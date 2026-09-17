'use client';

import { useState } from 'react';

interface DatePickerProps {
  value: string;
  onChange: (dateStr: string) => void;
  minDate: string;
  isDisabled: (dateStr: string) => boolean;
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

export default function DatePicker({
  value,
  onChange,
  minDate,
  isDisabled,
  locale,
}: DatePickerProps) {
  const initial = value || minDate;
  const [year, setYear] = useState<number>(() => {
    const [y] = initial.split('-').map(Number);
    return y && !Number.isNaN(y) ? y : new Date().getFullYear();
  });
  const [month, setMonth] = useState<number>(() => {
    const [, m] = initial.split('-').map(Number);
    return m && !Number.isNaN(m) ? m - 1 : new Date().getMonth();
  });

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
          <div key={i} className="py-1 text-center text-[10px] font-medium uppercase text-neutral-400">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((dateStr, i) => {
          if (!dateStr) {
            return <div key={`b-${i}`} className="h-9 w-full" />;
          }
          const disabled = isDisabled(dateStr) || dateStr < minDate;
          const selected = dateStr === value;
          return (
            <button
              key={dateStr}
              type="button"
              disabled={disabled}
              onClick={() => onChange(dateStr)}
              className={`flex h-9 w-full items-center justify-center rounded-lg text-sm font-medium transition ${
                disabled
                  ? 'cursor-not-allowed text-neutral-300'
                  : selected
                    ? 'bg-primary-700 text-white'
                    : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
              }`}
            >
              {parseInt(dateStr.slice(8, 10), 10)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
