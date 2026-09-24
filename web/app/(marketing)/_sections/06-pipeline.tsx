// OWNER: m4 (wave 3). Section 06 of 9 (plan T8) — THE PIPELINE, nine stages
// (landing blueprint §06; dashboard blueprint §2.4, §5.1; plan §13 A4). Job:
// prove there is a real architecture — that the specialists stage genuinely
// runs four passes at once, and that delivery degrades gracefully instead of
// silently dropping findings.
//
// Plan A4: the scroll-jacked pin is CUT. This is a normal section: it renders
// its complete geometry at first paint (server HTML, <StageRail mode="replay">
// rest frame = every stage done), autoplays once on first viewport entry via
// useSequence's own IntersectionObserver, and carries the visible ▶ PLAY
// control plus per-stage hover — all built into <StageRail> (wave 2, composed,
// never rebuilt). Orientation switches at 768px: horizontal above, the vertical
// spine below (two instances, CSS-toggled — the same technique <StageRail>'s
// own wide/medium switch uses one level down).
//
// A server component: every number — the nine stages' own recorded durations,
// their labels, the per-stage p50/p95 latencies, the delivery ladder's counts,
// which gate rung fired — is read here with the server-only fixture loaders
// and passed down as props (plan A7: nothing on this page is typed).
import type { CSSProperties } from "react";
import { Grain, SectionIndex } from "@/components/chrome";
import { StageRail, type StageEntry } from "@/components/evidence/StageRail";
import { DeliveryLadder } from "@/components/sections/pipeline/DeliveryLadder";
import { GateLadder } from "@/components/sections/pipeline/GateLadder";
import { specialistCounts } from "@/components/sections/pipeline/specialist-counts";
import { StageLatencyCaption } from "@/components/sections/pipeline/StageLatencyCaption";
import { formatLatency, stageLatencies } from "@/components/sections/pipeline/stage-latency";
import { getCostSummary, getDemoResult, getDemoRun } from "@/lib/fixtures";
import { STAGES, type Stage } from "@/lib/contracts";
import { FORK_LANES } from "@/lib/pipeline-geometry";
import { ANIM_PROPS, REVEAL_INDEX_VAR } from "@/motion/attrs";

const ALL_DONE: StageEntry[] = STAGES.map((key) => ({ key, state: "done" as const }));

export function Pipeline() {
  const demoRun = getDemoRun();
  const costSummary = getCostSummary();
  const demoResult = getDemoResult();

  const durationsMs: Partial<Record<Stage, number>> = Object.fromEntries(demoRun.stages.map((s) => [s.key, s.duration_ms * demoRun.time_scale]));
  const stageLabels: Partial<Record<Stage, string>> = Object.fromEntries(demoRun.stages.map((s) => [s.key, s.label]));
  const expectedMs: Partial<Record<Stage, number>> = Object.fromEntries(costSummary.per_stage.map((s) => [s.stage, s.p50_s * 1000]));
  const specialistsLatency = stageLatencies(costSummary).find((r) => r.stage === "specialists");

  const gate = demoResult.gate;
  const findings = demoResult.findings ?? [];
  const counts = demoResult.counts;
  const reviewIdShort = demoRun.review_id.slice(0, 7);
  const capturedAt = demoResult.timing?.finished_at ?? undefined;
  const provenance = `GET /v1/reviews/${reviewIdShort} → stage_index · stage_total · stage_label · heartbeat`;
  const lanes = specialistCounts(findings);

  return (
    <section id="pipeline" className="relative isolate border-b border-rule-hair px-4 py-(--space-section) md:px-8">
      <Grain />
      <div className="relative mx-auto max-w-[1200px]">
        {/* Section index grammar: "/ 06 — THE PIPELINE" (marketing-shell's
            MARKETING_SECTIONS, t8a, wave 3 — the nav's own category for this id).
            The two <StageRail> Exhibits below print their own, narrower category,
            "NINE STAGES" — the section describes the belief it changes, the
            exhibit describes the evidence. */}
        <SectionIndex index="06" category="THE PIPELINE" />

        <div {...ANIM_PROPS} className="reveal reveal-rise mt-6 max-w-(--measure-body)">
          <h2 className="type-display-h2 text-text-primary">Nine stages. One comment.</h2>
          <p className="mt-5 type-lead text-text-body">
            Driven by the demo run&rsquo;s own recorded timings, replayed at real proportions. Wall clock at the specialists
            stage is the slowest of the four lanes running inside it, never their sum.
          </p>
        </div>

        <p className="mt-6 type-label text-text-dim">
          {STAGES.map((key, i) => (
            <span key={key} className="whitespace-nowrap">
              {i > 0 ? <span aria-hidden="true"> &middot; </span> : null}
              {`S${i + 1} ${key}`}
            </span>
          ))}
        </p>

        <div className="mt-10">
          <div className="hidden md:block">
            <StageRail
              mode="replay"
              orientation="horizontal"
              stages={ALL_DONE}
              durationsMs={durationsMs}
              stageLabels={stageLabels}
              expectedMs={expectedMs}
              gate={gate?.conclusion}
              index="06"
              category="NINE STAGES"
              identifier={`run ${reviewIdShort}`}
              provenance={provenance}
              capturedAt={capturedAt}
              ext
            />
          </div>
          <div className="mx-auto max-w-[420px] md:hidden">
            <StageRail
              mode="replay"
              orientation="vertical"
              stages={ALL_DONE}
              durationsMs={durationsMs}
              stageLabels={stageLabels}
              expectedMs={expectedMs}
              gate={gate?.conclusion}
              index="06"
              category="NINE STAGES"
              identifier={`run ${reviewIdShort}`}
              provenance={provenance}
              capturedAt={capturedAt}
              ext
            />
          </div>
        </div>

        <StageLatencyCaption costSummary={costSummary} className="mt-4" />

        <div className="mt-14 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
          <div {...ANIM_PROPS} className="reveal reveal-rise" style={{ [REVEAL_INDEX_VAR]: 1 } as CSSProperties}>
            <p className="type-label text-text-dim">S3 &middot; the four specialists</p>
            <h3 className="mt-2 type-display-h4 text-text-primary">One diff, four passes, at once.</h3>
            <p className="mt-3 type-body text-text-body">
              The specialists stage forks the review into four lanes that run in parallel &mdash; bugs, security, tests,
              quality &mdash; each reading the same diff and proposing its own findings before the coordinator merges,
              deduplicates and filters them into one review. In the run behind this page:{" "}
              {FORK_LANES.map((lane, i) => (
                <span key={lane} className="tabular">
                  {i > 0 ? ", " : ""}
                  <span className="text-text-primary">{lanes[lane]}</span> from {lane}
                </span>
              ))}
              . Wall clock for the stage is a p50 of{" "}
              <span className="tabular text-text-primary">{formatLatency(specialistsLatency?.p50)}</span> &mdash; the slowest
              lane, not the sum of four.
            </p>
          </div>

          <div {...ANIM_PROPS} className="reveal reveal-rise" style={{ [REVEAL_INDEX_VAR]: 2 } as CSSProperties}>
            <p className="type-label text-text-dim">S7 &middot; the sandbox proof</p>
            <h3 className="mt-2 type-display-h4 text-text-primary">The stage that leaves the analysis.</h3>
            <p className="mt-3 type-body text-text-body">
              Proof is the one stage that touches a sandbox: it writes a repro test for the claim and runs it at the pull
              request&rsquo;s base SHA and head SHA. Only a finding whose repro passes at base and fails at head blocks the
              merge &mdash; in this run,{" "}
              <span className="tabular text-text-primary">{counts?.blocking ?? 0}</span> of{" "}
              <span className="tabular text-text-primary">{counts?.published ?? 0}</span> published findings met that bar, and{" "}
              <span className="tabular text-text-primary">{counts?.disproven ?? 0}</span> more were refuted by their own repro
              and stay on record as disproven, not silently dropped.
            </p>
          </div>
        </div>

        <div {...ANIM_PROPS} className="reveal reveal-rise mt-14 grid grid-cols-1 gap-10 sm:grid-cols-2" style={{ [REVEAL_INDEX_VAR]: 3 } as CSSProperties}>
          <div>
            <p className="type-label text-text-dim">S8 &middot; the delivery ladder</p>
            <p className="mt-2 max-w-(--measure-body) type-small text-text-dim">
              Every published finding falls to the highest rung the diff still supports, never silently.
            </p>
            <DeliveryLadder ladder={demoResult.delivery?.ladder_breakdown} counts={counts} findings={findings} className="mt-4" />
            <p className="mt-3 type-data text-[11px] text-text-dim">GET /v1/reviews/{reviewIdShort}/result &rarr; delivery.ladder_breakdown</p>
          </div>
          <div>
            <p className="type-label text-text-dim">S9 &middot; the gate ladder</p>
            <p className="mt-2 max-w-(--measure-body) type-small text-text-dim">
              The gate resolves once, on the rung the repository is configured to use.
            </p>
            <GateLadder fired={gate?.delivery} className="mt-4" />
            <p className="mt-3 type-data text-[11px] text-text-dim">GET /v1/reviews/{reviewIdShort}/result &rarr; gate.delivery</p>
          </div>
        </div>
      </div>
    </section>
  );
}
