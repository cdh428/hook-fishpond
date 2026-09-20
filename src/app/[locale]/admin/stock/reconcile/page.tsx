'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from '@/i18n/routing';
import {
  fetchStockReconcile,
  recalcStock,
  repairOrderStock,
  type ReconcileResult,
  type ReconcileRow,
  type OrderLinkAudit,
  type OrderLinkIssue,
  type OrderLinkKind,
} from '@/lib/api-client';

function localeName(
  locale: string,
  item: { name_zh: string; name_en: string; name_th: string },
): string {
  if (locale === 'en') return item.name_en;
  if (locale === 'th') return item.name_th;
  return item.name_zh;
}

function money(n: number): string {
  return `฿${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function StockReconcilePage() {
  const t = useTranslations();
  const locale = useLocale();

  const [data, setData] = useState<ReconcileResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3200);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchStockReconcile();
      setData(res);
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = data?.rows ?? [];
  const mismatched = useMemo(() => rows.filter((r) => !r.ok), [rows]);
  const visible = showAll ? rows : mismatched;

  const handleRecalc = async (onlyMismatch: boolean) => {
    const label = onlyMismatch
      ? t('adminStock.recalcMismatch')
      : t('adminStock.recalcAll');
    if (!window.confirm(`${label}?`)) return;
    setBusy(true);
    try {
      const res = await recalcStock(
        onlyMismatch ? mismatched.map((r) => r.itemId) : undefined,
      );
      const total = res.redone.length + res.opened.length;
      showToast(
        true,
        t('adminStock.recalcDone', {
          redone: res.redone.length,
          opened: res.opened.length,
        }) + (total === 0 ? ` · ${t('adminStock.recalcNoChange')}` : ''),
      );
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
          {t('adminStock.reconcileTitle')}
        </h3>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-neutral-400">
        {t('adminStock.reconcileHint')}
      </p>

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

      {loading ? (
        <div className="py-20 text-center text-sm text-neutral-400">
          {t('common.loading')}
        </div>
      ) : !data ? null : (
        <>
          {/* 汇总 */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white p-3 text-center shadow-sm">
              <div className="text-xl font-bold text-neutral-900">
                {data.summary.total}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {t('adminStock.reconcileTotal')}
              </div>
            </div>
            <div className="rounded-xl bg-white p-3 text-center shadow-sm">
              <div className="text-xl font-bold text-success-600">
                {data.summary.ok}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {t('adminStock.ledgerOk')}
              </div>
            </div>
            <div className="rounded-xl bg-white p-3 text-center shadow-sm">
              <div
                className={`text-xl font-bold ${
                  data.summary.mismatch > 0 ? 'text-error-600' : 'text-neutral-900'
                }`}
              >
                {data.summary.mismatch}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {t('adminStock.ledgerMismatch')}
              </div>
            </div>
          </div>

          <div className="mb-4 space-y-1 rounded-2xl bg-white p-3 text-xs shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">{t('adminStock.bookValueTotal')}</span>
              <span className="font-semibold text-neutral-900">
                {money(data.summary.bookValue)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">{t('adminStock.ledgerValueTotal')}</span>
              <span className="font-semibold text-neutral-900">
                {money(data.summary.ledgerValue)}
              </span>
            </div>
          </div>

          {/* 操作 */}
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => handleRecalc(true)}
              disabled={busy || mismatched.length === 0}
              className="flex-1 rounded-xl bg-primary-700 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('adminStock.recalcMismatch')}
            </button>
            <button
              onClick={() => handleRecalc(false)}
              disabled={busy}
              className="flex-1 rounded-xl bg-neutral-700 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {t('adminStock.recalcAll')}
            </button>
          </div>

          {/* ===== 订单 ↔ 库存 挂钩体检 ===== */}
          <OrderLinkSection
            audit={data.orderLink}
            locale={locale}
            t={t}
            onRepaired={load}
            showToast={showToast}
          />

          {/* 明细 */}
          <div className="mb-2 flex items-center justify-between">
            <h4 className="font-semibold text-neutral-900">
              {t('adminStock.reconcileDetail')}
            </h4>
            {mismatched.length > 0 && (
              <button
                onClick={() => setShowAll((s) => !s)}
                className="text-xs font-medium text-primary-700 underline"
              >
                {showAll
                  ? t('adminStock.showMismatchOnly')
                  : t('adminStock.showAll')}
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <div className="rounded-xl bg-success-50 px-4 py-6 text-center text-sm text-success-700">
              ✓ {t('adminStock.allBalanced')}
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map((r) => (
                <ReconcileCard key={r.itemId} row={r} locale={locale} t={t} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function ReconcileCard({
  row,
  locale,
  t,
}: {
  row: ReconcileRow;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div
      className={`rounded-xl p-3 shadow-sm ${
        row.ok ? 'bg-white' : 'bg-amber-50'
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="min-w-0 truncate text-sm font-semibold text-neutral-900">
          {localeName(locale, row)}
        </span>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
            row.ok
              ? 'bg-success-50 text-success-600'
              : 'bg-error-50 text-error-600'
          }`}
        >
          {row.ok ? t('adminStock.ledgerOk') : t('adminStock.ledgerMismatch')}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
        <div className="flex justify-between">
          <span>{t('adminStock.qtyBook')}</span>
          <span className="font-medium text-neutral-800">{row.bookQty}</span>
        </div>
        <div className="flex justify-between">
          <span>{t('adminStock.ledgerQty')}</span>
          <span className="font-medium text-neutral-800">{row.ledgerQty}</span>
        </div>
        <div className="flex justify-between">
          <span>{t('adminStock.valueBook')}</span>
          <span className="font-medium text-neutral-800">
            {money(row.bookValue)}
          </span>
        </div>
        <div className="flex justify-between">
          <span>{t('adminStock.ledgerValue')}</span>
          <span className="font-medium text-neutral-800">
            {money(row.ledgerValue)}
          </span>
        </div>
      </div>
      {!row.ok && (
        <div className="mt-1.5 border-t border-amber-100 pt-1.5 text-[11px] font-medium text-accent-600">
          {t('adminStock.ledgerDiff', {
            qty: row.qtyDiff,
            value: row.valueDiff.toFixed(2),
          })}
        </div>
      )}
      <div className="mt-0.5 text-[10px] text-neutral-400">
        {t('adminStock.entryCount', { n: row.entryCount })} ·{' '}
        {t('adminStock.avgCost')} {money(row.avgCost)}
      </div>
    </div>
  );
}

/** 订单 ↔ 库存 挂钩体检（「卖了没扣」专项） */
function OrderLinkSection({
  audit,
  locale,
  t,
  onRepaired,
  showToast,
}: {
  audit?: OrderLinkAudit;
  locale: string;
  t: ReturnType<typeof useTranslations>;
  onRepaired: () => Promise<void> | void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!audit) return null;

  const total = Object.values(audit.counts).reduce((s, n) => s + n, 0);
  const kinds: OrderLinkKind[] = [
    'SETTLED_UNPOSTED',
    'OPEN_UNRESERVED',
    'STALE_RESERVATION',
    'RESIDUAL_RESERVATION',
  ];

  const kindTitle: Record<OrderLinkKind, string> = {
    SETTLED_UNPOSTED: t('adminStock.kindSettledUnposted'),
    OPEN_UNRESERVED: t('adminStock.kindOpenUnreserved'),
    STALE_RESERVATION: t('adminStock.kindStaleReservation'),
    RESIDUAL_RESERVATION: t('adminStock.kindResidualReservation'),
  };
  const kindHint: Record<OrderLinkKind, string> = {
    SETTLED_UNPOSTED: t('adminStock.kindSettledUnpostedHint'),
    OPEN_UNRESERVED: t('adminStock.kindOpenUnreservedHint'),
    STALE_RESERVATION: t('adminStock.kindStaleReservationHint'),
    RESIDUAL_RESERVATION: t('adminStock.kindResidualReservationHint'),
  };

  const handleRepair = async (issue: OrderLinkIssue) => {
    if (!window.confirm(`${t('adminStock.repairStock')} · ${issue.orderNumber}?`)) return;
    setBusyId(issue.orderId);
    try {
      const res = await repairOrderStock(issue.orderId);
      showToast(
        true,
        res.healed > 0
          ? t('adminStock.repairDone', { n: res.healed })
          : t('adminStock.repairNothing'),
      );
      await onRepaired();
    } catch (err: any) {
      showToast(false, err?.message || t('adminStock.saveFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mb-4">
      <h4 className="mb-1.5 font-semibold text-neutral-900">
        {t('adminStock.orderLinkTitle')}
      </h4>
      <p className="mb-2 text-[11px] leading-relaxed text-neutral-400">
        {t('adminStock.orderLinkHint')}
      </p>

      {/* 计数 */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        {kinds.map((k) => (
          <div
            key={k}
            className={`rounded-xl p-2.5 shadow-sm ${
              audit.counts[k] > 0 ? 'bg-amber-50' : 'bg-white'
            }`}
          >
            <div
              className={`text-lg font-bold ${
                audit.counts[k] > 0 ? 'text-error-600' : 'text-neutral-900'
              }`}
            >
              {audit.counts[k]}
            </div>
            <div className="mt-0.5 text-[11px] leading-tight text-neutral-500">
              {kindTitle[k]}
            </div>
          </div>
        ))}
      </div>

      {total === 0 ? (
        <div className="rounded-xl bg-success-50 px-4 py-6 text-center text-sm text-success-700">
          ✓ {t('adminStock.orderLinkOk')}
        </div>
      ) : (
        <div className="space-y-2">
          {audit.issues.map((issue) => (
            <div
              key={`${issue.kind}:${issue.orderId}`}
              className={`rounded-xl p-3 shadow-sm ${
                issue.kind === 'SETTLED_UNPOSTED' ? 'bg-error-50' : 'bg-white'
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-semibold text-neutral-900">
                  {issue.orderNumber}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    issue.kind === 'SETTLED_UNPOSTED'
                      ? 'bg-error-100 text-error-700'
                      : 'bg-amber-100 text-accent-700'
                  }`}
                >
                  {kindTitle[issue.kind]}
                </span>
              </div>

              <div className="mb-1.5 text-[11px] leading-relaxed text-neutral-500">
                {kindHint[issue.kind]} · {issue.status} · {issue.settlementMode} ·{' '}
                {t('adminStock.ageHours', { n: issue.ageHours })}
              </div>

              <div className="space-y-0.5">
                {issue.lines.map((ln) => (
                  <div
                    key={ln.orderItemId}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <span className="min-w-0 truncate text-neutral-700">
                      {ln.name} × {ln.quantity}
                    </span>
                    <span className="shrink-0 text-neutral-400">
                      {t('adminStock.linePosted', { posted: ln.posted })}
                    </span>
                  </div>
                ))}
              </div>

              {issue.kind === 'SETTLED_UNPOSTED' && (
                <button
                  onClick={() => handleRepair(issue)}
                  disabled={busyId === issue.orderId}
                  className="mt-2 w-full rounded-lg bg-primary-700 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busyId === issue.orderId
                    ? t('adminStock.repairing')
                    : t('adminStock.repairStock')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
