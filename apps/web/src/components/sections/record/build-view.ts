// OWNER: m5 (wave 3). Pure data-shaping for section 07 — no React, no fixture
// loaders. app/(marketing)/_sections/07-record.tsx (the only server-only caller) reads
// the fixture corpus and passes plain arrays in; these functions turn that into the
// view models <IdentityPanel> renders. Kept separate from the page file so it is
// testable with plain fixtures, no `server-only` mock, no rendering.
import type { AuditEvent, Finding } from "@/lib/api-types";
import type { ReviewListItem, SuppressionItem } from "@/lib/api-types";
import type { LedgerRowView, OccurrenceView } from "./IdentityPanel";

/** The events whose `seq` falls in `[center - before, center + after]`, inclusive —
 *  <FlightRecorderPanel>'s window around `manifest.ids.tamper_demo_seq` (brand-gaps §2
 *  ruling 14: the tamper control recomputes the RENDERED WINDOW only, never the whole
 *  chain, so this window is also the boundary of what ever gets re-hashed). */
export function windowAroundSeq<T extends { seq: number }>(items: readonly T[], center: number, before: number, after: number): T[] {
  const lo = center - before;
  const hi = center + after;
  return items.filter((e) => e.seq >= lo && e.seq <= hi);
}

/** The payload's `suppression_id`, or null — `AuditItem.payload` is untyped JSON. */
export function payloadSuppressionId(event: Pick<AuditEvent, "payload">): string | null {
  const id = event.payload?.["suppression_id"];
  return typeof id === "string" ? id : null;
}

/** A finding plus the review it belongs to, as one row of the identity demo. */
export function toOccurrenceView(finding: Finding, reviews: readonly ReviewListItem[]): OccurrenceView {
  const review = reviews.find((r) => r.review_id === finding.review_id);
  return {
    reviewId: finding.review_id,
    prNumber: review?.pull_request.number ?? 0,
    prTitle: review?.pull_request.title ?? null,
    runStatus: review?.status ?? "succeeded",
    gateConclusion: review?.gate_conclusion ?? null,
    createdAt: finding.created_at,
    filePath: finding.location.file_path,
    symbolPath: finding.location.symbol_path ?? finding.location.file_path,
    startLine: finding.location.start_line ?? 0,
    endLine: finding.location.end_line ?? finding.location.start_line ?? 0,
    findingStatus: finding.status,
    proofStatus: finding.proof?.status ?? "not_attempted",
    severityScore: finding.severity?.score ?? 0,
    severityBand: finding.severity?.band ?? "info",
    blocking: finding.blocking ?? false,
  };
}

/**
 * The two real occurrences of one fingerprint: the finding a superseded run raised
 * first (`history.first_seen_run_id`) and the finding itself, oldest first. Only ever
 * returns findings that are actually in `findings` with a matching fingerprint AND
 * review_id — never invents a row (plan A7).
 */
export function findOccurrences(proven: Finding, fingerprint: string, findings: readonly Finding[]): Finding[] {
  const firstSeenRunId = proven.history?.first_seen_run_id ?? null;
  const firstOccurrence = firstSeenRunId != null ? (findings.find((f) => f.fingerprint === fingerprint && f.review_id === firstSeenRunId) ?? null) : null;
  return [firstOccurrence, proven].filter((f): f is Finding => f !== null).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * One suppression ledger row, its seq read off the matching `suppression.created` /
 * `suppression.revoked` audit event (dashboard-blueprint §3c: the ledger and the audit
 * rail are the same underlying event stream). Null when the id has no ledger entry.
 */
export function buildLedgerRow(suppressionId: string, suppressions: readonly SuppressionItem[], auditEvents: readonly AuditEvent[]): LedgerRowView | null {
  const item = suppressions.find((s) => s.suppression_id === suppressionId);
  if (!item) return null;
  const revoked = Boolean(item.revoked_at);
  const created = auditEvents.find((e) => e.event_type === "suppression.created" && payloadSuppressionId(e) === suppressionId);
  const revokedEvent = revoked ? auditEvents.find((e) => e.event_type === "suppression.revoked" && payloadSuppressionId(e) === suppressionId) : undefined;
  const seq = (revoked ? revokedEvent : created)?.seq ?? created?.seq ?? 0;
  return {
    seq,
    state: revoked ? "revoked" : "suppressed",
    scope: item.scope,
    matchPath: item.match_path ?? null,
    reason: item.reason,
    createdBy: item.created_by ?? null,
    createdAt: item.created_at,
    expiresAt: item.expires_at ?? null,
    revokedAt: item.revoked_at ?? null,
  };
}

/** The ledger's two rows (the demo suppression + the corpus's one revoked entry, if
 *  any), oldest first — never invents a revoked row when the corpus has none. */
export function buildLedgerRows(
  demoSuppressionId: string,
  suppressions: readonly SuppressionItem[],
  auditEvents: readonly AuditEvent[],
): LedgerRowView[] {
  const revokedItem = suppressions.find((s) => s.revoked_at);
  return [buildLedgerRow(demoSuppressionId, suppressions, auditEvents), revokedItem ? buildLedgerRow(revokedItem.suppression_id, suppressions, auditEvents) : null]
    .filter((r): r is LedgerRowView => r !== null)
    .sort((a, b) => a.seq - b.seq);
}
