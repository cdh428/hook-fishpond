'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/routing';
import {
  fetchPonds,
  fetchPondSpots,
  createBooking,
  fetchClosedDays,
  ApiPond,
  ApiSpot,
} from '@/lib/api-client';
import {
  bangkokDateString,
  isMonday,
  isTodayCutoff,
  SAME_DAY_CUTOFF_HOUR,
} from '@/lib/date-utils';
import DatePicker, { type DayState } from '@/components/DatePicker';
import { useApp } from '@/contexts/AppContext';

type PondType = 'LEISURE' | 'COMPETITION';

export default function BookingPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { user } = useApp();

  const [ponds, setPonds] = useState<ApiPond[]>([]);
  const [pondsLoading, setPondsLoading] = useState(true);

  const [pondType, setPondType] = useState<PondType>('LEISURE');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSpot, setSelectedSpot] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [groupName, setGroupName] = useState('');
  const [participantCount, setParticipantCount] = useState<number>(10);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showParticipantError, setShowParticipantError] = useState(false);

  const [spots, setSpots] = useState<ApiSpot[]>([]);
  const [spotsLoading, setSpotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Closed-day rules ──────────────────────────────────────────────────
  // Must mirror the server (src/lib/closed-days.ts): every Monday is closed,
  // plus whatever statutory holidays the admin configured.
  // Map of `YYYY-MM-DD` -> holiday name (undefined when the admin left it blank).
  const [holidays, setHolidays] = useState<Map<string, string | undefined>>(
    new Map(),
  );
  // Ticking clock: the same-day cut-off (17:00) and the midnight date rollover
  // must take effect on a page that is left open, without a reload.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const todayStr = bangkokDateString(now);
  const loadedYears = useRef<Set<number>>(new Set());

  // Holidays are stored per calendar year server-side, so load them lazily for
  // whichever year the visitor browses to — otherwise navigating past December
  // would silently re-enable next year's holidays.
  const loadHolidaysForYear = useCallback(
    async (year: number) => {
      if (loadedYears.current.has(year)) return;
      loadedYears.current.add(year);
      try {
        const res = await fetchClosedDays(year);
        setHolidays((prev) => {
          const next = new Map(prev);
          for (const d of res.days) {
            next.set(
              d.date,
              locale === 'en'
                ? d.reason_en
                : locale === 'th'
                  ? d.reason_th
                  : d.reason_zh,
            );
          }
          return next;
        });
      } catch {
        loadedYears.current.delete(year); // allow a retry on a later visit
      }
    },
    [locale],
  );

  useEffect(() => {
    loadHolidaysForYear(Number(todayStr.slice(0, 4)));
  }, [loadHolidaysForYear, todayStr]);

  /** Single source of truth for both the picker's colours and the submit guard. */
  const getDayState = (s: string): DayState => {
    if (s < todayStr) return 'past';
    if (isMonday(s)) return 'monday';
    if (holidays.has(s)) return 'holiday';
    // Same-day bookings stop at 17:00 — today is only blocked, never other days.
    if (isTodayCutoff(s, now)) return 'cutoff';
    return 'available';
  };

  const getDayNote = (s: string): string | undefined => {
    if (isMonday(s)) return t('booking.mondayClosed');
    if (holidays.has(s)) return holidays.get(s) || t('booking.legendHoliday');
    if (isTodayCutoff(s, now)) {
      return t('booking.cutoffNote', { hour: SAME_DAY_CUTOFF_HOUR });
    }
    return undefined;
  };

  const isDateDisabled = (s: string) => getDayState(s) !== 'available';

  /** True when the venue has already closed today's same-day booking window. */
  const todayCutoff = isTodayCutoff(todayStr, now);

  // Upcoming rest days at a glance — actual dates, not just "every Monday".
  const upcomingClosed: { date: string; label: string; holiday: boolean }[] = [];
  const cursor = new Date(`${todayStr}T00:00:00Z`).getTime();
  for (let i = 0; i < 92 && upcomingClosed.length < 5; i++) {
    const s = new Date(cursor + i * 86400000).toISOString().slice(0, 10);
    const mon = isMonday(s);
    const isHoliday = !mon && holidays.has(s);
    if (mon || isHoliday) {
      const holidayName = holidays.get(s);
      upcomingClosed.push({
        date: s,
        label:
          holidayName ||
          (mon ? t('booking.mondayClosed') : t('booking.legendHoliday')),
        holiday: isHoliday,
      });
    }
  }

  // Prefill customer details from the logged-in user
  useEffect(() => {
    if (user) {
      setCustomerName((n) => n || user.name);
      setCustomerPhone((p) => p || user.phone);
    }
  }, [user]);

  // Load ponds
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPondsLoading(true);
      try {
        const data = await fetchPonds();
        if (!cancelled) setPonds(data);
      } catch {
        /* keep empty; UI shows unavailable */
      } finally {
        if (!cancelled) setPondsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activePond = ponds.find((p) => p.type === pondType);
  const isLeisure = pondType === 'LEISURE';

  // Load spots whenever pond or date changes (leisure needs the grid)
  useEffect(() => {
    if (!activePond || !selectedDate) {
      setSpots([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSpotsLoading(true);
      try {
        const { spots: data } = await fetchPondSpots(
          activePond.id,
          selectedDate,
        );
        if (!cancelled) setSpots(data);
      } catch {
        if (!cancelled) setSpots([]);
      } finally {
        if (!cancelled) setSpotsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activePond, selectedDate]);

  const price = !activePond
    ? 0
    : isLeisure
      ? activePond.price
      : activePond.price * participantCount;

  const selectedSpotData = spots.find((s) => s.id === selectedSpot);

  // A spot is available for the selected slot
  const isSpotAvailable = (spot: ApiSpot) => {
    if (isLeisure) {
      return spot.slotAvailability
        ? !!spot.slotAvailability['FULL_DAY']
        : spot.available;
    }
    return spot.available;
  };

  const availableCount = spots.filter(isSpotAvailable).length;

  const formatClosedDate = (d: string) =>
    new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    }).format(new Date(`${d}T00:00:00`));

  const canConfirm = !activePond
    ? false
    : isLeisure
      ? !!(
          selectedDate &&
          !isDateDisabled(selectedDate) &&
          selectedSpot &&
          customerName &&
          customerPhone
        )
      : !!(
          selectedDate &&
          !isDateDisabled(selectedDate) &&
          customerName &&
          customerPhone &&
          groupName &&
          participantCount >= 10
        );

  const handleConfirm = async () => {
    if (!activePond) return;
    if (!isLeisure && participantCount < (activePond.minParticipants || 10)) {
      setShowParticipantError(true);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createBooking({
        pondId: activePond.id,
        spotId: isLeisure ? selectedSpot || undefined : undefined,
        date: selectedDate,
        timeSlot: 'FULL_DAY',
        participantCount: isLeisure ? undefined : participantCount,
        groupName: isLeisure ? undefined : groupName,
        customerName,
        customerPhone,
        userId: user?.id,
      });
      setShowSuccess(true);
    } catch (e: any) {
      // The server enforces the same rules; translate its machine codes.
      const code = e?.message;
      setSubmitError(
        code === 'ERR_SAME_DAY_CUTOFF'
          ? t('booking.cutoffError')
          : code || 'Failed to create booking',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setShowSuccess(false);
    setSelectedSpot(null);
    setGroupName('');
    setParticipantCount(10);
    setShowParticipantError(false);
    setSubmitError(null);
    // refresh spot availability after a successful booking
    if (activePond && selectedDate) {
      fetchPondSpots(activePond.id, selectedDate)
        .then(({ spots: data }) => setSpots(data))
        .catch(() => {});
    }
  };

  const getPondName = (pond: ApiPond) => {
    if (locale === 'en') return pond.name_en;
    if (locale === 'th') return pond.name_th;
    return pond.name_zh;
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h2 className="mb-4 text-2xl font-bold text-neutral-900">
        {t('booking.title')}
      </h2>

      {/* Pond Type Selector */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-neutral-700">
          {t('booking.selectPond')}
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setPondType('LEISURE');
              setSelectedSpot(null);
              setParticipantCount(10);
            }}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
              isLeisure
                ? 'bg-primary-700 text-white shadow-brand'
                : 'bg-white text-neutral-700 shadow-sm hover:bg-primary-50'
            }`}
          >
            <span className="block">{t('pond.leisure')}</span>
            <span className="block text-xs opacity-80">
              {t('home.leisurePrice')}
            </span>
          </button>
          <button
            onClick={() => {
              setPondType('COMPETITION');
              setSelectedSpot(null);
            }}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
              !isLeisure
                ? 'bg-accent-500 text-white shadow-brand'
                : 'bg-white text-neutral-700 shadow-sm hover:bg-accent-50'
            }`}
          >
            <span className="block">{t('pond.competition')}</span>
            <span className="block text-xs opacity-80">
              {t('home.competitionPrice')}
            </span>
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          {isLeisure ? t('booking.leisureMode') : t('booking.competitionMode')}
        </p>
        {isLeisure && (
          <p className="mt-1 text-xs text-neutral-400">
            {t('booking.fullDayNote')}
          </p>
        )}
      </div>

      {/* Date Selection */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-neutral-700">
          {t('booking.selectDate')}
        </label>
        <DatePicker
          value={selectedDate}
          onChange={(d) => {
            setSelectedDate(d);
            setSelectedSpot(null);
          }}
          minDate={todayStr}
          getDayState={getDayState}
          getDayNote={getDayNote}
          onYearChange={loadHolidaysForYear}
          locale={locale}
        />
        <p className="mt-2 text-xs text-neutral-500">
          {t('booking.businessHours')} · {t('booking.mondayClosed')}
        </p>
        {todayCutoff && (
          <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-accent-50 px-2.5 py-2 text-xs font-medium text-accent-700 ring-1 ring-accent-500/30">
            <svg
              className="mt-px h-3.5 w-3.5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
            <span>{t('booking.cutoffNotice', { hour: SAME_DAY_CUTOFF_HOUR })}</span>
          </p>
        )}
        {upcomingClosed.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-neutral-600">
              {t('booking.upcomingClosed')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {upcomingClosed.map((c) => (
                <span
                  key={c.date}
                  title={c.label}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
                    c.holiday
                      ? 'bg-error-50 text-error-500 ring-error-100'
                      : 'bg-neutral-100 text-neutral-500 ring-neutral-200'
                  }`}
                >
                  {formatClosedDate(c.date)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {!isLeisure && (
        <div className="mb-4 rounded-xl bg-neutral-50 p-3 text-center text-sm text-neutral-500">
          <svg
            className="mx-auto mb-1 h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {t('booking.onlyFullDay')}
        </div>
      )}

      {/* Spot Grid — Leisure only */}
      {isLeisure && (
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-neutral-700">
              {t('booking.selectSpot')}
            </label>
            {selectedDate && !spotsLoading && (
              <span className="text-xs text-neutral-400">
                {availableCount}/{spots.length} {t('booking.available')}
              </span>
            )}
          </div>

          {!selectedDate ? (
            <div className="rounded-xl bg-neutral-50 p-4 text-center text-sm text-neutral-500">
              {t('booking.selectDate')}
            </div>
          ) : spotsLoading ? (
            <div className="grid grid-cols-6 gap-2 md:grid-cols-8">
              {Array.from({ length: 18 }).map((_, i) => (
                <div
                  key={i}
                  className="h-11 w-full animate-pulse rounded-lg bg-neutral-100"
                />
              ))}
            </div>
          ) : spots.length === 0 ? (
            <div className="rounded-xl bg-neutral-50 p-4 text-center text-sm text-neutral-500">
              {t('common.noData')}
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-4 text-xs text-neutral-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded border border-primary-300 bg-primary-100" />
                  {t('booking.available')}
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded border border-error-500/30 bg-error-100" />
                  {t('booking.booked')}
                </span>
              </div>
              <div className="grid grid-cols-6 gap-2 md:grid-cols-8">
                {spots.map((spot) => {
                  const available = isSpotAvailable(spot);
                  return (
                    <button
                      key={spot.id}
                      disabled={!available}
                      onClick={() => setSelectedSpot(spot.id)}
                      className={`flex h-11 w-full items-center justify-center rounded-lg text-sm font-medium transition ${
                        !available
                          ? 'cursor-not-allowed bg-error-100 text-error-700'
                          : selectedSpot === spot.id
                            ? 'bg-primary-700 text-white shadow-brand'
                            : 'bg-primary-100 text-primary-800 ring-1 ring-primary-300 hover:bg-primary-200'
                      }`}
                    >
                      {spot.number}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Leisure Form */}
      {isLeisure && selectedSpot && selectedSpotData && (
        <div className="mb-4 rounded-xl bg-white p-4 shadow-md">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-neutral-600">
              {t('booking.spotNumber')}:{' '}
              <strong className="text-neutral-900">
                #{selectedSpotData.number}
              </strong>
            </span>
            <span className="text-lg font-bold text-accent-600">฿{price}</span>
          </div>
          <div className="space-y-2">
            <input
              type="text"
              placeholder={t('booking.yourName')}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <input
              type="tel"
              placeholder={t('booking.yourPhone')}
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>
      )}

      {/* Competition Form */}
      {!isLeisure && (
        <div className="mb-4 rounded-xl bg-white p-4 shadow-md">
          <h4 className="mb-3 text-sm font-semibold text-neutral-900">
            {t('booking.groupBooking')}
          </h4>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                {t('booking.groupName')}
              </label>
              <input
                type="text"
                placeholder={t('booking.groupName')}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                {t('booking.participantCount')}
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const next = Math.max(10, participantCount - 1);
                    setParticipantCount(next);
                    if (next >= 10) setShowParticipantError(false);
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-lg font-medium text-neutral-600 hover:bg-neutral-200"
                >
                  −
                </button>
                <input
                  type="number"
                  min={10}
                  value={participantCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setParticipantCount(val);
                    if (val >= 10) setShowParticipantError(false);
                  }}
                  className="w-20 rounded-xl border border-neutral-200 px-3 py-2.5 text-center text-sm font-semibold focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <button
                  onClick={() => {
                    const next = participantCount + 1;
                    setParticipantCount(next);
                    if (next >= 10) setShowParticipantError(false);
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-lg font-medium text-accent-700 hover:bg-accent-100"
                >
                  +
                </button>
              </div>
              {showParticipantError && (
                <p className="mt-1 text-xs text-error-600">
                  {t('booking.participantCountError')}
                </p>
              )}
              <p className="mt-1 text-xs text-neutral-400">
                {t('booking.minParticipants')}
              </p>
            </div>
            <div className="border-t border-neutral-100 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">
                  {t('booking.price')}
                </span>
                <span className="text-lg font-bold text-accent-600">
                  ฿{price.toLocaleString()}
                </span>
              </div>
              {activePond && (
                <p className="mt-0.5 text-xs text-neutral-400">
                  {activePond.price} × {participantCount} = ฿
                  {price.toLocaleString()}
                </p>
              )}
            </div>
            <div className="space-y-2 pt-2">
              <input
                type="text"
                placeholder={t('booking.yourName')}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <input
                type="tel"
                placeholder={t('booking.yourPhone')}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>
      )}

      {submitError && (
        <div className="mb-4 rounded-xl bg-error-50 p-3 text-sm text-error-600">
          {submitError}
        </div>
      )}

      {/* Sticky CTA */}
      {activePond && (isLeisure ? selectedSpot : true) && (
        <div className="fixed bottom-16 left-0 right-0 z-40 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur-md">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
            <div>
              <p className="text-xs text-neutral-500">
                {isLeisure
                  ? `${t('booking.spotNumber')}: ${
                      selectedSpotData?.number
                        ? `#${selectedSpotData.number}`
                        : '—'
                    }`
                  : getPondName(activePond)}
              </p>
              <p className="text-lg font-bold text-neutral-900">
                ฿{price.toLocaleString()}
              </p>
            </div>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm || submitting}
              className="flex-1 rounded-xl bg-accent-500 py-3 text-sm font-semibold text-white shadow-cta transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {submitting ? t('common.loading') : t('booking.confirmBooking')}
            </button>
          </div>
        </div>
      )}

      {pondsLoading && ponds.length === 0 && (
        <div className="py-10 text-center text-sm text-neutral-400">
          {t('common.loading')}
        </div>
      )}

      {/* Success Modal */}
      {showSuccess && activePond && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mb-4 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-50">
                <svg
                  className="h-8 w-8 text-success-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>
            <h3 className="text-lg font-bold text-neutral-900">
              {t('booking.bookingSuccess')}
            </h3>
            <div className="mt-2 space-y-1 text-sm text-neutral-500">
              {!isLeisure && groupName && (
                <p>
                  {t('booking.groupName')}: {groupName}
                </p>
              )}
              {!isLeisure && (
                <p>
                  {participantCount} {t('booking.participantCount')}
                </p>
              )}
              <p className="text-lg font-bold text-accent-600">
                ฿{price.toLocaleString()}
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleReset}
                className="flex-1 rounded-xl bg-neutral-100 py-2.5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-200"
              >
                {t('common.confirm')}
              </button>
              <button
                onClick={() => router.push('/orders')}
                className="flex-1 rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-800"
              >
                {t('common.orders')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
