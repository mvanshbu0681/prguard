// OWNER: m5 (wave 3). Section 07 of 9 (plan T8, landing-blueprint §07 "M3 + M4 ·
// IDENTITY & THE FLIGHT RECORDER"). Keep the named export and the section id — the
// frozen app/(marketing)/page.tsx imports IdentityRecorder, and the id is a deep-link
// target from the nav.
//
// A server component: every value here comes from the server-only fixture loaders
// (@/lib/fixtures) and is handed down as plain props to two small client leaves —
// <IdentityPanel>'s two chip components and <FlightRecorderPanel>'s <ChainRail> — so
// the page renders its complete content at first paint (server HTML), never behind an
// IntersectionObserver, scroll or client fetch (plan A4's rule for every section).
//
// LEFT (M3, identity): identity is `sha256(category|rule_key|symbol_path|shape_hash)`
// (docs/specs/2026-09-14-pr-reviewer-v1-spec.md:244) — none of those four inputs is a
// line number. The real corpus already has the demonstration: the proven finding
// (manifest ids.proven_finding_id) and the finding the SUPERSEDED run raised first
// (getDemoProvenFinding().history.first_seen_run_id) share one fingerprint, one file,
// one symbol_path, and different line ranges (line drift), different severity inputs
// and a different proof status — because everything but identity moved. That beats the
// landing-blueprint's illustrative three-commit rename (this repo's fixtures do not
// carry per-commit diffs to render one) with something stronger: it is not staged.
//
// RIGHT (M4, the flight recorder): a six-event, losslessly-parsed window of the real
// audit chain around manifest ids.tamper_demo_seq — see FlightRecorderPanel.tsx for why
// getAuditEventsText() and not getAuditChain(). <ChainRail surface="marketing"
// tamperable> owns the four guards, the tamper control and the broken-state rendering;
// this file only slices the window and supplies the copy around it.
import { Grain, GraphPaper, SectionIndex } from "@/components/chrome";
import type { OccurrenceView } from "@/components/sections/record/IdentityPanel";
import { IdentityPanel, type LedgerRowView } from "@/components/sections/record/IdentityPanel";
import { FlightRecorderPanel } from "@/components/sections/record/FlightRecorderPanel";
import { getAuditChain, getAuditEventsText, getDemoProvenFinding, getFindings, getManifest, getReviewsIndex, getSuppressions } from "@/lib/fixtures";
import type { AuditEvent, Finding } from "@/lib/api-types";

function payloadSuppressionId(event: AuditEvent): string | null {
  const id = event.payload?.["suppression_id"];
  return typeof id === "string" ? id : null;
}

function toOccurrenceView(finding: Finding, reviews: ReturnType<typeof getReviewsIndex>["items"]): OccurrenceView {
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

function buildLedgerRow(
  suppressionId: string,
  suppressions: ReturnType<typeof getSuppressions>["items"],
  auditEvents: readonly AuditEvent[],
): LedgerRowView | null {
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

export function IdentityRecorder() {
  const manifest = getManifest();
  const proven = getDemoProvenFinding();
  const findings = getFindings();
  const reviews = getReviewsIndex().items;
  const suppressions = getSuppressions().items;
  const auditEvents = getAuditChain().items;
  const rawEventsText = getAuditEventsText();

  const fingerprint = proven.fingerprint ?? manifest.ids.proven_fingerprint;
  const firstSeenRunId = proven.history?.first_seen_run_id ?? null;
  const firstOccurrence =
    firstSeenRunId != null ? (findings.find((f) => f.fingerprint === fingerprint && f.review_id === firstSeenRunId) ?? null) : null;

  const occurrenceFindings = [firstOccurrence, proven].filter((f): f is Finding => f !== null).sort((a, b) => a.created_at.localeCompare(b.created_at));

  const occurrences = occurrenceFindings.map((f) => toOccurrenceView(f, reviews));

  const revokedItem = suppressions.find((s) => s.revoked_at);
  const ledgerRows = [
    buildLedgerRow(manifest.ids.demo_suppression_id, suppressions, auditEvents),
    revokedItem ? buildLedgerRow(revokedItem.suppression_id, suppressions, auditEvents) : null,
  ]
    .filter((r): r is LedgerRowView => r !== null)
    .sort((a, b) => a.seq - b.seq);

  return (
    <section id="record" aria-labelledby="record-heading" className="relative isolate overflow-hidden border-b border-rule-hair px-4 py-24 md:px-8 md:py-32">
      <GraphPaper className="absolute inset-0 -z-10 bg-ink-0" />
      <Grain />
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10">
        <div className="max-w-(--measure-body)">
          <SectionIndex index="07" category="Identity & the record" />
          <h2 id="record-heading" className="type-display-h2 mt-3 text-text-primary">
            Say no once.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <p className="type-body max-w-(--measure-body) text-text-body">
              Identity is <code className="type-data text-text-primary">sha256(category | rule_key | symbol_path | shape_hash)</code>. It survives
              line drift, variable renames and rewording, because none of those are inputs.
            </p>
            <IdentityPanel
              fingerprint={fingerprint}
              findingId={proven.id}
              ruleKey={proven.rule_key}
              occurrences={occurrences}
              ledgerRows={ledgerRows}
            />
          </div>

          <div className="flex flex-col gap-4">
            <p className="type-body max-w-(--measure-body) text-text-body">
              <code className="type-data text-text-primary">event_hash = sha256(prev_hash + canonical_json)</code>. Six real events, a continuous 2px
              rail, and a field you can edit.
            </p>
            <FlightRecorderPanel rawEventsText={rawEventsText} tamperDemoSeq={manifest.ids.tamper_demo_seq} />
            <p className="type-micro text-text-dim">Edit any row&rsquo;s canonical_json above to see the chain break, then use restore to undo it.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
