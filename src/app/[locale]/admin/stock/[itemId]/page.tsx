'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/routing';
import {
  fetchStockItem,
  updateStockSettings,
  postStockPurchase,
  postStockAdjust,
  postStockWaste,
  postStockSoldOut,
  type AdminStockItem,
  type StockMovement,
} from '@/lib/api-client';

type StockType = 'NONE' | 'MADE' | 'PURCHASED';

const MOVE_META: Record<
  StockMovement['type'],
  { labelKey: string; icon: string }
> = {
  PURCHASE: { labelKey: 'adminStock.movePurchase', icon: '📥' },
  SALE: { labelKey: 'adminStock.moveSale', icon: '🛒' },
  CANCEL: { labelKey: 'adminStock.moveCancel', icon: '↩️' },
  MANUAL: { labelKey: 'adminStock.moveManual', icon: '✋' },
  WASTE: { labelKey: 'adminStock.moveWaste', icon: '🗑️' },
};

const TYPE_OPTIONS: { value: StockType; labelKey: string }[] = [
  { value: 'NONE', labelKey: 'adminStock.typeNone' },
  { value: 'MADE', labelKey: 'adminStock.typeMade' },
  { value: 'PURCHASED', labelKey: 'adminStock.typePurchased' },
];

function formatDateTime(locale: string, iso: string): string {
  try {
    return new Date(iso).toLocaleString(
      locale === 'zh' ? 'zh-CN' : locale === 'th' ? 'th-TH' : 'en-US',
      { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' },
    );
  } catch {
    return iso;
  }
}

export default function AdminStockItemPage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useParams<{ itemId: string }>();
  const itemId = params.itemId;

  const [item, setItem] = useState<AdminStockItem | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    stockType: 'NONE' as StockType,
    dailyLimit: '',
    lowStockAlert: '',
    costPrice: '',
  });

  const [panel, setPanel] = useState<'inbound' | 'adjust' | 'waste' | null>(
    null,
  );
  const [inboundQty, setInboundQty] = useState('');
  const [inboundUnitCost, setInboundUnitCost] = useState('');
  const [inboundNote, setInboundNote] = useState('');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [wasteQty, setWasteQty] = useState('');
  const [wasteNote, setWasteNote] = useState('');

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchStockItem(itemId);
      setItem(data.item);
      setMovements(data.movements || []);
      setForm({
        stockType: data.item.stockType,
        dailyLimit:
          data.item.dailyLimit === null || data.item.dailyLimit === undefined
            ? ''
            : String(data.item.dailyLimit),
        lowStockAlert:
          data.item.lowStockAlert === null ||
          data.item.lowStockAlert === undefined
            ? ''
            : String(data.item.lowStockAlert),
        costPrice:
          data.item.costPrice === null || data.item.costPrice === undefined
            ? ''
            : String(data.item.costPrice),
      });
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [itemId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStockType = async (type: StockType) => {
    setBusy(true);
    try {
      await updateStockSettings(itemId, { stockType: type });
      showToast(true, t('adminStock.savedOk'));
      await load();
    } catch {
      showToast(false, t('adminStock.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSettings = async () => {
    setBusy(true);
    const patch: {
      dailyLimit?: number | null;
      lowStockAlert?: number | null;
      costPrice?: number | null;
    } = {};
    if (form.stockType === 'MADE') {
      patch.dailyLimit = form.dailyLimit === '' ? null : Number(form.dailyLimit);
    }
    if (form.stockType === 'PURCHASED') {
      patch.lowStockAlert =
        form.lowStockAlert === '' ? null : Number(form.lowStockAlert);
      patch.costPrice = form.costPrice === '' ? null : Number(form.costPrice);
    }
    try {
      await updateStockSettings(itemId, patch);
      showToast(true, t('adminStock.savedOk'));
      await load();
    } catch {
      showToast(false, t('adminStock.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleInbound = async () => {
    const qty = Number(inboundQty);
    if (!qty || qty <= 0) return;
    setBusy(true);
    try {
      await postStockPurchase(itemId, {
        quantity: qty,
        unitCost: inboundUnitCost ? Number(inboundUnitCost) : undefined,
        note: inboundNote || undefined,
      });
      showToast(true, t('adminStock.savedOk'));
      setPanel(null);
      setInboundQty('');
      setInboundUnitCost('');
      setInboundNote('');
      await load();
    } catch (err: any) {
      showToast(false, err?.message || t('adminStock.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleAdjust = async () => {
    const qty = Number(adjustQty);
    if (!qty || qty === 0) return;
    setBusy(true);
    try {
      await postStockAdjust(itemId, {
        quantity: qty,
        note: adjustNote || undefined,
      });
      showToast(true, t('adminStock.savedOk'));
      setPanel(null);
      setAdjustQty('');
      setAdjustNote('');
      await load();
    } catch (err: any) {
      showToast(false, err?.message || t('adminStock.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleWaste = async () => {
    const qty = Number(wasteQty);
    if (!qty || qty <= 0) return;
    setBusy(true);
    try {
      await postStockWaste(itemId, {
        quantity: qty,
        note: wasteNote || undefined,
      });
      showToast(true, t('adminStock.savedOk'));
      setPanel(null);
      setWasteQty('');
      setWasteNote('');
      await load();
    } catch (err: any) {
      showToast(false, err?.message || t('adminStock.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleSoldOut = async () => {
    if (!item) return;
    setBusy(true);
    try {
      await postStockSoldOut(itemId, !item.soldOut);
      showToast(true, t('adminStock.savedOk'));
      await load();
    } catch {
      showToast(false, t('adminStock.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-neutral-400">
        {t('common.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-error-50 px-4 py-3 text-sm text-error-600">
        {error}
        <button onClick={load} className="ml-2 underline">
          {t('common.retry')}
        </button>
      </div>
    );
  }

  if (!item) return null;

  const localeName =
    locale === 'en'
      ? item.name_en
      : locale === 'th'
        ? item.name_th
        : item.name_zh;

  const v = item.view;
  const inboundQtyNum = Number(inboundQty) || 0;
  const inboundUnitCostNum = Number(inboundUnitCost) || 0;
  const stockAfter = (item.stockQty ?? 0) + inboundQtyNum;
  const inboundAmount = inboundQtyNum * inboundUnitCostNum;

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
        <h3 className="truncate text-lg font-bold text-neutral-900">
          {localeName}
        </h3>
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

      {/* Settings block */}
      <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            {t('adminStock.stockType')}
          </label>
          <p className="mb-2 text-xs text-neutral-400">
            {t('adminStock.stockTypeHint')}
          </p>
          <div className="flex rounded-xl bg-neutral-100 p-1">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleStockType(opt.value)}
                disabled={busy || form.stockType === opt.value}
                className={`flex-1 rounded-lg py-2 text-xs font-medium transition ${
                  form.stockType === opt.value
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {form.stockType === 'MADE' && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {t('adminStock.dailyLimit')}
              </label>
              <input
                type="number"
                min={0}
                value={form.dailyLimit}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dailyLimit: e.target.value }))
                }
                placeholder="—"
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              />
              <p className="mt-1 text-xs text-neutral-400">
                {t('adminStock.dailyLimitHint')}
              </p>
            </div>
            {v.dailyLimit ? (
              <div>
                <div className="mb-1 text-xs text-neutral-500">
                  {t('adminStock.soldToday')}{' '}
                  {(v.dailyLimit ?? 0) - (v.remaining ?? 0)} ·{' '}
                  {t('adminStock.remaining')} {v.remaining ?? 0}
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className={`h-full rounded-full ${
                      v.soldOut ? 'bg-error-600' : 'bg-success-500'
                    }`}
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          Math.round(((v.remaining ?? 0) / v.dailyLimit) * 100),
                        ),
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}

        {form.stockType === 'PURCHASED' && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {t('adminStock.currentStock')}
              </label>
              <div className="rounded-xl bg-neutral-50 px-3 py-2.5 text-sm font-semibold text-neutral-900">
                {item.stockQty ?? 0} {t('adminStock.unitPieces')}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {t('adminStock.lowStockAlertLine')}
              </label>
              <input
                type="number"
                min={0}
                value={form.lowStockAlert}
                onChange={(e) =>
                  setForm((f) => ({ ...f, lowStockAlert: e.target.value }))
                }
                placeholder="—"
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              />
              <p className="mt-1 text-xs text-neutral-400">
                {t('adminStock.lowStockAlertHint')}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {t('adminStock.costPrice')}
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.costPrice}
                onChange={(e) =>
                  setForm((f) => ({ ...f, costPrice: e.target.value }))
                }
                placeholder="—"
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              />
              <p className="mt-1 text-xs text-neutral-400">
                {t('adminStock.costPriceHint')}
              </p>
            </div>
          </div>
        )}

        {form.stockType !== 'NONE' && (
          <button
            onClick={handleSaveSettings}
            disabled={busy}
            className="mt-4 w-full rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        )}
      </div>

      {/* Action buttons */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          onClick={() =>
            setPanel(panel === 'inbound' ? null : 'inbound')
          }
          disabled={form.stockType === 'NONE'}
          className="rounded-xl bg-accent-500 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {t('adminStock.inbound')}
        </button>
        <button
          onClick={() => setPanel(panel === 'adjust' ? null : 'adjust')}
          className="rounded-xl bg-primary-700 py-2.5 text-sm font-medium text-white"
        >
          {t('adminStock.adjust')}
        </button>
        <button
          onClick={() => setPanel(panel === 'waste' ? null : 'waste')}
          className="rounded-xl bg-neutral-700 py-2.5 text-sm font-medium text-white"
        >
          {t('adminStock.waste')}
        </button>
        <button
          onClick={handleSoldOut}
          disabled={busy || form.stockType === 'NONE'}
          className={`rounded-xl py-2.5 text-sm font-medium text-white disabled:opacity-40 ${
            item.soldOut ? 'bg-success-600' : 'bg-error-600'
          }`}
        >
          {item.soldOut
            ? t('adminStock.restoreSale')
            : t('adminStock.forceSoldOut')}
        </button>
      </div>

      {panel === 'inbound' && (
        <div className="mb-4 space-y-2 rounded-2xl bg-white p-4 shadow-sm">
          <label className="block text-sm font-medium text-neutral-700">
            {t('adminStock.inboundQty')}
          </label>
          <input
            type="number"
            min={1}
            value={inboundQty}
            onChange={(e) => setInboundQty(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
          />
          <label className="block text-sm font-medium text-neutral-700">
            {t('adminStock.unitCost')}
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={inboundUnitCost}
            onChange={(e) => setInboundUnitCost(e.target.value)}
            placeholder="—"
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
          />
          <label className="block text-sm font-medium text-neutral-700">
            {t('adminStock.noteLabel')}
          </label>
          <input
            value={inboundNote}
            onChange={(e) => setInboundNote(e.target.value)}
            placeholder={t('adminStock.notePlaceholder')}
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
          />
          <div className="rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
            <div>
              {t('adminStock.stockAfter')}: {stockAfter} {t('adminStock.unitPieces')}
            </div>
            <div>
              {t('adminStock.inboundAmount')}: ฿
              {inboundAmount.toLocaleString()}
            </div>
          </div>
          <p className="text-xs text-neutral-400">
            {t('adminStock.inboundNote')}
          </p>
          <button
            onClick={handleInbound}
            disabled={busy || inboundQtyNum <= 0}
            className="w-full rounded-xl bg-accent-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('adminStock.confirmInbound')}
          </button>
        </div>
      )}

      {panel === 'adjust' && (
        <div className="mb-4 space-y-2 rounded-2xl bg-white p-4 shadow-sm">
          <label className="block text-sm font-medium text-neutral-700">
            {t('adminStock.adjustQty')}
          </label>
          <input
            type="number"
            value={adjustQty}
            onChange={(e) => setAdjustQty(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
          />
          <p className="text-xs text-neutral-400">{t('adminStock.adjustHint')}</p>
          <label className="block text-sm font-medium text-neutral-700">
            {t('adminStock.noteLabel')}
          </label>
          <input
            value={adjustNote}
            onChange={(e) => setAdjustNote(e.target.value)}
            placeholder={t('adminStock.notePlaceholder')}
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
          />
          <button
            onClick={handleAdjust}
            disabled={busy || Number(adjustQty) === 0}
            className="w-full rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('adminStock.adjust')}
          </button>
        </div>
      )}

      {panel === 'waste' && (
        <div className="mb-4 space-y-2 rounded-2xl bg-white p-4 shadow-sm">
          <label className="block text-sm font-medium text-neutral-700">
            {t('adminStock.waste')} ({t('adminStock.inboundQty')})
          </label>
          <input
            type="number"
            min={1}
            value={wasteQty}
            onChange={(e) => setWasteQty(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
          />
          <label className="block text-sm font-medium text-neutral-700">
            {t('adminStock.noteLabel')}
          </label>
          <input
            value={wasteNote}
            onChange={(e) => setWasteNote(e.target.value)}
            placeholder={t('adminStock.notePlaceholder')}
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
          />
          <button
            onClick={handleWaste}
            disabled={busy || Number(wasteQty) <= 0}
            className="w-full rounded-xl bg-neutral-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('adminStock.waste')}
          </button>
        </div>
      )}

      {/* Movements list */}
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-semibold text-neutral-900">
          {t('adminStock.movements')}
        </h4>
      </div>
      {movements.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-400">
          {t('common.noData')}
        </p>
      ) : (
        <div className="space-y-2">
          {movements.map((m) => {
            const meta = MOVE_META[m.type];
            const positive = m.quantity > 0;
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-lg bg-white p-3 shadow-sm"
              >
                <span className="text-lg">{meta.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-900">
                    {t(meta.labelKey)}
                  </p>
                  <p className="truncate text-xs text-neutral-400">
                    {m.adminName ? `${m.adminName} · ` : ''}
                    {formatDateTime(locale, m.createdAt)}
                    {m.orderId ? ` · #${m.orderId}` : ''}
                  </p>
                  {m.note && (
                    <p className="truncate text-xs text-neutral-500">{m.note}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold ${
                    positive ? 'text-success-600' : 'text-error-600'
                  }`}
                >
                  {positive ? '+' : ''}
                  {m.quantity}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
