import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bangkokDateString } from "@/lib/date-utils";
import { bangkokDayRange, consumeReservation, type ConsumeResult } from "@/lib/stock";

/**
 * 订单计费核心库 —— 渔获、折扣、金额口径的唯一计算来源。
 *
 * ## 金额口径（重要）
 *   subtotal     = 菜品小计（Σ OrderItem.totalPrice）
 *   fishCharge    = max(0, 渔获总重 − 1kg) × 60฿        ← 前 1kg 免费
 *   discountAmount= 折扣金额（正数=减免）
 *   totalPrice    = subtotal + fishCharge − discountAmount   ← 应付净额
 *
 * 口径带来的好处：
 *  - 报表（SUM(Order.totalPrice)）与交易页（SUM(Payment.amount)）自动一致，
 *    因为两者都取「净额」；
 *  - 渔获费天然计入营收，折扣天然被扣除。
 */

/** 渔获免费额度：每根鱼竿免 1 公斤（鱼竿总数 = 自带杆 + 租杆 数量） */
export const FISH_INCLUDED_KG_PER_ROD = 1;

/** 鱼竿类菜品的名称匹配规则（三语全表）。
 *  订单里鱼竿是普通菜品录入的，靠名字识别；价格 100/150 在菜单里不是唯一的，
 *  不能按价格匹配。 */
const ROD_ITEM_NAMES = [
  // zh
  "自带竿", "自带杆", "自带钓竿", "自带魚竿",
  "租竿", "租杆", "租钓竿", "租借钓竿", "租赁钓竿", "租借钓竿",
  // en
  "Bring your own rod", "Own rod", "Rod rental", "Rented rod", "Rental rod",
  "Fishing rod (own)", "Fishing rod (rental)", "Fishing rod",
  // th（从 menu 里实际出现的名称）
  "ค่านำมาเอง", "เช่าค่านำมาเอง", "คันเบ็ด (นำมาเอง)", "ค่าเช่าคันเบ็ด", "เช่าคันเบ็ด",
];

/** 判断一个菜品（OrderItem）是否算鱼竿。三语名任一命中即可。 */
function isRodItem(menuItem: { name_zh?: string; name_en?: string; name_th?: string } | null | undefined): boolean {
  if (!menuItem) return false;
  const names = [menuItem.name_zh, menuItem.name_en, menuItem.name_th].filter(Boolean) as string[];
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  return names.some((n) =>
    ROD_ITEM_NAMES.some((rod) => norm(n) === norm(rod) || norm(n).includes(norm(rod))),
  );
}

/** 从订单 items 里统计鱼竿总数（每行 quantity 累加） */
export function countRodsFromItems(
  items: Array<{ quantity: number; menuItem?: { name_zh?: string; name_en?: string; name_th?: string } | null }>,
): number {
  return items.reduce((s, it) => s + (isRodItem(it.menuItem) ? (it.quantity || 0) : 0), 0);
}
/** 渔获超出部分单价：60 泰铢/公斤 */
export const FISH_PRICE_PER_KG = 60;
/** 店员可直接改价的上限（占订单毛额比例）。超出需管理员确认。 */
export const STAFF_DISCOUNT_LIMIT_RATIO = 0.1;

export type DiscountTypeValue = "NONE" | "PERCENT" | "AMOUNT";
export type SettlementModeValue = "PREPAID" | "POSTPAID";

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** 渔获费 = max(0, 总重 − 免扣 kg) × 单价；免扣 kg 由鱼竿数 × 1 决定 */
export function fishChargeFor(
  weightKg: number,
  opts: { includedKg?: number; pricePerKg?: number } = {},
): number {
  const w = Math.max(0, Number(weightKg) || 0);
  const included = Math.max(0, opts.includedKg ?? FISH_INCLUDED_KG_PER_ROD);
  const perKg = opts.pricePerKg ?? FISH_PRICE_PER_KG;
  return round2(Math.max(0, w - included) * perKg);
}

/** 折扣金额（不得超过毛额） */
export function discountAmountFor(
  gross: number,
  type: DiscountTypeValue,
  value: number,
): number {
  const g = Math.max(0, Number(gross) || 0);
  const v = Math.max(0, Number(value) || 0);
  if (type === "PERCENT") {
    return round2((g * Math.min(v, 100)) / 100);
  }
  if (type === "AMOUNT") {
    return round2(Math.min(v, g));
  }
  return 0;
}

export interface OrderTotals {
  subtotal: number;
  fishWeightKg: number;
  fishCharge: number;
  gross: number;
  discountAmount: number;
  totalPrice: number;
}

/** 纯函数：由各项输入算出订单全部金额 */
export function computeOrderTotals(input: {
  subtotal: number;
  fishWeightKg: number;
  discountType: DiscountTypeValue;
  discountValue: number;
  includedKg?: number;
  pricePerKg?: number;
}): OrderTotals {
  const subtotal = round2(input.subtotal);
  const fishWeightKg = round2(Math.max(0, input.fishWeightKg));
  const fishCharge = fishChargeFor(fishWeightKg, {
    includedKg: input.includedKg,
    pricePerKg: input.pricePerKg,
  });
  const gross = round2(subtotal + fishCharge);
  const discountAmount = discountAmountFor(gross, input.discountType, input.discountValue);
  return {
    subtotal,
    fishWeightKg,
    fishCharge,
    gross,
    discountAmount,
    totalPrice: round2(gross - discountAmount),
  };
}

type Tx = Prisma.TransactionClient;

/** 依据数据库现状（菜品行 + 称重记录 + 折扣设置）重算并落库订单金额 */
export async function recalcOrderTotals(tx: Tx, orderId: string): Promise<OrderTotals> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { discountType: true, discountValue: true },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");

  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: {
      quantity: true,
      totalPrice: true,
      menuItem: { select: { name_zh: true, name_en: true, name_th: true } },
    },
  });
  const weighings = await tx.weighing.findMany({
    where: { orderId },
    select: { weightKg: true },
  });

  const rodCount = countRodsFromItems(items);
  const includedKg = rodCount * FISH_INCLUDED_KG_PER_ROD;
  const totals = computeOrderTotals({
    subtotal: items.reduce((s, i) => s + i.totalPrice, 0),
    fishWeightKg: weighings.reduce((s, w) => s + w.weightKg, 0),
    discountType: order.discountType as DiscountTypeValue,
    discountValue: order.discountValue,
    includedKg,
  });

  await tx.order.update({
    where: { id: orderId },
    data: {
      subtotal: totals.subtotal,
      fishWeightKg: totals.fishWeightKg,
      fishCharge: totals.fishCharge,
      discountAmount: totals.discountAmount,
      totalPrice: totals.totalPrice,
    },
  });

  return totals;
}

/**
 * 结清订单：预占转正式扣减 + 状态置为 SETTLED。
 *
 * 返回出库结果：`healed > 0` 表示这单有「下单时未预占到」的菜品，
 * 本次结算在台账上补记了出库（否则就会变成「卖了没扣」）。
 *
 * 幂等（consumeReservation 内部有 stockConsumedAt 守卫 + 台账幂等键）。
 */
export async function settleOrder(
  tx: Tx,
  orderId: string,
  opts: { adminName?: string } = {},
): Promise<ConsumeResult> {
  const result = await consumeReservation(tx, orderId, opts);
  await tx.order.update({
    where: { id: orderId },
    data: { status: "SETTLED", settledAt: new Date() },
  });
  return result;
}

export interface StaffChangeCheck {
  gross: number;
  /** 相对毛额的改价比例（正数=减少） */
  ratio: number;
  /** 是否超出店员权限（需要管理员密码） */
  needsAdmin: boolean;
}

/**
 * 判断一次折扣/改价是否超出店员权限（默认 ±10%）。
 * 注意 discountAmount 是由 discountValue 推出的，因此这里按「减免额 / 毛额」比较。
 */
export function checkStaffChange(
  gross: number,
  discountAmount: number,
  limitRatio = STAFF_DISCOUNT_LIMIT_RATIO,
): StaffChangeCheck {
  const g = Math.max(0, gross);
  const ratio = g > 0 ? discountAmount / g : 0;
  return { gross: g, ratio, needsAdmin: ratio > limitRatio + 1e-9 };
}

/** 按曼谷日期生成订单号（调用前需保证在事务内，重试由调用方负责） */
export async function generateOrderNumber(
  tx: Tx,
  attempt = 0,
): Promise<string> {
  const { start, end } = bangkokDayRange();
  const count = await tx.order.count({
    where: { createdAt: { gte: start, lt: end } },
  });
  const day = bangkokDateString().replace(/-/g, "");
  const seq = String(count + 1 + attempt).padStart(3, "0");
  return `FP-${day}-${seq}`;
}

/** 订单是否还允许改动菜品（未结清、未取消） */
export function isOrderEditable(status: string): boolean {
  return status !== "SETTLED" && status !== "CANCELLED";
}

/** 后厨/收银视角的「进行中」订单状态 */
export const OPEN_ORDER_STATUSES = [
  "PENDING",
  "PREPARING",
  "READY",
  "SERVED",
] as const;

/** 尚未结清但已完成的订单（待收款） */
export function needsSettlement(status: string, settlementMode: string): boolean {
  return (
    settlementMode === "POSTPAID" &&
    status !== "SETTLED" &&
    status !== "CANCELLED"
  );
}

/** 供报表/仪表盘复用的净额查询（避免各处硬编码口径） */
export async function sumOrderNetRevenue(from: Date, to: Date): Promise<number> {
  const rows = await prisma.order.findMany({
    where: { status: { not: "CANCELLED" }, createdAt: { gte: from, lt: to } },
    select: { totalPrice: true },
  });
  return rows.reduce((s, r) => s + r.totalPrice, 0);
}
