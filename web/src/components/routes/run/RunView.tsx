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
import { useMemo } from "react";
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

const RESULT_TABS = ["pipeline", "findings", "delivery", "cost"] as const;
type ResultTab = (typeof RESULT_TABS)[number];

export interface RunViewProps {
  id: string;
  /** getCostSummary().per_stage p50s, ×1000 (server-loaded — dashboard §2.4's expectedSeconds). */
  expectedMs: Partial<Record<Stage, number>>;
}

export function RunView({ id, expectedMs }: RunViewProps) {
  const status = useReviewStatus(id);
  const mode = status.data ? runMode(status.data.status) : null;
  const isLive = mode === "live";
  const isResult = mode === "result";
  const isMobile = useIsMobile();

  const partial = useReviewResult(id, { partial: true, enabled: isLive });
  const result = useReviewResult(id, { enabled: isResult });
  // Best-effort trigger lookup (ReviewStatus/ReviewResult carry no `trigger` — only
  // ReviewAccepted / the plan-A11 list item do). A miss just omits the field.
  const list = useReviewList({ limit: 200 }, { enabled: !!status.data });
  const listItem = list.data?.items.find((r) => r.review_id === id);

  const rerun = useRerunReview({ notify: true });

  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(RESULT_TABS).withDefault("pipeline"));

  const elapsedLive = useElapsedSeconds(status.data?.started_at, isLive);

  const gateConclusion = result.data?.gate?.conclusion ?? null;
  useLiveFavicon(isLive ? "running" : gateConclusion === "failure" ? "blocked" : gateConclusion ? "clear" : null);

  const stageEntries: StageEntry[] = useMemo(() => {
    if (!status.data) return STAGES.map((key) => ({ key, state: "pending" as const }));
    return stageStatesFromReviewStatus(status.data);
  }, [status.data]);

  const stageLabels = useMemo<Partial<Record<Stage, string>>>(() => {
    const s = status.data;
    if (!s?.stage || !s.stage_label) return {};
    return STAGES.includes(s.stage as Stage) ? { [s.stage as Stage]: s.stage_label } : {};
  }, [status.data]);

  if (status.isPending) {
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

  if (status.isError) {
    return (
      <div className="px-4 py-8 md:px-6">
        <ErrorState error={status.error} onRetry={() => status.refetch()} />
      </div>
    );
  }

  const s = status.data;
  const handleRerun = () => rerun.mutate({ reviewId: id });

  if (isLive) {
    const p = partial.data;
    return (
      <div className="flex flex-col gap-4 px-4 py-4 md:px-6">
        <RunHeader
          reviewId={id}
          status={s.status}
          repoLabel={p?.repository ? `${p.repository.owner}/${p.repository.name}` : undefined}
          prNumber={p?.pull_request?.number}
          prTitle={p?.pull_request?.title}
          prAuthor={p?.pull_request?.author}
          prUrl={p?.pull_request?.url}
          headSha={p?.pull_request?.head_sha ?? s.head_sha}
          baseSha={p?.pull_request?.base_sha}
          riskTier={p?.risk_tier ?? s.risk_tier}
          trigger={listItem?.trigger}
          elapsedLabel={formatElapsed(elapsedLive)}
          provenance={`GET /v1/reviews/${id}`}
          onRerun={handleRerun}
          rerunPending={rerun.isPending}
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <StageRail
            mode="live"
            orientation={isMobile ? "vertical" : "horizontal"}
            stages={stageEntries}
            stageIndex={s.stage_index}
            secondsSinceHeartbeat={s.seconds_since_heartbeat}
            stageLabels={stageLabels}
            expectedMs={expectedMs}
            index="02"
            category="PIPELINE"
            identifier={`run ${id.slice(0, 7)}`}
            provenance={`GET /v1/reviews/${id} → stage_index · stage_total · stage_label · heartbeat`}
          />
          <LiveRightRail
            counts={s.counts}
            cost={p?.cost}
            degradations={s.degradations ?? []}
            countsProvenance={`GET /v1/reviews/${id} → counts`}
            costProvenance={`GET /v1/reviews/${id}/result?partial=true → cost`}
          />
        </div>
      </div>
    );
  }

  // RESULT — terminal (succeeded, failed or cancelled).
  if (result.isPending) {
    return (
      <div className="flex flex-col gap-4 px-4 py-4 md:px-6">
        <RunHeader
          reviewId={id}
          status={s.status}
          headSha={s.head_sha}
          riskTier={s.risk_tier}
          trigger={listItem?.trigger}
          elapsedLabel={formatDurationSeconds(undefined)}
          provenance={`GET /v1/reviews/${id}`}
        />
        <div className="h-40 rounded-panel border border-rule-hair bg-ink-1" aria-hidden="true" />
      </div>
    );
  }
  if (result.isError) {
    return (
      <div className="px-4 py-8 md:px-6">
        <ErrorState error={result.error} onRetry={() => result.refetch()} />
      </div>
    );
  }

  const r = result.data;
  const rawPayload = r.review_payload;

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <RunHeader
          className="flex-1"
          reviewId={id}
          status={r.status}
          repoLabel={`${r.repository.owner}/${r.repository.name}`}
          prNumber={r.pull_request.number}
          prTitle={r.pull_request.title}
          prAuthor={r.pull_request.author}
          prUrl={r.pull_request.url}
          headSha={r.pull_request.head_sha}
          baseSha={r.pull_request.base_sha}
          riskTier={r.risk_tier}
          trigger={listItem?.trigger}
          elapsedLabel={formatDurationSeconds(r.timing?.duration_seconds)}
          provenance={`GET /v1/reviews/${id}/result`}
          onRerun={handleRerun}
          rerunPending={rerun.isPending}
        />
        <GateArea gate={r.gate} error={s.error} className="shrink-0" />
      </div>

      <PipelineSummaryStrip stages={stageEntries} wallClockSeconds={r.timing?.duration_seconds} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as ResultTab)}>
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

        <TabsContent value="pipeline" className="pt-4">
          <StageRail
            mode="static"
            orientation={isMobile ? "vertical" : "horizontal"}
            stages={stageEntries}
            index="02"
            category="PIPELINE"
            identifier={`run ${id.slice(0, 7)}`}
            provenance={`GET /v1/reviews/${id}/result → status`}
          />
        </TabsContent>
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
      </Tabs>
    </div>
  );
}
