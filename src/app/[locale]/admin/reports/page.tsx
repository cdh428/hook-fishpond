'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAdminReport,
  fetchAdminTransactions,
  fetchAdminOrder,
  reportExportUrl,
  type ReportItemStat,
  type ReportPayload,
  type ReportRange,
  type TrendGrain,
} from '@/lib/api-client';
import { pickCategory } from '@/lib/report-category';
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const RANGES: ReportRange[] = ['today', 'week', 'month', 'custom'];
const GRAINS: TrendGrain[] = ['day', 'week', 'month'];
const RANGE_LABEL_KEY: Record<ReportRange, string> = {
  today: 'adminReports.rangeToday',
  week: 'adminReports.rangeWeek',
  month: 'adminReports.rangeMonth',
  custom: 'adminReports.rangeCustom',
};
const GRAIN_LABEL_KEY: Record<TrendGrain, string> = {
  day: 'adminReports.grainDay',
  week: 'adminReports.grainWeek',
  month: 'adminReports.grainMonth',
};

function money(n: number): string {
  return `฿${Math.round(n).toLocaleString('en-US')}`;
}
function money2(n: number): string {
  return `฿${n.toFixed(2)}`;
}
function pctText(r: number | null): string {
  return r == null ? '—' : `${(r * 100).toFixed(1)}%`;
}

// ---------- 可选指标定义 ----------

interface MetricDef {
  key: string;
  labelKey: string;
  color: string;
  /** 从 overview 取值（用于 KPI 卡片） */
  getValue: (o: ReportPayload['overview']) => number | null;
  /** 从 TrendPoint 取值（用于趋势图） */
  getTrend: (p: ReportPayload['trend'][number]) => number;
  formatter: (n: number) => string;
}

const METRICS: MetricDef[] = [
  { key: 'revenue', labelKey: 'adminReports.totalRevenue', color: '#185FA5', getValue: (o) => o.totalRevenue, getTrend: (p) => p.revenue, formatter: money },
  { key: 'orders', labelKey: 'adminReports.orderCount', color: '#0F6E56', getValue: (o) => o.orderCount, getTrend: (p) => p.orders, formatter: (n) => String(n) },
  { key: 'grossProfit', labelKey: 'adminReports.grossProfit', color: '#639922', getValue: (o) => o.grossProfit, getTrend: (p) => p.profit, formatter: money },
  { key: 'avgTicket', labelKey: 'adminReports.avgTicket', color: '#D85A30', getValue: (o) => o.avgTicket, getTrend: () => 0, formatter: money },
];

const GROUP_OPTIONS = [
  { key: 'time', labelKey: 'adminReports.groupByTime' },
  { key: 'item', labelKey: 'adminReports.groupByItem' },
  { key: 'payment', labelKey: 'adminReports.groupByPayment' },
  { key: 'pond', labelKey: 'adminReports.groupByPond' },
  { key: 'orderType', labelKey: 'adminReports.groupByOrderType' },
] as const;

type GroupKey = typeof GROUP_OPTIONS[number]['key'];

interface LedgerProps {
  t: (key: string) => string;
  txData: any;
  txLoading: boolean;
  txError: string;
  txStart: string;
  txEnd: string;
  onFilter: (s: string, e: string) => void;
  onRetry: () => void;
  onOpenDetail: (
    orderId: string,
    fallback: {
      orderNumber?: string;
      customerName?: string;
      amount?: number;
      method?: string;
      status?: string;
      paidAt?: string;
    },
  ) => void;
  detailOrder: any;
  detailLoading: boolean;
  onCloseDetail: () => void;
  itemName: (it: any) => string;
}

const TX_METHOD_I18N: Record<string, string> = {
  PROMPTPAY: 'payment.promptpay',
  TRUEMONEY: 'payment.truemoney',
  BANK_TRANSFER: 'payment.bankTransfer',
  CREDIT_CARD: 'payment.creditCard',
  ALIPAY: 'payment.alipay',
  WECHAT_PAY: 'payment.wechatPay',
  CASH: 'payment.cash',
};

function TransactionLedger(props: LedgerProps) {
  const { t, txData, txLoading, txError, txStart, txEnd, onFilter, onRetry, onOpenDetail, detailOrder, detailLoading, onCloseDetail, itemName } = props;
  const transactions = txData?.transactions || [];
  const bkkDay = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  };
  const filtered = transactions.filter((tx: any) => {
    const txDate = bkkDay(tx.paidAt || '');
    if (txStart && txDate < txStart) return false;
    if (txEnd && txDate > txEnd) return false;
    return true;
  });

  return (
    <>
      <div className="mb-4 flex gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-neutral-500">{t('admin.startDate')}</label>
          <input type="date" value={txStart} onChange={(e) => onFilter(e.target.value, txEnd)}
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm" />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-neutral-500">{t('admin.endDate')}</label>
          <input type="date" value={txEnd} onChange={(e) => onFilter(txStart, e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm" />
        </div>
        <button onClick={onRetry}
          className="self-end rounded-xl bg-primary-700 px-3 py-2 text-xs font-medium text-white hover:bg-primary-800">
          {t('common.filter')}
        </button>
      </div>

      {txLoading ? (
        <div className="py-20 text-center text-sm text-neutral-400">{t('common.loading')}</div>
      ) : txError ? (
        <div className="py-20 text-center">
          <p className="text-sm text-error-600">{txError}</p>
          <button onClick={onRetry} className="mt-3 rounded-lg bg-primary-700 px-4 py-2 text-xs font-medium text-white">{t('common.retry')}</button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-neutral-400">{t('common.noData')}</p>
          ) : (
            filtered.map((tx: any) => (
              <div key={tx.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
                <button
                  onClick={() => tx.orderId
                    ? onOpenDetail(tx.orderId, { orderNumber: tx.orderNumber, customerName: tx.customerName, amount: tx.amount, method: tx.method, status: tx.status, paidAt: tx.paidAt })
                    : undefined}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-sm font-medium text-neutral-900">{tx.orderNumber || tx.orderId || tx.id}</p>
                  <p className="text-xs text-neutral-500">{(tx.paidAt || '').slice(0, 10)} | {t(TX_METHOD_I18N[tx.method] || tx.method)}</p>
                </button>
                <div className="ml-2 shrink-0 text-right">
                  <p className="text-sm font-bold text-neutral-900">฿{tx.amount?.toLocaleString()}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/30" onClick={onCloseDetail}>
          <div className="max-h-[80vh] w-full overflow-auto rounded-t-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-bold text-neutral-900">{t('adminReports.orderDetailTitle')}</div>
              <button onClick={onCloseDetail} className="rounded-lg px-2 py-1 text-sm text-neutral-400">✕</button>
            </div>
            {detailLoading ? (
              <div className="py-10 text-center text-sm text-neutral-400">{t('common.loading')}</div>
            ) : (
              <OrderDetailCard order={detailOrder} t={t} itemName={itemName} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function OrderDetailCard({ order, t, itemName: _itemName }: { order: any; t: (key: string) => string; itemName: (it: any) => string }) {
  if (!order) return null;
  const o = order?.order ?? order;
  const items: any[] = o?.items || [];
  const payments: any[] = o?.paymentRecords || [o?.payment].filter(Boolean) || [];
  const prepaid = o?.prepaidAmount || 0;
  const total = o?.totalPrice || 0;
  const needPay = Math.max(0, total - prepaid);

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-bold text-neutral-900">{o?.orderNumber || '—'}</div>
          <div className="text-xs text-neutral-500">{o?.customerName || '—'}</div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${o?.status === 'SETTLED' ? 'bg-success-100 text-success-600' : o?.status === 'CANCELLED' ? 'bg-error-100 text-error-600' : 'bg-warning-100 text-warning-600'}`}>
          {o?.status}
        </span>
      </div>
      {items.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-neutral-500">{t('adminReports.orderItems')}</div>
          <div className="space-y-1">
            {items.map((it: any, i: number) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-neutral-700">{it?.menuItem?.name_zh || it?.name || '—'} × {it?.quantity}</span>
                <span className="text-neutral-900">฿{(it?.totalPrice ?? 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-1 rounded-lg bg-neutral-50 p-3 text-xs">
        <div className="flex justify-between"><span className="text-neutral-500">{t('adminOrders.subtotal')}</span><span>฿{(o?.subtotal ?? 0).toLocaleString()}</span></div>
        {prepaid > 0 && (
          <div className="flex justify-between"><span className="text-success-600">{t('adminOrders.prepaid')}</span><span className="text-success-600">−฿{prepaid.toLocaleString()}</span></div>
        )}
        <div className="mt-1 flex justify-between border-t border-neutral-200 pt-1 text-sm font-bold text-neutral-900">
          <span>{t('payment.total')}</span><span>฿{needPay.toLocaleString()}</span>
        </div>
      </div>
      {payments.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-neutral-500">{t('adminReports.orderPayment')}</div>
          <div className="space-y-1">
            {payments.map((p: any, i: number) => (
              <div key={i} className="flex justify-between text-xs text-neutral-600">
                <span>{p?.method} {p?.voidedAt ? '· 作废' : ''}</span>
                <span>฿{(p?.amount ?? 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function enumText2(t: (key: string) => string, method: string): string {
  const key = TX_METHOD_I18N[method];
  if (!key) return method;
  try {
    return t(key);
  } catch {
    return method;
  }
}

export default function AdminReportsPage() {
  const t = useTranslations();
  const locale = useLocale();

  const [range, setRange] = useState<ReportRange>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [grain, setGrain] = useState<TrendGrain>('day');
  const [selected, setSelected] = useState<string[]>(['revenue', 'orders', 'avgTicket']);
  const [groupBy, setGroupBy] = useState<GroupKey>('time');

  const [data, setData] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showLedger, setShowLedger] = useState(false);
  const [txData, setTxData] = useState<any>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState('');
  const [txStart, setTxStart] = useState('');
  const [txEnd, setTxEnd] = useState('');
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const itemName = (it: any) =>
    locale === 'en' ? it?.name_en : locale === 'th' ? it?.name_th : it?.name_zh;

  const load = useCallback(async () => {
    if (range === 'custom' && (!customFrom || !customTo)) {
      setData(null); setLoading(false); return;
    }
    setLoading(true); setError('');
    try {
      const res = await fetchAdminReport({
        range,
        from: range === 'custom' ? customFrom : undefined,
        to: range === 'custom' ? customTo : undefined,
        grain,
      });
      setData(res);
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [range, grain, customFrom, customTo, t]);

  useEffect(() => { load(); }, [load]);

  const loadTransactions = useCallback(async () => {
    setTxLoading(true); setTxError('');
    try {
      const params: { startDate?: string; endDate?: string } = {};
      if (txStart) params.startDate = txStart;
      if (txEnd) params.endDate = txEnd;
      setTxData(await fetchAdminTransactions(params));
    } catch (err: any) {
      setTxError(err?.message || t('common.error'));
    } finally {
      setTxLoading(false);
    }
  }, [txStart, txEnd, t]);

  const openOrderDetail = useCallback(async (orderId: string, fallback: any) => {
    setDetailLoading(true);
    setDetailOrder({ ...fallback, _loading: true });
    try {
      const o = await fetchAdminOrder(orderId);
      setDetailOrder(o?.order ?? o ?? { ...fallback });
    } catch {
      setDetailOrder({ ...fallback, _failed: true });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const toggleMetric = (key: string) =>
    setSelected((p) => p.includes(key) ? p.filter((k) => k !== key) : [...p, key]);

  const o = data?.overview;
  const trend = data?.trend ?? [];
  const selectedDefs = METRICS.filter((m) => selected.includes(m.key));

  const chartData = useMemo(() => {
    if (!trend.length) return [];
    return trend.map((p) => {
      const row: any = { key: p.key.slice(5) || p.key };
      selectedDefs.forEach((m) => { row[m.key] = Math.round(m.getTrend(p) * 100) / 100; });
      return row;
    });
  }, [trend, selectedDefs]);

  const tableRows = useMemo(() => {
    if (!data) return [];
    if (groupBy === 'item')
      return data.topItems.slice(0, 20).map((it) => ({ key: it.id, label: itemName(it), values: [String(it.qty), money(it.revenue)], amount: it.revenue }));
    if (groupBy === 'payment')
      return data.structure.payments.map((p) => ({ key: p.method, label: enumText2(t, p.method), values: [String(p.count), money(p.amount)], amount: p.amount }));
    if (groupBy === 'pond')
      return data.structure.ponds.map((p) => ({ key: p.type, label: itemName(p), values: [String(p.bookings), money(p.revenue)], amount: p.revenue }));
    if (groupBy === 'orderType')
      return data.structure.orderTypes.map((ot) => ({ key: ot.type, label: ot.type === 'TAKEAWAY' ? t('orderType.takeaway') : t('orderType.dineIn'), values: [String(ot.orders), money(ot.revenue)], amount: ot.revenue }));
    return trend.map((p) => ({ key: p.key, label: p.key.slice(5) || p.key, values: selectedDefs.map((m) => m.formatter(m.getTrend(p))), amount: p.revenue }));
  }, [data, groupBy, selectedDefs, locale, t, trend]);

  return (
    <>
      {error && (
        <div className="mb-4 rounded-xl bg-error-50 px-4 py-2 text-sm text-error-600">
          {error}
          <button onClick={load} className="ml-2 underline">{t('common.retry')}</button>
        </div>
      )}

      <div className="mb-3">
        <h2 className="text-base font-bold text-neutral-900">📊 {t('adminReports.pageTitle')}</h2>
        <p className="mt-0.5 text-xs text-neutral-500">{t('adminReports.pageSubtitle')}</p>
      </div>

      <div className="mb-3 flex flex-wrap gap-1 rounded-xl bg-neutral-100 p-1">
        {RANGES.map((r) => (
          <button key={r} onClick={() => setRange(r)}
            className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition ${range === r ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500'}`}>
            {t(RANGE_LABEL_KEY[r])}
          </button>
        ))}
      </div>

      {range === 'custom' && (
        <div className="mb-4 flex items-center gap-2">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
          <span className="text-xs text-neutral-400">→</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-bold text-neutral-700">{t('adminReports.pickMetrics')}</p>
            <div className="space-y-2">
              {METRICS.map((m) => {
                const on = selected.includes(m.key);
                return (
                  <label key={m.key} className="flex cursor-pointer items-center gap-2 text-sm" onClick={() => toggleMetric(m.key)}>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] ${on ? 'border-primary-700 bg-primary-700 text-white' : 'border-neutral-300 bg-white text-transparent'}`}>✓</span>
                    <span className={on ? 'text-neutral-900' : 'text-neutral-500'}>{t(m.labelKey)}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-bold text-neutral-700">{t('adminReports.groupBy')}</p>
            <div className="space-y-2">
              {GROUP_OPTIONS.map((g) => (
                <label key={g.key} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" name="groupBy" checked={groupBy === g.key} onChange={() => setGroupBy(g.key)} className="h-4 w-4 accent-primary-700" />
                  <span className={groupBy === g.key ? 'text-neutral-900' : 'text-neutral-500'}>{t(g.labelKey)}</span>
                </label>
              ))}
            </div>
            {groupBy === 'time' && (
              <div className="mt-3 flex rounded-lg bg-neutral-100 p-1">
                {(['day', 'week', 'month'] as TrendGrain[]).map((g) => (
                  <button key={g} onClick={() => setGrain(g)} className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${grain === g ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500'}`}>
                    {t(GRAIN_LABEL_KEY[g])}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {o && selectedDefs.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {selectedDefs.map((m) => {
                const val = m.getValue(o);
                return (
                  <div key={m.key} className="rounded-xl bg-white p-3 shadow-sm">
                    <div className="text-xs text-neutral-500">{t(m.labelKey)}</div>
                    <div className="mt-1 text-lg font-bold text-neutral-900">{val == null ? '—' : m.formatter(val)}</div>
                  </div>
                );
              })}
            </div>
          )}

          {groupBy === 'time' && chartData.length > 0 && selectedDefs.length > 0 && (
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-bold text-neutral-700">{t('adminReports.trendTitle')}</p>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="key" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v: number) => money(v)} />
                    <Tooltip formatter={(v: any) => money(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {selectedDefs.map((m) => (
                      <Line key={m.key} type="monotone" dataKey={m.key} name={t(m.labelKey)} stroke={m.color} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {groupBy !== 'time' && tableRows.length > 0 && (
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-bold text-neutral-700">{t('adminReports.chartTitle')}</p>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={tableRows.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="label" fontSize={11} interval={0} angle={-30} textAnchor="end" height={60} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="amount" fill="#185FA5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-bold text-neutral-700">{t('adminReports.tableTitle')}</p>
            {tableRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-neutral-400">{t('common.noData')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                  <thead>
                    <tr className="border-b border-neutral-200">
                      <th className="p-2 text-left font-medium text-neutral-500">{t('adminReports.colLabel')}</th>
                      {groupBy === 'time'
                        ? selectedDefs.map((m) => (<th key={m.key} className="p-2 text-right font-medium text-neutral-500">{t(m.labelKey)}</th>))
                        : (<><th className="p-2 text-right font-medium text-neutral-500">{t('adminReports.colCount')}</th><th className="p-2 text-right font-medium text-neutral-500">{t('adminReports.colAmount')}</th></>)}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row) => (
                      <tr key={row.key} className="border-b border-neutral-100">
                        <td className="p-2 text-neutral-900">{row.label}</td>
                        {row.values.map((v, i) => (<td key={i} className="p-2 text-right text-neutral-900">{v}</td>))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {o && (
            <div className="flex flex-wrap gap-2">
              <a href={reportExportUrl({ format: 'xlsx', range, from: range === 'custom' ? customFrom : undefined, to: range === 'custom' ? customTo : undefined, grain, content: ['summary', 'items'], locale })}
                className="flex-1 rounded-xl bg-primary-700 py-3 text-center text-sm font-semibold text-white">⬇ {t('adminReports.exportExcel')}</a>
              <a href={reportExportUrl({ format: 'csv', range, from: range === 'custom' ? customFrom : undefined, to: range === 'custom' ? customTo : undefined, grain, content: ['items'], sheet: 'items', locale })}
                className="flex-1 rounded-xl border border-primary-200 bg-white py-3 text-center text-sm font-semibold text-primary-700">⬇ {t('adminReports.exportCsv')}</a>
            </div>
          )}

          <div className="rounded-xl bg-white p-4 shadow-sm">
            <button onClick={() => { setShowLedger((v) => !v); if (!txData) loadTransactions(); }}
              className="flex w-full items-center justify-between text-sm font-bold text-neutral-700">
              <span>{t('adminReports.segTransaction')}</span>
              <span className="text-xs text-neutral-400">{showLedger ? '▲' : '▼'}</span>
            </button>
            {showLedger && (
              <div className="mt-4">
                <TransactionLedger t={t} txData={txData} txLoading={txLoading} txError={txError} txStart={txStart} txEnd={txEnd}
                  onFilter={(s, e) => { setTxStart(s); setTxEnd(e); }} onRetry={loadTransactions} onOpenDetail={openOrderDetail}
                  detailOrder={detailOrder} detailLoading={detailLoading} onCloseDetail={() => setDetailOrder(null)} itemName={itemName} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
