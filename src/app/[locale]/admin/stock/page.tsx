'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from '@/i18n/routing';
import {
  fetchAdminStock,
  type AdminStockItem,
  type AdminStockSummary,
} from '@/lib/api-client';

type Filter = 'all' | 'made' | 'purchased' | 'attention';

const TYPE_LABEL_KEY: Record<AdminStockItem['stockType'], string> = {
  NONE: 'adminStock.typeNone',
  MADE: 'adminStock.typeMade',
  PURCHASED: 'adminStock.typePurchased',
};

function localeName(
  locale: string,
  item: { name_zh: string; name_en: string; name_th: string },
): string {
  if (locale === 'en') return item.name_en;
  if (locale === 'th') return item.name_th;
  return item.name_zh;
}

export default function AdminStockPage() {
  const t = useTranslations();
  const locale = useLocale();

  const [items, setItems] = useState<AdminStockItem[]>([]);
  const [summary, setSummary] = useState<AdminStockSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminStock();
      setItems(data.items || []);
      setSummary(data.summary || null);
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'made') return items.filter((i) => i.stockType === 'MADE');
    if (filter === 'purchased')
      return items.filter((i) => i.stockType === 'PURCHASED');
    return items.filter(
      (i) => i.view.lowStock || i.view.soldOut,
    );
  }, [items, filter]);

  const getLocaleName = (item: AdminStockItem) => localeName(locale, item);

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

      <h3 className="mb-3 text-lg font-bold text-neutral-900">
        {t('adminStock.overview')}
      </h3>

      {/* 单据与对账入口 */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Link
          href="/admin/stock/receipts"
          className="rounded-xl bg-white py-2.5 text-center text-xs font-medium text-neutral-600 shadow-sm hover:bg-neutral-50"
        >
          📥 {t('adminStock.receiptsEntry')}
        </Link>
        <Link
          href="/admin/stock/stock-takes"
          className="rounded-xl bg-white py-2.5 text-center text-xs font-medium text-neutral-600 shadow-sm hover:bg-neutral-50"
        >
          📋 {t('adminStock.takesEntry')}
        </Link>
        <Link
          href="/admin/stock/reconcile"
          className="rounded-xl bg-white py-2.5 text-center text-xs font-medium text-neutral-600 shadow-sm hover:bg-neutral-50"
        >
          ⚖️ {t('adminStock.reconcileEntry')}
        </Link>
      </div>

      {/* 存货金额账合计 */}
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-primary-700 px-4 py-3 text-white shadow-sm">
        <span className="text-xs opacity-90">{t('adminStock.stockValueTotal')}</span>
        <span className="text-xl font-bold">
          ฿
          {(summary?.stockValueTotal ?? 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>

      {/* Summary cells */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-white p-3 text-center shadow-sm">
          <div className="text-xl font-bold text-error-600">
            {summary?.soldOut ?? 0}
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">
            {t('adminStock.soldOutToday')}
          </div>
        </div>
        <div className="rounded-xl bg-white p-3 text-center shadow-sm">
          <div className="text-xl font-bold text-amber-600">
            {summary?.lowStock ?? 0}
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">
            {t('adminStock.lowStock')}
          </div>
        </div>
        <div className="rounded-xl bg-white p-3 text-center shadow-sm">
          <div className="text-xl font-bold text-success-600">
            {summary?.normal ?? 0}
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">
            {t('adminStock.normal')}
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex rounded-xl bg-neutral-100 p-1">
        {(
          [
            ['all', 'adminStock.filterAll'],
            ['made', 'adminStock.filterMade'],
            ['purchased', 'adminStock.filterPurchased'],
            ['attention', 'adminStock.filterAttention'],
          ] as [Filter, string][]
        ).map(([key, labelKey]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition ${
              filter === key
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-neutral-400">
          {t('common.loading')}
        </div>
      ) : items.length === 0 ? (
        <div className="py-10 text-center text-sm text-neutral-400">
          {t('adminStock.noStockItems')}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-neutral-400">
          {t('common.noData')}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const v = item.view;
            const pct =
              item.stockType === 'MADE' && v.dailyLimit
                ? Math.max(
                    0,
                    Math.min(
                      100,
                      Math.round(((v.remaining ?? 0) / v.dailyLimit) * 100),
                    ),
                  )
                : item.stockType === 'PURCHASED' && v.lowStockAlert
                  ? Math.max(
                      0,
                      Math.min(
                        100,
                        Math.round(((v.remaining ?? 0) / v.lowStockAlert) * 100),
                      ),
                    )
                  : v.remaining
                    ? 100
                    : 0;
            return (
              <Link
                key={item.id}
                href={`/admin/stock/${item.id}`}
                className="block rounded-lg bg-white p-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  {item.imageThumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageThumbUrl}
                      alt={getLocaleName(item)}
                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-lg">
                      🍽️
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-neutral-900">
                        {getLocaleName(item)}
                      </p>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
                          item.stockType === 'MADE'
                            ? 'bg-primary-50 text-primary-700'
                            : item.stockType === 'PURCHASED'
                              ? 'bg-accent-50 text-accent-600'
                              : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
                        {t(TYPE_LABEL_KEY[item.stockType])}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-neutral-500">
                      {item.categoryName}
                    </p>

                    {item.stockType !== 'NONE' && (
                      <div className="mt-1.5">
                        <div className="mb-1 text-xs text-neutral-500">
                          {item.stockType === 'MADE'
                            ? t('adminStock.stockProgress', {
                                remaining: v.remaining ?? 0,
                                limit: v.dailyLimit ?? 0,
                              })
                            : `${t('adminStock.currentStock')} ${v.remaining ?? 0} · ฿${(
                                item.stockValue ?? 0
                              ).toFixed(2)} · ${t('adminStock.lowStockAlertLine')} ${
                                v.lowStockAlert ?? '—'
                              }`}
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                          <div
                            className={`h-full rounded-full ${
                              v.soldOut
                                ? 'bg-error-600'
                                : v.lowStock
                                  ? 'bg-amber-500'
                                  : 'bg-success-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {v.soldOut && (
                      <span className="rounded bg-error-50 px-2 py-0.5 text-xs font-medium text-error-600">
                        {t('adminStock.soldOutState')}
                      </span>
                    )}
                    {!v.soldOut && v.lowStock && (
                      <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                        {t('adminStock.needsRestock')}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
