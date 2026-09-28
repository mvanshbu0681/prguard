// OWNER: m3 (wave 3). Section 04 — "What lands in your PR".
//
// GitHub's own review-header chrome reads "reviewed <relative> ago". The
// number is never invented (plan §14 hard rules): it is derived from the
// demo run's own ReviewResult.timing.finished_at, not a literal string typed
// to match the design spec's illustrative "2 minutes ago".
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** "just now" / "N minutes ago" / … / "N weeks ago", from an ISO timestamp to `nowMs` (default: render time). */
export function formatRelativeTime(iso: string, nowMs: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "just now";
  const deltaS = Math.max(0, Math.round((nowMs - then) / 1000));
  if (deltaS < 45) return "just now";
  if (deltaS < 90 * MINUTE) {
    const minutes = Math.max(1, Math.round(deltaS / MINUTE));
    return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  }
  if (deltaS < 36 * HOUR) {
    const hours = Math.max(1, Math.round(deltaS / HOUR));
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  if (deltaS < 10 * DAY) {
    const days = Math.max(1, Math.round(deltaS / DAY));
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }
  const weeks = Math.max(1, Math.round(deltaS / WEEK));
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}
