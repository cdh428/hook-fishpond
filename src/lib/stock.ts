import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/tx";
import { bangkokDateString } from "@/lib/date-utils";

/**
 * 库存核心库 —— 全站库存余量、预占、扣减、回补的唯一真相来源。
 *
 * 两类库存：
 *  - MADE（自制）：余量 = 每日限量 − 当日已占用（**实时计算**，无需定时任务，跨天自动归零）。
 *  - PURCHASED（外购）：可用量 = 持久计数 stockQty − 未结清订单的预占量。
 *  - NONE（不管理）：不限量、始终可售（仅受 soldOut 手动售罄影响）。
 *
 * ## 预占（reservation）机制 —— 2026-09-20 起
 *
 * 顾客「确认下单」后**立即预占**，但**不改动 stockQty、不写库存流水**；
 * 只有到了结算时点（后付=结清、先付=付款到账）才把预占转为正式扣减。
 *
 * 每条 OrderItem 上的 `reservedQty` 即该行尚未转正的预占数量：
 *  - 下单后未结算：reservedQty = quantity（全部是预占）
 *  - 结算后：reservedQty = 0（已转正式扣减）
 *  - 历史订单（旧流程下单即扣）：reservedQty = 0，数量已计入 stockQty
 *
 * 于是「已扣减量」= quantity − reservedQty，这一表达式对历史数据同样成立，
 * 因此取消逻辑可以统一处理：预占部分直接释放，已扣部分回补。
 */

export type StockTypeValue = "NONE" | "MADE" | "PURCHASED";

/** 前台"仅剩 N 份"的显示阈值：剩余 > 该值时不暴露精确数量 */
export const LOW_STOCK_DISPLAY_THRESHOLD = 10;

export interface StockView {
  stockType: StockTypeValue;
  /** 是否已售罄（手动强制售罄 或 可用量耗尽） */
  soldOut: boolean;
  /** 可用量：MADE=今日剩余；PURCHASED=实物库存−预占；NONE / 不限量自制 = null */
  remaining: number | null;
  dailyLimit?: number | null;
  lowStockAlert?: number | null;
  /** 外购：可用量 ≤ 预警线 */
  lowStock: boolean;
  /** 外购：未结清订单的预占量（全部由订单预占产生，不含已扣减） */
  reserved?: number;
}

/** 库存不足（下单/改单时抛出，路由转成 400） */
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

/**
 * 由「菜品字段 + 当日占用量 + 预占量」计算库存视图（纯函数）。
 *
 * @param soldToday  当日已占用（MADE 用；= 非取消订单件数合计，含未结清订单）
 * @param reserved   未结清订单的预占量（PURCHASED 用）
 */
export function computeStockView(
  item: StockItemLike,
  soldToday = 0,
  reserved = 0,
): StockView {
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
    const physical = item.stockQty ?? 0;
    const available = Math.max(0, physical - reserved);
    const alert = item.lowStockAlert ?? null;
    return {
      stockType: "PURCHASED",
      soldOut: manuallyOut || available <= 0,
      remaining: available,
      lowStockAlert: alert,
      lowStock: alert != null && available <= alert,
      reserved,
    };
  }

  return { stockType: "NONE", soldOut: manuallyOut, remaining: null, lowStock: false };
}

/** 单菜品当日已占用（排除已取消订单；含未结清订单，因为他们已占住当日限量） */
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

/** 批量取「未结清订单的预占量」（PURCHASED 用，一次 groupBy 避免 N+1） */
async function reservedTotals(
  itemIds: string[],
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (itemIds.length === 0) return map;
  const rows = await client.orderItem.groupBy({
    by: ["menuItemId"],
    where: {
      menuItemId: { in: itemIds },
      reservedQty: { gt: 0 },
      order: { status: { not: "CANCELLED" } },
    },
    _sum: { reservedQty: true },
  });
  for (const r of rows) map.set(r.menuItemId, r._sum.reservedQty ?? 0);
  return map;
}

/**
 * 批量计算库存视图（菜单列表 API 用）。
 * 自制菜品的「当日已占用」与外购菜品的「预占量」各用一次 groupBy 聚合取回。
 */
export async function buildStockViews(
  items: StockItemLike[],
): Promise<Map<string, StockView>> {
  const madeIds = items.filter((i) => i.stockType === "MADE").map((i) => i.id);
  const purchasedIds = items.filter((i) => i.stockType === "PURCHASED").map((i) => i.id);
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

  const reservedMap = await reservedTotals(purchasedIds);

  const map = new Map<string, StockView>();
  for (const it of items) {
    map.set(
      it.id,
      computeStockView(it, soldMap.get(it.id) ?? 0, reservedMap.get(it.id) ?? 0),
    );
  }
  return map;
}

/** 合并订单行（同一菜品多行 → 累加），过滤掉非正数量 */
function mergeLines(
  lines: { menuItemId: string; quantity: number }[],
): Map<string, number> {
  const merged = new Map<string, number>();
  for (const l of lines) {
    if (!l.menuItemId || !(l.quantity > 0)) continue;
    merged.set(l.menuItemId, (merged.get(l.menuItemId) ?? 0) + l.quantity);
  }
  return merged;
}

/** 对涉及的菜品行加 FOR UPDATE 行锁（并发下单/改单时串行化，避免超卖） */
async function lockItems(tx: Prisma.TransactionClient, ids: string[]) {
  if (ids.length === 0) return;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  await tx.$queryRawUnsafe(
    `SELECT id FROM "MenuItem" WHERE id IN (${placeholders}) FOR UPDATE`,
    ...ids,
  );
}

/**
 * 校验某菜品能否再被「占用」desiredQty 份（排除 excludeOrderId 自身已占的部分）。
 *  - MADE：当日（非取消订单）合计 + desiredQty ≤ dailyLimit
 *  - PURCHASED：stockQty − 其他订单的预占 ≥ desiredQty
 * 不足则抛 InsufficientStockError。
 */
export async function assertCanHold(
  tx: Prisma.TransactionClient,
  item: { id: string; name_zh: string; stockType: StockTypeValue; dailyLimit: number | null; stockQty: number | null; soldOut: boolean },
  desiredQty: number,
  excludeOrderId: string,
): Promise<void> {
  if (item.soldOut) throw new InsufficientStockError(item.name_zh);

  if (item.stockType === "MADE") {
    const limit = item.dailyLimit;
    if (limit == null) return;
    const { start, end } = bangkokDayRange();
    const agg = await tx.orderItem.aggregate({
      _sum: { quantity: true },
      where: {
        menuItemId: item.id,
        orderId: { not: excludeOrderId },
        order: { status: { not: "CANCELLED" }, createdAt: { gte: start, lt: end } },
      },
    });
    if ((agg._sum.quantity ?? 0) + desiredQty > limit) {
      throw new InsufficientStockError(item.name_zh);
    }
    return;
  }

  if (item.stockType === "PURCHASED") {
    const agg = await tx.orderItem.aggregate({
      _sum: { reservedQty: true },
      where: {
        menuItemId: item.id,
        orderId: { not: excludeOrderId },
        reservedQty: { gt: 0 },
        order: { status: { not: "CANCELLED" } },
      },
    });
    const available = (item.stockQty ?? 0) - (agg._sum.reservedQty ?? 0);
    if (available < desiredQty) throw new InsufficientStockError(item.name_zh);
  }
}

/**
 * 预占库存（必须在订单事务内调用，且订单行已写入）。
 * 顾客「确认下单」后调用：校验可用量，不足直接拦下；只写 reservedQty，不动 stockQty。
 */
export async function reserveStock(
  tx: Prisma.TransactionClient,
  orderId: string,
  lines: { menuItemId: string; quantity: number }[],
): Promise<void> {
  const merged = mergeLines(lines);
  if (merged.size === 0) return;
  const ids = [...merged.keys()];
  await lockItems(tx, ids);

  const items = await tx.menuItem.findMany({ where: { id: { in: ids } } });
  for (const item of items) {
    const qty = merged.get(item.id)!;
    const st = item.stockType as StockTypeValue;
    if (st === "NONE") continue; // 不管理库存，无需预占

    await assertCanHold(tx, { ...item, stockType: st }, qty, orderId);

    if (st === "PURCHASED") {
      await tx.orderItem.updateMany({
        where: { orderId, menuItemId: item.id },
        data: { reservedQty: qty },
      });
    }
    // MADE：无需写 reservedQty —— 未取消订单的数量本身就已计入当日占用
  }
}

/**
 * 预占转正式扣减（结算时点：后付=结清，先付=付款到账）。
 *  - PURCHASED：stockQty −= reservedQty，写 SALE 流水，reservedQty 归零。
 *  - MADE：数量已在当日占用里，仅写 SALE 流水备查。
 * 幂等：reservedQty 已为 0 时不会重复扣减。
 */
export async function consumeReservation(
  tx: Prisma.TransactionClient,
  orderId: string,
  opts: { adminName?: string } = {},
): Promise<number> {
  // 幂等：已经转正过就不再处理
  const current = await tx.order.findUnique({
    where: { id: orderId },
    select: { stockConsumedAt: true },
  });
  if (!current || current.stockConsumedAt) return 0;

  const orderItems = await tx.orderItem.findMany({
    where: { orderId },
    include: { menuItem: true },
  });

  let consumed = 0;
  for (const oi of orderItems) {
    const st = oi.menuItem.stockType as StockTypeValue;
    if (st === "NONE") continue;

    if (st === "PURCHASED") {
      // 只扣「预占」部分：历史订单（旧流程下单即扣）reservedQty 为 0，不重复扣
      if (oi.reservedQty > 0) {
        await tx.$executeRaw`
          UPDATE "MenuItem"
          SET "stockQty" = COALESCE("stockQty", 0) - ${oi.reservedQty}
          WHERE "id" = ${oi.menuItemId}
        `;
        await tx.stockMovement.create({
          data: {
            itemId: oi.menuItemId,
            type: "SALE",
            quantity: -oi.reservedQty,
            orderId,
            adminName: opts.adminName ?? null,
          },
        });
        consumed += oi.reservedQty;
      }
    } else {
      // MADE：数量本就在当日占用里，转正时补记一条流水备查
      await tx.stockMovement.create({
        data: {
          itemId: oi.menuItemId,
          type: "SALE",
          quantity: -oi.quantity,
          orderId,
          adminName: opts.adminName ?? null,
          note: "预占转正式扣减",
        },
      });
      consumed += oi.quantity;
    }
  }

  await tx.orderItem.updateMany({ where: { orderId }, data: { reservedQty: 0 } });
  await tx.order.update({
    where: { id: orderId },
    data: { stockConsumedAt: new Date() },
  });

  return consumed;
}

/**
 * 释放整单预占（取消订单时调用）。
 *  - 预占部分（reservedQty）：直接释放，不需要回补（因为从未扣减）。
 *  - 已扣减部分（quantity − reservedQty）：回补库存并写 CANCEL 流水。
 * 于是「下单即扣」的历史订单同样能被正确回补。
 */
export async function releaseOrderStock(
  tx: Prisma.TransactionClient,
  orderId: string,
  opts: { adminName?: string } = {},
): Promise<{ released: number; restored: number }> {
  const orderItems = await tx.orderItem.findMany({
    where: { orderId },
    include: { menuItem: true },
  });

  let released = 0;
  let restored = 0;

  for (const oi of orderItems) {
    const st = oi.menuItem.stockType as StockTypeValue;
    const held = oi.reservedQty;
    const alreadyDeducted = Math.max(0, oi.quantity - oi.reservedQty);
    released += held;

    if (alreadyDeducted > 0 && st !== "NONE") {
      if (st === "PURCHASED") {
        await tx.$executeRaw`
          UPDATE "MenuItem"
          SET "stockQty" = COALESCE("stockQty", 0) + ${alreadyDeducted}
          WHERE "id" = ${oi.menuItemId}
        `;
      }
      await tx.stockMovement.create({
        data: {
          itemId: oi.menuItemId,
          type: "CANCEL",
          quantity: alreadyDeducted,
          orderId,
          adminName: opts.adminName ?? null,
          note: "订单取消/减量回补",
        },
      });
      restored += alreadyDeducted;
    }
  }

  await tx.orderItem.updateMany({ where: { orderId }, data: { reservedQty: 0 } });
  return { released, restored };
}

/** @deprecated 兼容旧调用；新流程请用 releaseOrderStock */
export async function restoreStock(
  tx: Prisma.TransactionClient,
  orderId: string,
  opts: { adminName?: string } = {},
): Promise<void> {
  await releaseOrderStock(tx, orderId, opts);
}

/**
 * 后台改单：把订单菜品调整为 targetLines（完整目标状态，非增量）。
 *  - 减量/删行 → 预占部分释放，已扣减部分回补库存（"后台改单减少要加回库存"）
 *  - 加量/加行 → 校验可用量后增加预占
 * 返回被回补（真实加回库存）的总件数。
 */
export async function applyOrderItemChange(
  tx: Prisma.TransactionClient,
  orderId: string,
  targetLines: { menuItemId: string; quantity: number }[],
  opts: { adminName?: string } = {},
): Promise<{ restored: number }> {
  const merged = mergeLines(targetLines);
  const current = await tx.orderItem.findMany({
    where: { orderId },
    include: { menuItem: true },
  });

  const ids = [
    ...new Set([...current.map((o) => o.menuItemId), ...merged.keys()]),
  ];
  await lockItems(tx, ids);

  const fresh = new Map(
    (await tx.menuItem.findMany({ where: { id: { in: ids } } })).map((m) => [m.id, m]),
  );

  let restored = 0;

  // 1) 处理已有行：改量 或 删除
  for (const oi of current) {
    const item = fresh.get(oi.menuItemId) ?? oi.menuItem;
    const st = item.stockType as StockTypeValue;
    const targetQty = merged.get(oi.menuItemId) ?? 0;
    merged.delete(oi.menuItemId);

    if (targetQty <= 0) {
      // 删行：释放预占 + 回补已扣减部分
      const alreadyDeducted = Math.max(0, oi.quantity - oi.reservedQty);
      if (alreadyDeducted > 0 && st === "PURCHASED") {
        await tx.$executeRaw`
          UPDATE "MenuItem"
          SET "stockQty" = COALESCE("stockQty", 0) + ${alreadyDeducted}
          WHERE "id" = ${oi.menuItemId}
        `;
      }
      if (alreadyDeducted > 0 && st !== "NONE") {
        await tx.stockMovement.create({
          data: {
            itemId: oi.menuItemId,
            type: "CANCEL",
            quantity: alreadyDeducted,
            orderId,
            adminName: opts.adminName ?? null,
            note: "后台改单删除菜品回补",
          },
        });
        restored += alreadyDeducted;
      }
      await tx.orderItem.delete({ where: { id: oi.id } });
      continue;
    }

    const alreadyDeducted = Math.max(0, oi.quantity - oi.reservedQty);
    const newReserved = Math.max(0, targetQty - alreadyDeducted);

    if (newReserved > oi.reservedQty && st !== "NONE") {
      await assertCanHold(tx, { ...item, stockType: st }, newReserved, orderId);
    }

    // 目标数量低于已扣减量 → 需要把差额加回库存
    if (targetQty < alreadyDeducted) {
      const back = alreadyDeducted - targetQty;
      if (st === "PURCHASED") {
        await tx.$executeRaw`
          UPDATE "MenuItem"
          SET "stockQty" = COALESCE("stockQty", 0) + ${back}
          WHERE "id" = ${oi.menuItemId}
        `;
      }
      if (st !== "NONE") {
        await tx.stockMovement.create({
          data: {
            itemId: oi.menuItemId,
            type: "CANCEL",
            quantity: back,
            orderId,
            adminName: opts.adminName ?? null,
            note: "后台改单减量回补",
          },
        });
        restored += back;
      }
    }

    if (targetQty !== oi.quantity || newReserved !== oi.reservedQty) {
      await tx.orderItem.update({
        where: { id: oi.id },
        data: {
          quantity: targetQty,
          totalPrice: targetQty * oi.unitPrice,
          reservedQty: st === "NONE" ? 0 : newReserved,
        },
      });
    }
  }

  // 2) 剩下的就是新增行
  for (const [menuItemId, qty] of merged) {
    const item = fresh.get(menuItemId);
    if (!item) continue;
    const st = item.stockType as StockTypeValue;
    if (st !== "NONE") {
      await assertCanHold(tx, { ...item, stockType: st }, qty, orderId);
    }
    await tx.orderItem.create({
      data: {
        orderId,
        menuItemId,
        quantity: qty,
        unitPrice: item.price,
        totalPrice: item.price * qty,
        // 新增行同样立即预占（外购库存）；MADE 靠当日数量天然占位
        reservedQty: st === "PURCHASED" ? qty : 0,
      },
    });
  }

  return { restored };
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
  return runTx(async (tx) => {
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
