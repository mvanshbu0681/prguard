// OWNER: t7 (wave 2). /lab/t7 — <StageRail>, every mode and breakpoint, driven from the real
// fixture corpus (never a hand-typed number — plan A7, A11). A server component: fixture
// loaders run here and every value StageRail needs is passed down as props (READ FIRST rule).
import type { Metadata } from "next";
import { StageRail } from "@/components/evidence/StageRail";
import type { StageEntry } from "@/components/evidence/StageRail";
import { STAGES, type Stage } from "@/lib/contracts";
import { getCostSummary, getDemoResult, getDemoRun } from "@/lib/fixtures";
import { LiveSim } from "./live-sim";

export const metadata: Metadata = { title: "StageRail (lab)" };

const ALL_DONE: StageEntry[] = STAGES.map((key) => ({ key, state: "done" as const }));

// A representative static snapshot for the vertical breakpoint: three complete, one running,
// the rest still ahead — the shape a reader lands on mid-scroll, not a contrived extreme.
const VERTICAL_STATIC: StageEntry[] = STAGES.map((key, i) => ({
  key,
  state: i < 3 ? "done" : i === 3 ? "running" : "pending",
}));

// A failed run, frozen at S7 — the lab's third state beyond replay's all-done and live's own
// moving target, so every StageState in design §1.11 has a screenshot somewhere on this page.
const FAILED_STATIC: StageEntry[] = STAGES.map((key, i) => ({
  key,
  state: i < 6 ? "done" : i === 6 ? "failed" : "pending",
}));

export default function StageRailLabPage() {
  const demoRun = getDemoRun();
  const demoResult = getDemoResult();
  const costSummary = getCostSummary();

  const durationsMs: Partial<Record<Stage, number>> = Object.fromEntries(
    demoRun.stages.map((s) => [s.key, s.duration_ms * demoRun.time_scale]),
  );
  const stageLabels: Partial<Record<Stage, string>> = Object.fromEntries(demoRun.stages.map((s) => [s.key, s.label]));
  const expectedMs: Partial<Record<Stage, number>> = Object.fromEntries(costSummary.per_stage.map((s) => [s.stage, s.p50_s * 1000]));
  const gate = demoResult.gate?.conclusion;
  const reviewIdShort = demoRun.review_id.slice(0, 7);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-8" data-surface="marketing">
      <header className="pb-10">
        <p className="type-label text-text-dim">/ lab — t7 · stage rail</p>
        <h1 className="mt-3 type-display-h3 text-text-primary md:type-display-h2">StageRail</h1>
        <p className="mt-3 max-w-(--measure-body) type-body text-text-body">
          The nine-stage pipeline: a horizontal replay driven by the demo run&rsquo;s own recorded durations (autoplay on first
          viewport entry, plus a visible PLAY control), the vertical spine at a fixed snapshot, a live simulation standing in
          for polling, and a failed run frozen at the proof stage. Resize to see the wide / medium / vertical geometries switch
          — <code>src/lib/pipeline-geometry.ts</code> is the one file all three come from.
        </p>
      </header>

      <section className="space-y-4 pb-16">
        <h2 className="type-label text-text-dim">replay · horizontal (autoplay in-view, resize below 1280px for medium)</h2>
        <StageRail
          mode="replay"
          orientation="horizontal"
          stages={ALL_DONE}
          durationsMs={durationsMs}
          stageLabels={stageLabels}
          expectedMs={expectedMs}
          gate={gate}
          index="06"
          category="NINE STAGES"
          identifier={`run ${reviewIdShort}`}
          provenance={`fixtures/live/demo-run.json → stages[].duration_ms × time_scale (${demoRun.time_scale})`}
          capturedAt="2026-09-23T12:00:00Z"
          ext
        />
      </section>

      <section className="space-y-4 pb-16">
        <h2 className="type-label text-text-dim">static · vertical (&lt;768px spine, forced here for review)</h2>
        <div className="max-w-[420px]">
          <StageRail
            mode="static"
            orientation="vertical"
            stages={VERTICAL_STATIC}
            stageLabels={stageLabels}
            expectedMs={expectedMs}
            index="06"
            category="NINE STAGES"
            provenance="a fixed snapshot for review — no live source"
          />
        </div>
      </section>

      <section className="space-y-4 pb-16" data-surface="app">
        <h2 className="type-label text-text-dim">live · a local timer standing in for GET /v1/reviews/{`{id}`} polling</h2>
        <LiveSim
          stageLabels={stageLabels}
          expectedMs={expectedMs}
          provenance={`GET /v1/reviews/${reviewIdShort} → stage_index · stage_total · stage_label · heartbeat (simulated)`}
        />
      </section>

      <section className="space-y-4 pb-16">
        <h2 className="type-label text-text-dim">failed · frozen at S7 proof</h2>
        <StageRail
          mode="static"
          orientation="horizontal"
          stages={FAILED_STATIC}
          stageLabels={stageLabels}
          expectedMs={expectedMs}
          gate="failure"
          index="05"
          category="FAILED RUN"
          identifier={`run ${reviewIdShort}`}
          provenance="a fixed snapshot for review — no live source"
        />
      </section>
    </div>
  );
}
