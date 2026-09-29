'use client';
// /runs/[id] — one review. The mode follows the run's own status: LIVE while it
// is queued or running (the rail lights up stage by stage, a log narrates each
// poll, the counters arrive, the clock ticks), RESULT once it is terminal (the
// verdict lands, the findings open up by outcome, cost / delivery / details fill
// the rail). The hero, the pipeline rail and the side rail stay mounted across
// that transition — only their props change — so scroll and focus survive it.
//
// Data comes from the client hooks (@/lib/hooks): the polled status, the partial
// result while live, the final result once terminal, and the run list for the
// trigger and the pull request's other runs. In fixture mode ?replay=1 replays
// the demo run and Re-run simulates a fresh one (src/lib/fixture-resolver.ts).
import { ArrowLeft } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useLiveFavicon } from '@/components/brand';
import { ErrorState } from '@/components/app-shell';
import { stageStatesFromReviewStatus } from '@/components/evidence/StageRail';
import { CodeBlockClient } from '@/components/code';
import { Button, Card, Page, PageHeader, Rise, SectionHeader, Skeleton, type GateConclusion } from '@/components/dash/kit';
import { plural, relTime } from '@/components/dash/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Finding, ReviewListItem } from '@/lib/api-types';
import { STAGES, type Stage } from '@/lib/contracts';
import { isLiveStatus, useReviewList, useReviewResult, useReviewStatus, useRerunReview } from '@/lib/hooks';
import { medianDuration, threadsOf } from '../runs-list/model';
import { CostTimingPanel } from './CostTimingPanel';
import { DeliveryPanel } from './DeliveryPanel';
import { FindingsByOutcome } from './FindingsByOutcome';
import { bySeverity, groupFindings, proofTally } from './findings-model';
import { formatDurationSeconds, formatElapsed, runMode } from './format';
import { logEvents, snapshotKey, snapshotOf, type LiveSnapshot, type LogEvent } from './live-model';
import { LiveLog } from './LiveLog';
import {
  FunnelArtefact,
  LiveCountsArtefact,
  LiveProofArtefact,
  ProofArtefact,
  ProofTallyArtefact,
  RunHero,
  SeverityArtefact,
  StagesArtefact,
  type Verdict,
} from './RunHero';
import { RunMetaPanel } from './RunMetaPanel';
import { STAGE_META, stageProgress, stageViews, totalMs } from './stage-model';
import { StageTimeline } from './StageTimeline';
import { elapsedSince, useNow } from './useElapsedSeconds';
import s from './run.module.css';

export interface RunViewProps {
  id: string;
  /** Workspace p50 per stage (GET /v1/cost), in ms — the rail's "typical" widths. */
  expectedMs: Partial<Record<Stage, number>>;
  /** This run's own recorded stage durations, in ms, when the corpus has them. */
  recordedMs?: Partial<Record<Stage, number>> | null;
  /** How long each stage lasts in a simulated (fixture) live run, in ms. */
  simStageMs?: Partial<Record<Stage, number>> | null;
  /** The workspace's p50 review cost. */
  costP50?: number | null;
  /** Where "Watch replay" goes, when this run can be replayed. */
  replayHref?: string | null;
}

const TRIGGER_LABEL: Record<string, string> = { webhook: 'Webhook', rerun: 'Re-run', api: 'API' };
const TIER_LABEL: Record<string, string> = { full: 'Full review', standard: 'Standard review', trivial: 'Trivial change' };

interface LogState {
  id: string;
  key: string | null;
  prev: LiveSnapshot | null;
  events: LogEvent[];
  stageIndex: number;
  /** Seconds into the run when the current stage was first seen. */
  stageAt: number | null;
  /** started_at of the live run being logged (a finished status may carry another clock). */
  liveStart: string | null;
}

const emptyLog = (id: string): LogState => ({ id, key: null, prev: null, events: [], stageIndex: 0, stageAt: null, liveStart: null });

function secondsBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const d = (Date.parse(b) - Date.parse(a)) / 1000;
  return Number.isFinite(d) ? d : null;
}

export function RunView({ id, expectedMs, recordedMs, simStageMs, costP50, replayHref }: RunViewProps) {
  const status = useReviewStatus(id);

  // RE-RUN resets the status query, clearing `status.data` for the moment between the
  // reset and the next poll. Keep the last good poll (tagged with its id) so that gap
  // never unmounts the page — adjusted during render, not in an effect.
  const [cachedStatus, setCachedStatus] = useState<{ id: string; data: NonNullable<typeof status.data> } | null>(null);
  if (status.data && (cachedStatus?.id !== id || cachedStatus.data !== status.data)) {
    setCachedStatus({ id, data: status.data });
  }
  const st = status.data ?? (cachedStatus?.id === id ? cachedStatus.data : undefined);

  const mode = st ? runMode(st.status) : null;
  const isLive = mode === 'live';
  const isResult = mode === 'result';

  const partial = useReviewResult(id, { partial: true, enabled: isLive });
  const result = useReviewResult(id, { enabled: isResult });
  const list = useReviewList({ limit: 200 }, { enabled: !!st });
  const rerun = useRerunReview({ notify: true });
  const now = useNow(isLive);
  const elapsedLive = isLive ? elapsedSince(st?.started_at, now) : null;
  const [payloadOpen, setPayloadOpen] = useState(false);

  const r = isResult ? result.data : undefined;
  const p = partial.data;
  const gateConclusion = r?.gate?.conclusion ?? null;
  useLiveFavicon(isLive ? 'running' : gateConclusion === 'failure' ? 'blocked' : gateConclusion ? 'clear' : null);

  // ---- the live log: a diff between polls, kept in state -------------------------
  const [log, setLog] = useState<LogState>(() => emptyLog(id));
  if (log.id !== id) {
    setLog(emptyLog(id));
  } else if (st) {
    const snap = snapshotOf(st);
    const key = snapshotKey(snap);
    const restarted = log.prev != null && !isLiveStatus(log.prev.status) && isLiveStatus(snap.status);
    const logging = isLiveStatus(snap.status) || log.events.length > 0;
    if (logging && key !== log.key) {
      const base = restarted ? emptyLog(id) : log;
      const live = isLiveStatus(snap.status);
      const at = live ? elapsedLive : base.liveStart ? elapsedSince(base.liveStart, now) : secondsBetween(st.started_at, st.finished_at);
      const added = logEvents(restarted ? null : base.prev, snap, at);
      setLog({
        id,
        key,
        prev: snap,
        events: [...base.events, ...added],
        stageIndex: snap.stageIndex,
        stageAt: snap.stageIndex !== base.stageIndex ? at : base.stageAt,
        liveStart: live ? (st.started_at ?? base.liveStart) : base.liveStart,
      });
    }
  }

  const states = useMemo(() => (st ? stageStatesFromReviewStatus(st) : STAGES.map((key) => ({ key, state: 'pending' as const }))), [st]);
  const views = useMemo(() => stageViews(states, recordedMs, expectedMs), [states, recordedMs, expectedMs]);

  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const threads = useMemo(() => threadsOf(items), [items]);
  const listItem = items.find((x) => x.review_id === id);
  const thread = threads.get(id);
  const durationMedian = useMemo(() => medianDuration(items), [items]);


  // ---- first load / errors -----------------------------------------------------
  if (status.isPending && !st) return <RunSkeleton />;
  // A 404 is an answer, not a failure: no Retry, just the way back.
  if (status.isError && !st && isNotFound(status.error)) return <RunNotFound id={id} />;
  if (isResult && result.isError && isNotFound(result.error)) return <RunNotFound id={id} />;
  if (status.isError && !st) {
    return (
      <Page>
        <ErrorState error={status.error} onRetry={() => status.refetch()} />
      </Page>
    );
  }
  if (isResult && result.isError) {
    return (
      <Page>
        <ErrorState error={result.error} onRetry={() => result.refetch()} />
      </Page>
    );
  }

  const s0 = st!;
  const findings: Finding[] = r?.findings ?? [];
  const pr = r?.pull_request ?? p?.pull_request;
  const repo = r?.repository ?? p?.repository ?? listItem?.repository ?? null;
  const prNumber = pr?.number ?? listItem?.pull_request.number;
  const prTitle = pr?.title ?? listItem?.pull_request.title;
  const prAuthor = pr?.author ?? listItem?.pull_request.author;
  const headSha = pr?.head_sha ?? s0.head_sha;
  const baseSha = pr?.base_sha;
  const riskTier = r?.risk_tier ?? p?.risk_tier ?? s0.risk_tier;
  const trigger = listItem?.trigger ?? null;

  // ---- live progress -----------------------------------------------------------
  const currentKey = STAGES[(s0.stage_index ?? 1) - 1] ?? null;
  const inStage = elapsedLive != null && log.stageAt != null ? elapsedLive - log.stageAt : null;
  const progress = isLive && currentKey ? stageProgress(inStage, simStageMs?.[currentKey] ?? expectedMs[currentKey]) : 0;

  // ---- the verdict ---------------------------------------------------------------
  const published = r?.counts?.published ?? findings.filter((f) => f.status === 'published').length;
  const blockingIds = r?.gate?.blocking_finding_ids ?? findings.filter((f) => f.blocking).map((f) => f.id);
  let verdict: Verdict;
  if (isLive) {
    verdict = {
      kind: 'live',
      elapsed: formatElapsed(elapsedLive ?? 0),
      stageIndex: s0.stage_index ?? 1,
      stageName: currentKey ? STAGE_META[currentKey].name : '—',
      stageLabel: s0.stage_label ?? (currentKey ? STAGE_META[currentKey].doing : ''),
      queued: s0.status === 'queued',
    };
  } else if (s0.status === 'failed') {
    const k = s0.stage as Stage | null | undefined;
    verdict = { kind: 'failed', stageName: k && STAGE_META[k] ? STAGE_META[k].name : null, code: s0.error?.code ?? null, message: s0.error?.message ?? null };
  } else if (s0.status === 'cancelled') {
    if (s0.error?.code === 'SUPERSEDED' || thread?.superseded) {
      const by = thread?.next ?? null;
      verdict = { kind: 'superseded', byId: by?.review_id ?? null, byHref: by ? `/runs/${by.review_id}` : null };
    } else verdict = { kind: 'cancelled', message: s0.error?.message ?? null };
  } else if (!r) {
    verdict = { kind: 'loading' };
  } else if (r.gate?.conclusion === 'failure') {
    const blocking = blockingIds.length || r.counts?.blocking || 0;
    verdict = {
      kind: 'blocked',
      blocking,
      advisory: Math.max(0, published - blocking),
      contextName: r.gate.context_name ?? 'witness/merge-gate',
      delivery: r.gate.delivery ?? null,
      findingHref: blockingIds[0] ? `/findings/${blockingIds[0]}` : null,
    };
  } else if (r.gate?.conclusion === 'success') {
    verdict = { kind: 'clear', advisory: published, contextName: r.gate.context_name ?? 'witness/merge-gate', delivery: r.gate.delivery ?? null };
  } else {
    verdict = { kind: 'neutral', reason: r.gate?.reason ?? null, contextName: r.gate?.context_name ?? 'witness/merge-gate' };
  }
  const railVerdict: GateConclusion = isLive ? 'running' : r?.gate?.conclusion ?? (s0.status === 'succeeded' && r ? 'neutral' : null);

  // ---- the artefact cards --------------------------------------------------------
  const proven = findings.find((f) => blockingIds.includes(f.id)) ?? findings.filter((f) => f.status === 'published' && f.proof?.status === 'proven').sort(bySeverity)[0];
  const top = findings.filter((f) => f.status === 'published' && f.severity).sort(bySeverity)[0];
  let artefacts: ReactNode = null;
  if (isLive) {
    artefacts = (
      <>
        <LiveCountsArtefact counts={s0.counts} />
        <LiveProofArtefact stageIndex={s0.stage_index ?? 0} />
      </>
    );
  } else if (r && s0.status === 'succeeded') {
    artefacts = (
      <>
        {proven ? <ProofArtefact finding={proven} baseSha={baseSha} headSha={headSha} /> : <ProofTallyArtefact tally={proofTally(findings)} />}
        {top ? <SeverityArtefact finding={top} of={published} /> : null}
        <FunnelArtefact counts={r.counts} findings={findings} />
      </>
    );
  } else if (r || st) {
    const reached = s0.status === 'succeeded' ? 9 : Math.max(0, (s0.stage_index ?? 1) - 1);
    artefacts = (
      <>
        <StagesArtefact reached={reached} durationLabel={formatDurationSeconds(r?.timing?.duration_seconds ?? secondsBetween(s0.started_at, s0.finished_at))} />
        {(r?.counts?.proposed ?? 0) > 0 ? <FunnelArtefact counts={r?.counts} findings={findings} /> : null}
      </>
    );
  }

  // ---- labels ------------------------------------------------------------------
  const wall = r?.timing?.duration_seconds ?? secondsBetween(s0.started_at, s0.finished_at);
  const timeLabel = isLive
    ? s0.status === 'queued'
      ? 'Queued just now'
      : `Running · ${formatElapsed(elapsedLive ?? 0)}`
    : `${s0.status === 'succeeded' ? 'Finished' : 'Stopped'} ${relTime(s0.finished_at ?? r?.timing?.finished_at)} · ${formatDurationSeconds(wall)}`;
  const recorded = views.some((v) => v.kind === 'recorded');
  const railTotal = totalMs(views);
  const groups = groupFindings(findings);
  const count = (k: string) => groups.find((g) => g.key === k)?.findings.length ?? 0;

  const siblings = thread ? pullRequestRuns(items, listItem).filter((x) => x.review_id !== id) : [];
  const supersedes = thread?.prev && threads.get(thread.prev.review_id)?.superseded ? thread.prev : null;
  const supersededBy = thread?.superseded ? thread.next : null;

  const body = r?.review_payload && typeof r.review_payload.body === 'string' ? (r.review_payload.body as string) : null;

  const meta = (wide: boolean) => (
    <RunMetaPanel
      wide={wide}
      reviewId={id}
      headSha={headSha}
      baseSha={baseSha}
      riskTier={riskTier}
      trigger={trigger}
      startedAt={s0.started_at}
      finishedAt={s0.finished_at}
      siblings={siblings}
      supersedes={supersedes}
      supersededBy={supersededBy}
      supersededIds={new Set(siblings.filter((x) => threads.get(x.review_id)?.superseded).map((x) => x.review_id))}
      auditHref={`/audit?review_id=${id}`}
    />
  );

  return (
    <Page className={s.page}>
      <Rise>
        <RunHero
          repoLabel={repo ? `${repo.owner}/${repo.name}` : null}
          repoName={repo?.name ?? null}
          prNumber={prNumber}
          prTitle={prTitle}
          prAuthor={prAuthor}
          prUrl={pr?.url ?? null}
          baseSha={baseSha}
          headSha={headSha}
          triggerLabel={trigger ? TRIGGER_LABEL[trigger] ?? trigger : null}
          riskLabel={riskTier ? TIER_LABEL[riskTier] ?? riskTier : null}
          timeLabel={timeLabel}
          onRerun={() => rerun.mutate({ reviewId: id })}
          rerunPending={rerun.isPending}
          replayHref={isLive ? null : replayHref}
          verdict={verdict}
          artefacts={artefacts}
        />
      </Rise>

      <Rise delay={80}>
        <Card tone="surface" pad="lg" as="section" aria-labelledby="pipeline-h" className={s.pipeline}>
          <div className={s.pipeHead}>
            <div>
              <h2 id="pipeline-h" className={s.sectionTitle}>
                Pipeline
              </h2>
              <p className={s.sectionSub}>
                {isLive
                  ? `Stage ${s0.stage_index ?? 0} of 9 · ${s0.stage_label ?? (currentKey ? STAGE_META[currentKey].doing : '')}`
                  : s0.status === 'succeeded'
                    ? `Nine stages in ${formatDurationSeconds(wall)}. The four specialists read the diff in parallel.`
                    : `Stopped at stage ${s0.stage_index ?? '—'} of 9 after ${formatDurationSeconds(wall)}.`}
              </p>
            </div>
            <span className={s.pipeKey}>
              {recorded ? 'Timings recorded for this run' : railTotal != null ? '~ typical stage time, workspace p50' : null}
            </span>
          </div>
          <StageTimeline views={views} progress={progress} verdict={railVerdict} cancelled={s0.status === 'cancelled'} className={s.rail} />
        </Card>
      </Rise>

      <div className={s.body}>
        <Rise delay={140} className={s.mainCol}>
          {isLive ? (
            <LiveLog events={log.events} live elapsed={formatElapsed(elapsedLive ?? 0)} />
          ) : (
            <section aria-labelledby="findings-h" className={s.findings}>
              <SectionHeader
                id="findings-h"
                title="Findings"
                description={
                  r
                    ? findings.length
                      ? `${plural(r.counts?.proposed ?? findings.length, 'finding')} raised · ${published} published${count('blocking') ? ` · ${count('blocking')} ${count('blocking') === 1 ? 'blocks' : 'block'} the merge` : ''}`
                      : undefined
                    : 'Loading…'
                }
              />
              {r ? (
                <FindingsByOutcome findings={findings} baseSha={baseSha} headSha={headSha} gateClear={gateConclusion === 'success'} />
              ) : (
                <div className="flex flex-col gap-3" aria-hidden>
                  <Skeleton className="h-[220px] w-full" style={{ borderRadius: 20 }} />
                  <Skeleton className="h-[72px] w-full" style={{ borderRadius: 16 }} />
                  <Skeleton className="h-[72px] w-full" style={{ borderRadius: 16 }} />
                </div>
              )}
            </section>
          )}
          {!isLive ? meta(true) : null}
        </Rise>

        <Rise delay={200} as="aside" className={s.aside}>
          {!isLive && log.events.length ? <LiveLog events={log.events} live={false} elapsed={formatElapsed(log.events[log.events.length - 1]?.at ?? wall)} /> : null}
          {isResult ? (
            <>
              <CostTimingPanel
                cost={r?.cost}
                timing={r?.timing}
                context={r?.context}
                degradations={r?.degradations ?? s0.degradations ?? []}
                costP50={costP50}
                durationMedian={durationMedian}
              />
              <DeliveryPanel
                delivery={r?.delivery}
                gate={r?.gate}
                published={r?.counts?.published}
                findings={findings}
                onShowPayload={r?.review_payload ? () => setPayloadOpen(true) : undefined}
              />
            </>
          ) : null}
          {isLive ? meta(false) : null}
        </Rise>
      </div>

      {r?.review_payload ? (
        <Dialog open={payloadOpen} onOpenChange={setPayloadOpen}>
          <DialogContent className={s.payloadDialog}>
            <DialogHeader>
              <DialogTitle>What Witness posted</DialogTitle>
            </DialogHeader>
            {body ? <pre className={s.payloadBody}>{body}</pre> : null}
            <CodeBlockClient code={JSON.stringify(r.review_payload, null, 2)} lang="json" title="review_payload" maxHeight={360} />
          </DialogContent>
        </Dialog>
      ) : null}
    </Page>
  );
}

function isNotFound(error: { status?: number; code?: string } | null | undefined): boolean {
  return error?.status === 404 || error?.code === 'REVIEW_NOT_FOUND';
}

/** `/runs/<unknown id>`: a page of its own, with an h1 and the way back to the list. */
export function RunNotFound({ id }: { id: string }) {
  return (
    <Page className={s.page}>
      <PageHeader
        eyebrow="Reviews"
        title="No review with that id."
        description={
          <>
            Witness has no run <span className={s.notFoundId}>{id}</span>. The link may be mistyped, or the run belongs to another workspace.
          </>
        }
        actions={
          <Button variant="dark" icon={ArrowLeft} href="/runs">
            All reviews
          </Button>
        }
      />
    </Page>
  );
}

/** Every run on the same pull request as `item`, oldest first. */
function pullRequestRuns(items: readonly ReviewListItem[], item: ReviewListItem | undefined): ReviewListItem[] {
  if (!item) return [];
  return items
    .filter((x) => x.repository.owner === item.repository.owner && x.repository.name === item.repository.name && x.pull_request.number === item.pull_request.number)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

function RunSkeleton() {
  return (
    <Page className={s.page}>
      <Skeleton className="h-[420px] w-full" style={{ borderRadius: 20 }} />
      <Skeleton className="h-[200px] w-full" style={{ borderRadius: 20 }} />
      <div className={s.body}>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-[220px] w-full" style={{ borderRadius: 20 }} />
          <Skeleton className="h-[72px] w-full" style={{ borderRadius: 16 }} />
        </div>
        <Skeleton className="h-[320px] w-full" style={{ borderRadius: 20 }} />
      </div>
    </Page>
  );
}
