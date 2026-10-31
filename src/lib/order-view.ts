import type { ReceiptOrder, ReceiptItem } from '@/lib/print-receipt';
import { formatLineOptions, type OrderLineOption } from '@/lib/menu-options';

/**
 * 订单视图工具 —— 把 API 返回的原始订单转成界面/小票需要的形状。
 * 纯前端工具，不引入任何服务端依赖。
 */

export type Locale = 'zh' | 'en' | 'th';

export interface NamedRow {
  name_zh?: string;
  name_en?: string;
  name_th?: string;
}

export function pickName(row: NamedRow | null | undefined, locale: string): string {
  if (!row) return '';
  if (locale === 'en') return row.name_en || row.name_zh || '';
  if (locale === 'th') return row.name_th || row.name_zh || '';
  return row.name_zh || row.name_en || '';
}

/** 订单状态 → i18n key */
export const ORDER_STATUS_I18N: Record<string, string> = {
  PENDING: 'orders.pending',
  PAID: 'orders.paid',
  PREPARING: 'orders.preparing',
  READY: 'orders.ready',
  SERVED: 'orders.served',
  SETTLED: 'orders.settled',
  CANCELLED: 'orders.cancelled',
};

/** 订单状态 → 徽章配色（Tailwind 类） */
export const ORDER_STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-warning-100 text-warning-600',
  PAID: 'bg-primary-100 text-primary-700',
  PREPARING: 'bg-accent-100 text-accent-700',
  READY: 'bg-success-100 text-success-600',
  SERVED: 'bg-primary-100 text-primary-700',
  SETTLED: 'bg-neutral-100 text-neutral-500',
  CANCELLED: 'bg-error-100 text-error-600',
};

/** 后厨流程的下一步（放这里保证前后端口径一致） */
export const NEXT_STATUS: Record<string, string | null> = {
  PENDING: 'PREPARING',
  PREPARING: 'READY',
  READY: 'SERVED',
  SERVED: null,
  PAID: 'PREPARING',
  SETTLED: null,
  CANCELLED: null,
};

export const NEXT_STATUS_I18N: Record<string, string> = {
  PREPARING: 'adminOrders.markPreparing',
  READY: 'adminOrders.markReady',
  SERVED: 'adminOrders.markServed',
};

export function orderItemsTotal(items: { totalPrice: number }[]): number {
  return items.reduce((s, i) => s + (i.totalPrice || 0), 0);
}

/** 把 API 原始订单转成小票需要的形状 */
export function toReceiptOrder(raw: any, locale: string): ReceiptOrder {
  const items: ReceiptItem[] = (raw.items || []).map((it: any) => ({
    name: pickName(it.menuItem, locale),
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    totalPrice: it.totalPrice,
    note: it.note ?? null,
    // 该行下单时刻：用于按时间分组（同一次下单的行时间几乎相同）
    createdAt: it.createdAt ?? null,
    // 该行送餐时刻：null=未送，打印时打 ✓/⏳
    servedAt: it.servedAt ?? null,
    // 规格 / 面型 / 加料：后厨单必须逐行打出来，否则会做错
    optionLines: formatLineOptions(
      (Array.isArray(it.options) ? it.options : []) as OrderLineOption[],
      locale,
    ),
  }));

  const tableName = raw.table
    ? pickName(raw.table, locale).trim()
    : null;

  return {
    orderNumber: raw.orderNumber,
    createdAt: raw.createdAt,
    tableName,
    orderType: raw.orderType ?? 'DINE_IN',
    customerName: raw.customerName ?? null,
    settlementMode: raw.settlementMode ?? 'POSTPAID',
    status: raw.status,
    items,
    subtotal: raw.subtotal ?? orderItemsTotal(items),
    fishWeightKg: raw.fishWeightKg ?? 0,
    fishCharge: raw.fishCharge ?? 0,
    discountAmount: raw.discountAmount ?? 0,
    discountNote: raw.discountNote ?? null,
    totalPrice: raw.totalPrice ?? 0,
    note: raw.note ?? null,
    pickupAt: raw.pickupAt ?? null,
  };
}

/** 是否还允许改单（未结清、未取消） */
export function canEditOrder(status: string): boolean {
  return status !== 'SETTLED' && status !== 'CANCELLED';
}

/**
 * 是否需要收款结算（未结清且未取消）。
 *
 * 历史：曾只认 POSTPAID，导致「先付 PREPAID 但只付了一部分」的单
 * （如 FP-20261017-006）永远不显示结算按钮——顾客付了餐费 160、还没称重结清，
 * 却没法在后台把那 160 记成「已付」再补渔获费差额。
 * 现在放宽为**任何未结清订单**都可结算：后付 / 先付全付 / 先付部分付 一律给结算入口，
 * 差额由「需付 = 总应付 − 已付」在结算弹窗里算。
 */
export function needsSettlement(order: { settlementMode: string; status: string }): boolean {
  return order.status !== 'SETTLED' && order.status !== 'CANCELLED';
}
