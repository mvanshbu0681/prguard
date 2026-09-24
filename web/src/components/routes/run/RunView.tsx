"use client";
// OWNER: d1 (wave 3). /runs/[id] — the dashboard's showpiece (dashboard §2.4 LIVE, §2.5
// RESULT). ONE route whose mode switches on `status`: LIVE while queued/running, RESULT once
// terminal. Data comes from the client hooks (@/lib/hooks), never the server fixture loaders
// (those are for the marketing build and the /lab pages) — this file reads live.
//
// The header, the gate area and the <StageRail> instrument are the same three elements
// across both modes (never remounted, never keyed on `mode`): only their props change as the
// run's own status changes, so the "0ms colour flip, never a route change" promise (plan §2
// hard rule 3; dashboard §2.4) is structural, not animated in after the fact.
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { useLiveFavicon } from "@/components/brand";
import { ErrorState, useIsMobile } from "@/components/app-shell";
import { GateArea } from "./GateArea";
import { StageRail, stageStatesFromReviewStatus, type StageEntry } from "@/components/evidence/StageRail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CodeBlockClient } from "@/components/code";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useReviewList, useReviewResult, useReviewStatus, useRerunReview } from "@/lib/hooks";
import { STAGES, type Stage } from "@/lib/contracts";
import { CostTimingPanel } from "./CostTimingPanel";
import { DeliveryPanel } from "./DeliveryPanel";
import { FindingsTable } from "./FindingsTable";
import { formatDurationSeconds, formatElapsed, runMode } from "./format";
import { LiveRightRail } from "./LiveRightRail";
import { PipelineSummaryStrip } from "./PipelineSummaryStrip";
import { RunHeader } from "./RunHeader";
import { useElapsedSeconds } from "./useElapsedSeconds";
import { cn } from "@/lib/utils";

const RESULT_TABS = ["pipeline", "findings", "delivery", "cost"] as const;
type ResultTab = (typeof RESULT_TABS)[number];

export interface RunViewProps {
  id: string;
  /** getCostSummary().per_stage p50s, ×1000 (server-loaded — dashboard §2.4's expectedSeconds). */
  expectedMs: Partial<Record<Stage, number>>;
}

export function RunView({ id, expectedMs }: RunViewProps) {
  const status = useReviewStatus(id);

  // RE-RUN resets the status query (@/lib/hooks' useRerunReview: `resetQueries`), which
  // clears `status.data` to undefined for the moment between the reset and the next poll
  // landing. Without this, that gap would hit the "no id yet" skeleton below — a full
  // unmount of the header, gate area and stage rail (and, with it, keyboard focus) for a
  // run whose identity we already know. Keeping the last good poll bridges that gap so
  // the same continuity guarantee that covers the live → result transition also covers a
  // RE-RUN — adjusted during render (React's own "storing information from previous
  // renders" pattern), not in an effect, so there is no extra committed frame the old
  // data is visible under a new id. Tagged with the id it belongs to so a navigation to a
  // different run never shows the old one's cached header.
  const [cachedStatus, setCachedStatus] = useState<{ id: string; data: NonNullable<typeof status.data> } | null>(null);
  if (status.data && (cachedStatus?.id !== id || cachedStatus.data !== status.data)) {
    setCachedStatus({ id, data: status.data });
  }
  const effectiveStatusData = status.data ?? (cachedStatus?.id === id ? cachedStatus.data : undefined);

  const mode = effectiveStatusData ? runMode(effectiveStatusData.status) : null;
  const isLive = mode === "live";
  const isResult = mode === "result";
  const isMobile = useIsMobile();

  const partial = useReviewResult(id, { partial: true, enabled: isLive });
  const result = useReviewResult(id, { enabled: isResult });
  // Best-effort trigger lookup (ReviewStatus/ReviewResult carry no `trigger` — only
  // ReviewAccepted / the plan-A11 list item do). A miss just omits the field.
  const list = useReviewList({ limit: 200 }, { enabled: !!effectiveStatusData });
  const listItem = list.data?.items.find((r) => r.review_id === id);

  const rerun = useRerunReview({ notify: true });

  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(RESULT_TABS).withDefault("pipeline"));

  const elapsedLive = useElapsedSeconds(effectiveStatusData?.started_at, isLive);

  const gateConclusion = result.data?.gate?.conclusion ?? null;
  useLiveFavicon(isLive ? "running" : gateConclusion === "failure" ? "blocked" : gateConclusion ? "clear" : null);

  const stageEntries: StageEntry[] = useMemo(() => {
    if (!effectiveStatusData) return STAGES.map((key) => ({ key, state: "pending" as const }));
    return stageStatesFromReviewStatus(effectiveStatusData);
  }, [effectiveStatusData]);

  const stageLabels = useMemo<Partial<Record<Stage, string>>>(() => {
    const s = effectiveStatusData;
    if (!s?.stage || !s.stage_label) return {};
    return STAGES.includes(s.stage as Stage) ? { [s.stage as Stage]: s.stage_label } : {};
  }, [effectiveStatusData]);

  // Only the very first load (no cached poll at all) gets the bare "no id yet" skeleton;
  // a RE-RUN's reset-then-refetch gap falls through to the unified render below instead.
  if (status.isPending && !effectiveStatusData) {
    return (
      <div className="flex flex-col gap-4 px-4 py-4 md:px-6">
        <div className="h-24 animate-none rounded-panel border border-rule-hair bg-ink-1" aria-hidden="true" />
        <StageRail
          mode="static"
          orientation={isMobile ? "vertical" : "horizontal"}
          stages={STAGES.map((key) => ({ key, state: "pending" as const }))}
          index="02"
          category="PIPELINE"
        />
      </div>
    );
  }

  if (status.isError && !effectiveStatusData) {
    return (
      <div className="px-4 py-8 md:px-6">
        <ErrorState error={status.error} onRetry={() => status.refetch()} />
      </div>
    );
  }

  const s = effectiveStatusData!;
  const handleRerun = () => rerun.mutate({ reviewId: id });

  // A true fetch failure on the result query swaps the whole page for an error state —
  // distinct from the ordinary "result not loaded yet" gap below, which keeps the header,
  // gate area and stage rail mounted and simply waits for `r`.
  if (isResult && result.isError) {
    return (
      <div className="px-4 py-8 md:px-6">
        <ErrorState error={result.error} onRetry={() => result.refetch()} />
      </div>
    );
  }

  const p = partial.data;
  const r = isResult ? result.data : undefined;
  const resultLoaded = isResult && !!r;
  const rawPayload = r?.review_payload;

  // RunHeader, GateArea and StageRail render at the SAME position/type across LIVE and
  // RESULT (dashboard §2.4: "never a route change, never a remount — scroll position and
  // selection survive"): only the values fed into them change as the run's own status and
  // result resolve. `r` wins once the result has loaded; `p` (the live partial) covers the
  // gap before it; `s` (the poll, always present here) is the final fallback.
  const repoLabel = r
    ? `${r.repository.owner}/${r.repository.name}`
    : p?.repository
      ? `${p.repository.owner}/${p.repository.name}`
      : undefined;
  const prNumber = r ? r.pull_request.number : p?.pull_request?.number;
  const prTitle = r ? r.pull_request.title : p?.pull_request?.title;
  const prAuthor = r ? r.pull_request.author : p?.pull_request?.author;
  const prUrl = r ? r.pull_request.url : p?.pull_request?.url;
  const headSha = r ? r.pull_request.head_sha : (p?.pull_request?.head_sha ?? s.head_sha);
  const baseSha = r ? r.pull_request.base_sha : p?.pull_request?.base_sha;
  const riskTier = r ? r.risk_tier : (p?.risk_tier ?? s.risk_tier);
  const elapsedLabel = isLive ? formatElapsed(elapsedLive) : formatDurationSeconds(r?.timing?.duration_seconds);
  const headerStatus = r ? r.status : s.status;
  const headerProvenance = isResult ? `GET /v1/reviews/${id}/result` : `GET /v1/reviews/${id}`;

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <RunHeader
          className="flex-1"
          reviewId={id}
          status={headerStatus}
          repoLabel={repoLabel}
          prNumber={prNumber}
          prTitle={prTitle}
          prAuthor={prAuthor}
          prUrl={prUrl}
          headSha={headSha}
          baseSha={baseSha}
          riskTier={riskTier}
          trigger={listItem?.trigger}
          elapsedLabel={elapsedLabel}
          provenance={headerProvenance}
          onRerun={handleRerun}
          rerunPending={rerun.isPending}
        />
        <GateArea gate={r?.gate ?? null} error={s.error} live={isLive} className="shrink-0" />
      </div>

      {isResult ? <PipelineSummaryStrip stages={stageEntries} wallClockSeconds={r?.timing?.duration_seconds} /> : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as ResultTab)}>
        {isResult ? (
          <div className="flex items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="pipeline">PIPELINE</TabsTrigger>
              <TabsTrigger value="findings">FINDINGS</TabsTrigger>
              <TabsTrigger value="delivery">DELIVERY</TabsTrigger>
              <TabsTrigger value="cost">COST &amp; TIMING</TabsTrigger>
            </TabsList>
            {rawPayload ? (
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" variant="quiet" size="sm">
                    RAW PAYLOAD
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>review_payload</DialogTitle>
                  </DialogHeader>
                  <CodeBlockClient code={JSON.stringify(rawPayload, null, 2)} lang="json" title="review_payload" maxHeight={480} />
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
        ) : null}

        {/* The stage rail is ONE persistent instance, never reparented under a TabsContent —
            a live run keeps it (plus the counters rail) visible unconditionally; a terminal
            run keeps this same node mounted and only toggles it with the `hidden` attribute
            when another sub-tab is selected, so it survives the live → result transition and
            every subsequent tab switch. */}
        <div
          role={isResult ? "tabpanel" : undefined}
          aria-label={isResult ? "Pipeline" : undefined}
          className={cn(
            "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]",
            isResult && "pt-4",
            isResult && tab !== "pipeline" && "hidden",
          )}
        >
          <StageRail
            mode={isLive ? "live" : "static"}
            orientation={isMobile ? "vertical" : "horizontal"}
            stages={stageEntries}
            stageIndex={isLive ? s.stage_index : undefined}
            secondsSinceHeartbeat={isLive ? s.seconds_since_heartbeat : undefined}
            stageLabels={isLive ? stageLabels : undefined}
            expectedMs={isLive ? expectedMs : undefined}
            index="02"
            category="PIPELINE"
            identifier={`run ${id.slice(0, 7)}`}
            provenance={
              isLive
                ? `GET /v1/reviews/${id} → stage_index · stage_total · stage_label · heartbeat`
                : `GET /v1/reviews/${id}/result → status`
            }
          />
          {isLive ? (
            <LiveRightRail
              counts={s.counts}
              cost={p?.cost}
              degradations={s.degradations ?? []}
              countsProvenance={`GET /v1/reviews/${id} → counts`}
              costProvenance={`GET /v1/reviews/${id}/result?partial=true → cost`}
            />
          ) : null}
        </div>

        {resultLoaded && r ? (
          <>
            <TabsContent value="findings" className="pt-4">
              <FindingsTable
                findings={r.findings ?? []}
                gateConclusion={r.gate?.conclusion}
                provenance={`GET /v1/reviews/${id}/result → findings`}
              />
            </TabsContent>
            <TabsContent value="delivery" className="pt-4">
              <DeliveryPanel
                delivery={r.delivery}
                gate={r.gate}
                published={r.counts?.published}
                provenance={`GET /v1/reviews/${id}/result → delivery · gate · counts`}
              />
            </TabsContent>
            <TabsContent value="cost" className="pt-4">
              <CostTimingPanel
                cost={r.cost}
                timing={r.timing}
                context={r.context}
                degradations={r.degradations ?? []}
                provenance={`GET /v1/reviews/${id}/result → cost · timing · context · degradations`}
              />
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </div>
  );
}
