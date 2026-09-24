// OWNER: m4 (wave 3). Pure logic behind section 06's S3 fork copy — how many
// findings each of the four specialist lanes proposed in the demo run
// (Finding.specialist, plan A7: real counts stand in for the per-lane latency
// the fixture corpus does not carry — CostSummary has no per-lane timing, only
// the specialists STAGE's own aggregate p50/p95).
import { FORK_LANES, type ForkLaneKey } from "@/lib/pipeline-geometry";
import type { Finding } from "@/lib/api-types";

/** One count per lane, FORK_LANES order — a lane no finding named still prints 0, not absent. */
export function specialistCounts(findings: readonly Finding[]): Record<ForkLaneKey, number> {
  const counts = Object.fromEntries(FORK_LANES.map((lane) => [lane, 0])) as Record<ForkLaneKey, number>;
  for (const f of findings) {
    if ((FORK_LANES as readonly string[]).includes(f.specialist ?? "")) {
      counts[f.specialist as ForkLaneKey] += 1;
    }
  }
  return counts;
}
