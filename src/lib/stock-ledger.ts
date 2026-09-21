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
      select: { id: true, amount: true, balanceAfter: true, voidedAt: true },
    });
    if (existed && !existed.voidedAt) {
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

  // 幂等键让路：基础键被「已作废」的分录占用时，换一个确定性的备用键，
  // 既不撞唯一索引，也不至于把该记的账默默吞掉。
  const effKey = input.idempotencyKey
    ? await freeIdempotencyKey(tx, input.idempotencyKey)
    : null;

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
      idempotencyKey: effKey,
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
  if (origin.voidedAt) {
    throw new StockLedgerError("VOIDED", "该分录已作废，无需冲销（如需恢复请用「恢复」）", 409);
  }
  if (origin.reversalOf) {
    throw new StockLedgerError("ALREADY_REVERSED", "This entry is itself a reversal");
  }
  const existing = await tx.stockMovement.findFirst({
    where: { reversalOf: movementId, ...LIVE_MOVEMENT },
    select: { id: true },
  });
  if (existing) {
    throw new StockLedgerError("ALREADY_REVERSED", "This entry has already been reversed", 409);
  }

  const result = await postMovement(tx, {
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

  await writeAudit(tx, {
    action: "REVERSE",
    itemId: origin.itemId,
    movementId: origin.id,
    docType: origin.docType,
    docId: origin.docId,
    adminName: opts.adminName ?? null,
    reason: opts.note ?? "红字冲销",
    before: { quantity: origin.quantity, amount: origin.amount },
    after: { reversalMovementId: result.movementId, amount: result.amount },
  });

  return result;
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

// ============================================================================
// 作废（soft-void）—— 超管的「删除」
// ============================================================================

/**
 * **余额口径的唯一真相**：参与余额核算的分录 = 未作废的分录。
 *
 * ⚠️ 任何聚合（账实核对、逐品明细、挂钩体检、成本取数）都必须带上它，
 * 漏一处就会出现「作废了但还占着数量」的账漂。改口径只改这里。
 */
export const LIVE_MOVEMENT = { voidedAt: null } as const;

/** 原生 SQL 里判断「未作废」的片段（别名必须是 m） */
export const LIVE_MOVEMENT_SQL = `m."voidedAt" is null`;

/** 写一条账套审计。失败不阻断主流程，但会打日志。 */
async function writeAudit(
  tx: Tx,
  entry: {
    action: "VOID" | "UNVOID" | "RECALC" | "REVERSE" | "OPENING_REISSUE";
    itemId?: string | null;
    movementId?: string | null;
    docType?: string | null;
    docId?: string | null;
    adminName?: string | null;
    reason?: string | null;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  try {
    await tx.stockLedgerAudit.create({
      data: {
        action: entry.action,
        itemId: entry.itemId ?? null,
        movementId: entry.movementId ?? null,
        docType: entry.docType ?? null,
        docId: entry.docId ?? null,
        adminName: entry.adminName ?? null,
        reason: entry.reason ?? null,
        before: (entry.before ?? undefined) as any,
        after: (entry.after ?? undefined) as any,
      },
    });
  } catch (e) {
    console.error("writeAudit failed:", e);
  }
}

/**
 * 以台账重算某菜品的两本账 —— **唯一**允许直接写 `stockQty/stockValue/avgCost` 的地方。
 *
 * 口径：`stockQty = Σ quantity`、`stockValue = Σ amount`，范围都是**未作废**的分录。
 * 因此「作废一条分录 → 立即重算」必然让账面重新等于台账，天然账平。
 */
export async function recomputeItemBalance(
  tx: Tx,
  itemId: string,
): Promise<{ stockQty: number; stockValue: number; avgCost: number }> {
  await lockItem(tx, itemId);
  const agg = await tx.stockMovement.aggregate({
    where: { itemId, ...LIVE_MOVEMENT },
    _sum: { quantity: true, amount: true },
  });
  const qty = agg._sum.quantity ?? 0;
  const value = round2(agg._sum.amount ?? 0);
  const item = await tx.menuItem.findUnique({
    where: { id: itemId },
    select: { avgCost: true, costPrice: true },
  });
  const avgCost = qty > 0 ? round2(value / qty) : round2(item?.avgCost ?? item?.costPrice ?? 0);

  await tx.$executeRaw`
    UPDATE "MenuItem"
    SET "stockQty"   = ${qty},
        "stockValue" = ${value},
        "avgCost"    = ${avgCost}
    WHERE "id" = ${itemId}
  `;
  return { stockQty: qty, stockValue: value, avgCost };
}

/**
 * 幂等键「让路」：若基础键已被占用（例如那条分录被作废后再补记），
 * 依次尝试 `base#v2`、`base#v3`… 保证既能补记、又不会因唯一索引炸掉。
 * 结果是确定的：给定当前库状态，重复调用得到同一个键。
 */
export async function freeIdempotencyKey(tx: Tx, base: string): Promise<string> {
  const rows = await tx.stockMovement.findMany({
    where: { idempotencyKey: { startsWith: base } },
    select: { idempotencyKey: true },
  });
  const used = new Set(rows.map((r) => r.idempotencyKey));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}#v${n}`)) n++;
  return `${base}#v${n}`;
}

/**
 * 作废一条分录（超管的「删除」语义）。
 *
 * - 原始分录**不物理删除**（触发器禁止，且审计需要），只打 `voidedAt` 标记；
 * - 金额与数量从此**不再计入余额**；
 * - 立刻按剩余分录重算该菜品两本账 → 账实必然一致；
 * - 全程写 `StockLedgerAudit`（谁 / 何时 / 哪条 / 为什么）。
 *
 * 与「红字冲销 reverseMovement」的分工：
 *  - 红冲用于**业务上确实发生过的反向操作**（退货、取消），留一对完整分录；
 *  - 作废用于**录入错误**（把错数直接从账上摘掉），干净且可恢复。
 */
export async function voidMovement(
  tx: Tx,
  movementId: string,
  opts: { reason: string; adminName?: string | null },
): Promise<{ itemId: string; stockQty: number; stockValue: number; avgCost: number }> {
  const m = await tx.stockMovement.findUnique({ where: { id: movementId } });
  if (!m) throw new StockLedgerError("NOT_FOUND", "Movement not found", 404);
  if (m.voidedAt) throw new StockLedgerError("ALREADY_VOIDED", "该分录已作废", 409);
  if (!opts.reason || !opts.reason.trim()) {
    throw new StockLedgerError("REASON_REQUIRED", "作废必须填写原因");
  }

  await tx.stockMovement.update({
    where: { id: movementId },
    data: { voidedAt: new Date(), voidedBy: opts.adminName ?? null, voidReason: opts.reason.trim() },
  });

  const balance = await recomputeItemBalance(tx, m.itemId);

  await writeAudit(tx, {
    action: "VOID",
    itemId: m.itemId,
    movementId,
    docType: m.docType,
    docId: m.docId,
    adminName: opts.adminName,
    reason: opts.reason.trim(),
    before: {
      type: m.type,
      quantity: m.quantity,
      unitCost: m.unitCost,
      amount: m.amount,
      balanceAfter: m.balanceAfter,
      note: m.note,
      createdAt: m.createdAt,
    },
    after: balance,
  });

  return { itemId: m.itemId, ...balance };
}

/** 恢复一条被作废的分录（撤销误作废）。恢复后重算余额。 */
export async function unvoidMovement(
  tx: Tx,
  movementId: string,
  opts: { adminName?: string | null; reason?: string | null } = {},
): Promise<{ itemId: string; stockQty: number; stockValue: number; avgCost: number }> {
  const m = await tx.stockMovement.findUnique({ where: { id: movementId } });
  if (!m) throw new StockLedgerError("NOT_FOUND", "Movement not found", 404);
  if (!m.voidedAt) throw new StockLedgerError("NOT_VOIDED", "该分录未被作废", 409);

  await tx.stockMovement.update({
    where: { id: movementId },
    data: { voidedAt: null, voidedBy: null, voidReason: null },
  });

  const balance = await recomputeItemBalance(tx, m.itemId);

  await writeAudit(tx, {
    action: "UNVOID",
    itemId: m.itemId,
    movementId,
    docType: m.docType,
    docId: m.docId,
    adminName: opts.adminName,
    reason: opts.reason ?? "恢复已作废分录",
    before: { wasVoidedAt: m.voidedAt, wasVoidReason: m.voidReason },
    after: balance,
  });

  return { itemId: m.itemId, ...balance };
}

/** 记录一次账套维护操作（重算等），供路由调用 */
export async function auditMaintenance(
  tx: Tx,
  entry: Parameters<typeof writeAudit>[1],
): Promise<void> {
  return writeAudit(tx, entry);
}
