// OWNER: d3 (wave 3). Pure derivations for /findings/[id] — no React, no DOM,
// unit-testable in isolation from markup (tests/unit/routes/finding-detail/).
//
// Every string here is built ONLY from fields the generated API types actually
// carry (plan hard rule: never hard-code a number/value a fixture or API field
// provides).
import type { SuppressionScope } from "@/lib/contracts";

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

/** `app/checkout.py:41` (a single line) or `app/checkout.py:41–44` (a range). */
export function locationRangeLabel(filePath: string, startLine?: number | null, endLine?: number | null): string {
  if (startLine == null) return filePath;
  if (endLine == null || endLine === startLine) return `${filePath}:${startLine}`;
  return `${filePath}:${startLine}–${endLine}`;
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

/**
 * Whether the delivered line is the reported line — only meaningful for
 * inline_exact / inline_nearest, where `delivered_line` names a real diff line.
 * `null` when there is nothing to compare (no delivered line, or a rung that
 * never carries one).
 */
export function deliveredExactLine(deliveredLine: number | null | undefined, reportedStartLine: number | null | undefined): boolean | null {
  if (deliveredLine == null || reportedStartLine == null) return null;
  return deliveredLine === reportedStartLine;
}

/** A real GitHub comment permalink, built from ids the API already returned — never invented. */
export function githubCommentUrl(owner: string, name: string, prNumber: number, commentId: number): string {
  return `https://github.com/${owner}/${name}/pull/${prNumber}#issuecomment-${commentId}`;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

/** `4d ago`, `12m ago`, `just now` — the short mono form the fingerprint history table uses. */
export function formatRelativeAge(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const deltaSeconds = Math.round((now.getTime() - then) / 1000);
  if (deltaSeconds < 45) return "just now";
  for (const [unit, secondsInUnit] of UNITS) {
    const value = Math.floor(Math.abs(deltaSeconds) / secondsInUnit);
    if (value >= 1) {
      const short = unit === "minute" ? "m" : unit === "hour" ? "h" : unit === "day" ? "d" : unit === "week" ? "w" : unit === "month" ? "mo" : unit === "year" ? "y" : "s";
      return `${value}${short} ago`;
    }
  }
  return "just now";
}

/** `14.2s` — latency at one decimal, brand-gaps §D numeric style. */
export function formatDurationMs(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Suppress form validation
// ---------------------------------------------------------------------------

export interface SuppressFormValues {
  scope: SuppressionScope;
  reason: string;
  expiresAt: string;
  matchPath: string;
}

export interface SuppressFormErrors {
  reason?: string;
  matchPath?: string;
  expiresAt?: string;
}

/**
 * §2.7's suppress form rules: reason is required and non-empty (whitespace does
 * not count), `match_path` is required when `scope === "pattern"`, and an
 * expiry, if given, must be a valid date in the future.
 */
export function validateSuppressForm(values: SuppressFormValues, now: Date = new Date()): SuppressFormErrors {
  const errors: SuppressFormErrors = {};
  if (values.reason.trim().length === 0) {
    errors.reason = "A reason is required.";
  }
  if (values.scope === "pattern" && values.matchPath.trim().length === 0) {
    errors.matchPath = "A match path is required for scope=pattern.";
  }
  if (values.expiresAt.trim().length > 0) {
    const parsed = new Date(values.expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      errors.expiresAt = "Not a valid date.";
    } else if (parsed.getTime() <= now.getTime()) {
      errors.expiresAt = "Expiry must be in the future.";
    }
  }
  return errors;
}

export function hasSuppressFormErrors(errors: SuppressFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** The SuppressRequest body a valid form produces — call only after `validateSuppressForm` returns no errors. */
export function suppressRequestFrom(values: SuppressFormValues): { scope: SuppressionScope; reason: string; expires_at?: string | null; match_path?: string | null } {
  return {
    scope: values.scope,
    reason: values.reason.trim(),
    expires_at: values.expiresAt.trim().length > 0 ? new Date(values.expiresAt).toISOString() : null,
    match_path: values.scope === "pattern" ? values.matchPath.trim() : null,
  };
}
