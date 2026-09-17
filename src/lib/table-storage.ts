/**
 * Dining-table selection storage.
 *
 * Stores the customer's chosen table in localStorage with a SAME-DAY expiry:
 *   { code: "A01", date: "2026-09-17" }
 * Reading on a later day returns null and clears the stale entry, so a table
 * picked yesterday never leaks into today's visit.
 *
 * The QR-code flow (/t/A01) stays the highest-priority source: the menu page
 * applies the URL param first and simply overwrites what is stored here.
 */

const KEY = 'fp_table_v2';
// Legacy key from the first table-QR release (sessionStorage, no expiry).
const LEGACY_KEY = 'fp_table';

function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export interface StoredTable {
  code: string;
  date: string;
}

/** Current table code for today, or null. Clears stale/invalid entries. */
export function getStoredTableCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredTable;
      if (parsed && typeof parsed.code === 'string' && parsed.date === today()) {
        return parsed.code.toUpperCase();
      }
      // Expired (picked on another day) — drop it.
      localStorage.removeItem(KEY);
      return null;
    }
  } catch {
    // localStorage unavailable or corrupted — fall through to legacy check.
  }

  // One-time migration from the sessionStorage-only first release.
  try {
    const legacy = sessionStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const code = legacy.toUpperCase().trim();
      if (/^[A-Z0-9]{1,8}$/.test(code)) {
        setStoredTableCode(code);
        return code;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/** Persist the table selection for the rest of today. */
export function setStoredTableCode(code: string): void {
  if (typeof window === 'undefined') return;
  const normalized = code.toUpperCase().trim();
  if (!/^[A-Z0-9]{1,8}$/.test(normalized)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code: normalized, date: today() }));
  } catch {
    // storage unavailable — in-memory state on the page still works
  }
}

/** Forget the selection (payment completed, customer cleared it, …). */
export function clearStoredTable(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }
}
