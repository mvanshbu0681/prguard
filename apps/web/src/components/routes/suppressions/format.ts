// Pure formatting and derivation for /suppressions — no React, no DOM.
//
// The ledger reuses `ledgerState` (@/lib/fixture-query) rather than reimplementing
// the active/expired/revoked rule: revoked_at decides first, then the row's own
// `active` flag, then `expires_at` against the clock — the same order the fixture
// resolver and the backend's `_is_active()` use.
import { ledgerState, type LedgerState } from "@/lib/fixture-query";
import type { SuppressionItem } from "@/lib/api-types";
import type { SuppressionScope } from "@/lib/contracts";

export type { LedgerState };
export { ledgerState };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** `2026-09-19 14:22:07Z` — full absolute UTC, for a hover title. */
export function formatUtcStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const time = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
  return `${date} ${time}Z`;
}

/** `2026-09-19` — the date only. */
export function formatUtcDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export const DAY_MS = 86_400_000;

/** `3 days ago` / `in 12 days` / `today`. `nowMs` is injectable for tests. */
export function formatRelativeDay(iso: string, nowMs: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const days = Math.round((then - nowMs) / DAY_MS);
  if (days === 0) return "today";
  if (days > 0) return days === 1 ? "in 1 day" : `in ${days} days`;
  const past = Math.abs(days);
  return past === 1 ? "1 day ago" : `${past} days ago`;
}

/** What the row matches: match_path, then rule_key, then an em dash — never a
 *  fabricated value (the row carries no fingerprint of its own). */
export function matchLabel(item: SuppressionItem): string {
  if (item.match_path) return item.match_path;
  if (item.rule_key) return `rule ${item.rule_key}`;
  return "—";
}

/** `7f2a2e93` — the id's first 8 characters. */
export function shortSuppressionId(id: string): string {
  return id.slice(0, 8);
}

/** `70f24591…333d` — first 8 + last 4 of a fingerprint or hash. */
export function shortHash(hash: string | null | undefined): string {
  if (!hash) return "—";
  if (hash.length <= 13) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Scope: how far one suppression reaches, narrowest first.
// ---------------------------------------------------------------------------

export const SCOPE_ORDER: readonly SuppressionScope[] = ["line", "file", "pattern", "repo", "tenant"];

export const SCOPE_LABEL: Record<SuppressionScope, string> = {
  line: "Line",
  file: "File",
  pattern: "Pattern",
  repo: "Repo",
  tenant: "Org",
};

/** What a scope silences, in words (the reach meter's tooltip and the summary ladder). */
export const SCOPE_REACH: Record<SuppressionScope, string> = {
  line: "One finding, by fingerprint",
  file: "A rule, in one file",
  pattern: "A rule, under a path glob",
  repo: "A rule, across one repository",
  tenant: "A rule, in every repository",
};

/** 1 (one finding) … 5 (every repository). */
export function scopeLevel(scope: SuppressionScope): number {
  return SCOPE_ORDER.indexOf(scope) + 1;
}

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------

/** Whole days from `nowMs` until `iso` (negative once passed), or null. */
export function daysUntil(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - nowMs) / DAY_MS);
}

/** Active suppressions expiring within this many days read as "soon" (warn tone). */
export const EXPIRING_SOON_DAYS = 30;

/** `22d` / `9w` / `7mo` — the compact countdown on a ledger row. */
export function compactDays(days: number): string {
  const d = Math.abs(days);
  if (d < 60) return `${d}d`;
  if (d < 180) return `${Math.round(d / 7)}w`;
  return `${Math.round(d / 30)}mo`;
}

export const CATEGORY_LABEL: Record<string, string> = {
  correctness: "Correctness",
  security: "Security",
  test_integrity: "Test integrity",
  performance: "Performance",
  maintainability: "Maintainability",
};
