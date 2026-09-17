import { prisma } from './prisma';
import { isMonday, toDateValue } from './date-utils';

/**
 * Server-only closed-day rules for the venue.
 *
 *  - Every Monday is closed (fixed weekly rest day, hard-coded).
 *  - The admin may add extra statutory holidays (ClosedDay table).
 *
 * When a date is closed the venue takes NO bookings and NO same-day (dine-in)
 * table ordering.
 */

export type ClosedReason = 'monday' | 'holiday';

export interface ClosedInfo {
  closed: boolean;
  reason?: ClosedReason;
}

/** Check a single `YYYY-MM-DD` date against all closed-day rules. */
export async function getClosedInfo(dateStr: string): Promise<ClosedInfo> {
  if (isMonday(dateStr)) return { closed: true, reason: 'monday' };

  const hit = await prisma.closedDay.findUnique({
    where: { date: toDateValue(dateStr) },
  });
  if (hit) return { closed: true, reason: 'holiday' };

  return { closed: false };
}

/** Convenience boolean check. */
export async function isClosedDate(dateStr: string): Promise<boolean> {
  return (await getClosedInfo(dateStr)).closed;
}
