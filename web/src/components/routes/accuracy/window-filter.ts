// OWNER: d5 (wave 3). /accuracy's window filter, in the URL (dashboard rules:
// "Filters live in the URL (nuqs) so every view is a shareable link"; brief
// TESTS: "accuracy window filter in the URL"). `since`/`until` are calendar
// dates in the querystring (?since=2026-08-01&until=2026-09-01) parsed to a
// UTC-midnight Date by nuqs's own `parseAsIsoDate`, then widened to a full ISO
// 8601 instant for `useAccuracy` (AccuracyWindowFilter wants a datetime
// string). `until` is pushed to the end of that calendar day (23:59:59.999Z)
// so a same-day range is not empty by construction.
import { parseAsIsoDate, useQueryStates } from "nuqs";

export const accuracyWindowParsers = {
  since: parseAsIsoDate,
  until: parseAsIsoDate,
};

export function useAccuracyWindowFilter() {
  return useQueryStates(accuracyWindowParsers, { history: "replace" });
}

/** UTC midnight of the given calendar date, as the full ISO instant `useAccuracy` wants. */
export function sinceIso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

/** The end of the given calendar date (23:59:59.999 UTC), so a single-day window is non-empty. */
export function untilIso(date: Date | null): string | null {
  if (!date) return null;
  const end = new Date(date.getTime());
  end.setUTCHours(23, 59, 59, 999);
  return end.toISOString();
}

/** `YYYY-MM-DD` for an `<input type="date">` value, from the Date nuqs hands back. */
export function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}
