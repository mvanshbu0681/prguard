// OWNER: t7 (wave 2). Pure state, no React: mapping a polled ReviewStatus onto the nine
// StageState values <StageRail mode="live"> renders (dashboard §2.4, §5.1), and the
// concurrency accounting motion spec §4.7's "<= 6 paths animating simultaneously" cap needs.
import { HEARTBEAT } from "@/motion/tokens";
import { STAGES, type Stage, type StageState } from "@/lib/contracts";
import { FORK_LANES } from "@/lib/pipeline-geometry";

export interface StageEntry {
  readonly key: Stage;
  readonly state: StageState;
  /** ms is carried through from the caller (replay/static); the live mapper does not invent one. */
  readonly ms?: number;
}

/**
 * The slice of ReviewStatus (spec §6.2) this mapper reads. Kept narrow and structural
 * (not `import type { ReviewStatus }`) so a unit test can hand it a plain object without
 * constructing every other field the generated type carries.
 */
export interface ReviewStatusLike {
  readonly status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  readonly stage_index?: number | null;
  readonly stage_total?: number | null;
  readonly seconds_since_heartbeat?: number | null;
}

const STALE_AFTER_S = HEARTBEAT.staleAfterMs / 1000;

/**
 * Nine StageState values from one polled status. `stage_index` is 1-based (spec §6.2), so
 * STAGES[stage_index - 1] is the current stage.
 *
 *   queued              every stage pending (stage_index is 0/null before the run starts)
 *   running, on time    stages before stage_index: done · stage_index: running · after: pending
 *   running, stale      as above, but stage_index reads `degraded` once
 *                       seconds_since_heartbeat exceeds HEARTBEAT.staleAfterMs (20s, §4.9.3) —
 *                       the run has not failed, its telemetry has just gone quiet
 *   succeeded           every stage done, regardless of what stage_index last reported
 *   failed · cancelled  stages before stage_index: done · stage_index: failed · after: pending
 *                       (cancelled has no state of its own — the rail reads the same "a
 *                       terminal problem, at this stage" whether a human or the run itself
 *                       stopped it; the gate block elsewhere is what names the difference)
 */
export function stageStatesFromReviewStatus(status: ReviewStatusLike): StageEntry[] {
  const total = status.stage_total && status.stage_total > 0 ? status.stage_total : STAGES.length;
  const current = status.stage_index ?? 0; // 0: not yet reached stage 1

  if (status.status === "succeeded") return STAGES.map((key) => ({ key, state: "done" as const }));

  const terminalFailure = status.status === "failed" || status.status === "cancelled";
  const stale = (status.seconds_since_heartbeat ?? 0) > STALE_AFTER_S;

  return STAGES.map((key, i) => {
    const idx1 = i + 1;
    if (idx1 > total) return { key, state: "pending" as const }; // beyond a shorter reported total
    if (idx1 < current) return { key, state: "done" as const };
    if (idx1 > current) return { key, state: "pending" as const };
    // idx1 === current: the run's present stage.
    if (current === 0) return { key, state: "pending" as const }; // queued, nothing reached yet
    if (terminalFailure) return { key, state: "failed" as const };
    return { key, state: stale ? ("degraded" as const) : ("running" as const) };
  });
}

/**
 * How many edges are animating `stroke-dashoffset` at once for `states` — the fork's four
 * lanes count individually because each lane is its own `<path>`, so the four genuinely
 * paint in parallel; every other connector is one path driven by its target stage. Motion
 * spec §4.7's ceiling is 6; a single current stage (the mapper above's whole contract) can
 * only ever be a plain stage (1 animated edge) or `specialists` (4), so this stays well
 * under the cap by construction — the test asserts that, rather than trusting the arithmetic.
 */
export function animatedEdgeCount(states: readonly Pick<StageEntry, "key" | "state">[]): number {
  let count = 0;
  for (const { key, state } of states) {
    if (state !== "running" && state !== "degraded") continue;
    count += key === "specialists" ? FORK_LANES.length : 1;
  }
  return count;
}
