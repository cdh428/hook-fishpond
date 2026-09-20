'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from '@/i18n/routing';
import {
  fetchPurchaseReceipts,
  createPurchaseReceipt,
  reversePurchaseReceipt,
  fetchAdminStock,
  type PurchaseReceipt,
  type AdminStockItem,
} from '@/lib/api-client';

interface DraftLine {
  menuItemId: string;
  qty: string;
  unitCost: string;
}

function localeName(
  locale: string,
  item: { name_zh?: string; name_en?: string; name_th?: string },
): string {
  if (locale === 'en') return item.name_en || item.name_zh || '';
  if (locale === 'th') return item.name_th || item.name_zh || '';
  return item.name_zh || item.name_en || '';
}

function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `฿${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(locale: string, iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(
      locale === 'zh' ? 'zh-CN' : locale === 'th' ? 'th-TH' : 'en-US',
      { year: 'numeric', month: '2-digit', day: '2-digit' },
    );
  } catch {
    return iso;
  }
}

export default function PurchaseReceiptsPage() {
  const t = useTranslations();
  const locale = useLocale();

  const [receipts, setReceipts] = useState<PurchaseReceipt[]>([]);
  const [purchasedItems, setPurchasedItems] = useState<AdminStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // 新建进货单
  const [creating, setCreating] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [docDate, setDocDate] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    { menuItemId: '', qty: '', unitCost: '' },
  ]);
  const [busy, setBusy] = useState(false);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2800);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rs, stock] = await Promise.all([
        fetchPurchaseReceipts(),
        fetchAdminStock(),
      ]);
      setReceipts(rs.receipts || []);
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

  const itemById = useMemo(() => {
    const m = new Map<string, AdminStockItem>();
    for (const it of purchasedItems) m.set(it.id, it);
    return m;
  }, [purchasedItems]);

  const resetDraft = () => {
    setSupplier('');
    setDocDate('');
    setNote('');
    setLines([{ menuItemId: '', qty: '', unitCost: '' }]);
  };

  const updateLine = (idx: number, patch: Partial<DraftLine>) => {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    );
  };

  const pickItem = (idx: number, menuItemId: string) => {
    const it = itemById.get(menuItemId);
    // 选定菜品后默认带上其移动加权成本，避免空值把平均成本拉成 0
    updateLine(idx, {
      menuItemId,
      unitCost:
        it && it.avgCost != null
          ? String(it.avgCost)
          : it && it.costPrice != null
            ? String(it.costPrice)
            : '',
    });
  };

  const addLine = () =>
    setLines((prev) => [...prev, { menuItemId: '', qty: '', unitCost: '' }]);

  const removeLine = (idx: number) =>
    setLines((prev) => prev.filter((_, i) => i !== idx));

  const draftTotal = useMemo(
    () =>
      lines.reduce((s, l) => {
        const q = Number(l.qty) || 0;
        const c = Number(l.unitCost) || 0;
        return s + q * c;
      }, 0),
    [lines],
  );

  const validLines = lines.filter(
    (l) => l.menuItemId && Number(l.qty) > 0,
  );

  const submit = async () => {
    if (validLines.length === 0) return;
    setBusy(true);
    try {
      const res = await createPurchaseReceipt({
        lines: validLines.map((l) => ({
          menuItemId: l.menuItemId,
          qty: Number(l.qty),
          unitCost: l.unitCost === '' ? null : Number(l.unitCost),
        })),
        supplier: supplier || null,
        docDate: docDate ? new Date(docDate).toISOString() : null,
        note: note || null,
      });
      showToast(true, t('adminStock.receiptCreated', { code: res.code }));
      setCreating(false);
      resetDraft();
      await load();
    } catch (err: any) {
      showToast(false, err?.message || t('adminStock.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleReverse = async (r: PurchaseReceipt) => {
    if (!window.confirm(t('adminStock.reverseReceiptConfirm', { code: r.code })))
      return;
    setReversingId(r.id);
    try {
      await reversePurchaseReceipt(r.id);
      showToast(true, t('adminStock.reversedOk'));
      await load();
    } catch (err: any) {
      showToast(false, err?.message || t('adminStock.saveFailed'));
    } finally {
      setReversingId(null);
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
          {t('adminStock.receiptsTitle')}
        </h3>
        <button
          onClick={() => {
            setCreating((c) => !c);
            if (creating) resetDraft();
          }}
          className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white"
        >
          + {t('adminStock.newReceipt')}
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

      {/* 新建进货单表单 */}
      {creating && (
        <div className="mb-4 space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold text-neutral-900">
            {t('adminStock.newReceipt')}
          </h4>
          <p className="text-xs text-neutral-400">
            {t('adminStock.receiptFormHint')}
          </p>
          <input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder={t('adminStock.supplierPlaceholder')}
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
          />
          <input
            type="date"
            value={docDate}
            onChange={(e) => setDocDate(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
          />

          <div className="space-y-2">
            {lines.map((l, idx) => {
              const it = itemById.get(l.menuItemId);
              const amount =
                (Number(l.qty) || 0) * (Number(l.unitCost) || 0);
              return (
                <div key={idx} className="space-y-1.5 rounded-xl bg-neutral-50 p-2.5">
                  <div className="flex items-center gap-2">
                    <select
                      value={l.menuItemId}
                      onChange={(e) => pickItem(idx, e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-2 py-2 text-xs"
                    >
                      <option value="">{t('adminStock.chooseItem')}</option>
                      {purchasedItems.map((it2) => (
                        <option key={it2.id} value={it2.id}>
                          {localeName(locale, it2)} · ฿
                          {(it2.avgCost ?? 0).toFixed(2)}
                        </option>
                      ))}
                    </select>
                    {lines.length > 1 && (
                      <button
                        onClick={() => removeLine(idx)}
                        className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-error-600 hover:bg-error-50"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={l.qty}
                      onChange={(e) => updateLine(idx, { qty: e.target.value })}
                      placeholder={t('adminStock.inboundQty')}
                      className="w-24 rounded-lg border border-neutral-200 px-2 py-2 text-xs"
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.unitCost}
                      onChange={(e) =>
                        updateLine(idx, { unitCost: e.target.value })
                      }
                      placeholder={t('adminStock.unitCost')}
                      className="w-28 rounded-lg border border-neutral-200 px-2 py-2 text-xs"
                    />
                    <span className="ml-auto text-xs font-medium text-neutral-600">
                      {money(amount)}
                    </span>
                  </div>
                  {it && (
                    <p className="text-[11px] text-neutral-400">
                      {t('adminStock.currentStock')} {it.stockQty ?? 0} ·{' '}
                      {t('adminStock.avgCost')} {money(it.avgCost ?? 0)}
                    </p>
                  )}
                </div>
              );
            })}
            <button
              onClick={addLine}
              className="w-full rounded-xl border border-dashed border-neutral-300 py-2 text-xs font-medium text-primary-700 hover:bg-primary-50"
            >
              + {t('adminStock.addLine')}
            </button>
          </div>

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('adminStock.notePlaceholder')}
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
          />

          <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2.5 text-sm">
            <span className="text-neutral-500">{t('adminStock.receiptTotal')}</span>
            <span className="font-bold text-neutral-900">{money(draftTotal)}</span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setCreating(false);
                resetDraft();
              }}
              className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={submit}
              disabled={busy || validLines.length === 0}
              className="flex-1 rounded-xl bg-accent-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('adminStock.confirmInbound')}
            </button>
          </div>
        </div>
      )}

      {/* 进货单列表 */}
      {loading ? (
        <div className="py-20 text-center text-sm text-neutral-400">
          {t('common.loading')}
        </div>
      ) : receipts.length === 0 ? (
        <div className="py-10 text-center text-sm text-neutral-400">
          {t('adminStock.noReceipts')}
        </div>
      ) : (
        <div className="space-y-2">
          {receipts.map((r) => {
            const isOpen = expanded === r.id;
            return (
              <div key={r.id} className="rounded-xl bg-white p-3 shadow-sm">
                <button
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-neutral-900">
                        {r.code}
                      </span>
                      {r.reversedAt && (
                        <span className="rounded bg-error-50 px-1.5 py-0.5 text-[10px] text-error-600">
                          {t('adminStock.receiptReversed')}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-neutral-400">
                      {formatDate(locale, r.docDate)}
                      {r.supplier ? ` · ${r.supplier}` : ''}
                      {r.adminName ? ` · ${r.adminName}` : ''}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {t('adminStock.receiptLineCount', { n: r.lines.length })}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <span className="text-sm font-bold text-neutral-900">
                      {money(r.totalAmount)}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {isOpen ? '▲' : '▼'}
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-2 space-y-1.5 border-t border-neutral-100 pt-2">
                    {r.lines.map((l) => (
                      <div
                        key={l.id ?? l.menuItemId}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="min-w-0 truncate text-neutral-700">
                          {localeName(locale, l)}
                        </span>
                        <span className="shrink-0 text-neutral-500">
                          {l.qty} × {money(l.unitCost)} ={' '}
                          <span className="font-medium text-neutral-800">
                            {money(l.amount)}
                          </span>
                        </span>
                      </div>
                    ))}
                    {r.note && (
                      <p className="pt-1 text-xs text-neutral-400">{r.note}</p>
                    )}
                    {!r.reversedAt && (
                      <button
                        onClick={() => handleReverse(r)}
                        disabled={reversingId === r.id}
                        className="mt-1 w-full rounded-lg border border-error-200 py-2 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-50"
                      >
                        {reversingId === r.id
                          ? '…'
                          : `↩ ${t('adminStock.reverseReceipt')}`}
                      </button>
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
