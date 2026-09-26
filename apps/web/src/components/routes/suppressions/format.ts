// OWNER: d4 (wave 3). Pure formatting and derivation for /suppressions — no React, no
// DOM (mirrors src/components/evidence/ChainRail/format.ts's split of logic from markup).
//
// The ledger reuses `ledgerState` (@/lib/fixture-query, owner t2a) rather than
// reimplementing the active/expired/revoked rule: revoked_at decides first, then the
// row's own `active` flag, then `expires_at` against the wall clock — the same order
// the fixture resolver and the backend's `_is_active()` use (dashboard-blueprint §2.8).
import { ledgerState, type LedgerState } from "@/lib/fixture-query";
import type { SuppressionItem } from "@/lib/api-types";

export type { LedgerState };
export { ledgerState };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** `2026-09-19 14:22:07Z` — full absolute UTC, for a row that may not be "today"
 *  (unlike ChainRail's time-of-day-only formatAbsoluteUtc, appropriate for a rail
 *  window that never spans more than a few minutes). */
export function formatUtcStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const time = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
  return `${date} ${time}Z`;
}

/** `2026-09-19` — the date only, for an expiry or a revocation line. */
export function formatUtcDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

const DAY_MS = 86_400_000;

/** `3 days ago` / `in 12 days` / `today` — a list-row relative stamp (dashboard §0.2:
 *  "relative in lists", absolute in evidence). `nowMs` is injectable for tests. */
export function formatRelativeDay(iso: string, nowMs: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const days = Math.round((then - nowMs) / DAY_MS);
  if (days === 0) return "today";
  if (days > 0) return days === 1 ? "in 1 day" : `in ${days} days`;
  const past = Math.abs(days);
  return past === 1 ? "1 day ago" : `${past} days ago`;
}

/** What the row matches, in the priority order the brief gives (fingerprint first-8 /
 *  match_path / rule_key): `SuppressionItem` (components.schemas) carries no
 *  fingerprint field, so this is match_path, then rule_key, then a bare em dash — never
 *  a fabricated value (plan hard rule: never render what the data does not carry). */
export function matchLabel(item: SuppressionItem): string {
  if (item.match_path) return item.match_path;
  if (item.rule_key) return `rule ${item.rule_key}`;
  return "—";
}

/** `sup_7f2a2e93` — the id's own short form, matching the blueprint's `sup_7f2a`
 *  style closely enough to read as an id while staying grep-able to the real row. */
export function shortSuppressionId(id: string): string {
  return id.slice(0, 8);
}
