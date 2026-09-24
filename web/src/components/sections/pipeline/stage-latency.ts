// OWNER: m4 (wave 3). Pure logic behind section 06's per-stage latency caption
// (landing blueprint §06: "render the per-stage p50/p95 latencies from the cost
// summary"). Numbers are read straight off CostSummary.per_stage — never typed
// (plan A7) — and formatted to brand-gaps §D's latency style: 1 decimal + unit.
import type { CostSummary } from "@/lib/api-types";
import { STAGES, type Stage } from "@/lib/contracts";

export interface StageLatency {
  stage: Stage;
  p50: number | undefined;
  p95: number | undefined;
}

/** Nine rows, STAGES order — a stage missing from the summary prints no numbers, not an invented 0. */
export function stageLatencies(costSummary: CostSummary): StageLatency[] {
  const byStage = new Map(costSummary.per_stage.map((row) => [row.stage, row]));
  return STAGES.map((stage) => {
    const row = byStage.get(stage);
    return { stage, p50: row?.p50_s, p95: row?.p95_s };
  });
}

/** "14.2s" (1 decimal + unit, brand-gaps §D), or "—" for a missing value — never an invented 0.0s. */
export function formatLatency(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  return `${seconds.toFixed(1)}s`;
}
