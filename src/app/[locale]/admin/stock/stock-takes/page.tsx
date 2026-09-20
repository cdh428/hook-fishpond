'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from '@/i18n/routing';
import {
  fetchStockTakes,
  createStockTake,
  fetchAdminStock,
  type StockTake,
  type AdminStockItem,
} from '@/lib/api-client';

function localeName(
  locale: string,
  item: { name_zh?: string; name_en?: string; name_th?: string },
): string {
  if (locale === 'en') return item.name_en || item.name_zh || '';
  if (locale === 'th') return item.name_th || item.name_zh || '';
  return item.name_zh || item.name_en || '';
}

function formatDate(locale: string, iso: string): string {
  try {
    return new Date(iso).toLocaleString(
      locale === 'zh' ? 'zh-CN' : locale === 'th' ? 'th-TH' : 'en-US',
      {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      },
    );
  } catch {
    return iso;
  }
}

export default function StockTakesPage() {
  const t = useTranslations();
  const locale = useLocale();

  const [takes, setTakes] = useState<StockTake[]>([]);
  const [purchasedItems, setPurchasedItems] = useState<AdminStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState('');
  /** menuItemId -> 实盘数字符串 */
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2800);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [tk, stock] = await Promise.all([
        fetchStockTakes(),
        fetchAdminStock(),
      ]);
      setTakes(tk.takes || []);
      setPurchasedItems(
        (stock.items || []).filter((i) => i.stockType === 'PURCHASED'),
      );
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const entered = useMemo(
    () =>
      purchasedItems
        .map((it) => ({
          it,
          raw: counts[it.id],
        }))
        .filter((x) => x.raw !== undefined && x.raw !== ''),
    [purchasedItems, counts],
  );

  const diffSummary = useMemo(() => {
    let plus = 0;
    let minus = 0;
    for (const { it, raw } of entered) {
      const actual = Number(raw) || 0;
      const diff = actual - (it.stockQty ?? 0);
      if (diff > 0) plus += diff;
      else if (diff < 0) minus += -diff;
    }
    return { plus, minus };
  }, [entered]);

  const submit = async () => {
    if (entered.length === 0) return;
    setBusy(true);
    try {
      const res = await createStockTake({
        lines: entered.map(({ it, raw }) => ({
          menuItemId: it.id,
          actualQty: Number(raw) || 0,
        })),
        note: note || null,
      });
      showToast(true, t('adminStock.takeCreated', { code: res.code }));
      setCreating(false);
      setNote('');
      setCounts({});
      await load();
    } catch (err: any) {
      showToast(false, err?.message || t('adminStock.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/admin/stock"
          className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
        >
          ← {t('adminStock.back')}
        </Link>
        <h3 className="flex-1 truncate text-lg font-bold text-neutral-900">
          {t('adminStock.takesTitle')}
        </h3>
        <button
          onClick={() => {
            setCreating((c) => !c);
            if (creating) {
              setCounts({});
              setNote('');
            }
          }}
          className="rounded-lg bg-primary-700 px-3 py-1.5 text-xs font-medium text-white"
        >
          + {t('adminStock.newTake')}
        </button>
      </div>

      {toast && (
        <div
          className={`mb-3 rounded-xl px-4 py-2 text-sm ${
            toast.ok
              ? 'bg-success-50 text-success-600'
              : 'bg-error-50 text-error-600'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-error-50 px-4 py-2 text-sm text-error-600">
          {error}
          <button onClick={load} className="ml-2 underline">
            {t('common.retry')}
          </button>
        </div>
      )}

      {creating && (
        <div className="mb-4 space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold text-neutral-900">
            {t('adminStock.newTake')}
          </h4>
          <p className="text-xs text-neutral-400">
            {t('adminStock.takeFormHint')}
          </p>

          {purchasedItems.length === 0 ? (
            <p className="rounded-xl bg-neutral-50 px-3 py-3 text-xs text-neutral-400">
              {t('adminStock.noStockItems')}
            </p>
          ) : (
            <div className="space-y-1.5">
              {purchasedItems.map((it) => {
                const raw = counts[it.id];
                const actual = raw === undefined || raw === '' ? null : Number(raw) || 0;
                const diff = actual === null ? null : actual - (it.stockQty ?? 0);
                return (
                  <div
                    key={it.id}
                    className="flex items-center gap-2 rounded-xl bg-neutral-50 px-2.5 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-neutral-800">
                        {localeName(locale, it)}
                      </p>
                      <p className="text-[11px] text-neutral-400">
                        {t('adminStock.bookQty')} {it.stockQty ?? 0}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={raw ?? ''}
                      onChange={(e) =>
                        setCounts((prev) => ({
                          ...prev,
                          [it.id]: e.target.value,
                        }))
                      }
                      placeholder={t('adminStock.actualQty')}
                      className="w-24 rounded-lg border border-neutral-200 px-2 py-2 text-xs"
                    />
                    <span
                      className={`w-10 shrink-0 text-right text-xs font-semibold ${
                        diff === null || diff === 0
                          ? 'text-neutral-400'
                          : diff > 0
                            ? 'text-success-600'
                            : 'text-error-600'
                      }`}
                    >
                      {diff === null ? '—' : diff > 0 ? `+${diff}` : diff}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('adminStock.notePlaceholder')}
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
          />

          <div className="rounded-xl bg-neutral-50 px-3 py-2.5 text-xs text-neutral-600">
            {t('adminStock.takeSummary', {
              count: entered.length,
              plus: diffSummary.plus,
              minus: diffSummary.minus,
            })}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setCreating(false);
                setCounts({});
                setNote('');
              }}
              className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={submit}
              disabled={busy || entered.length === 0}
              className="flex-1 rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('adminStock.confirmTake')}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-neutral-400">
          {t('common.loading')}
        </div>
      ) : takes.length === 0 ? (
        <div className="py-10 text-center text-sm text-neutral-400">
          {t('adminStock.noTakes')}
        </div>
      ) : (
        <div className="space-y-2">
          {takes.map((tk) => {
            const isOpen = expanded === tk.id;
            const diffs = tk.lines.filter((l) => l.diff !== 0).length;
            return (
              <div key={tk.id} className="rounded-xl bg-white p-3 shadow-sm">
                <button
                  onClick={() => setExpanded(isOpen ? null : tk.id)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-sm font-semibold text-neutral-900">
                      {tk.code}
                    </span>
                    <p className="truncate text-xs text-neutral-400">
                      {formatDate(locale, tk.createdAt)}
                      {tk.adminName ? ` · ${tk.adminName}` : ''}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {t('adminStock.takeLineCount', {
                        n: tk.lines.length,
                        d: diffs,
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-neutral-400">
                    {isOpen ? '▲' : '▼'}
                  </span>
                </button>
                {isOpen && (
                  <div className="mt-2 space-y-1.5 border-t border-neutral-100 pt-2">
                    {tk.lines.map((l) => (
                      <div
                        key={l.id ?? l.menuItemId}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="min-w-0 truncate text-neutral-700">
                          {localeName(locale, l)}
                        </span>
                        <span className="shrink-0 text-neutral-500">
                          {t('adminStock.bookQty')} {l.bookQty} →{' '}
                          {t('adminStock.actualQty')} {l.actualQty}{' '}
                          <span
                            className={`font-semibold ${
                              l.diff === 0
                                ? 'text-neutral-400'
                                : l.diff > 0
                                  ? 'text-success-600'
                                  : 'text-error-600'
                            }`}
                          >
                            ({l.diff > 0 ? `+${l.diff}` : l.diff})
                          </span>
                        </span>
                      </div>
                    ))}
                    {tk.note && (
                      <p className="pt-1 text-xs text-neutral-400">{tk.note}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
