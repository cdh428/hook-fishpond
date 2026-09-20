import { buildReport, bkkParts, type ReportPayload, type ReportItemStat } from './reports';
import { getClosedInfo } from './closed-days';

/**
 * LINE 日报文案生成（中 / 泰 / 英）
 *
 * 口径与后台「报表」页完全一致（同一个 buildReport('today')），
 * 保证老板在 LINE 上看到的数字和后台一模一样。
 */

export type ReportLocale = 'zh' | 'th' | 'en';

const WEEKDAYS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEKDAYS_TH = [
  'วันอาทิตย์',
  'วันจันทร์',
  'วันอังคาร',
  'วันพุธ',
  'วันพฤหัสบดี',
  'วันศุกร์',
  'วันเสาร์',
];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Labels {
  title: string;
  revenue: string;
  orderPart: string;
  bookingPart: string;
  avgTicket: string;
  grossProfit: string;
  fish: string;
  discount: string;
  target: string;
  belowTarget: string;
  topItems: string;
  byRevenue: string;
  attention: string;
  lowMargin: string;
  noCost: string;
  traffic: string;
  ponds: string;
  dineIn: string;
  takeaway: string;
  emptyDay: string;
  closedDay: string;
  demoTag: string;
}

const L: Record<ReportLocale, Labels> = {
  zh: {
    title: '快乐钓鱼场 · 日报',
    revenue: '营收',
    orderPart: '点餐',
    bookingPart: '预约',
    avgTicket: '客单价',
    grossProfit: '毛利',
    fish: '渔获',
    discount: '折扣',
    target: '目标',
    belowTarget: '毛利率低于目标',
    topItems: '热销 TOP5（按营收）',
    byRevenue: '',
    attention: '需要关注',
    lowMargin: '毛利率',
    noCost: '个菜品未设成本价，毛利率会被高估',
    traffic: '客流',
    ponds: '鱼塘',
    dineIn: '堂食',
    takeaway: '外带',
    emptyDay: '今日暂无营业额',
    closedDay: '今日为休息日',
    demoTag: '⚠️ 这是一条示例数据（非真实经营数据）',
  },
  th: {
    title: 'บ่อตกปลาแฮปปี้ · รายงานประจำวัน',
    revenue: 'รายได้',
    orderPart: 'สั่งอาหาร',
    bookingPart: 'จอง',
    avgTicket: 'ยอดเฉลี่ย/บิล',
    grossProfit: 'กำไรขั้นต้น',
    fish: 'ค่าปลา',
    discount: 'ส่วนลด',
    target: 'เป้า',
    belowTarget: 'กำไรต่ำกว่าเป้า',
    topItems: 'ขายดี TOP5 (ตามรายได้)',
    byRevenue: '',
    attention: 'ต้องติดตาม',
    lowMargin: 'กำไรขั้นต้น',
    noCost: 'เมนูยังไม่ตั้งราคาทุน กำไรจะสูงเกินจริง',
    traffic: 'ลูกค้า',
    ponds: 'บ่อ',
    dineIn: 'ทานที่ร้าน',
    takeaway: 'สั่งกลับ',
    emptyDay: 'วันนี้ยังไม่มียอดขาย',
    closedDay: 'วันนี้เป็นวันหยุดร้าน',
    demoTag: '⚠️ นี่คือข้อมูลตัวอย่าง ไม่ใช่ข้อมูลจริง',
  },
  en: {
    title: 'Hook Fishpond · Daily Report',
    revenue: 'Revenue',
    orderPart: 'Food & drinks',
    bookingPart: 'Bookings',
    avgTicket: 'Avg ticket',
    grossProfit: 'Gross profit',
    fish: 'Catch',
    discount: 'Discounts',
    target: 'target',
    belowTarget: 'Margin below target',
    topItems: 'Top 5 by revenue',
    byRevenue: '',
    attention: 'Watch list',
    lowMargin: 'margin',
    noCost: 'menu items have no cost price — margin is overstated',
    traffic: 'Traffic',
    ponds: 'Ponds',
    dineIn: 'Dine-in',
    takeaway: 'Takeaway',
    emptyDay: 'No revenue today',
    closedDay: 'Closed today (rest day)',
    demoTag: '⚠️ Sample data (not real business data)',
  },
};

function money(n: number): string {
  return `฿${Math.round(n).toLocaleString('en-US')}`;
}

function pct(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`;
}

function itemName(it: ReportItemStat, locale: ReportLocale): string {
  if (locale === 'th') return it.name_th || it.name_en || it.name_zh;
  if (locale === 'en') return it.name_en || it.name_zh || it.name_th;
  return it.name_zh || it.name_en || it.name_th;
}

export function defaultReportLocale(): ReportLocale {
  const v = (process.env.LINE_REPORT_LOCALE || '').trim().toLowerCase();
  return v === 'th' || v === 'en' || v === 'zh' ? (v as ReportLocale) : 'zh';
}

export interface ComposeOptions {
  /** 示例数据标记：会在正文顶部加一行醒目提示 */
  demo?: boolean;
  /** 当日是否休息日（用于空单日的解释） */
  closed?: { closed: boolean; reason?: 'monday' | 'holiday' };
}

/** 把报表 payload 渲染成 LINE 文本消息 */
export function composeDailyReportText(
  payload: ReportPayload,
  locale: ReportLocale,
  opts: ComposeOptions = {},
): string {
  const t = L[locale];
  const o = payload.overview;
  const [y, m, d] = o.period.toDate.split('-').map(Number);
  const weekdayIdx = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const weekday =
    locale === 'th'
      ? WEEKDAYS_TH[weekdayIdx]
      : locale === 'en'
        ? WEEKDAYS_EN[weekdayIdx]
        : WEEKDAYS_ZH[weekdayIdx];

  const lines: string[] = [];
  lines.push(`📊 ${t.title}`);
  lines.push(`${o.period.toDate}（${weekday}）`);
  if (opts.demo) lines.push(t.demoTag);
  lines.push('');

  const hasBusiness =
    o.orderCount > 0 || o.bookingCount > 0 || o.totalRevenue > 0;

  if (!hasBusiness) {
    lines.push(`${t.emptyDay}（0 ${t.orderPart} / 0 ${t.bookingPart}）`);
    if (opts.closed?.closed) {
      lines.push(
        `${t.closedDay}${opts.closed.reason === 'monday' ? '（Monday）' : ''}`,
      );
    }
    return lines.join('\n');
  }

  // 营收
  lines.push(`💰 ${t.revenue} ${money(o.totalRevenue)}`);
  lines.push(
    `· ${t.orderPart} ${money(o.orderRevenue)}（${o.orderCount}）`,
  );
  lines.push(
    `· ${t.bookingPart} ${money(o.bookingRevenue)}（${o.bookingCount}）`,
  );
  if (o.fishRevenue > 0) {
    lines.push(`· ${t.fish} ${money(o.fishRevenue)}（${o.fishWeightKg} kg）`);
  }
  if (o.discountTotal > 0) {
    lines.push(`· ${t.discount} −${money(o.discountTotal)}`);
  }
  if (o.orderCount > 0) lines.push(`· ${t.avgTicket} ${money(o.avgTicket)}`);
  lines.push('');

  // 毛利
  const marginLine =
    o.marginRate == null
      ? `${t.grossProfit} —`
      : `${t.grossProfit} ${money(o.grossProfit)} · ${pct(o.marginRate)}`;
  const targetNote =
    o.marginRate != null && o.marginRate < o.period.targetMargin
      ? `（${t.target} ${pct(o.period.targetMargin)}）⚠️ ${t.belowTarget}`
      : `（${t.target} ${pct(o.period.targetMargin)}）`;
  lines.push(`📈 ${marginLine}${o.cogs > 0 ? ` ${targetNote}` : ''}`);
  if (o.cancelledOrders > 0)
    lines.push(`· 取消/拒单 ${o.cancelledOrders} 单（未计入营收）`);
  lines.push('');

  // 热销榜
  const top = [...payload.topItems]
    .filter((i) => i.qty > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  if (top.length) {
    lines.push(`🏆 ${t.topItems}`);
    top.forEach((it, idx) => {
      lines.push(
        `${idx + 1}. ${itemName(it, locale)} ×${it.qty} ${money(it.revenue)}`,
      );
    });
    lines.push('');
  }

  // 关注项：低于目标的菜品 + 未设成本
  const lowMargin = payload.margins
    .filter((i) => i.qty > 0 && i.marginRate != null && i.belowTarget)
    .sort((a, b) => (a.marginRate ?? 1) - (b.marginRate ?? 1))
    .slice(0, 3);
  const watch: string[] = [];
  for (const it of lowMargin) {
    watch.push(
      `· ${itemName(it, locale)} ${t.lowMargin} ${pct(it.marginRate)} / ${t.target} ${pct(it.effectiveTarget)}`,
    );
  }
  if (o.itemsWithoutCost > 0) {
    watch.push(`· ${o.itemsWithoutCost} ${t.noCost}`);
  }
  if (watch.length) {
    lines.push(`🔎 ${t.attention}`);
    lines.push(...watch);
    lines.push('');
  }

  // 客流
  const ponds = payload.structure.ponds.filter((p) => p.bookings > 0);
  const dt = payload.structure.orderTypes.find((x) => x.type === 'DINE_IN');
  const ta = payload.structure.orderTypes.find((x) => x.type === 'TAKEAWAY');
  if (ponds.length || dt || ta) {
    lines.push(`👥 ${t.traffic}`);
    if (ponds.length) {
      const parts = ponds.map(
        (p) => `${locale === 'th' ? p.name_th : p.name_zh} ${p.bookings} ฿${Math.round(p.revenue).toLocaleString('en-US')}`,
      );
      lines.push(`· ${t.ponds}：${parts.join(' ｜ ')}`);
    }
    if (dt || ta) {
      lines.push(
        `· ${t.dineIn} ${dt?.orders ?? 0} ｜ ${t.takeaway} ${ta?.orders ?? 0}`,
      );
    }
  }

  return lines.join('\n').trimEnd();
}

/** 真实数据：当天（曼谷时区） */
export async function getTodayReport(): Promise<{
  payload: ReportPayload;
  closed: { closed: boolean; reason?: 'monday' | 'holiday' };
}> {
  const payload = await buildReport('today');
  const today = bkkToday();
  const closed = await getClosedInfo(today);
  return { payload, closed };
}

function bkkToday(): string {
  const p = bkkParts(new Date());
  const mm = String(p.m).padStart(2, '0');
  const dd = String(p.d).padStart(2, '0');
  return `${p.y}-${mm}-${dd}`;
}

/**
 * 示例数据（不查库）——用于「发送示例日报」按钮，
 * 让老板在还没有真实订单时也能看到推送长什么样。
 * 数字取自真实盘点过的经营场景，含一个「卖得多不赚钱」的典型菜品。
 */
export function demoReportPayload(): ReportPayload {
  const today = bkkToday();
  const item = (
    id: string,
    zh: string,
    th: string,
    en: string,
    category: string,
    price: number,
    costPrice: number | null,
    qty: number,
  ): ReportItemStat => {
    const revenue = price * qty;
    const profit = costPrice == null ? null : (price - costPrice) * qty;
    return {
      id,
      name_zh: zh,
      name_en: en,
      name_th: th,
      category,
      price,
      costPrice,
      targetMargin: null,
      effectiveTarget: 0.6,
      qty,
      revenue,
      profit,
      marginRate:
        costPrice == null || price === 0 ? null : (price - costPrice) / price,
      belowTarget:
        costPrice != null && price > 0 && (price - costPrice) / price < 0.6,
      stockType: 'NONE',
    };
  };

  const topItems = [
    item('d1', '炸鸡翅', 'ปีกบนทอด', 'Fried Chicken Wingettes', 'ทอด', 80, 34, 23),
    item('d2', '烤鱼', 'ปลาเผา', 'Grilled Fish', 'ย่าง', 250, 120, 9),
    item('d3', '象牌啤酒', 'เบียร์ช้าง', 'Chang Beer', 'เครื่องดื่ม', 90, 68, 18),
    item('d4', '冬阴功汤', 'ต้มยำกุ้ง', 'Tom Yum Goong', 'ต้ม', 180, 82, 7),
    item('d5', '泰式炒河粉', 'ผัดไทย', 'Pad Thai', 'ผัด', 120, 48, 11),
  ];

  const margins = [
    ...topItems,
    item('m1', '青木瓜沙拉', 'ส้มตำ', 'Som Tam', 'ยำ', 90, 32, 6),
  ];

  return {
    overview: {
      orderRevenue: 14200,
      bookingRevenue: 4250,
      totalRevenue: 18450,
      orderCount: 38,
      bookingCount: 6,
      cancelledOrders: 1,
      avgTicket: 374,
      coveredRevenue: 17890,
      cogs: 9330,
      grossProfit: 9120,
      marginRate: 0.494,
      wasteCost: 260,
      itemsSold: 74,
      fishRevenue: 1860,
      fishWeightKg: 42,
      discountTotal: 350,
      itemsWithoutCost: 5,
      prev: {
        orderRevenue: 12100,
        bookingRevenue: 4000,
        totalRevenue: 16100,
        orderCount: 33,
        bookingCount: 5,
        cancelledOrders: 0,
        avgTicket: 367,
        coveredRevenue: 15500,
        cogs: 8600,
        grossProfit: 6900,
        marginRate: 0.445,
        wasteCost: 180,
        itemsSold: 66,
        fishRevenue: 1200,
        fishWeightKg: 28,
        discountTotal: 120,
      },
      deltas: {
        totalRevenue: 0.146,
        orderRevenue: 0.174,
        bookingRevenue: 0.0625,
        grossProfit: 0.322,
        orderCount: 0.152,
        marginRate: 0.11,
      },
      period: {
        range: 'today',
        fromDate: today,
        toDate: today,
        days: 1,
        grain: 'day',
        targetMargin: 0.6,
      },
    },
    trend: [
      {
        key: today,
        orderRevenue: 14200,
        bookingRevenue: 4250,
        revenue: 18450,
        profit: 9120,
        orders: 38,
      },
    ],
    topItems,
    margins,
    structure: {
      hourly: [
        { hour: 12, orders: 6 },
        { hour: 13, orders: 9 },
        { hour: 17, orders: 8 },
        { hour: 18, orders: 11 },
      ],
      payments: [
        { method: 'PROMPTPAY', count: 26, amount: 11200 },
        { method: 'CASH', count: 12, amount: 7250 },
      ],
      ordersWithoutPayment: 0,
      ponds: [
        {
          type: 'LEISURE',
          name_zh: '休闲塘',
          name_en: 'Leisure Pond',
          name_th: 'บ่อพักผ่อน',
          bookings: 4,
          revenue: 3000,
          participants: 7,
        },
        {
          type: 'COMPETITION',
          name_zh: '竞赛塘',
          name_en: 'Competition Pond',
          name_th: 'บ่อแข่งขัน',
          bookings: 2,
          revenue: 1250,
          participants: 12,
        },
      ],
      orderTypes: [
        { type: 'DINE_IN', orders: 30, revenue: 11800 },
        { type: 'TAKEAWAY', orders: 8, revenue: 2400 },
      ],
      tables: [{ code: 'A01', name: '茅草屋 A01', orders: 7 }],
    },
  };
}
