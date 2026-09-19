import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bangkokDateString } from "@/lib/date-utils";

/**
 * 库存核心库 —— 全站库存余量、扣减、回补的唯一真相来源。
 *
 * 两类库存：
 *  - MADE（自制）：余量 = 每日限量 − 当日已售（**实时计算**，无需定时任务，跨天自动归零）。
 *  - PURCHASED（外购）：余量 = 持久计数 stockQty，入库 + / 销售 − / 取消 + / 损耗 − / 调整 ±。
 *  - NONE（不管理）：不限量、始终可售（仅受 soldOut 手动售罄影响）。
 */

export type StockTypeValue = "NONE" | "MADE" | "PURCHASED";

/** 前台"仅剩 N 份"的显示阈值：剩余 > 该值时不暴露精确数量 */
export const LOW_STOCK_DISPLAY_THRESHOLD = 10;

export interface StockView {
  stockType: StockTypeValue;
  /** 是否已售罄（手动强制售罄 或 余量耗尽） */
  soldOut: boolean;
  /** 剩余量：MADE=今日剩余；PURCHASED=当前库存；NONE / 不限量自制 = null */
  remaining: number | null;
  dailyLimit?: number | null;
  lowStockAlert?: number | null;
  /** 外购：库存 ≤ 预警线 */
  lowStock: boolean;
}

/** 库存不足（下单时抛出，路由转成 400） */
export class InsufficientStockError extends Error {
  constructor(public readonly itemName: string) {
    super(`Insufficient stock: ${itemName}`);
    this.name = "InsufficientStockError";
  }
}

/**
 * 曼谷时区「今天」的 UTC 区间 [start, end)。
 * 曼谷为 UTC+7 且无夏令时，因此日界固定。
 */
export function bangkokDayRange(d: Date = new Date()): { start: Date; end: Date } {
  const dayStr = bangkokDateString(d); // YYYY-MM-DD（曼谷）
  const start = new Date(`${dayStr}T00:00:00.000+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

type StockItemLike = {
  id: string;
  stockType: StockTypeValue;
  dailyLimit: number | null;
  stockQty: number | null;
  lowStockAlert: number | null;
  soldOut: boolean;
};

/** 由「菜品字段 + 当日已售」计算库存视图（纯函数） */
export function computeStockView(item: StockItemLike, soldToday = 0): StockView {
  const manuallyOut = item.soldOut === true;

  if (item.stockType === "MADE") {
    const limit = item.dailyLimit ?? null;
    const remaining = limit == null ? null : Math.max(0, limit - soldToday);
    const soldOut = manuallyOut || (remaining != null && remaining <= 0);
    return {
      stockType: "MADE",
      soldOut,
      remaining,
      dailyLimit: limit,
      lowStock: false,
    };
  }

  if (item.stockType === "PURCHASED") {
    const qty = item.stockQty ?? 0;
    const alert = item.lowStockAlert ?? null;
    return {
      stockType: "PURCHASED",
      soldOut: manuallyOut || qty <= 0,
      remaining: qty,
      lowStockAlert: alert,
      lowStock: alert != null && qty <= alert,
    };
  }

  return { stockType: "NONE", soldOut: manuallyOut, remaining: null, lowStock: false };
}

/** 单菜品当日已售（排除已取消订单） */
export async function getSoldToday(
  itemId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  const { start, end } = bangkokDayRange();
  const agg = await client.orderItem.aggregate({
    _sum: { quantity: true },
    where: {
      menuItemId: itemId,
      order: { status: { not: "CANCELLED" }, createdAt: { gte: start, lt: end } },
    },
  });
  return agg._sum.quantity ?? 0;
}

/**
 * 批量计算库存视图（菜单列表 API 用）。
 * 自制菜品的「当日已售」用一次 groupBy 聚合取回，避免 N+1 查询。
 */
export async function buildStockViews(
  items: StockItemLike[],
): Promise<Map<string, StockView>> {
  const madeIds = items.filter((i) => i.stockType === "MADE").map((i) => i.id);
  const soldMap = new Map<string, number>();

  if (madeIds.length > 0) {
    const { start, end } = bangkokDayRange();
    const rows = await prisma.orderItem.groupBy({
      by: ["menuItemId"],
      where: {
        menuItemId: { in: madeIds },
        order: { status: { not: "CANCELLED" }, createdAt: { gte: start, lt: end } },
      },
      _sum: { quantity: true },
    });
    for (const r of rows) soldMap.set(r.menuItemId, r._sum.quantity ?? 0);
  }

  const map = new Map<string, StockView>();
  for (const it of items) {
    map.set(it.id, computeStockView(it, soldMap.get(it.id) ?? 0));
  }
  return map;
}

/**
 * 下单扣减（必须在订单事务内调用）。
 *  - PURCHASED：原子 updateMany（stockQty ≥ qty）扣减，防超卖。
 *  - MADE：事务内实时统计当日已售，超限量即拒绝。
 *  - 先对涉及的菜单项行加 `FOR UPDATE` 行锁，串行化并发下单。
 * 不足则抛 InsufficientStockError。
 */
export async function decrementStock(
  tx: Prisma.TransactionClient,
  lines: { menuItemId: string; quantity: number }[],
  opts: { orderId?: string; adminName?: string } = {},
): Promise<void> {
  const merged = new Map<string, number>();
  for (const l of lines) {
    if (!l.menuItemId || !(l.quantity > 0)) continue;
    merged.set(l.menuItemId, (merged.get(l.menuItemId) ?? 0) + l.quantity);
  }
  const ids = [...merged.keys()];
  if (ids.length === 0) return;

  // 行锁：并发下单时对同一菜品串行化，避免超卖
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  await tx.$queryRawUnsafe(
    `SELECT id FROM "MenuItem" WHERE id IN (${placeholders}) FOR UPDATE`,
    ...ids,
  );

  const items = await tx.menuItem.findMany({ where: { id: { in: ids } } });
  const { start, end } = bangkokDayRange();

  for (const item of items) {
    const qty = merged.get(item.id)!;

    if (item.stockType === "MADE") {
      const limit = item.dailyLimit;
      if (limit != null) {
        const agg = await tx.orderItem.aggregate({
          _sum: { quantity: true },
          where: {
            menuItemId: item.id,
            // 排除当前订单自身：调用方可能已把订单写入事务，不能把本次数量重复计入
            ...(opts.orderId ? { orderId: { not: opts.orderId } } : {}),
            order: { status: { not: "CANCELLED" }, createdAt: { gte: start, lt: end } },
          },
        });
        const sold = agg._sum.quantity ?? 0;
        if (sold + qty > limit) throw new InsufficientStockError(item.name_zh);
      }
    } else if (item.stockType === "PURCHASED") {
      // stockQty 可能为 NULL（刚设为外购）—— COALESCE 视为 0，且保证原子扣减
      const affected = await tx.$executeRaw`
        UPDATE "MenuItem"
        SET "stockQty" = COALESCE("stockQty", 0) - ${qty}
        WHERE "id" = ${item.id} AND COALESCE("stockQty", 0) >= ${qty}
      `;
      if (affected === 0) throw new InsufficientStockError(item.name_zh);
    } else {
      continue; // NONE 不管理库存
    }

    await tx.stockMovement.create({
      data: {
        itemId: item.id,
        type: "SALE",
        quantity: -qty,
        orderId: opts.orderId ?? null,
        adminName: opts.adminName ?? null,
      },
    });
  }
}

/**
 * 取消 / 拒单回补（必须在订单事务内调用，且仅当订单由「非取消」变为「取消」时调用一次）。
 *  - PURCHASED：stockQty 回补。
 *  - MADE：无需回补（余量实时计算，订单转 CANCELLED 后自然不计入已售），仅记流水冲正。
 */
export async function restoreStock(
  tx: Prisma.TransactionClient,
  orderId: string,
  opts: { adminName?: string } = {},
): Promise<void> {
  const orderItems = await tx.orderItem.findMany({
    where: { orderId },
    include: { menuItem: true },
  });

  for (const oi of orderItems) {
    const st = oi.menuItem.stockType as StockTypeValue;
    if (st === "PURCHASED") {
      await tx.$executeRaw`
        UPDATE "MenuItem"
        SET "stockQty" = COALESCE("stockQty", 0) + ${oi.quantity}
        WHERE "id" = ${oi.menuItemId}
      `;
    }
    if (st !== "NONE") {
      await tx.stockMovement.create({
        data: {
          itemId: oi.menuItemId,
          type: "CANCEL",
          quantity: oi.quantity,
          orderId,
          adminName: opts.adminName ?? null,
        },
      });
    }
  }
}

/**
 * 手动库存变更（外购入库 / 手动调整 / 损耗自用）。
 * 对 PURCHASED：同步更新 stockQty；其他类型仅记流水。
 */
export async function applyStockChange(input: {
  itemId: string;
  type: "PURCHASE" | "MANUAL" | "WASTE";
  quantity: number; // 带符号：正=增加，负=减少
  note?: string;
  adminName?: string;
  /** 入库时可顺便更新成本价 */
  costPrice?: number;
}): Promise<{ stockQty: number | null }> {
  return prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.findUnique({ where: { id: input.itemId } });
    if (!item) throw new Error("NOT_FOUND");

    let stockQty = item.stockQty ?? null;

    if (item.stockType === "PURCHASED") {
      // stockQty 可能为 NULL（刚设为外购）—— COALESCE 视为 0
      await tx.$executeRaw`
        UPDATE "MenuItem"
        SET "stockQty" = COALESCE("stockQty", 0) + ${input.quantity}
        WHERE "id" = ${input.itemId}
      `;
      stockQty = (item.stockQty ?? 0) + input.quantity;
    }

    if (input.type === "PURCHASE" && input.costPrice !== undefined) {
      await tx.menuItem.update({
        where: { id: input.itemId },
        data: { costPrice: input.costPrice },
      });
    }

    await tx.stockMovement.create({
      data: {
        itemId: input.itemId,
        type: input.type,
        quantity: input.quantity,
        note: input.note ?? null,
        adminName: input.adminName ?? null,
      },
    });

    return { stockQty };
  });
}
