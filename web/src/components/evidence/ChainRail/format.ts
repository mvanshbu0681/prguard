// OWNER: t6 (wave 2). Pure formatting for <ChainRail> — no React, no DOM (mirrors
// src/components/badges/format.ts's split of logic from markup).

/** `a91f3c2e…8b4d` — first 8 + ellipsis + last 4 of a 64-char hex hash. The full 64 chars
 *  live in `title` (hover) and are what click-to-copy puts on the clipboard; anything
 *  shorter than 13 chars (not a real sha256 hex) is printed whole. */
export function hashShort(hash: string): string {
  if (hash.length <= 8 + 1 + 4) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** `14:22:07Z` — absolute UTC time-of-day, the rail's per-row timestamp. */
export function formatAbsoluteUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}Z`;
}

/** `+12s` / `+0.4s` / `+340ms` — the delta from the previous row's `created_at`, or
 *  `null` for the window's first row (dashboard-blueprint §3c row anatomy). Sub-second
 *  deltas keep one decimal so two events in the same second stay distinguishable. */
export function formatRelativeDelta(iso: string, previousIso: string | null): string | null {
  if (!previousIso) return null;
  const current = new Date(iso).getTime();
  const previous = new Date(previousIso).getTime();
  if (Number.isNaN(current) || Number.isNaN(previous)) return null;
  const deltaMs = current - previous;
  if (deltaMs < 0) return null;
  if (deltaMs < 1000) return `+${deltaMs}ms`;
  const seconds = deltaMs / 1000;
  return `+${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
}
