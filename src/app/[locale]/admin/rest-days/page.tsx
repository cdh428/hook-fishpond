'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState, useEffect, useCallback } from 'react';
import {
  fetchClosedDays,
  createClosedDay,
  deleteClosedDay,
  type ApiClosedDay,
} from '@/lib/api-client';
import { bangkokDateString, isMonday } from '@/lib/date-utils';

export default function AdminRestDaysPage() {
  const t = useTranslations();
  const locale = useLocale();

  const [year, setYear] = useState<number>(() =>
    parseInt(bangkokDateString().slice(0, 4), 10),
  );
  const [days, setDays] = useState<ApiClosedDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [saving, setSaving] = useState(false);
  const [formDate, setFormDate] = useState('');
  const [reason_zh, setReasonZh] = useState('');
  const [reason_en, setReasonEn] = useState('');
  const [reason_th, setReasonTh] = useState('');
  const [formError, setFormError] = useState('');

  const todayStr = bangkokDateString();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchClosedDays(year);
      setDays(res.days || []);
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [year, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getReason = (d: ApiClosedDay) => {
    if (locale === 'en') return d.reason_en;
    if (locale === 'th') return d.reason_th;
    return d.reason_zh;
  };

  const handleSave = async () => {
    setFormError('');
    if (!formDate) {
      setFormError(t('admin.restDayDate'));
      return;
    }
    if (isMonday(formDate)) {
      setFormError(t('booking.mondayClosed'));
      return;
    }
    setSaving(true);
    try {
      await createClosedDay({
        date: formDate,
        reason_zh: reason_zh,
        reason_en: reason_en,
        reason_th: reason_th,
      });
      setFormDate('');
      setReasonZh('');
      setReasonEn('');
      setReasonTh('');
      await loadData();
    } catch (err: any) {
      setFormError(err?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteClosedDay(id);
      await loadData();
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    }
  };

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="rounded-xl bg-accent-50 p-4 text-sm text-accent-700">
        <p className="font-medium">{t('admin.mondayFixed')}</p>
        <p className="mt-1 text-accent-600/80">{t('admin.statutoryHint')}</p>
      </div>

      {/* Year switcher */}
      <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-md">
        <button
          onClick={() => setYear((y) => y - 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
          aria-label="Previous year"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-neutral-900">
          {t('admin.yearLabel')} {year}
        </span>
        <button
          onClick={() => setYear((y) => y + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
          aria-label="Next year"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-error-50 px-4 py-2 text-sm text-error-600">
          {error}
          <button onClick={loadData} className="ml-2 underline">
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* List */}
      <div className="rounded-xl bg-white p-4 shadow-md">
        <h3 className="mb-3 text-sm font-semibold text-neutral-900">
          {t('admin.restDays')}
        </h3>
        {loading ? (
          <p className="py-4 text-center text-sm text-neutral-400">
            {t('common.loading')}
          </p>
        ) : days.length === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-400">
            {t('admin.noRestDays')}
          </p>
        ) : (
          <ul className="space-y-2">
            {days.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold text-neutral-900">
                    {d.date}
                  </p>
                  {getReason(d) && (
                    <p className="truncate text-xs text-neutral-500">{getReason(d)}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="rounded px-2 py-1 text-[11px] font-medium text-error-600 hover:bg-error-50"
                >
                  {t('common.delete')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add form */}
      <div className="rounded-xl bg-white p-4 shadow-md">
        <h3 className="mb-3 text-sm font-semibold text-neutral-900">
          {t('admin.addRestDay')}
        </h3>
        <div className="space-y-2">
          <input
            type="date"
            min={todayStr}
            value={formDate}
            onChange={(e) => setFormDate(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <input
            placeholder={t('admin.restDayReason') + ' (' + t('admin.nameZhPlaceholder') + ')'}
            value={reason_zh}
            onChange={(e) => setReasonZh(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <input
            placeholder={t('admin.restDayReason') + ' (' + t('admin.nameEnPlaceholder') + ')'}
            value={reason_en}
            onChange={(e) => setReasonEn(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <input
            placeholder={t('admin.restDayReason') + ' (' + t('admin.nameThPlaceholder') + ')'}
            value={reason_th}
            onChange={(e) => setReasonTh(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          {formError && (
            <p className="text-xs text-error-600">{formError}</p>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('admin.addRestDay')}
          </button>
        </div>
      </div>
    </div>
  );
}
