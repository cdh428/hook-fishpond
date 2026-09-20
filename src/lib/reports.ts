import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * 报表核心库 —— 销售报表 / 菜品成本毛利的唯一计算来源。
 *
 * 设计约定（用户已确认）：
 *  - 总营收 = 点餐/饮品营收（Order，排除 CANCELLED）+ 预约营收（Booking，排除 CANCELLED），分开呈现。
 *  - 毛利口径 v1 = 售价（下单单价的快照）− 当前成本价。
 *  - **未设成本价的菜品一律排除出毛利统计**（否则毛利率虚高），单独标注「未设成本」。
 *  - 目标毛利率：全局默认 60%，菜品可用 targetMargin 单独覆盖。
 *  - 已取消的订单不计入营收与销量，但单独显示数量供核对。
 *  - 损耗/自用单列「损耗成本」，不计入菜品毛利。
 *  - 所有「天」一律按曼谷时区（UTC+7，无夏令时）切分。
 */

/** 全局默认目标毛利率（菜品未单独设置时生效） */
export const DEFAULT_TARGET_MARGIN = 0.6;

export type ReportRange = "today" | "week" | "month" | "custom";
export type TrendGrain = "day" | "week" | "month";

export interface ResolvedPeriod {
  range: ReportRange;
  /** UTC 瞬时，含 */
  from: Date;
  /** UTC 瞬时，不含 */
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  /** 曼谷日期字符串 YYYY-MM-DD（含），用于 Booking.date 这种 DATE 列 */
  fromDate: string;
  toDate: string;
  prevFromDate: string;
  prevToDate: string;
  days: number;
  grain: TrendGrain;
}

// ---------- 曼谷时区工具 ----------

const DAY_MS = 24 * 60 * 60 * 1000;
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

interface BkkParts {
  y: number;
  m: number;
  d: number;
  /** 0=周日 … 6=周六 */
  wd: number;
}

/** 取某个 UTC 瞬时在曼谷的「年月日 + 星期」 */
export function bkkParts(d: Date): BkkParts {
  const t = new Date(d.getTime() + BKK_OFFSET_MS);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    wd: t.getUTCDay(),
  };
}

/** 曼谷某日 00:00 对应的 UTC 瞬时 */
export function bkkDayStart(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d) - BKK_OFFSET_MS);
}

export function fmtDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addDaysStr(s: string, n: number): string {
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS);
  return fmtDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// ---------- 期间解析 ----------

export function resolvePeriod(
  range: ReportRange,
  opts: { from?: string | null; to?: string | null; grain?: TrendGrain | null } = {},
  now: Date = new Date(),
): ResolvedPeriod {
  const t = bkkParts(now);
  let startDate: string;
  let days: number;

  if (range === "week") {
    const back = (t.wd + 6) % 7; // 周一为一周之始
    const monday = addDaysStr(fmtDate(t.y, t.m, t.d), -back);
    startDate = monday;
    days = 7;
  } else if (range === "month") {
    startDate = fmtDate(t.y, t.m, 1);
    days = daysInMonth(t.y, t.m);
  } else if (range === "custom" && opts.from && opts.to) {
    startDate = opts.from;
    const toIncl = opts.to;
    const [fy, fm, fd] = startDate.split("-").map(Number);
    const [ty, tm, td] = toIncl.split("-").map(Number);
    const diff = Math.round(
      (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS,
    );
    days = Math.max(1, diff + 1);
  } else {
    startDate = fmtDate(t.y, t.m, t.d);
    days = 1;
  }

  const [sy, sm, sd] = startDate.split("-").map(Number);
  const from = bkkDayStart(sy, sm, sd);
  const to = new Date(from.getTime() + days * DAY_MS);
  const prevFrom = new Date(from.getTime() - days * DAY_MS);
  const prevTo = from;

  const lastDay = addDaysStr(startDate, days - 1);
  const prevLastDay = addDaysStr(startDate, -1);

  const grain: TrendGrain =
    opts.grain ?? (range === "today" ? "day" : "day");

  return {
    range,
    from,
    to,
    prevFrom,
    prevTo,
    fromDate: startDate,
    toDate: lastDay,
    prevFromDate: addDaysStr(startDate, -days),
    prevToDate: prevLastDay,
    days,
    grain,
  };
}

// ---------- 类型 ----------

export interface PeriodRevenue {
  orderRevenue: number;
  bookingRevenue: number;
  totalRevenue: number;
  orderCount: number;
  bookingCount: number;
  cancelledOrders: number;
  avgTicket: number;
  /** 计入毛利统计的营收（仅含已设成本的菜品） */
  coveredRevenue: number;
  cogs: number;
  grossProfit: number;
  /** 0-1，无覆盖营收时为 null */
  marginRate: number | null;
  wasteCost: number;
  itemsSold: number;
  /** 期间渔获费合计（已包含在 orderRevenue 里） */
  fishRevenue: number;
  /** 期间渔获总重（kg） */
  fishWeightKg: number;
  /** 期间折扣合计（正数=已减免，已从 orderRevenue 中扣除） */
  discountTotal: number;
}

export interface ReportOverview extends PeriodRevenue {
  /** 在售但未设成本价的菜品数（全量，与「未设成本」筛选一致） */
  itemsWithoutCost: number;
  prev: PeriodRevenue;
  /** 环比变化率（0-1），上期为 0 时为 null */
  deltas: {
    totalRevenue: number | null;
    orderRevenue: number | null;
    bookingRevenue: number | null;
    grossProfit: number | null;
    orderCount: number | null;
    marginRate: number | null;
  };
  period: {
    range: ReportRange;
    fromDate: string;
    toDate: string;
    days: number;
    grain: TrendGrain;
    targetMargin: number;
  };
}

export interface TrendPoint {
  key: string;
  /** YYYY-MM-DD 或 YYYY-MM */
  orderRevenue: number;
  bookingRevenue: number;
  revenue: number;
  profit: number;
  orders: number;
}

export interface ReportItemStat {
  id: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  category: string;
  price: number;
  costPrice: number | null;
  targetMargin: number | null;
  effectiveTarget: number;
  /** 期间销量 */
  qty: number;
  /** 期间营收 */
  revenue: number;
  /** 期间毛利额（未设成本 → null） */
  profit: number | null;
  /** 期间毛利率 0-1（未设成本 → null） */
  marginRate: number | null;
  belowTarget: boolean;
  stockType: string;
}

export interface ReportStructure {
  hourly: { hour: number; orders: number }[];
  payments: { method: string; count: number; amount: number }[];
  ordersWithoutPayment: number;
  ponds: { type: string; name_zh: string; name_en: string; name_th: string; bookings: number; revenue: number; participants: number }[];
  orderTypes: { type: string; orders: number; revenue: number }[];
  tables: { code: string; name: string; orders: number }[];
}

export interface ReportPayload {
  overview: ReportOverview;
  trend: TrendPoint[];
  topItems: ReportItemStat[];
  margins: ReportItemStat[];
  structure: ReportStructure;
}

// ---------- 单期营收 ----------

async function fetchPeriodRevenue(
  from: Date,
  to: Date,
  fromDate: string,
  toDate: string,
): Promise<PeriodRevenue> {
  const [orderAgg] = await prisma.$queryRaw<
    {
      orders: number;
      revenue: number;
      fish: number;
      fishkg: number;
      discount: number;
    }[]
  >(Prisma.sql`
    SELECT COUNT(*)::int AS orders,
           COALESCE(SUM("totalPrice"), 0)::float8 AS revenue,
           COALESCE(SUM("fishCharge"), 0)::float8 AS fish,
           COALESCE(SUM("fishWeightKg"), 0)::float8 AS fishkg,
           COALESCE(SUM("discountAmount"), 0)::float8 AS discount
    FROM "Order"
    WHERE "status" <> 'CANCELLED'
      AND "createdAt" >= ${from} AND "createdAt" < ${to}
  `);

  const [bookingAgg] = await prisma.$queryRaw<
    { bookings: number; revenue: number }[]
  >(Prisma.sql`
    SELECT COUNT(*)::int AS bookings,
           COALESCE(SUM("totalPrice"), 0)::float8 AS revenue
    FROM "Booking"
    WHERE "status" <> 'CANCELLED'
      AND "date" >= ${fromDate}::date AND "date" <= ${toDate}::date
  `);

  const [cancelledAgg] = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS n FROM "Order"
    WHERE "status" = 'CANCELLED'
      AND "createdAt" >= ${from} AND "createdAt" < ${to}
  `);

  const [salesAgg] = await prisma.$queryRaw<
    { covered: number; cost: number; qty: number }[]
  >(Prisma.sql`
    SELECT
      COALESCE(SUM(CASE WHEN mi."costPrice" IS NOT NULL THEN oi."totalPrice" ELSE 0 END), 0)::float8 AS covered,
      COALESCE(SUM(CASE WHEN mi."costPrice" IS NOT NULL THEN oi."quantity" * mi."costPrice" ELSE 0 END), 0)::float8 AS cost,
      COALESCE(SUM(oi."quantity"), 0)::int AS qty
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    JOIN "MenuItem" mi ON mi."id" = oi."menuItemId"
    WHERE o."status" <> 'CANCELLED'
      AND o."createdAt" >= ${from} AND o."createdAt" < ${to}
  `);

  const [wasteAgg] = await prisma.$queryRaw<{ cost: number }[]>(Prisma.sql`
    SELECT COALESCE(SUM(ABS(sm."quantity") * COALESCE(mi."costPrice", 0)), 0)::float8 AS cost
    FROM "StockMovement" sm
    JOIN "MenuItem" mi ON mi."id" = sm."itemId"
    WHERE sm."type" = 'WASTE'
      AND sm."createdAt" >= ${from} AND sm."createdAt" < ${to}
  `);

  const orderRevenue = orderAgg?.revenue ?? 0;
  const bookingRevenue = bookingAgg?.revenue ?? 0;
  const orderCount = orderAgg?.orders ?? 0;
  const bookingCount = bookingAgg?.bookings ?? 0;
  const coveredRevenue = salesAgg?.covered ?? 0;
  const cogs = salesAgg?.cost ?? 0;
  const grossProfit = coveredRevenue - cogs;

  return {
    orderRevenue,
    bookingRevenue,
    totalRevenue: orderRevenue + bookingRevenue,
    orderCount,
    bookingCount,
    cancelledOrders: cancelledAgg?.n ?? 0,
    avgTicket: orderCount > 0 ? orderRevenue / orderCount : 0,
    coveredRevenue,
    cogs,
    grossProfit,
    marginRate: coveredRevenue > 0 ? grossProfit / coveredRevenue : null,
    wasteCost: wasteAgg?.cost ?? 0,
    itemsSold: salesAgg?.qty ?? 0,
    fishRevenue: orderAgg?.fish ?? 0,
    fishWeightKg: orderAgg?.fishkg ?? 0,
    discountTotal: orderAgg?.discount ?? 0,
  };
}

function delta(cur: number, prev: number): number | null {
  if (!Number.isFinite(prev) || prev === 0) return null;
  return (cur - prev) / prev;
}

function deltaRate(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return (cur - prev) / prev;
}

// ---------- 趋势 ----------

interface DayRow {
  day: string | Date;
  orders: number;
  revenue: number;
}

function toDayKey(v: string | Date): string {
  if (typeof v === "string") return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}

function bucketKeyOf(dayKey: string, grain: TrendGrain): string {
  if (grain === "month") return dayKey.slice(0, 7);
  if (grain === "week") {
    const [y, m, d] = dayKey.split("-").map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const back = (wd + 6) % 7;
    return addDaysStr(dayKey, -back);
  }
  return dayKey;
}

async function fetchTrend(
  period: ResolvedPeriod,
  grain: TrendGrain,
): Promise<TrendPoint[]> {
  const orderRows = await prisma.$queryRaw<DayRow[]>(Prisma.sql`
    SELECT ((o."createdAt" + interval '7 hours')::date) AS day,
           COUNT(*)::int AS orders,
           COALESCE(SUM(o."totalPrice"), 0)::float8 AS revenue
    FROM "Order" o
    WHERE o."status" <> 'CANCELLED'
      AND o."createdAt" >= ${period.from} AND o."createdAt" < ${period.to}
    GROUP BY 1
  `);

  const bookingRows = await prisma.$queryRaw<DayRow[]>(Prisma.sql`
    SELECT b."date" AS day,
           COUNT(*)::int AS orders,
           COALESCE(SUM(b."totalPrice"), 0)::float8 AS revenue
    FROM "Booking" b
    WHERE b."status" <> 'CANCELLED'
      AND b."date" >= ${period.fromDate}::date AND b."date" <= ${period.toDate}::date
    GROUP BY 1
  `);

  const profitRows = await prisma.$queryRaw<
    { day: string | Date; covered: number; cost: number }[]
  >(Prisma.sql`
    SELECT ((o."createdAt" + interval '7 hours')::date) AS day,
           COALESCE(SUM(CASE WHEN mi."costPrice" IS NOT NULL THEN oi."totalPrice" ELSE 0 END), 0)::float8 AS covered,
           COALESCE(SUM(CASE WHEN mi."costPrice" IS NOT NULL THEN oi."quantity" * mi."costPrice" ELSE 0 END), 0)::float8 AS cost
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    JOIN "MenuItem" mi ON mi."id" = oi."menuItemId"
    WHERE o."status" <> 'CANCELLED'
      AND o."createdAt" >= ${period.from} AND o."createdAt" < ${period.to}
    GROUP BY 1
  `);

  const orderMap = new Map<string, { revenue: number; orders: number }>();
  for (const r of orderRows) {
    const k = toDayKey(r.day);
    orderMap.set(k, { revenue: r.revenue ?? 0, orders: r.orders ?? 0 });
  }
  const bookingMap = new Map<string, number>();
  for (const r of bookingRows) {
    bookingMap.set(toDayKey(r.day), r.revenue ?? 0);
  }
  const profitMap = new Map<string, number>();
  for (const r of profitRows) {
    profitMap.set(toDayKey(r.day), (r.covered ?? 0) - (r.cost ?? 0));
  }

  // 逐日遍历，按 grain 归并成桶（保证没有数据的日期也占位，图表不塌）
  const buckets = new Map<string, TrendPoint>();
  for (let i = 0; i < period.days; i++) {
    const dayKey = addDaysStr(period.fromDate, i);
    const key = bucketKeyOf(dayKey, grain);
    let b = buckets.get(key);
    if (!b) {
      b = { key, orderRevenue: 0, bookingRevenue: 0, revenue: 0, profit: 0, orders: 0 };
      buckets.set(key, b);
    }
    const o = orderMap.get(dayKey);
    b.orderRevenue += o?.revenue ?? 0;
    b.orders += o?.orders ?? 0;
    b.bookingRevenue += bookingMap.get(dayKey) ?? 0;
    b.profit += profitMap.get(dayKey) ?? 0;
  }
  for (const b of buckets.values()) b.revenue = b.orderRevenue + b.bookingRevenue;

  return [...buckets.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

// ---------- 菜品维度 ----------

interface RawItemRow {
  id: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  category: string | null;
  price: number;
  costPrice: number | null;
  targetMargin: number | null;
  stockType: string;
  qty: number;
  revenue: number;
  cost: number;
  coveredRevenue: number;
  hasCost: boolean;
}

async function fetchItemStats(period: ResolvedPeriod): Promise<ReportItemStat[]> {
  const rows = await prisma.$queryRaw<RawItemRow[]>(Prisma.sql`
    SELECT
      oi."menuItemId" AS id,
      mi."name_zh", mi."name_en", mi."name_th",
      mi."price", mi."costPrice", mi."targetMargin", mi."stockType",
      mc."name_zh" AS category,
      COALESCE(SUM(oi."quantity"), 0)::int AS qty,
      COALESCE(SUM(oi."totalPrice"), 0)::float8 AS revenue,
      COALESCE(SUM(CASE WHEN mi."costPrice" IS NOT NULL THEN oi."quantity" * mi."costPrice" ELSE 0 END), 0)::float8 AS cost,
      COALESCE(SUM(CASE WHEN mi."costPrice" IS NOT NULL THEN oi."totalPrice" ELSE 0 END), 0)::float8 AS "coveredRevenue",
      (mi."costPrice" IS NOT NULL) AS "hasCost"
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    JOIN "MenuItem" mi ON mi."id" = oi."menuItemId"
    LEFT JOIN "MenuCategory" mc ON mc."id" = mi."categoryId"
    WHERE o."status" <> 'CANCELLED'
      AND o."createdAt" >= ${period.from} AND o."createdAt" < ${period.to}
    GROUP BY oi."menuItemId", mi."name_zh", mi."name_en", mi."name_th",
             mi."price", mi."costPrice", mi."targetMargin", mi."stockType", mc."name_zh"
  `);

  return rows.map((r) => {
    const hasCost = r.hasCost === true && r.costPrice != null;
    const profit = hasCost ? r.coveredRevenue - r.cost : null;
    const marginRate =
      hasCost && r.coveredRevenue > 0 ? (r.coveredRevenue - r.cost) / r.coveredRevenue : null;
    const effectiveTarget =
      r.targetMargin != null ? r.targetMargin : DEFAULT_TARGET_MARGIN;
    return {
      id: r.id,
      name_zh: r.name_zh,
      name_en: r.name_en,
      name_th: r.name_th,
      category: r.category ?? "",
      price: r.price,
      costPrice: r.costPrice,
      targetMargin: r.targetMargin,
      effectiveTarget,
      qty: r.qty ?? 0,
      revenue: r.revenue ?? 0,
      profit,
      marginRate,
      belowTarget: marginRate != null && marginRate < effectiveTarget,
      stockType: r.stockType,
    };
  });
}

/** 全量在售菜品的成本毛利（不依赖下单数据，用于「未设成本」补录） */
async function fetchAllMargins(): Promise<ReportItemStat[]> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      name_zh: string;
      name_en: string;
      name_th: string;
      category: string | null;
      price: number;
      costPrice: number | null;
      targetMargin: number | null;
      stockType: string;
    }[]
  >(Prisma.sql`
    SELECT mi."id", mi."name_zh", mi."name_en", mi."name_th",
           mi."price", mi."costPrice", mi."targetMargin", mi."stockType",
           mc."name_zh" AS category
    FROM "MenuItem" mi
    LEFT JOIN "MenuCategory" mc ON mc."id" = mi."categoryId"
    WHERE mi."isActive" = true
    ORDER BY mc."sortOrder" ASC, mi."sortOrder" ASC, mi."name_zh" ASC
  `);

  return rows.map((r) => {
    const hasCost = r.costPrice != null;
    const profit = hasCost ? r.price - (r.costPrice as number) : null;
    const marginRate = hasCost && r.price > 0 ? ((r.price - (r.costPrice as number)) / r.price) : null;
    const effectiveTarget =
      r.targetMargin != null ? r.targetMargin : DEFAULT_TARGET_MARGIN;
    return {
      id: r.id,
      name_zh: r.name_zh,
      name_en: r.name_en,
      name_th: r.name_th,
      category: r.category ?? "",
      price: r.price,
      costPrice: r.costPrice,
      targetMargin: r.targetMargin,
      effectiveTarget,
      qty: 0,
      revenue: 0,
      profit,
      marginRate,
      belowTarget: marginRate != null && marginRate < effectiveTarget,
      stockType: r.stockType,
    };
  });
}

// ---------- 结构 ----------

async function fetchStructure(period: ResolvedPeriod): Promise<ReportStructure> {
  const hourlyRows = await prisma.$queryRaw<{ hour: number; orders: number }[]>(
    Prisma.sql`
      SELECT EXTRACT(HOUR FROM (o."createdAt" + interval '7 hours'))::int AS hour,
             COUNT(*)::int AS orders
      FROM "Order" o
      WHERE o."status" <> 'CANCELLED'
        AND o."createdAt" >= ${period.from} AND o."createdAt" < ${period.to}
      GROUP BY 1 ORDER BY 1
    `,
  );

  const paymentRows = await prisma.$queryRaw<
    { method: string; count: number; amount: number }[]
  >(Prisma.sql`
    SELECT p."method" AS method,
           COUNT(*)::int AS count,
           COALESCE(SUM(p."amount"), 0)::float8 AS amount
    FROM "Payment" p
    WHERE p."status" <> 'FAILED'
      AND p."createdAt" >= ${period.from} AND p."createdAt" < ${period.to}
    GROUP BY 1 ORDER BY amount DESC
  `);

  const [noPayAgg] = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS n
    FROM "Order" o
    LEFT JOIN "Payment" p ON p."orderId" = o."id"
    WHERE o."status" <> 'CANCELLED' AND p."id" IS NULL
      AND o."createdAt" >= ${period.from} AND o."createdAt" < ${period.to}
  `);

  const pondRows = await prisma.$queryRaw<
    {
      type: string;
      name_zh: string;
      name_en: string;
      name_th: string;
      bookings: number;
      revenue: number;
      participants: number;
    }[]
  >(Prisma.sql`
    SELECT p."type" AS type, p."name_zh", p."name_en", p."name_th",
           COUNT(b."id")::int AS bookings,
           COALESCE(SUM(b."totalPrice"), 0)::float8 AS revenue,
           COALESCE(SUM(b."participantCount"), 0)::int AS participants
    FROM "Booking" b
    JOIN "Pond" p ON p."id" = b."pondId"
    WHERE b."status" <> 'CANCELLED'
      AND b."date" >= ${period.fromDate}::date AND b."date" <= ${period.toDate}::date
    GROUP BY 1, 2, 3, 4 ORDER BY revenue DESC
  `);

  const orderTypeRows = await prisma.$queryRaw<
    { type: string; orders: number; revenue: number }[]
  >(Prisma.sql`
    SELECT o."orderType" AS type,
           COUNT(*)::int AS orders,
           COALESCE(SUM(o."totalPrice"), 0)::float8 AS revenue
    FROM "Order" o
    WHERE o."status" <> 'CANCELLED'
      AND o."createdAt" >= ${period.from} AND o."createdAt" < ${period.to}
    GROUP BY 1 ORDER BY revenue DESC
  `);

  const tableRows = await prisma.$queryRaw<
    { code: string; name: string; orders: number }[]
  >(Prisma.sql`
    SELECT t."code" AS code, t."name_zh" AS name, COUNT(o."id")::int AS orders
    FROM "Order" o
    JOIN "DiningTable" t ON t."id" = o."tableId"
    WHERE o."status" <> 'CANCELLED'
      AND o."createdAt" >= ${period.from} AND o."createdAt" < ${period.to}
    GROUP BY 1, 2 ORDER BY orders DESC
    LIMIT 5
  `);

  return {
    hourly: hourlyRows.map((h) => ({ hour: Number(h.hour), orders: h.orders ?? 0 })),
    payments: paymentRows.map((p) => ({
      method: p.method,
      count: p.count ?? 0,
      amount: p.amount ?? 0,
    })),
    ordersWithoutPayment: noPayAgg?.n ?? 0,
    ponds: pondRows.map((p) => ({
      type: p.type,
      name_zh: p.name_zh,
      name_en: p.name_en,
      name_th: p.name_th,
      bookings: p.bookings ?? 0,
      revenue: p.revenue ?? 0,
      participants: p.participants ?? 0,
    })),
    orderTypes: orderTypeRows.map((o) => ({
      type: o.type,
      orders: o.orders ?? 0,
      revenue: o.revenue ?? 0,
    })),
    tables: tableRows.map((t) => ({
      code: t.code,
      name: t.name,
      orders: t.orders ?? 0,
    })),
  };
}

// ---------- 汇总入口 ----------

export async function buildReport(
  range: ReportRange,
  opts: { from?: string | null; to?: string | null; grain?: TrendGrain | null } = {},
): Promise<ReportPayload> {
  const period = resolvePeriod(range, opts);

  const [cur, prev, trend, topItems, margins, structure] = await Promise.all([
    fetchPeriodRevenue(period.from, period.to, period.fromDate, period.toDate),
    fetchPeriodRevenue(period.prevFrom, period.prevTo, period.prevFromDate, period.prevToDate),
    fetchTrend(period, period.grain),
    fetchItemStats(period),
    fetchAllMargins(),
    fetchStructure(period),
  ]);

  // 把期间销量合并进全量毛利列表，让「成本毛利」页既有期间毛利额又有完整清单
  const statById = new Map(topItems.map((i) => [i.id, i]));
  const mergedMargins: ReportItemStat[] = margins.map((m) => {
    const s = statById.get(m.id);
    return s ? { ...m, qty: s.qty, revenue: s.revenue } : m;
  });
  // 有销量但已下架的菜品也要出现在榜单里
  for (const s of topItems) {
    if (!mergedMargins.some((m) => m.id === s.id)) mergedMargins.push(s);
  }

  const overview: ReportOverview = {
    ...cur,
    itemsWithoutCost: margins.filter((m) => m.costPrice == null).length,
    prev,
    deltas: {
      totalRevenue: delta(cur.totalRevenue, prev.totalRevenue),
      orderRevenue: delta(cur.orderRevenue, prev.orderRevenue),
      bookingRevenue: delta(cur.bookingRevenue, prev.bookingRevenue),
      grossProfit: delta(cur.grossProfit, prev.grossProfit),
      orderCount: delta(cur.orderCount, prev.orderCount),
      marginRate: deltaRate(cur.marginRate, prev.marginRate),
    },
    period: {
      range,
      fromDate: period.fromDate,
      toDate: period.toDate,
      days: period.days,
      grain: period.grain,
      targetMargin: DEFAULT_TARGET_MARGIN,
    },
  };

  return {
    overview,
    trend,
    topItems: [...topItems].sort((a, b) => b.revenue - a.revenue),
    margins: mergedMargins,
    structure,
  };
}
