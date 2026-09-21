import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/tx";
import { bangkokDateString } from "@/lib/date-utils";
import { round2 } from "@/lib/menu-options";
import { postMovement, StockLedgerError, LIVE_MOVEMENT, recomputeItemBalance, auditMaintenance } from "@/lib/stock-ledger";

/**
 * 库存单据层 —— 借鉴会计软件的「凭证」概念。
 *
 *  - **进货单** `PurchaseReceipt`：一张单可含多个菜品，形成一组带同一单据号的
 *    分录；作废 = 生成一组红字反向分录（原分录不动）。
 *  - **盘点单** `StockTake`：录实盘数，系统按「实盘 − 账面」自动生成盘盈/盘亏分录。
 *
 * 单据本身不直接改余额，一律通过 `postMovement()` 过账 —— 这是保证
 * `余额 ≡ Σ分录` 的前提。
 */

type Tx = Prisma.TransactionClient;

/** 单据编号：RC-20260920-001 / ST-20260920-001（按曼谷日期分日流水） */
async function nextDocCode(tx: Tx, prefix: "RC" | "ST"): Promise<string> {
  const day = bangkokDateString().replace(/-/g, "");
  const prefixStr = `${prefix}-${day}-`;
  const rows =
    prefix === "RC"
      ? await tx.purchaseReceipt.findMany({
          where: { code: { startsWith: prefixStr } },
          select: { code: true },
        })
      : await tx.stockTake.findMany({
          where: { code: { startsWith: prefixStr } },
          select: { code: true },
        });
  let max = 0;
  for (const r of rows) {
    const n = Number(r.code.slice(prefixStr.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefixStr}${String(max + 1).padStart(3, "0")}`;
}

// ============================================================================
// 进货单
// ============================================================================

export type ReceiptLineInput = {
  menuItemId: string;
  qty: number;
  /** 进货单价；不传则沿用该菜品现有移动加权成本（避免空值把平均成本拉成 0） */
  unitCost?: number | null;
};

export type ReceiptStockSnapshot = {
  menuItemId: string;
  stockQty: number;
  stockValue: number;
  avgCost: number;
};

/**
 * 创建并过账一张进货单。
 * 入库把数量与金额同时记入存货，并重算移动加权平均成本。
 */
export async function createPurchaseReceipt(input: {
  lines: ReceiptLineInput[];
  supplier?: string | null;
  docDate?: Date | null;
  note?: string | null;
  adminName?: string | null;
}): Promise<{
  id: string;
  code: string;
  totalAmount: number;
  stock: ReceiptStockSnapshot[];
}> {
  const lines = (input.lines || []).filter(
    (l) => l && l.menuItemId && Number.isInteger(l.qty) && l.qty > 0,
  );
  if (lines.length === 0) {
    throw new StockLedgerError("EMPTY_RECEIPT", "进货单至少要有一行有效明细");
  }
  for (const l of lines) {
    if (l.unitCost != null && (!Number.isFinite(l.unitCost) || l.unitCost < 0)) {
      throw new StockLedgerError("BAD_UNIT_COST", "进货单价必须是非负数");
    }
  }

  return runTx(async (tx) => {
    const code = await nextDocCode(tx, "RC");
    const receipt = await tx.purchaseReceipt.create({
      data: {
        code,
        supplier: input.supplier || null,
        docDate: input.docDate ?? new Date(),
        note: input.note || null,
        adminName: input.adminName ?? null,
      },
      select: { id: true, code: true },
    });

    let total = 0;
    const stock: ReceiptStockSnapshot[] = [];

    for (const line of lines) {
      const item = await tx.menuItem.findUnique({
        where: { id: line.menuItemId },
        select: {
          id: true,
          stockType: true,
          name_zh: true,
          avgCost: true,
          costPrice: true,
        },
      });
      if (!item) {
        throw new StockLedgerError("NOT_FOUND", "进货单里有菜品不存在", 404);
      }
      if (item.stockType !== "PURCHASED") {
        throw new StockLedgerError(
          "STOCK_TYPE_NOT_TRACKED",
          `${item.name_zh} 未启用库存管理（请先把库存类型设为外购）`,
        );
      }

      // 单价缺省沿用现有移动加权成本（其次参考成本价）
      // —— 留空不能把平均成本拉成 0
      const unitCost = round2(
        line.unitCost != null ? line.unitCost : (item.avgCost ?? item.costPrice ?? 0),
      );
      const amount = round2(line.qty * unitCost);

      await tx.purchaseReceiptLine.create({
        data: {
          receiptId: receipt.id,
          menuItemId: item.id,
          qty: line.qty,
          unitCost,
          amount,
        },
      });

      const res = await postMovement(tx, {
        itemId: item.id,
        type: "PURCHASE",
        quantity: line.qty,
        unitCost,
        docType: "PURCHASE_RECEIPT",
        docId: receipt.id,
        note: `进货单 ${code}`,
        adminName: input.adminName ?? null,
      });

      total += amount;
      stock.push({
        menuItemId: item.id,
        stockQty: res.balanceQty ?? 0,
        stockValue: res.balanceValue ?? 0,
        avgCost: res.avgCost ?? 0,
      });

      // 参考成本价跟随最近一次进货价（用于估算毛利；入账成本以 avgCost 为准）
      await tx.menuItem.update({
        where: { id: item.id },
        data: { costPrice: unitCost },
      });
    }

    await tx.purchaseReceipt.update({
      where: { id: receipt.id },
      data: { totalAmount: round2(total) },
    });

    return {
      id: receipt.id,
      code: receipt.code,
      totalAmount: round2(total),
      stock,
    };
  });
}

/**
 * 作废（红字冲销）一张进货单：为每条明细生成反向分录，原分录不动。
 * 若货已卖出导致冲销后为负，会被负库存保护拦下 —— 这是正确行为。
 */
export async function reversePurchaseReceipt(
  receiptId: string,
  opts: { adminName?: string | null; note?: string | null } = {},
): Promise<{ code: string; reversedLines: number }> {
  return runTx(async (tx) => {
    const receipt = await tx.purchaseReceipt.findUnique({
      where: { id: receiptId },
      include: { lines: true },
    });
    if (!receipt) throw new StockLedgerError("NOT_FOUND", "进货单不存在", 404);
    if (receipt.reversedAt) {
      throw new StockLedgerError("ALREADY_REVERSED", "该进货单已冲销", 409);
    }

    for (const line of receipt.lines) {
      const origin = await tx.stockMovement.findFirst({
        where: {
          docType: "PURCHASE_RECEIPT",
          docId: receipt.id,
          itemId: line.menuItemId,
          quantity: line.qty,
          voidedAt: null,
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      await postMovement(tx, {
        itemId: line.menuItemId,
        type: "PURCHASE",
        quantity: -line.qty,
        unitCost: line.unitCost,
        docType: "PURCHASE_RECEIPT",
        docId: receipt.id,
        reversalOf: origin?.id ?? null,
        note: opts.note ?? `冲销进货单 ${receipt.code}`,
        adminName: opts.adminName ?? null,
      });
    }

    await tx.purchaseReceipt.update({
      where: { id: receipt.id },
      data: { reversedAt: new Date() },
    });

    return { code: receipt.code, reversedLines: receipt.lines.length };
  });
}

// ============================================================================
// 盘点单
// ============================================================================

export type StockTakeLineInput = { menuItemId: string; actualQty: number };

/**
 * 盘点：录入实盘数，系统按「实盘 − 账面」自动生成盘盈/盘亏分录。
 * 盘点不会产生负数余额（实盘数本身不允许为负）。
 */
export async function createStockTake(input: {
  lines: StockTakeLineInput[];
  note?: string | null;
  adminName?: string | null;
}): Promise<{
  id: string;
  code: string;
  lines: {
    menuItemId: string;
    name_zh: string;
    bookQty: number;
    actualQty: number;
    diff: number;
  }[];
}> {
  const lines = (input.lines || []).filter(
    (l) => l && l.menuItemId && Number.isInteger(l.actualQty) && l.actualQty >= 0,
  );
  if (lines.length === 0) {
    throw new StockLedgerError("EMPTY_TAKE", "盘点单至少要有一行有效明细");
  }

  return runTx(async (tx) => {
    const code = await nextDocCode(tx, "ST");
    const take = await tx.stockTake.create({
      data: {
        code,
        note: input.note || null,
        adminName: input.adminName ?? null,
      },
      select: { id: true, code: true },
    });

    const out: {
      menuItemId: string;
      name_zh: string;
      bookQty: number;
      actualQty: number;
      diff: number;
    }[] = [];

    for (const line of lines) {
      const item = await tx.menuItem.findUnique({
        where: { id: line.menuItemId },
        select: { id: true, name_zh: true, stockType: true, stockQty: true },
      });
      if (!item) throw new StockLedgerError("NOT_FOUND", "盘点单里有菜品不存在", 404);
      if (item.stockType !== "PURCHASED") {
        throw new StockLedgerError(
          "STOCK_TYPE_NOT_TRACKED",
          `${item.name_zh} 未启用库存管理（请先把库存类型设为外购）`,
        );
      }

      const bookQty = item.stockQty ?? 0;
      const diff = line.actualQty - bookQty;

      await tx.stockTakeLine.create({
        data: {
          takeId: take.id,
          menuItemId: item.id,
          bookQty,
          actualQty: line.actualQty,
          diff,
        },
      });

      if (diff !== 0) {
        await postMovement(tx, {
          itemId: item.id,
          type: "MANUAL",
          quantity: diff,
          docType: "STOCK_TAKE",
          docId: take.id,
          note: `盘点单 ${code} · ${diff > 0 ? "盘盈" : "盘亏"}`,
          adminName: input.adminName ?? null,
        });
      }

      out.push({
        menuItemId: item.id,
        name_zh: item.name_zh,
        bookQty,
        actualQty: line.actualQty,
        diff,
      });
    }

    return { id: take.id, code: take.code, lines: out };
  });
}

// ============================================================================
// 账实核对
// ============================================================================

export type ReconcileRow = {
  itemId: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  /** 账面数量 */
  bookQty: number;
  /** 分录汇总数量 */
  ledgerQty: number;
  qtyDiff: number;
  /** 账面金额 */
  bookValue: number;
  /** 分录汇总金额 */
  ledgerValue: number;
  valueDiff: number;
  avgCost: number;
  entryCount: number;
  ok: boolean;
};

/**
 * 账实核对：把「账面」与「分录汇总」逐品对比。
 *
 * 会计上余额只能是分录的汇总结果，所以 `qtyDiff ≠ 0` 就意味着有一处
 * 绕过台账直接改了余额（历史遗留），需要人工决定对齐方式。
 */
export async function reconcileStock(): Promise<{
  rows: ReconcileRow[];
  summary: { total: number; mismatch: number; ok: number; bookValue: number; ledgerValue: number };
}> {
  const items = await prisma.menuItem.findMany({
    where: { stockType: "PURCHASED" },
    select: {
      id: true,
      name_zh: true,
      name_en: true,
      name_th: true,
      stockQty: true,
      stockValue: true,
      avgCost: true,
    },
    orderBy: { name_zh: "asc" },
  });

  const agg = await prisma.stockMovement.groupBy({
    by: ["itemId"],
    where: { itemId: { in: items.map((i) => i.id) }, ...LIVE_MOVEMENT },
    _sum: { quantity: true, amount: true },
    _count: { _all: true },
  });
  const byItem = new Map(agg.map((a) => [a.itemId, a]));

  const rows: ReconcileRow[] = items.map((it) => {
    const a = byItem.get(it.id);
    const ledgerQty = a?._sum.quantity ?? 0;
    const ledgerValue = round2(a?._sum.amount ?? 0);
    const bookQty = it.stockQty ?? 0;
    const bookValue = round2(it.stockValue ?? 0);
    const qtyDiff = bookQty - ledgerQty;
    const valueDiff = round2(bookValue - ledgerValue);
    return {
      itemId: it.id,
      name_zh: it.name_zh,
      name_en: it.name_en,
      name_th: it.name_th,
      bookQty,
      ledgerQty,
      qtyDiff,
      bookValue,
      ledgerValue,
      valueDiff,
      avgCost: round2(it.avgCost ?? 0),
      entryCount: a?._count._all ?? 0,
      ok: qtyDiff === 0 && Math.abs(valueDiff) < 0.01,
    };
  });

  const bookValue = round2(rows.reduce((s, r) => s + r.bookValue, 0));
  const ledgerValue = round2(rows.reduce((s, r) => s + r.ledgerValue, 0));
  const mismatch = rows.filter((r) => !r.ok).length;

  return {
    rows,
    summary: {
      total: rows.length,
      mismatch,
      ok: rows.length - mismatch,
      bookValue,
      ledgerValue,
    },
  };
}

/**
 * 按台账重算余额。
 *
 * 会计上「余额是分录的汇总」，所以这里分两种情况处理：
 *  - 台账**有**分录：账面以台账为准 → 直接重算余额（不新增分录，因为分录本来就是对的）
 *  - 台账**无**分录而账面不为 0：说明是手工建的期初 → 补一条 `OPENING` 期初分录，
 *    让分录追上账面（这样两边都成立）
 *
 * 另外**必须能修 NULL**：`stockQty` / `stockValue` 为 NULL 是迁移期遗留，
 * 前台会把它当成 0 可用量 → 菜品被判「售罄」、顾客下不了单。
 * 所以 NULL 一律走「归位」（有台账按台账，无台账归 0），不能被当成 0 跳过。
 */
export async function recalcStock(opts: {
  itemIds?: string[];
  adminName?: string | null;
} = {}): Promise<{
  redone: { itemId: string; name_zh: string; fromQty: number; toQty: number }[];
  opened: { itemId: string; name_zh: string; qty: number; avgCost: number }[];
}> {
  return runTx(async (tx) => {
    const items = await tx.menuItem.findMany({
      where: {
        stockType: "PURCHASED",
        ...(opts.itemIds && opts.itemIds.length > 0 ? { id: { in: opts.itemIds } } : {}),
      },
      select: {
        id: true,
        name_zh: true,
        stockQty: true,
        stockValue: true,
        avgCost: true,
        costPrice: true,
      },
      orderBy: { name_zh: "asc" },
    });

    const redone: { itemId: string; name_zh: string; fromQty: number; toQty: number }[] = [];
    const opened: { itemId: string; name_zh: string; qty: number; avgCost: number }[] = [];

    for (const item of items) {
      const agg = await tx.stockMovement.aggregate({
        where: { itemId: item.id, ...LIVE_MOVEMENT },
        _sum: { quantity: true, amount: true },
        _count: { _all: true },
      });
      const entryCount = agg._count._all ?? 0;
      const ledgerQty = agg._sum.quantity ?? 0;
      const ledgerValue = round2(agg._sum.amount ?? 0);
      // ⚠️ 必须区分「账面为 0」与「账面为 NULL」。
      //    NULL 是迁移期的历史遗留值：前台按 `stockQty ?? 0` 算可用量，
      //    于是这些菜品会被判成「售罄」、顾客下不了单（矿泉水曾因此下不了单）。
      //    所以 NULL 一律属于「需要归位」，不能当成 0 跳过。
      const bookIsNull = item.stockQty === null || item.stockValue === null;
      const bookQty = item.stockQty ?? 0;

      if (entryCount === 0) {
        if (bookQty === 0) {
          if (!bookIsNull) continue;
          // 台账本来就空，只是把 NULL 归一为 0 —— 不建期初分录
          // （数量为 0 的分录会被过账引擎拒绝，也没有业务含义）
          const avgCost0 = round2(item.avgCost ?? item.costPrice ?? 0);
          await tx.$executeRaw`
            UPDATE "MenuItem"
            SET "stockQty"   = 0,
                "stockValue" = 0,
                "avgCost"    = ${avgCost0}
            WHERE "id" = ${item.id}
          `;
          redone.push({
            itemId: item.id,
            name_zh: item.name_zh,
            fromQty: 0,
            toQty: 0,
          });
          continue;
        }
        // 期初建账：账面有货但台账空 → 补一条期初分录
        const unitCost = round2(item.avgCost ?? item.costPrice ?? 0);
        const res = await postMovement(tx, {
          itemId: item.id,
          type: "MANUAL",
          quantity: bookQty,
          unitCost,
          docType: "OPENING",
          note: "期初建账（按账面补录）",
          adminName: opts.adminName ?? null,
        });
        await auditMaintenance(tx, {
          action: "OPENING_REISSUE",
          itemId: item.id,
          movementId: res.movementId,
          adminName: opts.adminName ?? null,
          reason: "期初建账（按账面补录）",
          before: { bookQty, avgCost: unitCost },
          after: { qty: bookQty },
        });
        opened.push({ itemId: item.id, name_zh: item.name_zh, qty: bookQty, avgCost: unitCost });
        continue;
      }

      if (
        !bookIsNull &&
        bookQty === ledgerQty &&
        Math.abs(round2((item.stockValue ?? 0) - ledgerValue)) < 0.01
      ) {
        continue;
      }

      // 用统一的重算函数（口径 = Σ 未作废分录），避免这里再抄一遍公式
      await recomputeItemBalance(tx, item.id);
      redone.push({
        itemId: item.id,
        name_zh: item.name_zh,
        fromQty: bookQty,
        toQty: ledgerQty,
      });
    }

    if (redone.length > 0 || opened.length > 0) {
      await auditMaintenance(tx, {
        action: "RECALC",
        adminName: opts.adminName ?? null,
        reason: `按台账重算：调整 ${redone.length} 项，期初建账 ${opened.length} 项`,
        after: { redone, opened },
      });
    }

    return { redone, opened };
  });
}
