"use client";
// OWNER: d3 (wave 3). §07 — AUDIT (dashboard-blueprint §2.7 §07):
// <ChainRail scope="finding"> — every audit event touching this fingerprint,
// with per-row recomputation.
//
// RAISED: the brief's footer text is `GET /v1/audit?fingerprint=<id8>`, but
// GET /v1/audit's real query (web/openapi/openapi.json → ListAuditEventsData)
// has no `fingerprint` parameter — only `finding_id` (a narrower filter: one
// finding's own events, not every event across every occurrence of its
// fingerprint). This section filters by `finding_id` (the parameter the API
// actually accepts) and prints that endpoint, rather than a query string the
// server would reject. A `fingerprint` filter on GET /v1/audit is a
// reasonable backend addition, in the spirit of A9 — degraded, never invisible.
import { ErrorState, LoadingState } from "@/components/app-shell";
import { ChainRail, type LosslessAuditEvent } from "@/components/evidence/ChainRail";
import { useAudit } from "@/lib/hooks";
import type { AuditEvent, AuditItemWithTenant, Finding } from "@/lib/api-types";

function toLossless(items: AuditItemWithTenant[] | undefined): LosslessAuditEvent[] {
  return (items ?? []).map((item) => ({
    seq: item.seq,
    event_type: item.event_type,
    actor_type: item.actor_type,
    actor_id: item.actor_id ?? null,
    payload: item.payload,
    created_at: item.created_at,
    tenant_id: item.tenant_id,
    event_hash: item.event_hash,
    prev_hash: item.prev_hash ?? null,
  }));
}

export function AuditSection({ finding }: { finding: Finding }) {
  const query = useAudit({ finding_id: finding.id, limit: 200 });

  if (query.isPending) {
    return (
      <section aria-labelledby="fd-07" className="rounded-panel border border-rule-1 bg-ink-2 px-4 py-5 md:px-6">
        <h2 id="fd-07" className="type-label text-text-dim">
          / 07 — AUDIT
        </h2>
        <div className="mt-4">
          <LoadingState rows={4} label="Loading audit events." />
        </div>
      </section>
    );
  }
  if (query.isError) {
    return (
      <section aria-labelledby="fd-07" className="rounded-panel border border-rule-1 bg-ink-2 px-4 py-5 md:px-6">
        <h2 id="fd-07" className="type-label text-text-dim">
          / 07 — AUDIT
        </h2>
        <div className="mt-4">
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </div>
      </section>
    );
  }

  const items = query.data.items ?? [];
  const losslessEvents = toLossless(items);
  const missingTenantId = items.length > 0 && items.every((item) => item.tenant_id == null);
  const short = finding.id.slice(0, 8);

  return (
    <ChainRail
      events={items as AuditEvent[]}
      losslessEvents={losslessEvents}
      verified={query.data.chain.verified}
      brokenAtSeq={query.data.chain.broken_at_seq ?? null}
      checked={query.data.chain.checked}
      firstSeq={query.data.chain.first_seq ?? null}
      lastSeq={query.data.chain.last_seq ?? null}
      surface="dashboard"
      variant="audit"
      missingTenantId={missingTenantId}
      index="07"
      provenance={`GET /v1/audit?finding_id=${short}`}
    />
  );
}
