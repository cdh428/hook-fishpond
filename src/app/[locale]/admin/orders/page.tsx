'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAdminOrders,
  fetchMenuItems,
  updateAdminOrderStatus,
  updateAdminOrderTable,
  updateAdminOrderItems,
  applyAdminOrderDiscount,
  cancelAdminOrder,
  restoreAdminOrder,
  addOrderWeighing,
  deleteOrderWeighing,
  settleAdminOrder,
  fetchAdminServiceCalls,
  updateServiceCall,
  type AdminOrderSummary,
  type DiscountTypeValue,
  type ServiceCallRow,
  type StockPostResult,
} from '@/lib/api-client';
import {
  ORDER_STATUS_COLOR,
  ORDER_STATUS_I18N,
  NEXT_STATUS,
  NEXT_STATUS_I18N,
  canEditOrder,
  needsSettlement,
  pickName,
  toReceiptOrder,
} from '@/lib/order-view';
import {
  buildKitchenTicketHtml,
  buildBillHtml,
  buildReceiptHtml,
  makeQrDataUrl,
  type PrintLabels,
} from '@/lib/print-receipt';
import { formatLineOptions, makeOptionKey } from '@/lib/menu-options';
import { submitPrint, describeOutcome } from '@/lib/print-agent';
import TablePicker from '@/components/TablePicker';
import OptionSheet from '@/components/OptionSheet';

type Tab = 'open' | 'awaiting' | 'settled' | 'cancelled';
type Modal =
  | { kind: 'weigh'; order: any }
  | { kind: 'discount'; order: any }
  | { kind: 'items'; order: any }
  | { kind: 'settle'; order: any }
  | { kind: 'rebind'; order: any }
  | null;

const FISH_FREE_KG = 1; // 每根鱼竿免 1kg

// 称重 5 行：第 1 行免重（不计费），后 4 行价格档
const FISH_TIER_KEYS = [
  { tier: 50, labelKey: 'tier50', priceKey: 'tierPrice50', price: 50 },
  { tier: 60, labelKey: 'tier60', priceKey: 'tierPrice60', price: 60 },
  { tier: 80, labelKey: 'tier80', priceKey: 'tierPrice80', price: 80 },
  { tier: 100, labelKey: 'tier100', priceKey: 'tierPrice100', price: 100 },
] as const;

// 鱼竿类菜品名（三语，用于在订单 items 里统计鱼竿总数）
const ROD_ITEM_NAMES = [
  "自带竿", "自带杆", "自带钓竿", "自带魚竿",
  "租竿", "租杆", "租钓竿", "租借钓竿", "租赁钓竿", "租借钓竿",
  "Bring your own rod", "Own rod", "Rod rental", "Rented rod", "Rental rod",
  "ค่านำมาเอง", "เช่าค่านำมาเอง", "คันเบ็ด (นำมาเอง)", "ค่าเช่าคันเบ็ด", "เช่าคันเบ็ด",
];

function isRodItem(menuItem: any): boolean {
  if (!menuItem) return false;
  const names = [menuItem.name_zh, menuItem.name_en, menuItem.name_th].filter(Boolean);
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  return names.some((n: string) =>
    ROD_ITEM_NAMES.some((rod) => norm(n) === norm(rod) || norm(n).includes(norm(rod))),
  );
}

/** 统计订单里鱼竿总数（自带杆 + 租杆 数量） */
function countRods(order: any): number {
  const items = order?.items || [];
  return items.reduce((s: number, it: any) => s + (isRodItem(it?.menuItem) ? (it.quantity || 0) : 0), 0);
}

export default function AdminOrdersPage() {
  const t = useTranslations();
  const locale = useLocale();

  const [orders, setOrders] = useState<any[]>([]);
  const [summary, setSummary] = useState<AdminOrderSummary>({
    open: 0,
    awaitingCount: 0,
    awaitingAmount: 0,
    unsettledPrepaid: 0,
  });
  const [tab, setTab] = useState<Tab>('open');
  const [todayOnly, setTodayOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState('');
  // 呼叫服务看板：顾客按桌上的按钮 → 这里闪出来（15 秒轮询，失败静默）
  const [calls, setCalls] = useState<ServiceCallRow[]>([]);
  const [callBusy, setCallBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // 「进行中 / 待收款」不受「只看今天」限制：跨天未结的桌必须一直可见，
      // 否则隔天就在后台消失，钱收不到也结不掉。已结算 / 已取消才按日期筛。
      const scope =
        tab === 'open' || tab === 'awaiting'
          ? 'unsettled'
          : todayOnly
            ? 'today'
            : undefined;
      const res = await fetchAdminOrders({ scope });
      // 财务口径：按「最近一次变动」倒序 —— 追加了菜、记了一笔收款、改了折扣，
      // 这张单立刻浮到顶部。结算时间也要算进变动时间（结清也是一次变动）。
      const activityAt = (o: any): number =>
        Math.max(
          new Date(o.updatedAt || o.createdAt || 0).getTime(),
          new Date(o.settledAt || 0).getTime(),
          ...(Array.isArray(o.paymentRecords)
            ? o.paymentRecords.map((r: any) => new Date(r.paidAt || 0).getTime())
            : [0]),
          ...(Array.isArray(o.items)
            ? o.items.map((it: any) => new Date(it.createdAt || 0).getTime())
            : [0]),
        );
      setOrders(
        [...res.orders].sort((a, b) => activityAt(b) - activityAt(a)),
      );
      setSummary(res.summary);
    } catch (e: any) {
      setError(e?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [tab, todayOnly, t]);

  useEffect(() => {
    load();
  }, [load]);

  const loadCalls = useCallback(async () => {
    try {
      const res = await fetchAdminServiceCalls();
      setCalls(res.pending);
    } catch {
      /* 静默：呼叫看板不该打断订单操作 */
    }
  }, []);

  useEffect(() => {
    loadCalls();
    const id = window.setInterval(loadCalls, 15000);
    return () => window.clearInterval(id);
  }, [loadCalls]);

  const handleCall = async (id: string, status: 'ACKNOWLEDGED' | 'DONE') => {
    setCallBusy(id);
    try {
      await updateServiceCall(id, status);
      await loadCalls();
    } catch (e: any) {
      setError(e?.message || t('common.error'));
    } finally {
      setCallBusy(null);
    }
  };

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2600);
  };

  const patchOrder = (updated: any) => {
    if (!updated?.id) return;
    setOrders((list) => list.map((o) => (o.id === updated.id ? updated : o)));
  };

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (tab === 'open') return ['PENDING', 'PREPARING', 'READY', 'SERVED', 'PAID'].includes(o.status);
      if (tab === 'awaiting') return needsSettlement(o);
      if (tab === 'settled') return o.status === 'SETTLED';
      return o.status === 'CANCELLED';
    });
  }, [orders, tab]);

  // ---------- 打印文案（全部来自翻译，不硬编码） ----------
  const printLabels: PrintLabels = useMemo(
    () => ({
      brand: t('common.siteName'),
      brandSub: t('printLabels.brandSub'),
      kitchenTicket: t('printLabels.kitchenTicket'),
      bill: t('printLabels.bill'),
      receipt: t('printLabels.receipt'),
      orderNo: t('orders.orderNumber'),
      table: t('printLabels.table'),
      takeaway: t('orderType.takeaway'),
      dineIn: t('orderType.dineIn'),
      customer: t('admin.customer'),
      time: t('printLabels.time'),
      item: t('printLabels.item'),
      qty: t('printLabels.qty'),
      amount: t('admin.amount'),
      subtotal: t('adminOrders.subtotal'),
      fishCharge: t('adminOrders.fishCharge'),
      fishWeight: t('adminOrders.weightKg'),
      discount: t('adminOrders.discount'),
      total: t('payment.total'),
      note: t('cart.orderNote'),
      status: t('orders.status'),
      settlementMode: t('adminOrders.settlementMode'),
      prepaid: t('adminOrders.prepaid'),
      postpaid: t('adminOrders.postpaid'),
      scanToPay: t('adminOrders.scanToPay'),
      paidAt: t('adminOrders.settledAt'),
      pickupAt: t('cart.pickupTime'),
      thanks: t('printLabels.thanks'),
    }),
    [t],
  );

  // ---------- 动作 ----------
  const doPrintKitchen = async (order: any) => {
    const html = buildKitchenTicketHtml(toReceiptOrder(order, locale), printLabels);
    const outcome = await submitPrint(html, 'kitchen');
    flash(describeOutcome(outcome, t));
  };

  const doPrintBill = async (order: any, qrString?: string | null) => {
    let qrDataUrl: string | null = null;
    if (qrString) {
      try {
        qrDataUrl = await makeQrDataUrl(qrString);
      } catch {
        qrDataUrl = null;
      }
    }
    const html = buildBillHtml(toReceiptOrder(order, locale), { qrDataUrl, labels: printLabels });
    const outcome = await submitPrint(html, 'bill');
    flash(describeOutcome(outcome, t));
  };

  const doPrintReceipt = async (order: any) => {
    const html = buildReceiptHtml(toReceiptOrder(order, locale), { labels: printLabels });
    const outcome = await submitPrint(html, 'receipt');
    flash(describeOutcome(outcome, t));
  };

  const advanceStatus = async (order: any) => {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setBusy(true);
    try {
      const updated = await updateAdminOrderStatus(order.id, next as any);
      patchOrder(updated);
      flash(t('common.success'));
    } catch (e: any) {
      setError(e?.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async (order: any) => {
    if (!window.confirm(t('adminOrders.cancelConfirm', { order: order.orderNumber }))) return;
    setBusy(true);
    try {
      const updated = await cancelAdminOrder(order.id);
      patchOrder(updated);
      await load();
      flash(t('adminOrders.cancelledToast'));
    } catch (e: any) {
      setError(e?.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async (order: any) => {
    if (!window.confirm(t('adminOrders.restoreConfirm', { order: order.orderNumber }))) return;
    setBusy(true);
    try {
      await restoreAdminOrder(order.id, 'PENDING');
      await load();
      flash(t('adminOrders.restoredToast'));
    } catch (e: any) {
      setError(e?.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const tabs: { key: Tab; labelKey: string; count: number }[] = [
    { key: 'open', labelKey: 'adminOrders.tabOpen', count: summary.open },
    { key: 'awaiting', labelKey: 'adminOrders.tabAwaiting', count: summary.awaitingCount },
    { key: 'settled', labelKey: 'adminOrders.tabSettled', count: 0 },
    { key: 'cancelled', labelKey: 'adminOrders.tabCancelled', count: 0 },
  ];

  return (
    <>
      {/* 顶部汇总 */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-accent-50 p-3 text-accent-700">
          <p className="text-xs opacity-80">{t('adminOrders.tabOpen')}</p>
          <p className="mt-0.5 text-2xl font-bold">{summary.open}</p>
        </div>
        <div className="rounded-xl bg-primary-50 p-3 text-primary-700">
          <p className="text-xs opacity-80">{t('adminOrders.awaitingAmount')}</p>
          <p className="mt-0.5 text-2xl font-bold">
            ฿{summary.awaitingAmount.toLocaleString()}
          </p>
          <p className="text-[11px] opacity-70">
            {summary.awaitingCount} {t('adminOrders.ordersUnit')}
          </p>
        </div>
      </div>

      {/* 呼叫服务看板（有未处理的呼叫才出现，处理完自动消失） */}
      {calls.length > 0 && (
        <div className="mb-4 space-y-2">
          {calls.map((c) => {
            const icon =
              (
                { ASSISTANCE: '🛎️', WATER: '💧', TISSUE: '🧻', BILL: '💰' } as Record<
                  string,
                  string
                >
              )[c.type] ?? '🛎️';
            const pending = c.status === 'PENDING';
            const label =
              (
                {
                  ASSISTANCE: t('serviceCall.assistance'),
                  WATER: t('serviceCall.water'),
                  TISSUE: t('serviceCall.tissue'),
                  BILL: t('serviceCall.bill'),
                } as Record<string, string>
              )[c.type] ?? t('serviceCall.assistance');
            return (
              <div
                key={c.id}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 ${
                  pending ? 'bg-error-50 ring-1 ring-error-200' : 'bg-warning-50'
                }`}
              >
                <span className="text-lg">{icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-800">
                    {c.tableCode} · {label}
                  </p>
                  <p className="text-[11px] text-neutral-500">
                    {new Date(c.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {!pending && ` · ${t('serviceCall.acknowledged')}`}
                  </p>
                </div>
                {pending ? (
                  <button
                    onClick={() => handleCall(c.id, 'ACKNOWLEDGED')}
                    disabled={callBusy === c.id}
                    className="shrink-0 rounded-lg bg-error-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {t('serviceCall.acknowledge')}
                  </button>
                ) : (
                  <button
                    onClick={() => handleCall(c.id, 'DONE')}
                    disabled={callBusy === c.id}
                    className="shrink-0 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {t('serviceCall.done')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 筛选 */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex flex-1 gap-1 overflow-x-auto rounded-xl bg-neutral-100 p-1">
          {tabs.map((x) => (
            <button
              key={x.key}
              onClick={() => setTab(x.key)}
              className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                tab === x.key ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500'
              }`}
            >
              {t(x.labelKey)}
              {x.count > 0 && (
                <span className="rounded-full bg-accent-500 px-1.5 text-[10px] font-bold text-white">
                  {x.count}
                </span>
              )}
            </button>
          ))}
        </div>
        {tab === 'settled' || tab === 'cancelled' ? (
          <button
            onClick={() => setTodayOnly((v) => !v)}
            className={`shrink-0 rounded-lg px-2.5 py-2 text-xs font-medium transition ${
              todayOnly ? 'bg-primary-700 text-white' : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {todayOnly ? t('adminOrders.today') : t('adminOrders.allTime')}
          </button>
        ) : (
          <span className="shrink-0 rounded-lg bg-neutral-100 px-2.5 py-2 text-xs font-medium text-neutral-500">
            {t('adminOrders.unsettledAllDays')}
          </span>
        )}
        <button
          onClick={load}
          className="shrink-0 rounded-lg bg-neutral-100 px-2.5 py-2 text-xs font-medium text-neutral-600"
        >
          ↻
        </button>
      </div>

      {toast && (
        <div className="mb-3 rounded-xl bg-success-50 px-3 py-2 text-xs font-medium text-success-600">
          {toast}
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-xl bg-error-50 px-3 py-2 text-xs text-error-600">{error}</div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-neutral-400">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-neutral-400">{t('common.noData')}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              busy={busy}
              onPrintKitchen={() => doPrintKitchen(order)}
              onPrintBill={() => doPrintBill(order)}
              onPrintReceipt={() => doPrintReceipt(order)}
              onAdvance={() => advanceStatus(order)}
              onCancel={() => doCancel(order)}
              onWeigh={() => setModal({ kind: 'weigh', order })}
              onDiscount={() => setModal({ kind: 'discount', order })}
              onItems={() => setModal({ kind: 'items', order })}
              onSettle={() => setModal({ kind: 'settle', order })}
              onRebind={() => setModal({ kind: 'rebind', order })}
              onRestore={() => doRestore(order)}
            />
          ))}
        </div>
      )}

      {/* ===== 改桌 ===== */}
      <TablePicker
        open={modal?.kind === 'rebind'}
        currentCode={modal?.kind === 'rebind' ? modal.order?.table?.code || null : null}
        title={
          modal?.kind === 'rebind'
            ? `${modal.order.orderNumber} · ${t('table.changeTable')}`
            : undefined
        }
        allowClear
        onSelect={async (code) => {
          if (modal?.kind !== 'rebind') return;
          setBusy(true);
          try {
            const updated = await updateAdminOrderTable(modal.order.id, code);
            patchOrder(updated);
            setModal(null);
          } catch (e: any) {
            setError(e?.message || t('common.error'));
          } finally {
            setBusy(false);
          }
        }}
        onClear={async () => {
          if (modal?.kind !== 'rebind') return;
          setBusy(true);
          try {
            const updated = await updateAdminOrderTable(modal.order.id, null);
            patchOrder(updated);
            setModal(null);
          } catch (e: any) {
            setError(e?.message || t('common.error'));
          } finally {
            setBusy(false);
          }
        }}
        onClose={() => setModal(null)}
      />

      {/* ===== 称重 ===== */}
      {modal?.kind === 'weigh' && (
        <WeighModal
          order={modal.order}
          locale={locale}
          onClose={() => setModal(null)}
          onSaved={(updated, added) => {
            patchOrder(updated);
            setModal({ kind: 'weigh', order: updated });
            if (added) flash(t('adminOrders.weighAdded'));
          }}
          onError={(m) => setError(m)}
        />
      )}

      {/* ===== 折扣 ===== */}
      {modal?.kind === 'discount' && (
        <DiscountModal
          order={modal.order}
          onClose={() => setModal(null)}
          onSaved={(updated) => {
            patchOrder(updated);
            setModal(null);
            flash(t('adminOrders.discountApplied'));
          }}
          onError={(m) => setError(m)}
        />
      )}

      {/* ===== 改单 ===== */}
      {modal?.kind === 'items' && (
        <ItemsModal
          order={modal.order}
          locale={locale}
          onClose={() => setModal(null)}
          onSaved={(updated, restored) => {
            patchOrder(updated);
            setModal(null);
            flash(
              restored > 0
                ? t('adminOrders.itemsSavedRestored', { n: restored })
                : t('adminOrders.itemsSaved'),
            );
            load();
          }}
          onError={(m) => setError(m)}
        />
      )}

      {/* ===== 结算 ===== */}
      {modal?.kind === 'settle' && (
        <SettleModal
          order={modal.order}
          locale={locale}
          printLabels={printLabels}
          onClose={() => setModal(null)}
          onSettled={(updated, stock) => {
            patchOrder(updated);
            setModal(null);
            load();
            // 结算时补记了漏扣 → 明确提示，不静默改库存
            if (stock && stock.healed > 0) {
              flash(t('adminOrders.stockHealed', { n: stock.healed }));
            } else {
              flash(t('adminOrders.settledToast'));
            }
          }}
          onError={(m) => setError(m)}
        />
      )}
    </>
  );
}

/* =====================================================================
 * 订单卡片
 * ===================================================================*/
function OrderCard({
  order,
  busy,
  onPrintKitchen,
  onPrintBill,
  onPrintReceipt,
  onAdvance,
  onCancel,
  onWeigh,
  onDiscount,
  onItems,
  onSettle,
  onRebind,
  onRestore,
}: {
  order: any;
  busy: boolean;
  onPrintKitchen: () => void;
  onPrintBill: () => void;
  onPrintReceipt: () => void;
  onAdvance: () => void;
  onCancel: () => void;
  onWeigh: () => void;
  onDiscount: () => void;
  onItems: () => void;
  onSettle: () => void;
  onRebind: () => void;
  onRestore: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const editable = canEditOrder(order.status);
  const next = NEXT_STATUS[order.status];
  const awaiting = needsSettlement(order);
  const time = order.createdAt
    ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="rounded-xl bg-white p-3 shadow-md">
      {/* 头部 */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-neutral-900">{order.orderNumber}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                ORDER_STATUS_COLOR[order.status] || 'bg-neutral-100 text-neutral-600'
              }`}
            >
              {t(ORDER_STATUS_I18N[order.status] || 'orders.pending')}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
            <button
              onClick={onRebind}
              className="rounded bg-accent-50 px-1.5 py-0.5 font-medium text-accent-700 hover:bg-accent-100"
            >
              {order.orderType === 'TAKEAWAY' || !order.table
                ? `🥡 ${t('orderType.takeaway')}`
                : `🪑 ${pickName(order.table, locale) || order.table.code}`}
            </button>
            {order.pickupAt && (
              <span className="rounded bg-primary-50 px-1.5 py-0.5 font-medium text-primary-700">
                ⏰ {t('cart.pickupTime')}{' '}
                {new Date(order.pickupAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
            <span>·</span>
            <span>{time}</span>
            <span>·</span>
            <span>{order.customerName}</span>
            <span>·</span>
            <span
              className={
                order.settlementMode === 'PREPAID'
                  ? 'font-medium text-primary-600'
                  : 'font-medium text-warning-600'
              }
            >
              {order.settlementMode === 'PREPAID'
                ? t('adminOrders.prepaid')
                : t('adminOrders.postpaid')}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {(() => {
            const total = order.totalPrice || 0;
            const prepaid = order.prepaidAmount || 0;
            const needPay = Math.max(0, Math.round((total - prepaid) * 100) / 100);
            const open = order.status !== 'SETTLED' && order.status !== 'CANCELLED';
            // 未结清：主金额突出「需付」（总应付−已付），总应付作拆解小字；
            // 已结清/取消：主金额回到「实收/总额」。
            return (
              <>
                {open ? (
                  <>
                    <p className="text-base font-bold text-accent-600">
                      {t('admin.needPay')} ฿{needPay}
                    </p>
                    <p className="text-[10px] text-neutral-400">
                      {t('payment.total')} ฿{total}
                      {prepaid > 0 && ` · ${t('adminOrders.prepaid')} ฿${prepaid}`}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-base font-bold text-neutral-900">฿{total}</p>
                    {prepaid > 0 && (
                      <p className="text-[10px] text-success-600">
                        {t('adminOrders.prepaid')} ฿{prepaid}
                      </p>
                    )}
                  </>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* 收款记录：时间正序，账本式从早到晚 */}
      {Array.isArray(order.paymentRecords) && order.paymentRecords.length > 0 && (
        <div className="mt-1.5 rounded-lg border border-neutral-100 bg-white px-2.5 py-1.5">
          <p className="text-[10px] font-bold text-neutral-500">{t('admin.paymentHistory')}</p>
          <ul className="mt-0.5 space-y-0.5">
            {order.paymentRecords.map((r: any) => (
              <li key={r.id} className="flex items-center justify-between text-[10px] text-neutral-600">
                <span className="truncate">
                  {new Date(r.paidAt).toLocaleString([], {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' · '}
                  {r.method === 'CASH'
                    ? t('payment.cash')
                    : r.method === 'PROMPTPAY'
                      ? t('payment.promptpay')
                      : r.method}
                  {r.operator && ` · ${r.operator}`}
                  {r.note && ` · ${r.note}`}
                </span>
                <span className={`ml-2 shrink-0 font-bold ${r.amount < 0 ? 'text-error-600' : 'text-neutral-800'}`}>
                  ฿{r.amount}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 菜品 */}
      <div className="space-y-0.5 rounded-lg bg-neutral-50 px-2.5 py-2">
        {(order.items || []).map((it: any) => {
          const optLines = formatLineOptions(it.options, locale);
          return (
            <div key={it.id}>
              <div className="flex justify-between text-xs">
                <span className="min-w-0 flex-1 text-neutral-700">
                  {pickName(it.menuItem, locale)} × {it.quantity}
                </span>
                <span className="shrink-0 text-neutral-500">฿{it.totalPrice}</span>
              </div>
              {optLines.map((l, i) => (
                <p key={i} className="pl-3 text-[11px] text-neutral-500">
                  {l}
                </p>
              ))}
              {it.note && (
                <p className="pl-3 text-[11px] text-accent-600">※ {it.note}</p>
              )}
            </div>
          );
        })}
        {order.fishWeightKg > 0 && (
          <div className="flex justify-between text-xs text-primary-700">
            <span>
              🐟 {t('adminOrders.fishCharge')} {order.fishWeightKg} kg
            </span>
            <span>฿{order.fishCharge}</span>
          </div>
        )}
        {order.discountAmount > 0 && (
          <div className="flex justify-between text-xs text-error-600">
            <span>
              {t('adminOrders.discount')}
              {order.discountNote ? ` (${order.discountNote})` : ''}
            </span>
            <span>−฿{order.discountAmount}</span>
          </div>
        )}
        {order.subtotal !== order.totalPrice && (
          <div className="mt-0.5 flex justify-between border-t border-neutral-200 pt-0.5 text-[11px] text-neutral-400">
            <span>{t('adminOrders.subtotal')}</span>
            <span>฿{order.subtotal}{order.fishCharge > 0 && ` + ${t('adminOrders.fishCharge')} ฿${order.fishCharge}`}</span>
          </div>
        )}
        {order.note && (
          <div className="pt-0.5 text-[11px] text-warning-600">※ {order.note}</div>
        )}
      </div>

      {/* 操作 */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Btn onClick={onPrintKitchen} tone="ghost" disabled={busy}>
          🖨 {t('adminOrders.printKitchen')}
        </Btn>
        <Btn onClick={onPrintBill} tone="ghost" disabled={busy}>
          🧾 {t('adminOrders.printBill')}
        </Btn>

        {next && (
          <Btn onClick={onAdvance} tone="primary" disabled={busy}>
            {t(NEXT_STATUS_I18N[next] || 'common.confirm')}
          </Btn>
        )}

        {editable && (
          <>
            <Btn onClick={onWeigh} tone="ghost" disabled={busy}>
              🐟 {t('adminOrders.addWeighing')}
            </Btn>
            <Btn onClick={onItems} tone="ghost" disabled={busy}>
              ✏️ {t('adminOrders.editItems')}
            </Btn>
          </>
        )}

        {editable && (
          <Btn onClick={onDiscount} tone="ghost" disabled={busy}>
            🏷 {t('adminOrders.discount')}
          </Btn>
        )}

        {awaiting && (
          <Btn onClick={onSettle} tone="accent" disabled={busy}>
            💰 {t('adminOrders.settle')}
          </Btn>
        )}

        {order.status === 'SETTLED' && (
          <Btn onClick={onPrintReceipt} tone="ghost" disabled={busy}>
            ✅ {t('adminOrders.printReceipt')}
          </Btn>
        )}

        {editable && (
          <Btn onClick={onCancel} tone="danger" disabled={busy}>
            {t('adminOrders.cancelOrder')}
          </Btn>
        )}

        {order.status === 'CANCELLED' && (
          <Btn onClick={onRestore} tone="primary" disabled={busy}>
            ↩ {t('adminOrders.restoreOrder')}
          </Btn>
        )}
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  tone = 'ghost',
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'ghost' | 'primary' | 'accent' | 'danger';
  disabled?: boolean;
}) {
  const tones: Record<string, string> = {
    ghost: 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
    primary: 'bg-primary-700 text-white hover:bg-primary-800',
    accent: 'bg-accent-500 text-white hover:bg-accent-600',
    danger: 'bg-error-50 text-error-600 hover:bg-error-100',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

/* =====================================================================
 * 弹窗外壳
 * ===================================================================*/
function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative my-auto max-h-[92dvh] w-full max-w-md md:max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-neutral-900">{title}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* =====================================================================
 * 称重
 * ===================================================================*/
function WeighModal({
  order,
  locale,
  onClose,
  onSaved,
  onError,
}: {
  order: any;
  locale: string;
  onClose: () => void;
  onSaved: (updated: any, added?: boolean) => void;
  onError: (m: string) => void;
}) {
  const t = useTranslations();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [freeInput, setFreeInput] = useState('');
  const [tierInputs, setTierInputs] = useState<Record<number, string>>({});

  const weighings = order.weighings || [];
  const totalKg = weighings.reduce((s: number, w: any) => s + w.weightKg, 0);
  const rodCount = countRods(order);
  const freeKg = rodCount * FISH_FREE_KG; // 总免重 = 鱼竿数 × 1kg

  // 免重行已填（含本次）
  const freeUsed = weighings
    .filter((w: any) => w.fishTier === 0)
    .reduce((s: number, w: any) => s + w.weightKg, 0);
  const newFreeKg = Number(freeInput) || 0;
  const freeTotal = freeUsed + newFreeKg;
  const freeOver = freeTotal > freeKg + 1e-9;

  // 各价格档本次填写
  const tierVals = FISH_TIER_KEYS.map((k) => ({
    ...k,
    kg: Number(tierInputs[k.tier]) || 0,
    amount: (Number(tierInputs[k.tier]) || 0) * k.price,
  }));
  const newPaidKg = tierVals.reduce((s, x) => s + x.kg, 0);
  const newPaidCharge = tierVals.reduce((s, x) => s + x.amount, 0);
  // 历史收费档合计（已落库的）
  const histPaidCharge = weighings
    .filter((w: any) => w.fishTier && w.fishTier !== 0)
    .reduce((s: number, w: any) => s + (w.amount || 0), 0);

  const setTier = (tier: number, v: string) =>
    setTierInputs((s) => ({ ...s, [tier]: v }));

  const anyInput = newFreeKg > 0 || newPaidKg > 0;

  const add = async () => {
    if (!anyInput) return;
    // 前端校验：免重超额
    if (freeOver) {
      onError(t('adminOrders.freeOverMsg'));
      return;
    }
    setBusy(true);
    try {
      let updated: any = order;
      // 免重行
      if (newFreeKg > 0) {
        updated = await addOrderWeighing(order.id, {
          weightKg: newFreeKg,
          fishTier: 0,
          note: note || undefined,
        });
      }
      // 4 个收费档
      for (const x of tierVals) {
        if (x.kg > 0) {
          updated = await addOrderWeighing(order.id, {
            weightKg: x.kg,
            fishTier: x.tier,
            note: note || undefined,
          });
        }
      }
      setFreeInput('');
      setTierInputs({});
      setNote('');
      onSaved(updated, true);
    } catch (e: any) {
      if (e?.message?.includes('FREE_TIER_EXCEEDED')) {
        onError(t('adminOrders.freeOverMsg'));
      } else {
        onError(e?.message || t('common.error'));
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (weighingId: string) => {
    setBusy(true);
    try {
      const updated = await deleteOrderWeighing(order.id, weighingId);
      onSaved(updated, false);
    } catch (e: any) {
      onError(e?.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={`🐟 ${t('adminOrders.addWeighing')} · ${order.orderNumber}`} onClose={onClose}>
      {/* 标题提示 */}
      <p className="mb-3 rounded-lg bg-primary-50 px-3 py-2 text-[11px] leading-relaxed text-primary-700">
        {t('adminOrders.weighByTier')}
      </p>

      {/* 第 1 行：免重 */}
      <div className="mb-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-xs font-semibold text-neutral-800">
            {t('adminOrders.freeRow')}
          </div>
          <div className="text-[11px] text-neutral-500">
            {t('adminOrders.totalFreeKg', { kg: freeKg })}
            {freeUsed > 0 && ` · ${t('adminOrders.freeUsed', { kg: freeUsed })}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={freeInput}
            onChange={(e) => setFreeInput(e.target.value)}
            placeholder="0.00"
            className={`w-24 rounded-lg border px-2 py-1.5 text-right text-sm font-bold focus:outline-none ${
              freeOver
                ? 'border-error-400 bg-error-50'
                : 'border-neutral-200 focus:border-primary-500'
            }`}
          />
          <span className="text-xs text-neutral-400">kg</span>
          <span className="flex-1 text-right">
            {freeOver ? (
              <span className="rounded bg-error-50 px-2 py-1 text-[11px] font-bold text-error-600">
                {t('adminOrders.freeOver')}
              </span>
            ) : newFreeKg > 0 ? (
              <span className="text-xs font-bold text-success-600">
                {t('adminOrders.freeOk')}
              </span>
            ) : (
              <span className="text-xs text-neutral-300">—</span>
            )}
          </span>
        </div>
      </div>

      {/* 第 2–5 行：4 个价格档 */}
      {tierVals.map((x) => (
        <div
          key={x.tier}
          className="mb-2 flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5"
        >
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-neutral-800">
              {t(`adminOrders.${x.labelKey}`)}
            </div>
            <div className="text-[11px] text-neutral-500">{t(`adminOrders.${x.priceKey}`)}</div>
          </div>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={tierInputs[x.tier] ?? ''}
            onChange={(e) => setTier(x.tier, e.target.value)}
            placeholder="0.00"
            className="w-20 rounded-lg border border-neutral-200 px-2 py-1.5 text-right text-sm font-bold focus:border-primary-500 focus:outline-none"
          />
          <span className="w-4 text-xs text-neutral-400">kg</span>
          <span className="w-16 text-right text-sm font-bold">
            {x.kg > 0 ? (
              <span className="text-primary-700">฿{Math.round(x.amount * 100) / 100}</span>
            ) : (
              <span className="text-neutral-300">—</span>
            )}
          </span>
        </div>
      ))}

      {/* 本次预览 */}
      <div className="mb-3 flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2 text-xs">
        <span className="text-neutral-500">
          {t('adminOrders.afterWeigh')} {newFreeKg + newPaidKg} kg
        </span>
        <span className="font-bold text-primary-700">
          ฿{Math.round(newPaidCharge * 100) / 100}
        </span>
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('adminOrders.weighNotePlaceholder')}
        className="mb-3 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
      />

      <button
        onClick={add}
        disabled={busy || !anyInput || freeOver}
        className="w-full rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {t('adminOrders.weighSave')}
      </button>

      {/* 已记录 */}
      {weighings.length > 0 && (
        <div className="mt-4 border-t border-neutral-100 pt-3">
          <p className="mb-2 text-xs font-semibold text-neutral-700">
            {t('adminOrders.weighList')}
          </p>
          <div className="space-y-1">
            {weighings.map((w: any) => (
              <div
                key={w.id}
                className="flex items-center justify-between rounded-lg bg-neutral-50 px-2.5 py-1.5 text-xs"
              >
                <span className="text-neutral-700">
                  {w.weightKg} kg
                  {w.fishTier === 0 ? ` · ${t('adminOrders.freeRow')}` : w.fishTier ? ` · ${t(`adminOrders.tier${w.fishTier}`)}` : ''}
                  {w.note ? ` · ${w.note}` : ''}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-neutral-500">
                    {w.fishTier === 0 ? t('adminOrders.freeRowFree') : `฿${w.amount}`}
                  </span>
                  <button
                    onClick={() => remove(w.id)}
                    disabled={busy}
                    className="text-error-500 hover:text-error-600 disabled:opacity-50"
                  >
                    {t('common.delete')}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 汇总 */}
      <div className="mt-4 space-y-1 rounded-xl bg-neutral-50 p-3 text-xs">
        <div className="flex justify-between">
          <span className="text-neutral-500">{t('adminOrders.fishTotal')}</span>
          <span className="font-semibold">{totalKg} kg</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">{t('adminOrders.fishCharge')}</span>
          <span className="font-semibold text-primary-700">
            ฿{Math.round((histPaidCharge + newPaidCharge) * 100) / 100}
          </span>
        </div>
      </div>
    </Sheet>
  );
}

/* =====================================================================
 * 折扣 / 改价
 * ===================================================================*/
function DiscountModal({
  order,
  onClose,
  onSaved,
  onError,
}: {
  order: any;
  onClose: () => void;
  onSaved: (updated: any) => void;
  onError: (m: string) => void;
}) {
  const t = useTranslations();
  const [type, setType] = useState<DiscountTypeValue>(
    (order.discountType as DiscountTypeValue) || 'NONE',
  );
  const [value, setValue] = useState(order.discountValue ? String(order.discountValue) : '');
  const [note, setNote] = useState(order.discountNote || '');
  const [password, setPassword] = useState('');
  const [needsAdmin, setNeedsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const gross = order.subtotal + order.fishCharge;
  const v = Number(value) || 0;
  const discountAmount =
    type === 'PERCENT' ? (gross * Math.min(v, 100)) / 100 : type === 'AMOUNT' ? Math.min(v, gross) : 0;
  const payable = Math.max(0, gross - discountAmount);
  const overLimit = gross > 0 && discountAmount / gross > 0.1 + 1e-9;

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      const updated = await applyAdminOrderDiscount(order.id, {
        discountType: type,
        discountValue: v,
        note,
        adminPassword: needsAdmin ? password : undefined,
      });
      onSaved(updated);
    } catch (e: any) {
      const m = e?.message || '';
      if (m.includes('admin password') || m.toLowerCase().includes('needs_admin')) {
        setNeedsAdmin(true);
        setMsg(t('adminOrders.needsAdminPassword'));
      } else {
        onError(m || t('common.error'));
      }
    } finally {
      setBusy(false);
    }
  };

  const types: { key: DiscountTypeValue; labelKey: string }[] = [
    { key: 'NONE', labelKey: 'adminOrders.discountNone' },
    { key: 'PERCENT', labelKey: 'adminOrders.discountPercent' },
    { key: 'AMOUNT', labelKey: 'adminOrders.discountAmountType' },
  ];

  return (
    <Sheet title={`🏷 ${t('adminOrders.discount')} · ${order.orderNumber}`} onClose={onClose}>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {types.map((x) => (
          <button
            key={x.key}
            onClick={() => setType(x.key)}
            className={`rounded-xl border-2 py-2 text-xs font-medium transition ${
              type === x.key
                ? 'border-primary-600 bg-primary-50 text-primary-700'
                : 'border-neutral-200 text-neutral-600'
            }`}
          >
            {t(x.labelKey)}
          </button>
        ))}
      </div>

      {type !== 'NONE' && (
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            {type === 'PERCENT' ? t('adminOrders.discountPercentLabel') : t('adminOrders.discountAmountLabel')}
          </label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-lg font-bold focus:border-primary-500 focus:outline-none"
          />
        </div>
      )}

      <label className="mb-1 block text-xs font-medium text-neutral-700">
        {t('adminOrders.discountNote')}
      </label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('adminOrders.discountNotePlaceholder')}
        className="mb-3 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
      />

      {(overLimit || needsAdmin) && (
        <div className="mb-3 rounded-xl bg-warning-100 p-3">
          <p className="mb-2 text-[11px] font-medium text-warning-600">
            {t('adminOrders.overLimitWarning')}
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('adminOrders.adminPassword')}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
          />
        </div>
      )}

      <div className="mb-3 space-y-1 rounded-xl bg-neutral-50 p-3 text-xs">
        <div className="flex justify-between">
          <span className="text-neutral-500">{t('adminOrders.gross')}</span>
          <span className="font-medium">฿{Math.round(gross * 100) / 100}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">{t('adminOrders.discount')}</span>
          <span className="font-medium text-error-600">−฿{Math.round(discountAmount * 100) / 100}</span>
        </div>
        <div className="flex justify-between border-t border-neutral-200 pt-1">
          <span className="font-semibold text-neutral-900">{t('adminOrders.payable')}</span>
          <span className="text-base font-bold text-accent-600">
            ฿{Math.round(payable * 100) / 100}
          </span>
        </div>
      </div>

      {msg && <p className="mb-2 text-xs text-warning-600">{msg}</p>}

      <button
        onClick={save}
        disabled={busy || (discountAmount > 0 && !note.trim())}
        className="w-full rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? t('common.saving') : t('adminOrders.applyDiscount')}
      </button>
    </Sheet>
  );
}

/* =====================================================================
 * 改单（增减菜品）
 *
 * 行匹配按「菜品 + 规格」的 optionKey —— 过去只按 menuItemId，
 * 一份订单里出现「加大蛋面」和「标准米粉」时会把两行搅在一起。
 * ===================================================================*/
interface EditRow {
  /** 行匹配键；新增行先占位，保存时由服务端按 optionIds 重算 */
  key: string;
  menuItemId: string;
  name: string;
  optionLines: string[];
  optionIds: string[];
  note: string | null;
  quantity: number;
  /** 仅供显示；服务端会按选项重算，不信这个值 */
  unitPrice: number;
  isNew: boolean;
}

function ItemsModal({
  order,
  locale,
  onClose,
  onSaved,
  onError,
}: {
  order: any;
  locale: string;
  onClose: () => void;
  onSaved: (updated: any, restored: number) => void;
  onError: (m: string) => void;
}) {
  const t = useTranslations();
  const [rows, setRows] = useState<EditRow[]>(
    (order.items || []).map((it: any) => {
      const snapshot = Array.isArray(it.options) ? it.options : [];
      const optionIds = snapshot.map((o: any) => o.optionId);
      return {
        key: it.optionKey || makeOptionKey(it.menuItemId, optionIds),
        menuItemId: it.menuItemId,
        name: pickName(it.menuItem, locale),
        optionLines: formatLineOptions(snapshot, locale),
        optionIds,
        note: it.note ?? null,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        isNew: false,
      };
    }),
  );

  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [menu, setMenu] = useState<any[] | null>(null);
  const [menuBusy, setMenuBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [sheetItem, setSheetItem] = useState<any | null>(null);

  const step = (idx: number, delta: number) =>
    setRows((list) =>
      list.map((r, i) => (i === idx ? { ...r, quantity: Math.max(0, r.quantity + delta) } : r)),
    );

  const openAdd = async () => {
    setAddOpen(true);
    if (menu || menuBusy) return;
    setMenuBusy(true);
    try {
      setMenu(await fetchMenuItems());
    } catch (e: any) {
      onError(e?.message || t('common.error'));
      setAddOpen(false);
    } finally {
      setMenuBusy(false);
    }
  };

  const appendRow = (item: any, res?: { optionIds: string[]; options: any[]; optionsDelta: number }) => {
    const optionIds = res?.optionIds ?? [];
    const key = makeOptionKey(item.id, optionIds);
    setRows((list) => {
      const idx = list.findIndex((r) => r.key === key);
      if (idx >= 0) {
        return list.map((r, i) => (i === idx ? { ...r, quantity: r.quantity + 1 } : r));
      }
      return [
        ...list,
        {
          key,
          menuItemId: item.id,
          name: locale === 'en' ? item.name_en : locale === 'th' ? item.name_th : item.name_zh,
          optionLines: formatLineOptions(res?.options ?? [], locale),
          optionIds,
          note: null,
          quantity: 1,
          unitPrice: Math.round((Number(item.price) + Number(res?.optionsDelta ?? 0)) * 100) / 100,
          isNew: true,
        },
      ];
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = rows
        // 原有行数量归零 = 删行，必须发出去；新增行数量归零可直接丢掉
        .filter((r) => r.quantity > 0 || !r.isNew)
        .map((r) =>
          r.isNew
            ? {
                menuItemId: r.menuItemId,
                quantity: r.quantity,
                optionIds: r.optionIds,
                ...(r.note ? { note: r.note } : {}),
              }
            : {
                menuItemId: r.menuItemId,
                quantity: r.quantity,
                optionKey: r.key,
                optionIds: r.optionIds,
              },
        );
      const res = await updateAdminOrderItems(order.id, payload as any);
      onSaved(res.order, res.restored ?? 0);
    } catch (e: any) {
      onError(e?.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const q = query.trim().toLowerCase();
  const menuFiltered = (menu ?? []).filter((i) => {
    if (!q) return true;
    return [i.name_zh, i.name_en, i.name_th]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  return (
    <Sheet title={`✏️ ${t('adminOrders.editItems')} · ${order.orderNumber}`} onClose={onClose}>
      <p className="mb-3 rounded-lg bg-warning-100 px-3 py-2 text-[11px] leading-relaxed text-warning-600">
        {t('adminOrders.editItemsHint')}
      </p>

      <div className="space-y-2">
        {rows.map((r, idx) => (
          <div key={r.key} className="rounded-xl bg-neutral-50 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">
                {r.name}
                {r.isNew && (
                  <span className="ml-1.5 rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">
                    {t('adminOrders.newLine')}
                  </span>
                )}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => step(idx, -1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-medium text-neutral-600 shadow-sm"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm font-semibold">{r.quantity}</span>
                <button
                  onClick={() => step(idx, 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-50 text-sm font-medium text-primary-700"
                >
                  +
                </button>
              </div>
            </div>
            {r.optionLines.length > 0 && (
              <div className="mt-0.5">
                {r.optionLines.map((l, i) => (
                  <p key={i} className="text-[11px] text-neutral-500">
                    {l}
                  </p>
                ))}
              </div>
            )}
            {r.note && <p className="text-[11px] text-accent-600">※ {r.note}</p>}
            {r.quantity === 0 && (
              <p className="mt-0.5 text-[11px] text-error-500">
                {t('adminOrders.lineWillBeRemoved')}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* 加菜 */}
      {!addOpen ? (
        <button
          onClick={() => void openAdd()}
          className="mt-3 w-full rounded-xl border border-dashed border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 hover:border-primary-300 hover:text-primary-700"
        >
          ＋ {t('adminOrders.addItem')}
        </button>
      ) : (
        <div className="mt-3 rounded-xl border border-neutral-200 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-600">
              {t('adminOrders.addItem')}
            </span>
            <button
              onClick={() => setAddOpen(false)}
              className="text-xs text-neutral-400 hover:text-neutral-600"
            >
              {t('common.close')}
            </button>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('menu.searchPlaceholder')}
            className="mt-2 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
          />
          <div className="mt-2 max-h-52 overflow-y-auto">
            {menuBusy ? (
              <p className="py-3 text-center text-xs text-neutral-400">
                {t('common.loading')}
              </p>
            ) : (
              menuFiltered.slice(0, 60).map((i) => (
                <button
                  key={i.id}
                  onClick={() => {
                    if ((i.optionGroups ?? []).length > 0) {
                      setSheetItem(i);
                    } else {
                      appendRow(i);
                    }
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-neutral-50"
                >
                  <span className="min-w-0 truncate text-neutral-700">
                    {locale === 'en' ? i.name_en : locale === 'th' ? i.name_th : i.name_zh}
                  </span>
                  <span className="shrink-0 text-xs text-neutral-400">฿{i.price}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <button
        onClick={save}
        disabled={busy}
        className="mt-4 w-full rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? t('common.saving') : t('adminOrders.saveChanges')}
      </button>

      {/* 加菜时选规格（与顾客端同一个面板，口径一致） */}
      <OptionSheet
        open={!!sheetItem}
        item={sheetItem}
        groups={sheetItem?.optionGroups ?? []}
        locale={locale}
        onClose={() => setSheetItem(null)}
        onConfirm={(res) => {
          if (!sheetItem) return;
          appendRow(sheetItem, res);
          setSheetItem(null);
        }}
      />
    </Sheet>
  );
}

/* =====================================================================
 * 结算收款
 * ===================================================================*/
function SettleModal({
  order,
  locale,
  printLabels,
  onClose,
  onSettled,
  onError,
}: {
  order: any;
  locale: string;
  printLabels: PrintLabels;
  onClose: () => void;
  onSettled: (updated: any, stock?: StockPostResult) => void;
  onError: (m: string) => void;
}) {
  const t = useTranslations();
  const [method, setMethod] = useState<'CASH' | 'PROMPTPAY'>('PROMPTPAY');
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<{ dataUrl: string; amount: number; qrString: string } | null>(null);
  const [current, setCurrent] = useState<any>(order);

  // 需付 = 总应付 − 已付（与服务端 settle 的 res.amount 同口径，避免弹窗主金额与收款码/实收不一致）
  const receivable = Math.max(
    0,
    Math.round(((current.totalPrice || 0) - (current.prepaidAmount || 0)) * 100) / 100,
  );

  const genQr = async () => {
    setBusy(true);
    try {
      const res = await settleAdminOrder(current.id, { action: 'create', method: 'PROMPTPAY' });
      if (res.order) setCurrent(res.order);
      if (res.qrString) {
        const dataUrl = await makeQrDataUrl(res.qrString);
        setQr({ dataUrl, amount: res.amount ?? receivable, qrString: res.qrString });
      }
    } catch (e: any) {
      onError(e?.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const markPaid = async (m: 'CASH' | 'PROMPTPAY') => {
    setBusy(true);
    try {
      const res = await settleAdminOrder(current.id, { action: 'mark-paid', method: m });
      if (res.order) {
        setCurrent(res.order);
        await submitPrint(
          buildReceiptHtml(toReceiptOrder(res.order, locale), { labels: printLabels }),
          'receipt',
        );
        onSettled(res.order, res.stock);
      }
    } catch (e: any) {
      onError(e?.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const confirmPaid = async () => {
    setBusy(true);
    try {
      const res = await settleAdminOrder(current.id, { action: 'confirm', method });
      if (res.order) {
        setCurrent(res.order);
        await submitPrint(
          buildReceiptHtml(toReceiptOrder(res.order, locale), { labels: printLabels }),
          'receipt',
        );
        onSettled(res.order, res.stock);
      }
    } catch (e: any) {
      onError(e?.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const printBill = async () => {
    await submitPrint(
      buildBillHtml(toReceiptOrder(current, locale), {
        qrDataUrl: qr?.dataUrl ?? null,
        labels: printLabels,
      }),
      'bill',
    );
  };

  return (
    <Sheet title={`💰 ${t('adminOrders.settle')} · ${order.orderNumber}`} onClose={onClose}>
      {/* 账单明细 */}
      <div className="mb-3 space-y-1 rounded-xl bg-neutral-50 p-3 text-xs">
        <div className="flex justify-between">
          <span className="text-neutral-500">{t('adminOrders.subtotal')}</span>
          <span className="font-medium">฿{current.subtotal}</span>
        </div>
        {current.fishWeightKg > 0 && (
          <div className="flex justify-between">
            <span className="text-neutral-500">
              {t('adminOrders.fishCharge')} ({current.fishWeightKg} kg)
            </span>
            <span className="font-medium">฿{current.fishCharge}</span>
          </div>
        )}
        {current.discountAmount > 0 && (
          <div className="flex justify-between">
            <span className="text-neutral-500">
              {t('adminOrders.discount')}
              {current.discountNote ? ` (${current.discountNote})` : ''}
            </span>
            <span className="font-medium text-error-600">−฿{current.discountAmount}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-neutral-200 pt-1">
          <span className="font-semibold text-neutral-900">{t('adminOrders.payable')}</span>
          <span className="text-lg font-bold text-accent-600">฿{receivable}</span>
        </div>
      </div>

      {/* 方式 */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        {(['PROMPTPAY', 'CASH'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`rounded-xl border-2 py-2.5 text-xs font-medium transition ${
              method === m
                ? 'border-primary-600 bg-primary-50 text-primary-700'
                : 'border-neutral-200 text-neutral-600'
            }`}
          >
            {m === 'CASH' ? `💵 ${t('payment.cash')}` : `🔵 ${t('payment.promptpay')}`}
          </button>
        ))}
      </div>

      {method === 'CASH' ? (
        <button
          onClick={() => markPaid('CASH')}
          disabled={busy}
          className="w-full rounded-xl bg-accent-500 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? t('common.saving') : `${t('adminOrders.markPaid')} ฿${receivable}`}
        </button>
      ) : (
        <>
          {!qr ? (
            <button
              onClick={genQr}
              disabled={busy}
              className="w-full rounded-xl bg-primary-700 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? t('common.loading') : t('adminOrders.generatePayQr')}
            </button>
          ) : (
            <>
              <div className="mb-3 flex flex-col items-center">
                <img
                  src={qr.dataUrl}
                  alt="PromptPay QR"
                  className="h-52 w-52 rounded-xl border border-neutral-200 bg-white p-2"
                />
                <p className="mt-2 text-xs text-neutral-500">{t('adminOrders.scanToPay')}</p>
                <p className="text-xl font-bold text-primary-700">฿{qr.amount}</p>
              </div>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <button
                  onClick={printBill}
                  className="rounded-xl bg-neutral-100 py-2.5 text-xs font-medium text-neutral-700"
                >
                  🖨 {t('adminOrders.printBillWithQr')}
                </button>
                <button
                  onClick={confirmPaid}
                  disabled={busy}
                  className="rounded-xl bg-accent-500 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {t('adminOrders.confirmPaid')}
                </button>
              </div>
              <p className="text-center text-[11px] text-neutral-400">
                {t('adminOrders.confirmPaidHint')}
              </p>
            </>
          )}
        </>
      )}

      <div className="mt-3 border-t border-neutral-100 pt-3">
        <button
          onClick={() => markPaid(method)}
          disabled={busy}
          className="w-full rounded-xl bg-neutral-100 py-2 text-[11px] font-medium text-neutral-600 disabled:opacity-50"
        >
          {t('adminOrders.markPaidDirect')}
        </button>
      </div>
    </Sheet>
  );
}
