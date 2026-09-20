/**
 * Pure date helpers — safe to import from both client and server code
 * (no Prisma / Node-only dependencies here).
 *
 * Dates are handled as plain `YYYY-MM-DD` strings to avoid timezone drift.
 */

/** Format a Date as `YYYY-MM-DD` in the venue's local time (Asia/Bangkok). */
export function bangkokDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** The venue (Asia/Bangkok) is on UTC+7 all year round — no daylight saving. */
const VENUE_UTC_OFFSET_HOURS = 7;

/**
 * Same-day cut-off, in venue local time: from this hour onward the venue stops
 * taking **online bookings for the current day** (walk-ins / phone only).
 */
export const SAME_DAY_CUTOFF_HOUR = 17;

/** Hour of day (0-23) in the venue's local time. */
export function bangkokHour(d: Date = new Date()): number {
  return (d.getUTCHours() + VENUE_UTC_OFFSET_HOURS) % 24;
}

/** True once the venue has passed today's same-day booking cut-off. */
export function isSameDayCutoff(d: Date = new Date()): boolean {
  return bangkokHour(d) >= SAME_DAY_CUTOFF_HOUR;
}

/**
 * True when `dateStr` is *today* in the venue's timezone **and** the cut-off has
 * already passed — i.e. same-day booking for that date is no longer accepted.
 * Any other date (past or future) is unaffected and falls back to the regular
 * closed-day / past-date rules.
 */
export function isTodayCutoff(dateStr: string, d: Date = new Date()): boolean {
  return dateStr.slice(0, 10) === bangkokDateString(d) && isSameDayCutoff(d);
}

/** True when the given `YYYY-MM-DD` string falls on a Monday. */
export function isMonday(dateStr: string): boolean {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return false;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}

/** Normalise a `YYYY-MM-DD` string to the Date value stored for ClosedDay. */
export function toDateValue(dateStr: string): Date {
  return new Date(`${dateStr.slice(0, 10)}T00:00:00.000Z`);
}
