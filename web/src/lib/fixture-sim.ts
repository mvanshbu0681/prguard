// OWNER: t2a (wave 1).
//
// The simulated live run (plan A5) as pure functions of elapsed time, so the
// resolver only has to supply `now - startedAt` and tests can drive it with
// fake timers. The recorded run is replayed stage by stage from
// live/demo-run.json (durations × time_scale); what each stage reveals follows
// the pipeline in spec §4.1:
//   S1 INGEST resolves head_sha · S2 CONTEXT computes risk_tier ·
//   S4 COORDINATOR emits canonical findings (counts.proposed) ·
//   S6 IDENTITY applies the ledger (counts.suppressed) ·
//   S8 DELIVERY posts and sets the gate (counts.published, counts.blocking).
// A value appears only once the stage that produces it has completed; after
// the last stage the recorded final status file is served verbatim.
import type { ReviewResult, ReviewStatus, RunCounts } from "@/lib/api-types";
import { POLL_INTERVAL_MS, STAGES, type Stage } from "./contracts";
import type { DemoRun } from "./fixture-types";

/** Stage length used ONLY while live/demo-run.json is still a stub, so the
 *  lifecycle can be exercised before t2b's corpus lands. Labels stay null. */
export const STUB_STAGE_MS = 2000;

export interface SimStage {
  key: Stage;
  /** Already multiplied by time_scale. */
  durationMs: number;
  label: string | null;
}

export interface SimTiming {
  stages: SimStage[];
  heartbeatIntervalMs: number;
  /** "stub" while live/demo-run.json has not been generated. */
  source: "fixture" | "stub";
}

export function simTiming(run: DemoRun | null): SimTiming {
  if (!run) {
    return {
      stages: STAGES.map((key) => ({ key, durationMs: STUB_STAGE_MS, label: null })),
      heartbeatIntervalMs: POLL_INTERVAL_MS,
      source: "stub",
    };
  }
  const scale = Number.isFinite(run.time_scale) && run.time_scale > 0 ? run.time_scale : 1;
  const byKey = new Map(run.stages.map((s) => [s.key, s]));
  return {
    // Always the nine STAGES in canonical order, whatever order the file uses.
    stages: STAGES.map((key) => {
      const s = byKey.get(key);
      return { key, durationMs: Math.max(1, Math.round((s?.duration_ms ?? STUB_STAGE_MS) * scale)), label: s?.label ?? null };
    }),
    heartbeatIntervalMs: run.heartbeat_interval_ms > 0 ? run.heartbeat_interval_ms : POLL_INTERVAL_MS,
    source: "fixture",
  };
}

export interface SimFrame {
  phase: "running" | "done";
  /** 1-based, like GET /v1/reviews/{id} → stage_index. */
  stageIndex: number;
  stage: Stage;
  label: string | null;
  secondsSinceHeartbeat: number;
  elapsedMs: number;
  /** Time until the run's last stage ends. */
  totalMs: number;
  /** Heartbeat frozen by ?stall. */
  stalled: boolean;
}

export interface SimFrameOptions {
  /** The last stage the recorded run reaches (a failed run stops early). Default 9. */
  lastStage?: number;
  /** Freeze the heartbeat once this stage starts (?stall). */
  stallAtStage?: number | null;
}

function clampStage(n: number, max: number): number {
  return Math.min(Math.max(Math.trunc(n), 1), max);
}

export function simFrame(timing: SimTiming, elapsedMs: number, options: SimFrameOptions = {}): SimFrame {
  const count = timing.stages.length;
  const lastStage = clampStage(options.lastStage ?? count, count);
  const starts: number[] = [];
  let acc = 0;
  for (const s of timing.stages) {
    starts.push(acc);
    acc += s.durationMs;
  }
  const endOf = (i: number) => starts[i]! + timing.stages[i]!.durationMs;
  const totalMs = endOf(lastStage - 1);
  const e = Math.max(0, elapsedMs);
  const frameAt = (i: number, phase: SimFrame["phase"], secondsSinceHeartbeat: number, stalled: boolean): SimFrame => ({
    phase,
    stageIndex: i + 1,
    stage: timing.stages[i]!.key,
    label: timing.stages[i]!.label,
    secondsSinceHeartbeat,
    elapsedMs: e,
    totalMs,
    stalled,
  });

  if (options.stallAtStage != null) {
    const s = clampStage(options.stallAtStage, lastStage) - 1;
    // The worker stops heart-beating when stage s starts; the run never advances.
    if (e >= starts[s]!) return frameAt(s, "running", Math.floor((e - starts[s]!) / 1000), true);
  }
  if (e >= totalMs) return frameAt(lastStage - 1, "done", 0, false);
  let i = 0;
  while (i < lastStage - 1 && e >= endOf(i)) i++;
  // One heartbeat per interval since the run started: the age resets every tick.
  return frameAt(i, "running", Math.floor((e % timing.heartbeatIntervalMs) / 1000), false);
}

function iso(ms: number): string {
  // Whole seconds, like the spec's examples; this is also what makes the
  // canonical form of created_at unambiguous (plan A8).
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");
}

export const toIsoSeconds = iso;

function revealCounts(final: RunCounts | undefined, stageIndex: number): RunCounts {
  const done = (stage: number) => stageIndex > stage;
  return {
    proposed: done(4) ? (final?.proposed ?? 0) : 0,
    suppressed: done(6) ? (final?.suppressed ?? 0) : 0,
    published: done(8) ? (final?.published ?? 0) : 0,
    blocking: done(8) ? (final?.blocking ?? 0) : 0,
  };
}

/**
 * GET /v1/reviews/{id} for a simulated run at `frame`.
 * `final` is the recorded status file (null while it is a stub).
 */
export function simStatus(reviewId: string, frame: SimFrame, startedAt: number, final: ReviewStatus | null): ReviewStatus {
  if (frame.phase === "done") {
    if (final) return final;
    // Stub corpus: a terminal state that says what it is.
    return {
      review_id: reviewId,
      status: "succeeded",
      stage: frame.stage,
      stage_index: frame.stageIndex,
      stage_total: STAGES.length,
      stage_label: frame.label,
      seconds_since_heartbeat: 0,
      risk_tier: null,
      head_sha: null,
      degradations: ["fixture_stub"],
      counts: { proposed: 0, published: 0, suppressed: 0, blocking: 0 },
      started_at: iso(startedAt),
      finished_at: iso(startedAt + frame.totalMs),
      error: null,
    };
  }
  const i = frame.stageIndex;
  return {
    review_id: reviewId,
    status: "running",
    stage: frame.stage,
    stage_index: i,
    stage_total: STAGES.length,
    stage_label: frame.label,
    seconds_since_heartbeat: frame.secondsSinceHeartbeat,
    risk_tier: i > 2 ? (final?.risk_tier ?? null) : null,
    head_sha: i > 1 ? (final?.head_sha ?? null) : null,
    degradations: [],
    counts: revealCounts(final?.counts, i),
    started_at: iso(startedAt),
    finished_at: null,
    error: null,
  };
}

/**
 * GET /v1/reviews/{id}/result?partial=true while the simulated run is live:
 * only what exists before the run ends. No findings (their recorded statuses are
 * the final ones), no gate, no delivery, no cost.
 */
export function simPartialResult(final: ReviewResult, frame: SimFrame, startedAt: number): ReviewResult {
  const counts = revealCounts(final.counts, frame.stageIndex);
  return {
    review_id: final.review_id,
    status: "running",
    repository: final.repository,
    pull_request: final.pull_request,
    risk_tier: frame.stageIndex > 2 ? (final.risk_tier ?? null) : null,
    ...(frame.stageIndex > 2 && final.context ? { context: final.context } : {}),
    gate: null,
    delivery: null,
    counts: { ...counts, dropped: 0, disproven: 0 },
    timing: { queued_at: iso(startedAt), started_at: iso(startedAt), finished_at: null, duration_seconds: null },
    degradations: [],
    findings: [],
    review_payload: null,
    audit_url: final.audit_url,
  };
}
