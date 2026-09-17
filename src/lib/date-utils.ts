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
