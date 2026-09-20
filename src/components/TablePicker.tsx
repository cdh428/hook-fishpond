'use client';

/**
 * TablePicker — bottom-sheet table selector.
 *
 * Self-contained: fetches the active tables from the public /api/tables
 * endpoint when opened, groups them by area (茅草屋 / 咖啡厅) and lets the
 * customer tap a table. Reused by the menu page, the cart and the admin
 * dashboard (table rebinding), so it takes an optional `title` and an
 * optional `allowClear`.
 */

import { useTranslations, useLocale } from 'next-intl';
import { useEffect, useState } from 'react';
import { fetchTables, type ApiTable } from '@/lib/api-client';

interface TablePickerProps {
  open: boolean;
  currentCode?: string | null;
  onSelect: (code: string) => void;
  onClose: () => void;
  /** Show a "no table / clear" row (menu page uses it; checkout does not). */
  allowClear?: boolean;
  onClear?: () => void;
  title?: string;
}

export default function TablePicker({
  open,
  currentCode,
  onSelect,
  onClose,
  allowClear = false,
  onClear,
  title,
}: TablePickerProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [tables, setTables] = useState<ApiTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchTables()
      .then((list) => {
        if (!cancelled) setTables(list);
      })
      .catch(() => {
        if (!cancelled) setError(t('common.error'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  if (!open) return null;

  const tableName = (tb: ApiTable) =>
    locale === 'en' ? tb.name_en : locale === 'th' ? tb.name_th : tb.name_zh;

  const huts = tables.filter((x) => x.area === 'HUT');
  const cafes = tables.filter((x) => x.area === 'CAFE');

  const renderGroup = (label: string, list: ApiTable[]) =>
    list.length > 0 && (
      <div className="mb-4">
        <p className="mb-2 text-xs font-semibold text-neutral-500">{label}</p>
        <div className="grid grid-cols-3 gap-2">
          {list.map((tb) => {
            const active = currentCode === tb.code;
            return (
              <button
                key={tb.id}
                onClick={() => onSelect(tb.code)}
                className={`rounded-xl border-2 px-2 py-2.5 text-center transition ${
                  active
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-neutral-200 bg-white hover:border-primary-300'
                }`}
              >
                <p className="text-sm font-bold text-neutral-900">{tb.code}</p>
                <p className="mt-0.5 truncate text-[10px] text-neutral-500">
                  {tableName(tb)}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    );

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-black/40" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-bg-page px-4 pb-6 pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-300" />
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-neutral-900">
            {title || t('table.selectTable')}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100"
          >
            {t('common.close')}
          </button>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-neutral-400">{t('common.loading')}</p>
        ) : error ? (
          <p className="py-10 text-center text-sm text-error-600">{error}</p>
        ) : (
          <>
            {renderGroup(t('admin.areaHut'), huts)}
            {renderGroup(t('admin.areaCafe'), cafes)}
            {tables.length === 0 && (
              <p className="py-10 text-center text-sm text-neutral-400">{t('common.noData')}</p>
            )}
          </>
        )}

        {allowClear && currentCode && onClear && (
          <button
            onClick={onClear}
            className="mt-2 w-full rounded-xl border border-neutral-200 bg-white py-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            {t('table.clear')}
          </button>
        )}
      </div>
    </div>
  );
}
