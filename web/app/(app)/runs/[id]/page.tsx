// OWNER: d1 (wave 3). /runs/[id] — the dashboard's showpiece: LIVE while queued/running,
// RESULT once terminal (dashboard §2.4, §2.5). A thin server page: Next 16's `params` is a
// Promise and must be awaited, and this is the one place a server component can call the
// server-only fixture loader (@/lib/fixtures — plan's "pass data down as props" rule) for
// `expectedMs`, the per-stage p50 latencies <StageRail>'s hover readout and the live rail's
// `stagePhase` use (dashboard §2.4's `progress` contract: "expectedSeconds comes from GET
// /v1/cost per-stage p50, falling back to a constants file" — there is no built `/cost` route
// in this beta (plan A3), so the recorded corpus IS that fallback, for every run, live or
// fixture). Everything else — the actual run data — is read live, client-side, by <RunView>.
import type { Metadata } from "next";
import { Suspense } from "react";
import { RunView } from "@/components/routes/run/RunView";
import { getCostSummary } from "@/lib/fixtures";
import type { Stage } from "@/lib/contracts";

export const metadata: Metadata = { title: "Run" };

function expectedMsFromCostSummary(): Partial<Record<Stage, number>> {
  const summary = getCostSummary();
  return Object.fromEntries(summary.per_stage.map((s) => [s.stage, s.p50_s * 1000]));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const expectedMs = expectedMsFromCostSummary();
  return (
    <Suspense fallback={<section className="px-4 py-12 md:px-8" aria-hidden="true" />}>
      <RunView id={id} expectedMs={expectedMs} />
    </Suspense>
  );
}
