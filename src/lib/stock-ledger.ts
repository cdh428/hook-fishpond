import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { round2 } from "@/lib/menu-options";

/**
 * 库存过账引擎 —— **全站唯一允许改动库存余额的地方**。
 *
 * ## 会计模型
 *
 * 库存分两本账，成对记账：
 *  - **数量账** `MenuItem.stockQty`
 *  - **金额账** `MenuItem.stockValue`
 *
 * 每一笔业务都在 `StockMovement` 上落一条**不可变分录**（数据库触发器禁止
 * UPDATE / DELETE，改错只能「红字冲销」—— 新增一条反向分录并用 `reversalOf`
 * 指回原分录）。分录的 `quantity` / `amount` 带符号：正 = 入库（借：存货），
 * 负 = 出库（贷：存货）。
 *
 * ⚠️ 由此推出两条铁律（破坏任一条账就会漂）：
 *  1. **不许直接写 `stockQty` / `stockValue`** —— 菜单编辑、批量导入等
 *     一律不得提交库存字段，只能通过本文件过账。
 *  2. **余额恒等于分录汇总**：`stockQty = Σ quantity`、`stockValue = Σ amount`。
 *     这正是「账实核对」能成立的原因。
 *
 * ## 成本
 * 移动加权平均：入库时重算 `avgCost = 金额账 / 数量账`；出库按出库时的
 * `avgCost` 结转成本，出库本身不改变平均单价。
 */

export type StockMovementTypeValue =
  | "PURCHASE"
  | "SALE"
  | "CANCEL"
  | "MANUAL"
  | "WASTE";

export type StockDocTypeValue =
  | "PURCHASE_RECEIPT"
  | "STOCK_TAKE"
  | "ORDER"
  | "MANUAL"
  | "OPENING";

/** 过账失败（路由转成 400/409） */
export class StockLedgerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "StockLedgerError";
  }
}

export type PostMovementInput = {
  itemId: string;
  type: StockMovementTypeValue;
  /** 带符号数量：正 = 入库/回补，负 = 出库/扣减/损耗。不能为 0 */
  quantity: number;
  /**
   * 单价。
   *  - 入库：进货单价（缺省取进货前的 avgCost / 参考成本价）
   *  - 出库：成本单价快照（缺省取当前 avgCost）
   */
  unitCost?: number | null;
  docType?: StockDocTypeValue | null;
  docId?: string | null;
  /** 红字冲销：指回被冲销的那条分录 id */
  reversalOf?: string | null;
  /** 幂等键：同一业务重复调用只会过账一次（唯一索引兜底） */
  idempotencyKey?: string | null;
  note?: string | null;
  orderId?: string | null;
  adminName?: string | null;
  /** 允许把数量账过成负数（订单结算用；默认不允许，会抛 NEGATIVE_STOCK） */
  allowNegative?: boolean;
  /**
   * 只记分录、不动余额。
   * 用于自制菜品（MADE）的备查分录 —— 它的「库存」是当日限量，不按持久计数。
   */
  ledgerOnly?: boolean;
};

export type PostMovementResult = {
  movementId: string;
  /** 过账后的数量账余额（ledgerOnly 时为 null） */
  balanceQty: number | null;
  /** 过账后的金额账余额（ledgerOnly 时为 null） */
  balanceValue: number | null;
  avgCost: number | null;
  /** 本次分录金额（带符号） */
  amount: number;
  /** 是否命中了幂等键（重复调用，未重复记账） */
  duplicated: boolean;
};

type Tx = Prisma.TransactionClient;

/** 对菜品行加排它锁 —— 同一菜品的过账串行化，避免并发把余额算错 */
async function lockItem(tx: Tx, itemId: string) {
  await tx.$queryRaw`SELECT id FROM "MenuItem" WHERE id = ${itemId} FOR UPDATE`;
}

/**
 * 过账。必须在事务内调用（用 `runTx`）。
 *
 * 幂等：带 `idempotencyKey` 时，若该键已存在则直接返回既有结果、不重复记账。
 */
export async function postMovement(
  tx: Tx,
  input: PostMovementInput,
): Promise<PostMovementResult> {
  if (!Number.isInteger(input.quantity) || input.quantity === 0) {
    throw new StockLedgerError("BAD_QUANTITY", "quantity must be a non-zero integer");
  }

  if (input.idempotencyKey) {
    const existed = await tx.stockMovement.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, amount: true, balanceAfter: true },
    });
    if (existed) {
      const item = await tx.menuItem.findUnique({
        where: { id: input.itemId },
        select: { stockQty: true, stockValue: true, avgCost: true },
      });
      return {
        movementId: existed.id,
        balanceQty: item?.stockQty ?? null,
        balanceValue: item?.stockValue ?? null,
        avgCost: item?.avgCost ?? null,
        amount: existed.amount ?? 0,
        duplicated: true,
      };
    }
  }

  await lockItem(tx, input.itemId);
  const item = await tx.menuItem.findUnique({ where: { id: input.itemId } });
  if (!item) throw new StockLedgerError("NOT_FOUND", "Menu item not found", 404);

  const tracked = item.stockType === "PURCHASED" && !input.ledgerOnly;

  const qty = Math.abs(input.quantity);
  const isIn = input.quantity > 0;

  // 缺省单价
  const fallbackCost = item.avgCost ?? item.costPrice ?? 0;
  const unitCost = round2(
    input.unitCost != null && Number.isFinite(input.unitCost)
      ? input.unitCost
      : fallbackCost,
  );

  const amount = round2((isIn ? qty : -qty) * unitCost);

  let balanceQty: number | null = null;
  let balanceValue: number | null = null;
  let avgCost: number | null = null;

  if (tracked) {
    const prevQty = item.stockQty ?? 0;
    const prevValue = item.stockValue ?? 0;

    const nextQty = isIn ? prevQty + qty : prevQty - qty;
    const nextValue = round2(prevValue + amount);

    if (nextQty < 0 && !input.allowNegative) {
      throw new StockLedgerError(
        "NEGATIVE_STOCK",
        `Insufficient stock: ${item.name_zh} (on hand ${prevQty}, requested ${qty})`,
      );
    }

    balanceQty = nextQty;
    balanceValue = nextValue;
    // 移动加权平均：入库重算，出库保持原平均单价
    avgCost = isIn
      ? nextQty > 0
        ? round2(nextValue / nextQty)
        : unitCost
      : round2(item.avgCost ?? unitCost);

    await tx.$executeRaw`
      UPDATE "MenuItem"
      SET "stockQty"   = ${nextQty},
          "stockValue" = ${nextValue},
          "avgCost"    = ${avgCost}
      WHERE "id" = ${item.id}
    `;
  }

  const movement = await tx.stockMovement.create({
    data: {
      itemId: item.id,
      type: input.type,
      quantity: input.quantity,
      unitCost,
      amount,
      balanceAfter: balanceQty,
      docType: (input.docType ?? null) as any,
      docId: input.docId ?? null,
      reversalOf: input.reversalOf ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      note: input.note ?? null,
      orderId: input.orderId ?? null,
      adminName: input.adminName ?? null,
    },
    select: { id: true },
  });

  return {
    movementId: movement.id,
    balanceQty,
    balanceValue,
    avgCost,
    amount,
    duplicated: false,
  };
}

/**
 * 红字冲销：为某条分录生成一条反向分录（金额与数量都反号）。
 * 原分录不动 —— 这是「不可变台账」下唯一的纠错方式。
 */
export async function reverseMovement(
  tx: Tx,
  movementId: string,
  opts: { adminName?: string | null; note?: string | null } = {},
): Promise<PostMovementResult> {
  const origin = await tx.stockMovement.findUnique({ where: { id: movementId } });
  if (!origin) throw new StockLedgerError("NOT_FOUND", "Movement not found", 404);
  if (origin.reversalOf) {
    throw new StockLedgerError("ALREADY_REVERSED", "This entry is itself a reversal");
  }
  const existing = await tx.stockMovement.findFirst({
    where: { reversalOf: movementId },
    select: { id: true },
  });
  if (existing) {
    throw new StockLedgerError("ALREADY_REVERSED", "This entry has already been reversed", 409);
  }

  return postMovement(tx, {
    itemId: origin.itemId,
    type: origin.type,
    quantity: -origin.quantity,
    unitCost: origin.unitCost,
    docType: (origin.docType ?? null) as StockDocTypeValue | null,
    docId: origin.docId,
    reversalOf: origin.id,
    note: opts.note ?? `红字冲销 ${origin.id}`,
    orderId: origin.orderId,
    adminName: opts.adminName ?? origin.adminName,
    allowNegative: true,
  });
}

/**
 * 路由层统一的库存错误响应。
 * 把过账错误、库存不足错误翻译成带机器码的 4xx，其余归为 500。
 * （用鸭子类型判断库存不足错误，避免与 stock.ts 形成循环 import）
 */
export function ledgerErrorResponse(error: unknown, label = "Stock error") {
  if (error instanceof StockLedgerError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (
    error instanceof Error &&
    (error.name === "InsufficientStockError" || error.message.startsWith("Insufficient stock"))
  ) {
    return NextResponse.json(
      { error: error.message, code: "INSUFFICIENT_STOCK" },
      { status: 400 },
    );
  }
  if (error instanceof Error && error.message === "NOT_FOUND") {
    return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
  }
  console.error(`${label}:`, error);
  return NextResponse.json(
    { error: (error as any)?.message || label },
    { status: 500 },
  );
}
