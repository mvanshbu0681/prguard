// OWNER: t2a (wave 1).
//
// Query-string parsing and list filtering for the fixture resolver, as pure
// functions. Parsing mirrors FastAPI: an unknown enum value, a non-integer, a
// limit out of range or a cursor this server did not issue is a 422
// VALIDATION_ERROR naming the field — never silently ignored, so a mistyped
// filter in a URL shows up as an error state instead of a wrong list.
import type { AuditItemWithTenant, Finding, ReviewListItem, SuppressionItem } from "@/lib/api-types";
import { decodeCursor } from "@/api/cursor";
import { SEVERITY_BANDS, type SeverityBand } from "./contracts";

export class QueryError extends Error {
  constructor(
    readonly field: string,
    message: string,
    readonly value?: unknown,
  ) {
    super(message);
    this.name = "QueryError";
  }
}

const TRUE = new Set(["true", "1", "yes", "on"]);
const FALSE = new Set(["false", "0", "no", "off"]);

/** FastAPI's bool coercion. null when absent. */
export function parseBool(query: URLSearchParams, field: string): boolean | null {
  const raw = query.get(field);
  if (raw === null || raw === "") return null;
  const v = raw.toLowerCase();
  if (TRUE.has(v)) return true;
  if (FALSE.has(v)) return false;
  throw new QueryError(field, `${field} must be true or false.`, raw);
}

export function parseInteger(query: URLSearchParams, field: string): number | null {
  const raw = query.get(field);
  if (raw === null || raw === "") return null;
  if (!/^-?\d+$/.test(raw)) throw new QueryError(field, `${field} must be an integer.`, raw);
  return Number(raw);
}

export function parseLimit(query: URLSearchParams, fallback: number, max: number): number {
  const n = parseInteger(query, "limit");
  if (n === null) return fallback;
  if (n < 1 || n > max) throw new QueryError("limit", `limit must be from 1 to ${max}.`, n);
  return n;
}

export function parseEnum<T extends string>(query: URLSearchParams, field: string, allowed: readonly T[]): T | null {
  const raw = query.get(field);
  if (raw === null || raw === "") return null;
  if (!(allowed as readonly string[]).includes(raw)) throw new QueryError(field, `${field} must be one of ${allowed.join(", ")}.`, raw);
  return raw as T;
}

/** A repeatable enum filter: `?proof_status=proven&proof_status=disproven` (or comma-separated). */
export function parseEnumList<T extends string>(query: URLSearchParams, field: string, allowed: readonly T[]): T[] {
  const values = query
    .getAll(field)
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
  for (const v of values) {
    if (!(allowed as readonly string[]).includes(v)) throw new QueryError(field, `${field} must be one of ${allowed.join(", ")}.`, v);
  }
  return [...new Set(values)] as T[];
}

/** An ISO 8601 date-time → epoch ms. */
export function parseDateTime(query: URLSearchParams, field: string): number | null {
  const raw = query.get(field);
  if (raw === null || raw === "") return null;
  const ms = Date.parse(raw);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(raw) || Number.isNaN(ms)) throw new QueryError(field, `${field} must be an ISO 8601 date-time.`, raw);
  return ms;
}

export function parseString(query: URLSearchParams, field: string): string | null {
  const raw = query.get(field);
  return raw === null || raw === "" ? null : raw;
}

/** The anchor of an opaque cursor, or a 422. */
export function parseCursor(query: URLSearchParams, key: "id" | "seq"): string | number | null {
  const raw = parseString(query, "cursor");
  if (raw === null) return null;
  const anchor = decodeCursor(raw);
  const value = anchor?.[key];
  if (key === "id" ? typeof value !== "string" : typeof value !== "number") {
    throw new QueryError("cursor", "cursor is not one this endpoint issued.", raw);
  }
  return value as string | number;
}

// --- ordering ---------------------------------------------------------------

/** Newest first, then id — deterministic whatever order the fixture file uses. */
export function byCreatedDesc<T extends { created_at: string }>(idOf: (row: T) => string) {
  return (a: T, b: T): number => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : idOf(a).localeCompare(idOf(b)));
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
  // A tenant-wide rule applies in every repository.
  if (filter.repository !== null && row.scope !== "tenant" && !ref?.repositories.has(filter.repository)) return false;
  return true;
}

export function isActiveSuppression(row: SuppressionItem): boolean {
  return (row.active ?? true) && !row.revoked_at;
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
  if (filter.sinceMs !== null && Date.parse(e.created_at) < filter.sinceMs) return false;
  return true;
}
