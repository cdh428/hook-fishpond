'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Visual state of a single day cell. The picker never decides this itself —
 * the parent owns the closed-day rules and hands back the state, so the
 * calendar stays in sync with server-side booking validation.
 */
export type DayState = 'past' | 'monday' | 'holiday' | 'available';

interface DatePickerProps {
  value: string;
  onChange: (dateStr: string) => void;
  minDate: string;
  /** Required — the single source of truth for whether a day is bookable. */
  getDayState: (dateStr: string) => DayState;
  /** Optional tooltip / long-press hint for a day (e.g. the holiday name). */
  getDayNote?: (dateStr: string) => string | undefined;
  /** Fired whenever the displayed year changes, so the parent can lazy-load
   *  that year's statutory holidays. */
  onYearChange?: (year: number) => void;
  locale: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateString(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

// Weekday short labels Mon..Sun, in the requested locale.
function weekdayShort(locale: string, dayIndex: number): string {
  // 2024-01-01 is a Monday; offset by dayIndex (0=Mon .. 6=Sun)
  const base = new Date(Date.UTC(2024, 0, 1 + dayIndex));
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(base);
}

/**
 * Cell styling. Deliberately high-contrast:
 *   available → teal pill with a visible ring (clearly tappable)
 *   monday    → solid grey fill + strikethrough (weekly rest day)
 *   holiday   → warm red fill + strikethrough (statutory holiday)
 *   past      → near-invisible ghost cell (nothing to tap)
 */
const STATE_CLASS: Record<DayState, string> = {
  available:
    'bg-primary-100 text-primary-800 ring-1 ring-primary-300 hover:bg-primary-200 hover:ring-primary-400',
  monday:
    'cursor-not-allowed bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200',
  holiday:
    'cursor-not-allowed bg-error-100 text-error-700 ring-1 ring-error-500/30',
  past: 'cursor-not-allowed bg-white text-neutral-300 ring-1 ring-neutral-100',
};

export default function DatePicker({
  value,
  onChange,
  minDate,
  getDayState,
  getDayNote,
  onYearChange,
  locale,
}: DatePickerProps) {
  const t = useTranslations();
  const initial = value || minDate;
  const [year, setYear] = useState<number>(() => {
    const [y] = initial.split('-').map(Number);
    return y && !Number.isNaN(y) ? y : new Date().getFullYear();
  });
  const [month, setMonth] = useState<number>(() => {
    const [, m] = initial.split('-').map(Number);
    return m && !Number.isNaN(m) ? m - 1 : new Date().getMonth();
  });

  // Keep the latest callback without re-firing the effect on every render.
  const yearCb = useRef(onYearChange);
  yearCb.current = onYearChange;
  useEffect(() => {
    yearCb.current?.(year);
  }, [year]);

  const monthDate = new Date(year, month, 1);
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(monthDate);

  const weekdays = Array.from({ length: 7 }, (_, i) => weekdayShort(locale, i));

  // Leading blanks so the 1st falls under its correct weekday (weeks start Mon)
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0=Mon
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      toDateString(year, month + 1, i + 1),
    ),
  ];

  const prevMonth = () => {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else {
      setMonth(month - 1);
    }
  };

  const nextMonth = () => {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else {
      setMonth(month + 1);
    }
  };

  const restTag = t('booking.restTag');
  const closedCount = cells.filter(
    (d) => d && (getDayState(d) === 'monday' || getDayState(d) === 'holiday'),
  ).length;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
          aria-label="Previous month"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-neutral-900">{monthLabel}</span>
        <button
          type="button"
          onClick={nextMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
          aria-label="Next month"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {weekdays.map((w, i) => (
          <div
            key={i}
            className={`py-1 text-center text-[10px] uppercase ${
              i === 0
                ? 'font-semibold text-error-600'
                : 'font-medium text-neutral-400'
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((dateStr, i) => {
          if (!dateStr) {
            return <div key={`b-${i}`} className="h-11 w-full" />;
          }
          const state = getDayState(dateStr);
          const disabled = state !== 'available';
          const selected = dateStr === value;
          const closed = state === 'monday' || state === 'holiday';
          const note = getDayNote?.(dateStr);

          return (
            <button
              key={dateStr}
              type="button"
              disabled={disabled}
              title={note}
              onClick={() => onChange(dateStr)}
              className={`flex h-11 w-full flex-col items-center justify-center rounded-lg text-sm font-medium leading-none transition ${
                selected
                  ? 'bg-primary-700 text-white ring-2 ring-primary-300'
                  : STATE_CLASS[state]
              }`}
            >
              <span className={closed && !selected ? 'line-through' : ''}>
                {parseInt(dateStr.slice(8, 10), 10)}
              </span>
              {closed && (
                <span className="mt-0.5 text-[8px] font-normal leading-none">
                  {restTag}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend — makes the colour coding explicit instead of guessable */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-neutral-100 pt-2 text-[11px] text-neutral-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-primary-100 ring-1 ring-primary-300" />
          {t('booking.legendAvailable')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-neutral-100 ring-1 ring-neutral-200" />
          {t('booking.legendMonday')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-error-100 ring-1 ring-error-500/30" />
          {t('booking.legendHoliday')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-white ring-1 ring-neutral-100" />
          {t('booking.legendPast')}
        </span>
      </div>

      {closedCount > 0 && (
        <p className="mt-2 text-[11px] text-neutral-400">
          {t('booking.closedThisMonth', { count: closedCount })}
        </p>
      )}
    </div>
  );
}
