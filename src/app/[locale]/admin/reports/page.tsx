'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAdminReport,
  reportExportUrl,
  updateMenuItem,
  type ReportItemStat,
  type ReportPayload,
  type ReportRange,
  type TrendGrain,
} from '@/lib/api-client';

type Segment = 'overview' | 'trend' | 'top' | 'structure' | 'margin' | 'export';
type TopSort = 'qty' | 'revenue' | 'profit';
type MarginFilter = 'all' | 'below' | 'noCost' | 'top';

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
const PAY_LABEL: Record<string, string> = {
  PROMPTPAY: 'PromptPay',
  TRUEMONEY: 'TrueMoney',
  BANK_TRANSFER: 'Bank transfer',
  CREDIT_CARD: 'Credit card',
  ALIPAY: 'Alipay',
  WECHAT_PAY: 'WeChat Pay',
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

export default function AdminReportsPage() {
  const t = useTranslations();
  const locale = useLocale();

  const [segment, setSegment] = useState<Segment>('overview');
  const [range, setRange] = useState<ReportRange>('today');
  const [grain, setGrain] = useState<TrendGrain>('day');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [data, setData] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [topSort, setTopSort] = useState<TopSort>('qty');
  const [marginFilter, setMarginFilter] = useState<MarginFilter>('all');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [costInput, setCostInput] = useState('');
  const [marginInput, setMarginInput] = useState('');
  const [saving, setSaving] = useState(false);

  const [exportContent, setExportContent] = useState<string[]>([
    'summary',
    'items',
  ]);
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx');

  const load = useCallback(async () => {
    if (range === 'custom' && (!customFrom || !customTo)) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
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

  useEffect(() => {
    load();
  }, [load]);

  const itemName = (it: { name_zh: string; name_en: string; name_th: string }) =>
    locale === 'en' ? it.name_en : locale === 'th' ? it.name_th : it.name_zh;

  const groupedByCategory = useMemo(() => {
    if (!data) return [] as { name: string; revenue: number }[];
    const map = new Map<string, number>();
    for (const it of data.topItems) {
      map.set(it.category, (map.get(it.category) ?? 0) + it.revenue);
    }
    return [...map.entries()]
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [data]);

  const marginRows = useMemo(() => {
    if (!data) return [] as ReportItemStat[];
    const list = data.margins;
    if (marginFilter === 'below')
      return list.filter((m) => m.marginRate != null && m.belowTarget);
    if (marginFilter === 'noCost') return list.filter((m) => m.costPrice == null);
    if (marginFilter === 'top')
      return [...list]
        .filter((m) => m.marginRate != null)
        .sort((a, b) => (b.marginRate ?? 0) - (a.marginRate ?? 0));
    return list;
  }, [data, marginFilter]);

  const sortedTop = useMemo(() => {
    if (!data) return [] as ReportItemStat[];
    const list = data.topItems.filter((i) => i.qty > 0);
    if (topSort === 'qty') return [...list].sort((a, b) => b.qty - a.qty);
    if (topSort === 'profit')
      return [...list].sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity));
    return [...list].sort((a, b) => b.revenue - a.revenue);
  }, [data, topSort]);

  const startEdit = (m: ReportItemStat) => {
    setEditingId(m.id);
    setCostInput(m.costPrice == null ? '' : String(m.costPrice));
    setMarginInput(
      m.targetMargin == null ? '' : String(Math.round(m.targetMargin * 100)),
    );
  };

  const saveCost = async (id: string) => {
    setSaving(true);
    try {
      await updateMenuItem(id, {
        costPrice: costInput === '' ? null : Number(costInput),
        targetMargin: marginInput === '' ? null : Number(marginInput) / 100,
      });
      setEditingId(null);
      await load();
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  // ---------- derived ----------
  const o = data?.overview;
  const trend = data?.trend ?? [];
  const trendMax = Math.max(1, ...trend.map((p) => p.revenue));
  const hourly = data?.structure.hourly ?? [];
  const hourlyMax = Math.max(1, ...hourly.map((h) => h.orders));

  const segBtn = (active: boolean) =>
    `flex-1 rounded-lg px-2 py-2 text-xs font-medium transition ${
      active ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500'
    }`;

  return (
    <>
      {error && (
        <div className="mb-4 rounded-xl bg-error-50 px-4 py-2 text-sm text-error-600">
          {error}
          <button onClick={load} className="ml-2 underline">
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Segment nav */}
      <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-neutral-100 p-1">
        {(
          [
            ['overview', 'adminReports.segOverview'],
            ['trend', 'adminReports.segTrend'],
            ['top', 'adminReports.segTop'],
            ['structure', 'adminReports.segStructure'],
            ['margin', 'adminReports.segMargin'],
            ['export', 'adminReports.segExport'],
          ] as [Segment, string][]
        ).map(([key, labelKey]) => (
          <button
            key={key}
            onClick={() => setSegment(key)}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition ${
              segment === key
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-neutral-500'
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* Range picker */}
      <div className="mb-4 flex rounded-xl bg-neutral-100 p-1">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={segBtn(range === r)}
          >
            {t(RANGE_LABEL_KEY[r])}
          </button>
        ))}
      </div>

      {range === 'custom' && (
        <div className="mb-4 flex items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm"
          />
          <span className="text-xs text-neutral-400">→</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-neutral-400">
          {t('common.loading')}
        </div>
      ) : !data || !o ? (
        <div className="py-16 text-center text-sm text-neutral-400">
          {range === 'custom'
            ? t('adminReports.pickCustomRange')
            : t('common.noData')}
        </div>
      ) : (
        <>
          {/* ============ OVERVIEW ============ */}
          {segment === 'overview' && (
            <>
              <div className="mb-3 rounded-2xl bg-gradient-to-br from-primary-700 to-primary-900 px-5 py-4 text-white shadow-md">
                <div className="text-xs opacity-80">
                  {t('adminReports.totalRevenue')} · {o.period.fromDate}
                  {o.period.fromDate !== o.period.toDate &&
                    ` → ${o.period.toDate}`}
                </div>
                <div className="mt-1 text-3xl font-bold">
                  {money(o.totalRevenue)}
                </div>
                <div className="mt-1 text-xs">
                  {t('adminReports.vsPrev')}{' '}
                  {o.deltas.totalRevenue == null ? (
                    <span className="opacity-70">{t('adminReports.noPrev')}</span>
                  ) : (
                    <b
                      className={
                        o.deltas.totalRevenue >= 0
                          ? 'text-green-300'
                          : 'text-red-300'
                      }
                    >
                      {o.deltas.totalRevenue >= 0 ? '↑' : '↓'}{' '}
                      {(Math.abs(o.deltas.totalRevenue) * 100).toFixed(1)}%
                    </b>
                  )}
                </div>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <div className="text-xs text-neutral-500">
                    🍽️ {t('adminReports.orderRevenue')}
                  </div>
                  <div className="mt-0.5 text-lg font-bold text-neutral-900">
                    {money(o.orderRevenue)}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <div className="text-xs text-neutral-500">
                    🎣 {t('adminReports.bookingRevenue')}
                  </div>
                  <div className="mt-0.5 text-lg font-bold text-neutral-900">
                    {money(o.bookingRevenue)}
                  </div>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-white p-3 text-center shadow-sm">
                  <div className="text-xl font-bold text-neutral-900">
                    {o.orderCount}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {t('adminReports.orderCount')}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3 text-center shadow-sm">
                  <div className="text-xl font-bold text-neutral-900">
                    {money(o.avgTicket)}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {t('adminReports.avgTicket')}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3 text-center shadow-sm">
                  <div className="text-xl font-bold text-success-600">
                    {pctText(o.marginRate)}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {t('adminReports.marginRate')}
                  </div>
                </div>
              </div>

              <div className="mb-2 text-sm font-bold text-neutral-700">
                {t('adminReports.trendTitle')}
              </div>
              <div className="mb-4 flex h-24 items-end gap-1 rounded-xl bg-white p-3 shadow-sm">
                {trend.map((p) => (
                  <div
                    key={p.key}
                    className="flex flex-1 flex-col items-center justify-end gap-1"
                    style={{ height: '100%' }}
                  >
                    <div
                      className="w-full rounded-t bg-primary-500"
                      style={{
                        height: `${Math.max(3, (p.revenue / trendMax) * 100)}%`,
                      }}
                    />
                    <span className="whitespace-nowrap text-[9px] text-neutral-400">
                      {p.key.slice(5)}
                    </span>
                  </div>
                ))}
              </div>

              {data.structure.payments.length > 0 && (
                <>
                  <div className="mb-2 text-sm font-bold text-neutral-700">
                    {t('adminReports.paymentTitle')}
                  </div>
                  <div className="mb-4 space-y-2 rounded-xl bg-white p-3 shadow-sm">
                    {data.structure.payments.map((p) => {
                      const total =
                        data.structure.payments.reduce(
                          (s, x) => s + x.amount,
                          0,
                        ) || 1;
                      const share = p.amount / total;
                      return (
                        <div key={p.method}>
                          <div className="mb-1 flex justify-between text-xs text-neutral-600">
                            <span>{PAY_LABEL[p.method] ?? p.method}</span>
                            <b>
                              {(share * 100).toFixed(0)}% · {money(p.amount)}
                            </b>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                            <div
                              className="h-full rounded-full bg-primary-500"
                              style={{ width: `${share * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {o.cancelledOrders > 0 && (
                <div className="mb-3 rounded-xl bg-neutral-100 px-4 py-2 text-xs text-neutral-500">
                  {t('adminReports.cancelledNote', { n: o.cancelledOrders })}
                </div>
              )}

              {o.itemsWithoutCost > 0 && (
                <button
                  onClick={() => {
                    setMarginFilter('noCost');
                    setSegment('margin');
                  }}
                  className="mb-3 w-full rounded-xl bg-accent-50 px-4 py-2.5 text-left text-xs text-accent-600"
                >
                  ⚠️ {t('adminReports.noCostHint', { n: o.itemsWithoutCost })}
                </button>
              )}

              <button
                onClick={() => setSegment('export')}
                className="w-full rounded-xl border border-primary-100 bg-white py-2.5 text-sm font-semibold text-primary-700"
              >
                ⬇ {t('adminReports.exportReport')}
              </button>
            </>
          )}

          {/* ============ TREND ============ */}
          {segment === 'trend' && (
            <>
              <div className="mb-3 flex rounded-xl bg-neutral-100 p-1">
                {GRAINS.map((g) => (
                  <button
                    key={g}
                    onClick={() => setGrain(g)}
                    className={segBtn(grain === g)}
                  >
                    {t(GRAIN_LABEL_KEY[g])}
                  </button>
                ))}
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-white p-3 text-center shadow-sm">
                  <div className="text-lg font-bold text-neutral-900">
                    {money(o.totalRevenue)}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {t('adminReports.totalRevenue')}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3 text-center shadow-sm">
                  <div className="text-lg font-bold text-success-600">
                    {money(o.grossProfit)}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {t('adminReports.grossProfit')}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3 text-center shadow-sm">
                  <div className="text-lg font-bold text-accent-600">
                    {pctText(o.marginRate)}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {t('adminReports.marginRate')}
                  </div>
                </div>
              </div>

              <div className="mb-4 rounded-xl bg-white p-3 shadow-sm">
                <div className="flex h-32 items-end gap-1">
                  {trend.map((p) => (
                    <div
                      key={p.key}
                      className="flex flex-1 flex-col items-center justify-end gap-1"
                      style={{ height: '100%' }}
                    >
                      <div
                        className="w-full rounded-t bg-primary-500"
                        style={{
                          height: `${Math.max(3, (p.revenue / trendMax) * 100)}%`,
                        }}
                      />
                      <span className="whitespace-nowrap text-[9px] text-neutral-400">
                        {p.key.length > 7 ? p.key.slice(5) : p.key}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                {trend.map((p) => (
                  <div
                    key={p.key}
                    className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs shadow-sm"
                  >
                    <span className="text-neutral-500">{p.key}</span>
                    <span className="flex gap-3">
                      <b className="text-neutral-900">{money(p.revenue)}</b>
                      <span className="text-success-600">
                        {money(p.profit)}
                      </span>
                      <span className="text-neutral-400">{p.orders}</span>
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-xl bg-primary-50 px-4 py-3 text-xs text-primary-700">
                {t('adminReports.marginFootnote')}
                <br />
                {t('adminReports.wasteCost')}: {money2(o.wasteCost)}
              </div>
            </>
          )}

          {/* ============ TOP ITEMS ============ */}
          {segment === 'top' && (
            <>
              <div className="mb-3 flex rounded-xl bg-neutral-100 p-1">
                {(
                  [
                    ['qty', 'adminReports.sortQty'],
                    ['revenue', 'adminReports.sortRevenue'],
                    ['profit', 'adminReports.sortProfit'],
                  ] as [TopSort, string][]
                ).map(([k, labelKey]) => (
                  <button
                    key={k}
                    onClick={() => setTopSort(k)}
                    className={segBtn(topSort === k)}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>

              {sortedTop.length === 0 ? (
                <div className="py-14 text-center text-sm text-neutral-400">
                  {t('common.noData')}
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedTop.map((it, idx) => (
                    <div
                      key={it.id}
                      className="flex items-center gap-3 rounded-lg bg-white p-3 shadow-sm"
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold ${
                          idx < 3
                            ? 'bg-accent-500 text-white'
                            : 'bg-primary-50 text-primary-700'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-neutral-900">
                          {itemName(it)}
                        </div>
                        <div className="truncate text-xs text-neutral-500">
                          {it.category}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-bold text-primary-700">
                          {topSort === 'qty'
                            ? `${it.qty}`
                            : topSort === 'revenue'
                              ? money(it.revenue)
                              : it.profit == null
                                ? '—'
                                : money(it.profit)}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {topSort === 'qty'
                            ? money(it.revenue)
                            : `${it.qty} ×`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {groupedByCategory.length > 0 && (
                <>
                  <div className="mb-2 mt-5 text-sm font-bold text-neutral-700">
                    {t('adminReports.categoryShare')}
                  </div>
                  <div className="space-y-2 rounded-xl bg-white p-3 shadow-sm">
                    {groupedByCategory.map((c) => {
                      const total =
                        groupedByCategory.reduce((s, x) => s + x.revenue, 0) || 1;
                      const share = c.revenue / total;
                      return (
                        <div key={c.name}>
                          <div className="mb-1 flex justify-between text-xs text-neutral-600">
                            <span>{c.name}</span>
                            <b>{(share * 100).toFixed(0)}%</b>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                            <div
                              className="h-full rounded-full bg-accent-500"
                              style={{ width: `${share * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {/* ============ STRUCTURE ============ */}
          {segment === 'structure' && (
            <>
              <div className="mb-2 text-sm font-bold text-neutral-700">
                {t('adminReports.hourlyTitle')}
              </div>
              <div className="mb-4 flex h-28 items-end gap-1 rounded-xl bg-white p-3 shadow-sm">
                {hourly.length === 0 ? (
                  <div className="w-full text-center text-xs text-neutral-400">
                    {t('common.noData')}
                  </div>
                ) : (
                  hourly.map((h) => (
                    <div
                      key={h.hour}
                      className="flex flex-1 flex-col items-center justify-end gap-1"
                      style={{ height: '100%' }}
                    >
                      <div
                        className="w-full rounded-t bg-primary-500"
                        style={{
                          height: `${Math.max(3, (h.orders / hourlyMax) * 100)}%`,
                        }}
                      />
                      <span className="text-[9px] text-neutral-400">
                        {h.hour}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {data.structure.ponds.length > 0 && (
                <>
                  <div className="mb-2 text-sm font-bold text-neutral-700">
                    {t('adminReports.pondTitle')}
                  </div>
                  <div className="mb-4 space-y-2 rounded-xl bg-white p-3 shadow-sm">
                    {data.structure.ponds.map((p) => {
                      const total =
                        data.structure.ponds.reduce(
                          (s, x) => s + x.revenue,
                          0,
                        ) || 1;
                      const share = p.revenue / total;
                      return (
                        <div key={p.type}>
                          <div className="mb-1 flex justify-between text-xs text-neutral-600">
                            <span>🎣 {itemName(p)}</span>
                            <b>
                              {p.bookings} · {money(p.revenue)}
                            </b>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                            <div
                              className="h-full rounded-full bg-accent-500"
                              style={{ width: `${share * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {data.structure.orderTypes.length > 0 && (
                <>
                  <div className="mb-2 text-sm font-bold text-neutral-700">
                    {t('adminReports.orderTypeTitle')}
                  </div>
                  <div className="mb-4 grid grid-cols-2 gap-2">
                    {data.structure.orderTypes.map((ot) => (
                      <div
                        key={ot.type}
                        className="rounded-xl bg-white p-3 shadow-sm"
                      >
                        <div className="text-xs text-neutral-500">
                          {ot.type === 'TAKEAWAY'
                            ? t('orderType.takeaway')
                            : t('orderType.dineIn')}
                        </div>
                        <div className="mt-0.5 text-base font-bold text-neutral-900">
                          {money(ot.revenue)}
                        </div>
                        <div className="text-xs text-neutral-400">
                          {ot.orders} {t('adminReports.ordersUnit')}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {data.structure.tables.length > 0 && (
                <>
                  <div className="mb-2 text-sm font-bold text-neutral-700">
                    {t('adminReports.tableHeat')}
                  </div>
                  <div className="space-y-1">
                    {data.structure.tables.map((tb, i) => (
                      <div
                        key={tb.code}
                        className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-sm"
                      >
                        <span className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded bg-primary-50 text-[11px] font-bold text-primary-700">
                            {i + 1}
                          </span>
                          <span className="font-medium text-neutral-900">
                            {tb.name}
                          </span>
                          <span className="text-xs text-neutral-400">
                            {tb.code}
                          </span>
                        </span>
                        <b className="text-primary-700">{tb.orders}</b>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {data.structure.ordersWithoutPayment > 0 && (
                <div className="mt-3 rounded-xl bg-neutral-100 px-4 py-2 text-xs text-neutral-500">
                  {t('adminReports.noPaymentNote', {
                    n: data.structure.ordersWithoutPayment,
                  })}
                </div>
              )}
            </>
          )}

          {/* ============ MARGIN ============ */}
          {segment === 'margin' && (
            <>
              <div className="mb-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-white p-3 text-center shadow-sm">
                  <div className="text-lg font-bold text-success-600">
                    {pctText(o.marginRate)}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {t('adminReports.overallMargin')}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3 text-center shadow-sm">
                  <div className="text-lg font-bold text-accent-600">
                    {data.margins.filter((m) => m.belowTarget).length}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {t('adminReports.belowTarget')}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3 text-center shadow-sm">
                  <div className="text-lg font-bold text-error-600">
                    {data.margins.filter((m) => m.costPrice == null).length}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {t('adminReports.noCost')}
                  </div>
                </div>
              </div>

              <div className="mb-3 flex rounded-xl bg-neutral-100 p-1">
                {(
                  [
                    ['all', 'adminReports.filterAll'],
                    ['below', 'adminReports.filterBelow'],
                    ['noCost', 'adminReports.filterNoCost'],
                    ['top', 'adminReports.filterTop'],
                  ] as [MarginFilter, string][]
                ).map(([k, labelKey]) => (
                  <button
                    key={k}
                    onClick={() => setMarginFilter(k)}
                    className={segBtn(marginFilter === k)}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>

              {marginRows.length === 0 ? (
                <div className="py-14 text-center text-sm text-neutral-400">
                  {t('common.noData')}
                </div>
              ) : (
                <div className="space-y-2">
                  {marginRows.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-xl bg-white p-3 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-neutral-900">
                            {itemName(m)}
                          </div>
                          <div className="mt-0.5 text-xs text-neutral-500">
                            {t('adminReports.priceLabel')} ฿{m.price}
                            {m.costPrice != null &&
                              ` · ${t('adminReports.costLabel')} ฿${m.costPrice}`}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {m.marginRate == null ? (
                            <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
                              {t('adminReports.noCost')}
                            </span>
                          ) : (
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-bold ${
                                m.belowTarget
                                  ? 'bg-accent-50 text-accent-600'
                                  : 'bg-success-50 text-success-700'
                              }`}
                            >
                              {(m.marginRate * 100).toFixed(0)}%
                            </span>
                          )}
                          {m.profit != null && (
                            <div className="mt-0.5 text-xs text-neutral-500">
                              {money2(m.profit)}
                            </div>
                          )}
                        </div>
                      </div>

                      {m.qty > 0 && (
                        <div className="mt-1.5 text-xs text-neutral-400">
                          {t('adminReports.soldInPeriod', {
                            qty: m.qty,
                            revenue: money(m.revenue),
                          })}
                        </div>
                      )}

                      {editingId === m.id ? (
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder={t('adminReports.costLabel')}
                            value={costInput}
                            onChange={(e) => setCostInput(e.target.value)}
                            className="flex-1 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs"
                          />
                          <input
                            type="number"
                            min={0}
                            max={100}
                            placeholder={t('adminReports.targetMarginShort')}
                            value={marginInput}
                            onChange={(e) => setMarginInput(e.target.value)}
                            className="w-20 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs"
                          />
                          <button
                            onClick={() => saveCost(m.id)}
                            disabled={saving}
                            className="rounded-lg bg-primary-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {t('common.save')}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs text-neutral-600"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(m)}
                          className="mt-2 text-xs font-medium text-primary-700 underline"
                        >
                          {m.costPrice == null
                            ? t('adminReports.setCost')
                            : t('adminReports.editCost')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 rounded-xl bg-primary-50 px-4 py-3 text-xs text-primary-700">
                {t('adminReports.marginFootnote')}
              </div>
            </>
          )}

          {/* ============ EXPORT ============ */}
          {segment === 'export' && (
            <>
              <div className="mb-2 text-sm font-bold text-neutral-700">
                {t('adminReports.exportContent')}
              </div>
              <div className="mb-4 space-y-2">
                {(
                  [
                    ['summary', 'adminReports.contentSummary'],
                    ['items', 'adminReports.contentItems'],
                    ['orders', 'adminReports.contentOrders'],
                    ['stock', 'adminReports.contentStock'],
                  ] as [string, string][]
                ).map(([key, labelKey]) => {
                  const on = exportContent.includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() =>
                        setExportContent((prev) =>
                          prev.includes(key)
                            ? prev.filter((k) => k !== key)
                            : [...prev, key],
                        )
                      }
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm ${
                        on
                          ? 'border-primary-200 bg-white text-neutral-900'
                          : 'border-neutral-200 bg-white text-neutral-500'
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                          on
                            ? 'border-primary-700 bg-primary-700 text-white'
                            : 'border-neutral-300 bg-white text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                      {t(labelKey)}
                    </button>
                  );
                })}
              </div>

              <div className="mb-4 flex rounded-xl bg-neutral-100 p-1">
                <button
                  onClick={() => setExportFormat('xlsx')}
                  className={segBtn(exportFormat === 'xlsx')}
                >
                  Excel (.xlsx)
                </button>
                <button
                  onClick={() => setExportFormat('csv')}
                  className={segBtn(exportFormat === 'csv')}
                >
                  CSV (.csv)
                </button>
              </div>

              <div className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-xs text-primary-700">
                {t('adminReports.exportRangeNote')} {o.period.fromDate}
                {o.period.fromDate !== o.period.toDate && ` → ${o.period.toDate}`}
                <br />
                {exportFormat === 'csv'
                  ? t('adminReports.csvNote')
                  : t('adminReports.xlsxNote')}
              </div>

              {exportContent.length === 0 ? (
                <div className="rounded-xl bg-neutral-100 px-4 py-3 text-center text-xs text-neutral-500">
                  {t('adminReports.pickContent')}
                </div>
              ) : (
                <a
                  href={reportExportUrl({
                    format: exportFormat,
                    range,
                    from: range === 'custom' ? customFrom : undefined,
                    to: range === 'custom' ? customTo : undefined,
                    grain,
                    content: exportContent,
                    sheet: exportFormat === 'csv' ? exportContent[0] : undefined,
                  })}
                  className="block w-full rounded-xl bg-primary-700 py-3 text-center text-sm font-semibold text-white"
                >
                  ⬇ {t('adminReports.generateDownload')}
                </a>
              )}

              <div className="mt-4 rounded-xl border border-dashed border-neutral-300 px-4 py-3 text-xs text-neutral-500">
                <b className="text-neutral-600">
                  {t('adminReports.comingSoon')}
                </b>
                <br />☐ {t('adminReports.autoDaily')}
                <br />☐ {t('adminReports.autoMonthly')}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
