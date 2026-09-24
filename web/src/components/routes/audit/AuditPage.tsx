"use client";
// OWNER: d4 (wave 3). /audit — the chain viewer (dashboard-blueprint §2.9, §3c; plan
// A8/A9). Composes <ChainRail surface="dashboard"> (t6, wave 2) over
// useAuditInfinite's windowed pages, exactly as /lab/t6's dashboard variant does
// (events AND losslessEvents from the same lossless-parsed items — never JSON.parse
// on this data, plan A8). Filters live in the URL (useAuditFilters, t2a); `seq` is
// this page's own addition (not in url-state.ts's frozen parser set) for the
// `?seq=<n>` deep link a finding's audit tab sends here.
//
// `tamperable` is FIXTURES-only (brief): dashboard-blueprint §3c says the dashboard
// carries no tamper control at all ("In the dashboard there is no tamper button"), but
// this track's brief asks for it specifically in fixture mode, for the demo screenshot
// of a broken chain — raised as an intentional deviation from that rule, gated so a
// live deployment (FIXTURES=0) never exposes it regardless.
import { useMemo, useRef, useState } from "react";
import { parseAsInteger, useQueryState } from "nuqs";
import { EmptyState, ErrorState, LoadingState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChainRail, type LosslessAuditEvent } from "@/components/evidence/ChainRail";
import type { AuditEvent } from "@/lib/api-types";
import { ACTOR_TYPES, AUDIT_EVENT_TYPES, type ActorType } from "@/lib/contracts";
import { useAuditFilters, useAuditInfinite } from "@/lib/hooks";
import { FIXTURES } from "@/lib/env";
import { auditHashDocument } from "@/lib/canonical-json";
import { verifyWindow, type ChainVerifyItem } from "@/lib/audit-verify";
import { stringifyLosslessJson } from "@/api/lossless";
import { useSeqDeepLink } from "./use-seq-deep-link";

const ALL = "__all__";

function downloadJson(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function AuditPage() {
  const [filters, setFilters] = useAuditFilters();
  const [seq, setSeq] = useQueryState("seq", parseAsInteger);
  const [verifyRun, setVerifyRun] = useState<{ ms: number; verified: boolean; checked: number; brokenAtSeq: number | null } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const query = useAuditInfinite({
    review_id: filters.review_id,
    finding_id: filters.finding_id,
    event_type: filters.event_type,
    actor_type: filters.actor_type,
  });

  const pages = query.data?.pages ?? [];
  const losslessEvents = useMemo<LosslessAuditEvent[]>(
    () => pages.flatMap((p) => (p.items ?? []) as unknown as LosslessAuditEvent[]),
    [pages],
  );
  const chain = pages.at(-1)?.chain;
  const missingTenantId = losslessEvents.length > 0 && losslessEvents.every((e) => !e.tenant_id);

  useSeqDeepLink({ containerRef, seq, ready: query.isSuccess });

  async function onVerify() {
    if (losslessEvents.length === 0) return;
    setVerifying(true);
    const start = performance.now();
    const items: ChainVerifyItem[] = losslessEvents.map((e) => ({
      seq: e.seq,
      prevHash: e.prev_hash,
      expectedHash: e.event_hash,
      document: auditHashDocument({
        tenant_id: e.tenant_id ?? "",
        seq: e.seq,
        event_type: e.event_type,
        actor_type: e.actor_type,
        actor_id: e.actor_id,
        payload: (e.payload ?? {}) as Record<string, unknown>,
        created_at: e.created_at,
      }),
    }));
    const result = await verifyWindow(items);
    setVerifyRun({ ms: performance.now() - start, verified: result.verified, checked: result.checked, brokenAtSeq: result.brokenAtSeq });
    setVerifying(false);
  }

  function onDownload() {
    const text = stringifyLosslessJson({ items: losslessEvents, chain: chain ?? null });
    downloadJson(`prguard-audit-${Date.now()}.json`, text);
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
      <p className="type-label text-text-dim">/audit</p>
      <h1 className="mt-2 type-display-h3 text-text-primary">Audit chain</h1>
      <p className="mt-2 max-w-(--measure-body) type-body text-text-body">
        Every decision PRGuard makes lands in this chain: hash-linked, sequence-ordered, checked in your browser against the recorded event_hash.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="type-label text-text-dim">Event type</span>
          <Select value={filters.event_type ?? ALL} onValueChange={(v) => void setFilters({ event_type: v === ALL ? null : v })}>
            <SelectTrigger className="w-52" aria-label="Event type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All event types</SelectItem>
              {AUDIT_EVENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="type-label text-text-dim">Actor</span>
          <Select value={filters.actor_type ?? ALL} onValueChange={(v) => void setFilters({ actor_type: v === ALL ? null : (v as ActorType) })}>
            <SelectTrigger className="w-36" aria-label="Actor type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All actors</SelectItem>
              {ACTOR_TYPES.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="type-label text-text-dim">Review id</span>
          <Input value={filters.review_id ?? ""} onChange={(e) => void setFilters({ review_id: e.target.value || null })} placeholder="4e8b1d0…" mono className="w-40" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="type-label text-text-dim">Finding id</span>
          <Input value={filters.finding_id ?? ""} onChange={(e) => void setFilters({ finding_id: e.target.value || null })} placeholder="a91f3c2e…" mono className="w-40" />
        </label>

        {filters.review_id || filters.finding_id || filters.event_type || filters.actor_type || seq != null ? (
          <button
            type="button"
            onClick={() => {
              void setFilters({ review_id: null, finding_id: null, event_type: null, actor_type: null });
              void setSeq(null);
            }}
            className="type-label text-text-dim underline decoration-dotted hover:text-text-body"
          >
            CLEAR FILTERS
          </button>
        ) : null}
      </div>

      <div ref={containerRef} className="mt-4">
        {query.isPending ? (
          <LoadingState rows={8} density="compact" label="Loading the audit chain." />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : losslessEvents.length === 0 ? (
          <EmptyState message="No events match this filter. The chain itself is unaffected — this is a view, not a record." />
        ) : (
          <ChainRail
            events={losslessEvents as unknown as AuditEvent[]}
            losslessEvents={losslessEvents}
            verified={chain?.verified ?? true}
            brokenAtSeq={chain?.broken_at_seq ?? null}
            checked={chain?.checked}
            firstSeq={chain?.first_seq ?? null}
            lastSeq={chain?.last_seq ?? null}
            missingTenantId={missingTenantId}
            tamperable={FIXTURES}
            surface="dashboard"
            index="09"
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onVerify} loading={verifying} disabled={losslessEvents.length === 0}>
          VERIFY CHAIN LOCALLY
        </Button>
        <Button variant="ghost" size="sm" onClick={onDownload} disabled={losslessEvents.length === 0}>
          DOWNLOAD RAW HISTORY (JSON)
        </Button>
        {query.hasNextPage ? (
          <Button variant="quiet" size="sm" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage}>
            LOAD OLDER EVENTS
          </Button>
        ) : null}
        {verifyRun ? (
          <p className="type-data text-text-dim">
            {verifyRun.verified ? (
              <>
                verified {verifyRun.checked.toLocaleString("en-US")} events in {verifyRun.ms.toFixed(1)}ms — chain.verified = <span className="text-signal-text">true</span>
              </>
            ) : (
              <span className="text-alarm-text">
                chain.verified = false · broken_at_seq = {verifyRun.brokenAtSeq} · checked in {verifyRun.ms.toFixed(1)}ms
              </span>
            )}
          </p>
        ) : null}
      </div>
    </div>
  );
}
