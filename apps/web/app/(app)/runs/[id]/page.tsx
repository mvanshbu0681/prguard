// /runs/[id] — one review: LIVE while queued/running, RESULT once terminal. A thin
// server page (Next 16: `params` is a Promise). It is the one place that can read
// the server-only fixture loaders, so it hands <RunView> the numbers that are not
// on the run itself: the workspace's per-stage p50 and p50 cost (the "typical"
// the run is measured against), and — for the recorded demo run — its own stage
// timings and the simulation's pace for ?replay=1. The run's data is read live,
// client-side, by <RunView>.
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RunView } from '@/components/routes/run/RunView';
import { FIXTURES } from '@/lib/env';
import { getCostSummary, getDemoRun, getManifest } from '@/lib/fixtures';
import type { Stage } from '@/lib/contracts';

export const metadata: Metadata = { title: 'Review' };

function stageMap(rows: { key: Stage; ms: number }[]): Partial<Record<Stage, number>> {
  return Object.fromEntries(rows.map((r) => [r.key, r.ms]));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const summary = getCostSummary();
  const expectedMs = stageMap(summary.per_stage.map((s) => ({ key: s.stage, ms: s.p50_s * 1000 })));

  let recordedMs: Partial<Record<Stage, number>> | null = null;
  let simStageMs: Partial<Record<Stage, number>> | null = null;
  let replayHref: string | null = null;
  if (FIXTURES) {
    const demo = getDemoRun();
    const scale = demo.time_scale > 0 ? demo.time_scale : 1;
    // Every simulated run (a replay or a re-run) plays the recorded demo timings.
    simStageMs = stageMap(demo.stages.map((s) => ({ key: s.key, ms: s.duration_ms * scale })));
    if (id === getManifest().ids.demo_review_id) {
      recordedMs = stageMap(demo.stages.map((s) => ({ key: s.key, ms: s.duration_ms })));
      replayHref = `/runs/${id}?replay=1`;
    }
  }

  return (
    <Suspense fallback={null}>
      <RunView id={id} expectedMs={expectedMs} recordedMs={recordedMs} simStageMs={simStageMs} costP50={summary.cost_p50_usd} replayHref={replayHref} />
    </Suspense>
  );
}
