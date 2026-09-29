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

// ---------------------------------------------------------------------------
// Links built from ids the API returned — never invented.
// ---------------------------------------------------------------------------

/**
 * The permalink of the comment a delivery rung posted. Inline and file-level
 * rungs post review comments (`#discussion_r…`); anything else lands in the
 * conversation (`#issuecomment-…`).
 */
export function deliveryCommentUrl(owner: string, name: string, prNumber: number, commentId: number, mode: string | null | undefined): string {
  if (mode === "inline_exact" || mode === "inline_nearest" || mode === "file_level") {
    return `https://github.com/${owner}/${name}/pull/${prNumber}#discussion_r${commentId}`;
  }
  return githubCommentUrl(owner, name, prNumber, commentId);
}

/** The reported lines at a commit: `…/blob/<sha>/<path>#L41-L44`. */
export function githubBlobUrl(owner: string, name: string, sha: string, filePath: string, startLine?: number | null, endLine?: number | null): string {
  const anchor = startLine == null ? "" : endLine != null && endLine !== startLine ? `#L${startLine}-L${endLine}` : `#L${startLine}`;
  return `https://github.com/${owner}/${name}/blob/${sha}/${filePath.split("/").map(encodeURIComponent).join("/")}${anchor}`;
}

/** Whether a delivered line falls inside the reported range (a multi-line comment anchors on the range's last line). */
export function deliveredWithinRange(deliveredLine: number | null | undefined, startLine: number | null | undefined, endLine: number | null | undefined): boolean | null {
  if (deliveredLine == null || startLine == null) return null;
  const end = endLine ?? startLine;
  return deliveredLine >= Math.min(startLine, end) && deliveredLine <= Math.max(startLine, end);
}

// ---------------------------------------------------------------------------
// Proof by execution — what each run said, and what the pair means.
// ---------------------------------------------------------------------------

export type RunKind = "passed" | "failed" | "error" | "timeout" | "not_run";

export interface RunOutcome {
  kind: RunKind;
  /** Passed / Failed / Errored / Timed out / Not run */
  label: string;
  /** pytest's own summary line (`1 passed in 0.42s`), or the runner's note. */
  summary: string | null;
  exitCode: number | null;
}

/** The last non-empty line of a captured excerpt: pytest's verdict line. */
export function summaryLine(excerpt: string | null | undefined): string | null {
  if (!excerpt) return null;
  const lines = excerpt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1].replace(/^=+\s*|\s*=+$/g, "") : null;
}

/** Reads one run from its exit code (0 pass, 1 test failure, 124 timeout, other non-zero an error before any assertion). */
export function runOutcome(run: { exit_code?: number | null; excerpt?: string | null } | null | undefined): RunOutcome {
  const exitCode = run?.exit_code ?? null;
  const summary = summaryLine(run?.excerpt);
  if (exitCode === null) return { kind: "not_run", label: "Not run", summary, exitCode };
  if (exitCode === 0) return { kind: "passed", label: "Passed", summary, exitCode };
  if (exitCode === 1) return { kind: "failed", label: "Failed", summary, exitCode };
  if (exitCode === 124 || /\bkill(ed)? after\b|\btimeout\b/i.test(run?.excerpt ?? "")) return { kind: "timeout", label: "Timed out", summary, exitCode };
  return { kind: "error", label: "Errored", summary, exitCode };
}

export type VerdictTone = "proven" | "refuted" | "inconclusive" | "none";

export interface ProofVerdict {
  tone: VerdictTone;
  title: string;
  body: string;
}

/** One sentence pair per proof state, reasoned from the two runs the API returned. */
export function proofVerdict(proof: {
  status: string;
  base?: { exit_code?: number | null; excerpt?: string | null } | null;
  head?: { exit_code?: number | null; excerpt?: string | null } | null;
  deps_install_ok?: boolean | null;
  isolation?: string | null;
} | null | undefined, context: { blocking: boolean; status: string }): ProofVerdict {
  const base = runOutcome(proof?.base);
  const head = runOutcome(proof?.head);
  switch (proof?.status) {
    case "proven":
      return {
        tone: "proven",
        title: "Proven: passes at base, fails at head.",
        body: context.blocking
          ? "The repro test only fails once this change is applied, so the bug belongs to the pull request. That is what lets it hold the merge."
          : context.status === "suppressed"
            ? "The repro test only fails once this change is applied. The finding is suppressed, so it no longer holds the merge."
            : "The repro test only fails once this change is applied, so the bug belongs to the pull request.",
      };
    case "disproven":
      return {
        tone: "refuted",
        title: "Witness refuted this claim.",
        body: "It wrote a test for its own claim and the code held up at both commits, so the finding was withdrawn before it reached the pull request.",
      };
    case "inconclusive": {
      let body = "The repro ran, but its result does not settle the claim either way, so the finding stays advisory.";
      if (proof.deps_install_ok === false) body = "Dependencies failed to install in the sandbox, so a failing head cannot be trusted. The finding stays advisory.";
      else if (head.kind === "timeout" || base.kind === "timeout") body = `The run at ${head.kind === "timeout" ? "head" : "base"} timed out before the test finished, so it proved nothing. The finding stays advisory.`;
      else if (base.kind === "error" && head.kind === "error") body = "The repro errors before any assertion runs at both commits, so it never exercised the claim. The finding stays advisory.";
      else if (base.kind === "failed" && head.kind === "failed") body = "The repro fails at both commits: the failure predates this pull request, so it cannot be the change's fault. The finding stays advisory.";
      else if (proof.isolation === "degraded") body = "The sandbox ran without full isolation, so the result is not trusted. The finding stays advisory.";
      return { tone: "inconclusive", title: "Inconclusive.", body };
    }
    case "skipped_no_env":
      return {
        tone: "none",
        title: "No runnable environment.",
        body: "Witness wrote a repro test, but the sandbox could not run this repository's tests, so it was never executed. Only a proven bug can block the merge.",
      };
    case "not_applicable":
      return {
        tone: "none",
        title: "Nothing to execute.",
        body: "This claim is about the code's shape rather than its behaviour, so there is no test that could prove it. It stays advisory.",
      };
    default:
      return {
        tone: "none",
        title: "Not executed.",
        body: "Witness did not run a repro test for this finding, so it stays advisory: only a proven bug can block the merge.",
      };
  }
}

// ---------------------------------------------------------------------------
// Severity arithmetic — every weighted input, as the formula adds it up.
// ---------------------------------------------------------------------------

export const SEVERITY_INPUT_LABEL: Record<string, string> = {
  path_sensitivity: "Path sensitivity",
  reachability: "Reachability",
  blast_radius: "Blast radius",
  coverage_gap: "Coverage gap",
  proof_confidence: "Proof confidence",
  churn: "Churn",
};

export interface SeverityTerm {
  key: string;
  label: string;
  input: number;
  weight: number;
  contribution: number;
}

/** input × weight per input, in the order given (SEVERITY_INPUTS: heaviest weight first). */
export function severityTerms(order: readonly string[], inputs: Record<string, number>, weights: Record<string, number>): SeverityTerm[] {
  return order.map((key) => {
    const input = inputs[key] ?? 0;
    const weight = weights[key] ?? 0;
    return { key, label: SEVERITY_INPUT_LABEL[key] ?? key, input, weight, contribution: input * weight };
  });
}

/** 3 decimals, the way the score itself prints. */
export function fixed3(n: number): string {
  return (Math.round(n * 1000) / 1000).toFixed(3);
}

// ---------------------------------------------------------------------------
// Suppress form: expiry as quick picks or a calendar day
// ---------------------------------------------------------------------------

export type ExpiryChoice = "never" | "7" | "30" | "90" | "date";

/** YYYY-MM-DD for a date input, in local time. */
export function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The form's expiresAt for a choice: an ISO instant N days out, the end of a picked day, or empty for never. */
export function expiryValue(choice: ExpiryChoice, pickedDay: string, now: Date = new Date()): string {
  if (choice === "never") return "";
  if (choice === "date") return pickedDay ? `${pickedDay}T23:59` : "";
  return new Date(now.getTime() + Number(choice) * 86_400_000).toISOString();
}

// ---------------------------------------------------------------------------
// The suppression behind a suppressed finding, and the ledger view that shows it
// ---------------------------------------------------------------------------

export type SuppressionState = "active" | "expired" | "revoked";

export function suppressionState(row: { revoked_at?: string | null; expires_at?: string | null; active?: boolean | null }, nowMs: number): SuppressionState {
  if (row.revoked_at) return "revoked";
  if (row.expires_at && Date.parse(row.expires_at) <= nowMs) return "expired";
  if (row.active === false) return "expired";
  return "active";
}

/** /suppressions on the tab that holds the row: Active is the default; expired and revoked rows live under active=false&state=…. */
export function ledgerHref(fingerprint: string | null | undefined, state: SuppressionState): string {
  const params = new URLSearchParams();
  if (state !== "active") {
    params.set("active", "false");
    params.set("state", state);
  }
  if (fingerprint) params.set("fingerprint", fingerprint);
  const qs = params.toString();
  return qs ? `/suppressions?${qs}` : "/suppressions";
}
