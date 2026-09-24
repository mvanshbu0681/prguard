// @vitest-environment node
// OWNER: m5 (wave 3). build-view against the REAL fixture corpus — the same data
// app/(marketing)/_sections/07-record.tsx reads. Covers this track's two required
// checks (brief "TESTS"): the fingerprint shown equals the manifest's, and the
// identity demo is built only from real, cross-referenced fixture rows — never an
// invented seq, date or count (plan A7).
import { describe, expect, it, vi } from "vitest";

// Next implements `import "server-only"` in its compiler; vitest has no such module
// (tests/unit/data/fixtures-on-disk.test.ts does the same).
vi.mock("server-only", () => ({}));

import { buildLedgerRow, buildLedgerRows, findOccurrences, payloadSuppressionId, toOccurrenceView } from "@/components/sections/record/build-view";
import { getAuditChain, getDemoProvenFinding, getFindings, getManifest, getReviewsIndex, getSuppressions } from "@/lib/fixtures";

const manifest = getManifest();
const proven = getDemoProvenFinding();
const findings = getFindings();
const reviews = getReviewsIndex().items;
const suppressions = getSuppressions().items;
const auditEvents = getAuditChain().items;

describe("the fingerprint shown equals the manifest's", () => {
  it("getDemoProvenFinding().fingerprint === manifest.ids.proven_fingerprint", () => {
    expect(proven.fingerprint).toBe(manifest.ids.proven_fingerprint);
  });
});

describe("findOccurrences", () => {
  it("returns the finding itself and the one the superseded run raised first, oldest first", () => {
    const fingerprint = proven.fingerprint ?? manifest.ids.proven_fingerprint;
    const occurrences = findOccurrences(proven, fingerprint, findings);

    expect(occurrences).toHaveLength(proven.history?.occurrence_count ?? occurrences.length);
    expect(occurrences.every((f) => f.fingerprint === fingerprint)).toBe(true);
    // Ascending by created_at.
    for (let i = 1; i < occurrences.length; i++) {
      expect(occurrences[i - 1].created_at.localeCompare(occurrences[i].created_at)).toBeLessThanOrEqual(0);
    }
    // The last one IS the demo finding.
    expect(occurrences.at(-1)?.id).toBe(proven.id);
    // The first came from the run history says it did.
    expect(occurrences[0]?.review_id).toBe(proven.history?.first_seen_run_id);
  });

  it("demonstrates line drift, not a fabricated one: same file and symbol, different lines", () => {
    const fingerprint = proven.fingerprint ?? manifest.ids.proven_fingerprint;
    const [first, second] = findOccurrences(proven, fingerprint, findings);
    expect(first.location.file_path).toBe(second.location.file_path);
    expect(first.location.symbol_path).toBe(second.location.symbol_path);
    expect(first.location.start_line).not.toBe(second.location.start_line);
  });
});

describe("toOccurrenceView", () => {
  it("carries the review's PR number and status alongside the finding's own fields", () => {
    const view = toOccurrenceView(proven, reviews);
    const review = reviews.find((r) => r.review_id === proven.review_id);
    expect(view.prNumber).toBe(review?.pull_request.number);
    expect(view.runStatus).toBe(review?.status);
    expect(view.severityScore).toBe(proven.severity?.score);
    expect(view.proofStatus).toBe(proven.proof?.status);
  });

  it("falls back without throwing when a finding's review is not in the list", () => {
    const view = toOccurrenceView({ ...proven, review_id: "not-a-real-review-id" }, reviews);
    expect(view.prNumber).toBe(0);
    expect(view.runStatus).toBe("succeeded");
  });
});

describe("payloadSuppressionId", () => {
  it("reads the string field out of an untyped audit payload", () => {
    expect(payloadSuppressionId({ payload: { suppression_id: "abc-123" } })).toBe("abc-123");
  });
  it("returns null when absent or not a string", () => {
    expect(payloadSuppressionId({ payload: {} })).toBeNull();
    expect(payloadSuppressionId({ payload: { suppression_id: 5 } })).toBeNull();
    expect(payloadSuppressionId({})).toBeNull();
  });
});

describe("buildLedgerRow — the demo suppression", () => {
  it("reads scope, reason, created_by and expiry off the real ledger entry", () => {
    const row = buildLedgerRow(manifest.ids.demo_suppression_id, suppressions, auditEvents);
    const item = suppressions.find((s) => s.suppression_id === manifest.ids.demo_suppression_id);
    expect(row).not.toBeNull();
    expect(row?.state).toBe("suppressed");
    expect(row?.scope).toBe(item?.scope);
    expect(row?.reason).toBe(item?.reason);
    expect(row?.createdBy).toBe(item?.created_by);
    expect(row?.expiresAt).toBe(item?.expires_at ?? null);
  });

  it("its seq is the real suppression.created audit event's seq, not invented", () => {
    const row = buildLedgerRow(manifest.ids.demo_suppression_id, suppressions, auditEvents);
    const createdEvent = auditEvents.find((e) => e.event_type === "suppression.created" && payloadSuppressionId(e) === manifest.ids.demo_suppression_id);
    expect(row?.seq).toBe(createdEvent?.seq);
    expect(row?.seq).toBeGreaterThan(0);
  });

  it("returns null for an id with no ledger entry", () => {
    expect(buildLedgerRow("not-a-real-suppression-id", suppressions, auditEvents)).toBeNull();
  });
});

describe("buildLedgerRows — append-only: a revocation stays on the record", () => {
  it("includes a revoked row when the corpus has one, marked accordingly", () => {
    const rows = buildLedgerRows(manifest.ids.demo_suppression_id, suppressions, auditEvents);
    const revokedItem = suppressions.find((s) => s.revoked_at);
    if (!revokedItem) return; // the corpus's own totals.revoked could be 0 on a future regeneration
    const revokedRow = rows.find((r) => r.state === "revoked");
    expect(revokedRow).toBeDefined();
    expect(revokedRow?.revokedAt).toBe(revokedItem.revoked_at);
    // Its seq is the real suppression.revoked event, not the creation event.
    const revokedEvent = auditEvents.find((e) => e.event_type === "suppression.revoked" && payloadSuppressionId(e) === revokedItem.suppression_id);
    expect(revokedRow?.seq).toBe(revokedEvent?.seq);
  });

  it("rows are ordered by seq ascending", () => {
    const rows = buildLedgerRows(manifest.ids.demo_suppression_id, suppressions, auditEvents);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].seq).toBeLessThanOrEqual(rows[i].seq);
  });
});
