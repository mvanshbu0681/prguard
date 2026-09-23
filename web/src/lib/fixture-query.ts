// OWNER: t2a (wave 1).
//
// Query-string parsing and list filtering for the fixture resolver, as pure
// functions that mirror the backend at eeb1be8:
//   - A bad parameter is a 422 VALIDATION_ERROR whose details list every bad
//     field the way FastAPI does — `{ errors: [{ loc: ["query", "limit"], msg,
//     type }] }` — never silently ignored, so a mistyped filter in a URL shows
//     up as an error state instead of a wrong list.
//   - A cursor that does not decode is "not a cursor this API issued"; one that
//     decodes but names no row "points at a finding this tenant cannot see"
//     (api/pagination.py, routes_findings.py, routes_suppressions.py).
//   - Lists sort newest first, ties broken by id descending, like the backend's
//     ORDER BY created_at DESC, id DESC.
import type { AuditItemWithTenant, Finding, ReviewListItem, SuppressionItem } from "@/lib/api-types";
import { decodeCursor } from "@/api/cursor";
import { SEVERITY_BANDS, type SeverityBand } from "./contracts";

/** One entry of FastAPI's validation error list, as the backend's envelope carries it. */
export interface ValidationIssue {
  loc: string[];
  msg: string;
  type: string;
}

/** Every invalid parameter or body field of one request (FastAPI reports them together). */
export class RequestValidationError extends Error {
  constructor(readonly errors: ValidationIssue[]) {
    super(errors.map((e) => `${e.loc.join(".")}: ${e.msg}`).join("; "));
    this.name = "RequestValidationError";
  }
}

/** A cursor the endpoint cannot use. Answered as 422 VALIDATION_ERROR with `details.cursor`. */
export class CursorError extends Error {
  constructor(
    message: string,
    readonly cursor: string,
  ) {
    super(message);
    this.name = "CursorError";
  }
}

export const CURSOR_NOT_ISSUED = "The cursor is not a cursor this API issued.";
export const cursorNotVisible = (noun: string) => `That cursor points at a ${noun} this tenant cannot see.`;

const TRUE = new Set(["true", "1", "yes", "on", "t", "y"]);
const FALSE = new Set(["false", "0", "no", "off", "f", "n"]);

/** pydantic's message for a Literal: `Input should be 'a', 'b' or 'c'`. */
function literalMessage(allowed: readonly string[]): string {
  const quoted = allowed.map((a) => `'${a}'`);
  return `Input should be ${quoted.length > 1 ? `${quoted.slice(0, -1).join(", ")} or ${quoted[quoted.length - 1]}` : quoted[0]}`;
}

/**
 * Reads one request's query string. Each accessor returns null for an absent
 * or invalid value and records the invalid ones; done() throws them together.
 */
export class QueryReader {
  readonly issues: ValidationIssue[] = [];

  constructor(readonly query: URLSearchParams) {}

  private raw(field: string): string | null {
    const all = this.query.getAll(field);
    // Starlette keeps the last value of a repeated scalar parameter.
    const value = all.length ? all[all.length - 1]! : null;
    return value === null || value === "" ? null : value;
  }

  private issue(field: string, msg: string, type: string): null {
    this.issues.push({ loc: ["query", field], msg, type });
    return null;
  }

  string(field: string): string | null {
    return this.raw(field);
  }

  integer(field: string): number | null {
    const raw = this.raw(field);
    if (raw === null) return null;
    if (!/^[+-]?\d+$/.test(raw.trim())) return this.issue(field, "Input should be a valid integer, unable to parse string as an integer", "int_parsing");
    return Number(raw.trim());
  }

  bool(field: string): boolean | null {
    const raw = this.raw(field);
    if (raw === null) return null;
    const v = raw.toLowerCase();
    if (TRUE.has(v)) return true;
    if (FALSE.has(v)) return false;
    return this.issue(field, "Input should be a valid boolean, unable to interpret input", "bool_parsing");
  }

  enumOf<T extends string>(field: string, allowed: readonly T[]): T | null {
    const raw = this.raw(field);
    if (raw === null) return null;
    if (!(allowed as readonly string[]).includes(raw)) return this.issue(field, literalMessage(allowed), "literal_error");
    return raw as T;
  }

  /** A repeatable filter: `?proof_status=proven&proof_status=disproven` (or comma-separated). The fixture resolver's extension; the backend keeps the last value. */
  enumList<T extends string>(field: string, allowed: readonly T[]): T[] {
    const values = this.query
      .getAll(field)
      .flatMap((v) => v.split(","))
      .map((v) => v.trim())
      .filter(Boolean);
    const bad = values.filter((v) => !(allowed as readonly string[]).includes(v));
    if (bad.length) {
      this.issue(field, literalMessage(allowed), "literal_error");
      return [];
    }
    return [...new Set(values)] as T[];
  }

  /** An ISO 8601 date-time (or date) → epoch ms. */
  dateTime(field: string): number | null {
    const raw = this.raw(field);
    if (raw === null) return null;
    const ms = Date.parse(raw);
    if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(raw) || Number.isNaN(ms)) {
      return this.issue(field, "Input should be a valid datetime", "datetime_parsing");
    }
    return ms;
  }

  /** `limit` with FastAPI's ge=1 / le=max messages. */
  limit(fallback: number, max: number): number {
    const n = this.integer("limit");
    if (n === null) return fallback;
    if (n < 1) return this.issue("limit", "Input should be greater than or equal to 1", "greater_than_equal") ?? fallback;
    if (n > max) return this.issue("limit", `Input should be less than or equal to ${max}`, "less_than_equal") ?? fallback;
    return n;
  }

  /** Throw every recorded issue at once. */
  done(): void {
    if (this.issues.length) throw new RequestValidationError(this.issues);
  }
}

/** The `id` a findings / suppressions / runs cursor anchors on ("" when it decodes without one, which then names no row). */
export function cursorId(raw: string | null): string | null {
  if (raw === null) return null;
  const anchor = decodeCursor(raw);
  if (!anchor) throw new CursorError(CURSOR_NOT_ISSUED, raw);
  return typeof anchor.id === "string" ? anchor.id : "";
}

/** The `seq` an audit cursor anchors on (0 when it decodes without one, as the backend reads it). */
export function cursorSeq(raw: string | null): number | null {
  if (raw === null) return null;
  const anchor = decodeCursor(raw);
  if (!anchor) throw new CursorError(CURSOR_NOT_ISSUED, raw);
  const value = anchor.seq;
  if (value === undefined || value === null) return 0;
  const n = typeof value === "number" ? value : typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(n)) throw new CursorError(CURSOR_NOT_ISSUED, raw);
  return n;
}

// --- ordering ---------------------------------------------------------------

function instant(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Newest first, then id descending — the backend's ORDER BY created_at DESC, id DESC. */
export function byCreatedDesc<T extends { created_at: string }>(idOf: (row: T) => string) {
  return (a: T, b: T): number => {
    const d = instant(b.created_at) - instant(a.created_at);
    if (d !== 0) return d;
    const ia = idOf(a);
    const ib = idOf(b);
    return ia < ib ? 1 : ia > ib ? -1 : 0;
  };
}

export function bandRank(band: SeverityBand): number {
  return SEVERITY_BANDS.indexOf(band);
}

// --- findings (spec §6.5) ---------------------------------------------------

export interface FindingFilter {
  review_id: string | null;
  repository: string | null;
  pr_number: number | null;
  fingerprint: string | null;
  status: Finding["status"] | null;
  severity_min: SeverityBand | null;
  blocking: boolean | null;
  proof_status: string[];
}

/** What a finding cannot say about itself: its run's repository and PR. */
export interface RunRef {
  repository: string;
  pr_number: number;
}

export function matchesFinding(f: Finding, filter: FindingFilter, runs: ReadonlyMap<string, RunRef>): boolean {
  if (filter.review_id !== null && f.review_id !== filter.review_id) return false;
  if (filter.fingerprint !== null && f.fingerprint !== filter.fingerprint) return false;
  if (filter.status !== null && f.status !== filter.status) return false;
  if (filter.blocking !== null && (f.blocking ?? false) !== filter.blocking) return false;
  // A band floor: severity_min=high keeps high and critical. Unscored findings never pass a floor.
  if (filter.severity_min !== null && (!f.severity || bandRank(f.severity.band) < bandRank(filter.severity_min))) return false;
  // findings.proof_status is never null in the backend's table (spec §5.1): a
  // finding served with proof: null has proof_status not_attempted.
  if (filter.proof_status.length && !filter.proof_status.includes(f.proof?.status ?? "not_attempted")) return false;
  if (filter.repository !== null || filter.pr_number !== null) {
    const run = runs.get(f.review_id);
    if (!run) return false;
    if (filter.repository !== null && run.repository !== filter.repository) return false;
    if (filter.pr_number !== null && run.pr_number !== filter.pr_number) return false;
  }
  return true;
}

export function runRefs(reviews: readonly ReviewListItem[]): Map<string, RunRef> {
  return new Map(reviews.map((r) => [r.review_id, { repository: `${r.repository.owner}/${r.repository.name}`, pr_number: r.pull_request.number }]));
}

// --- suppressions (spec §6.7) -----------------------------------------------

/** What the ledger rows cannot say about themselves: which fingerprints and repositories they touch. */
export interface SuppressionRef {
  fingerprints: Set<string>;
  repositories: Set<string>;
}

export interface SuppressionFilter {
  repository: string | null;
  scope: SuppressionItem["scope"] | null;
  fingerprint: string | null;
}

export function matchesSuppression(row: SuppressionItem, filter: SuppressionFilter, ref: SuppressionRef | undefined): boolean {
  if (filter.scope !== null && row.scope !== filter.scope) return false;
  if (filter.fingerprint !== null && !ref?.fingerprints.has(filter.fingerprint)) return false;
  if (filter.repository !== null && !ref?.repositories.has(filter.repository)) return false;
  return true;
}

export type LedgerState = "active" | "expired" | "revoked";

/**
 * A row's state. revoked_at decides first; otherwise the corpus's own `active`
 * flag (computed when the corpus was generated, so a demo does not drift as the
 * wall clock passes an expiry); a row without one is judged against `nowMs`,
 * as the backend's _is_active() does.
 */
export function ledgerState(row: SuppressionItem, nowMs: number): LedgerState {
  if (row.revoked_at) return "revoked";
  if (typeof row.active === "boolean") return row.active ? "active" : "expired";
  return row.expires_at && instant(row.expires_at) <= nowMs ? "expired" : "active";
}

// --- audit (spec §6.8) ------------------------------------------------------

export interface AuditFilter {
  review_id: string | null;
  finding_id: string | null;
  event_type: string | null;
  actor_type: AuditItemWithTenant["actor_type"] | null;
  sinceMs: number | null;
}

export function matchesAudit(e: AuditItemWithTenant, filter: AuditFilter): boolean {
  if (filter.review_id !== null && e.review_id !== filter.review_id) return false;
  if (filter.finding_id !== null && e.finding_id !== filter.finding_id) return false;
  if (filter.event_type !== null && e.event_type !== filter.event_type) return false;
  if (filter.actor_type !== null && e.actor_type !== filter.actor_type) return false;
  if (filter.sinceMs !== null && instant(e.created_at) < filter.sinceMs) return false;
  return true;
}

/** True when no audit filter is set: the page is then a contiguous slice of the chain (routes_audit.py). */
export function isUnfilteredAudit(filter: AuditFilter): boolean {
  return filter.review_id === null && filter.finding_id === null && filter.event_type === null && filter.actor_type === null && filter.sinceMs === null;
}
