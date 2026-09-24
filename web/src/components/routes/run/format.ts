// OWNER: d1 (wave 3). Pure formatting and accounting helpers for /runs/[id] — no React, no
// DOM, so they are unit-testable without a browser (track brief: "TESTS: mode selection by
// status; the ladder breakdown sums to published; cost/token formatting").
//
// Numeric style throughout follows brand-gaps §D: every value renders exactly what the API
// gave it (no invented precision, no silently-clamped fallback) and a missing number prints
// NO_VALUE, never a fabricated 0.
import type { LadderBreakdown } from "@/lib/api-types";
import type { ReviewRunStatus } from "@/lib/contracts";
import { isTerminalStatus } from "@/lib/hooks";

/** Printed for a missing number — never an invented zero (design §D, plan A7). */
export const NO_VALUE = "—";

/** U+2009 THIN SPACE — brand-gaps §D's token-count grouping (`41 022`), never a comma. */
const THIN_SPACE = " ";

export type RunViewMode = "live" | "result";

/** LIVE while queued/running, RESULT once terminal (dashboard §2.4: "One route ... the mode
 *  switches on status"). Wraps @/lib/query's isTerminalStatus so this file owns the one
 *  decision the route makes, in one place a test can hit directly. */
export function runMode(status: ReviewRunStatus | null | undefined): RunViewMode {
  return isTerminalStatus(status) ? "result" : "live";
}

/** A token count, thin-space grouped: 97763 → "97 763". Never negative in practice, but
 *  the sign is handled so a defect upstream still prints something legible. */
export function formatTokenCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return NO_VALUE;
  const sign = n < 0 ? "-" : "";
  const digits = Math.trunc(Math.abs(n)).toString();
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) groups.unshift(digits.slice(Math.max(0, end - 3), end));
  return sign + groups.join(THIN_SPACE);
}

/** usd_estimate to 4 decimals (dashboard §2.5: "cost (usd to 4 decimals ...)"). */
export function formatUsd(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return NO_VALUE;
  return `$${usd.toFixed(4)}`;
}

/** A duration in seconds, one decimal — matches the recorded fixture's own style (41.2s). */
export function formatDurationSeconds(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return NO_VALUE;
  return `${seconds.toFixed(1)}s`;
}

/** Whole-second elapsed time as `12s` or `4m 07s` — the run header's ticking readout. */
export function formatElapsed(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return NO_VALUE;
  const s = Math.floor(totalSeconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${String(rem).padStart(2, "0")}s` : `${rem}s`;
}

/** The share of processed tokens served from cache: cache_read / (cache_read + input). Null
 *  when there is nothing to divide by yet (both zero — the run has not billed anything). */
export function cacheHitShare(cacheReadTokens: number | null | undefined, inputTokens: number | null | undefined): number | null {
  const cache = cacheReadTokens ?? 0;
  const input = inputTokens ?? 0;
  const total = cache + input;
  if (total <= 0) return null;
  return cache / total;
}

export function formatPercent(share: number | null | undefined): string {
  if (share == null || !Number.isFinite(share)) return NO_VALUE;
  return `${Math.round(share * 100)}%`;
}

/** Σ of the four comment-ladder rungs — what actually reached the pull request. */
export function ladderTotal(ladder: LadderBreakdown | null | undefined): number {
  if (!ladder) return 0;
  return (ladder.inline_exact ?? 0) + (ladder.inline_nearest ?? 0) + (ladder.file_level ?? 0) + (ladder.summary_only ?? 0);
}

/**
 * The delivery ladder's own accounting check (dashboard §2.5: "computed (`raised == Σ
 * ladder`) rather than asserted ... turns --alarm and reads `N unaccounted`"). Verified
 * against the fixture corpus: every rung fires only for a PUBLISHED finding (suppressed,
 * dropped and disproven findings never reach delivery), so the invariant this route checks
 * is `counts.published === Σ ladder` — confirmed on the demo run (published 3, ladder
 * 1+1+1+0 = 3) rather than against the blueprint's illustrative "raised" label, which the
 * API does not expose per-delivery.
 */
export function ladderUnaccounted(published: number | null | undefined, ladder: LadderBreakdown | null | undefined): number {
  return (published ?? 0) - ladderTotal(ladder);
}
