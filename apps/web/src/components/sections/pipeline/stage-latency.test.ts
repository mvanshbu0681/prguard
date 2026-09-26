import { describe, expect, it } from "vitest";
import type { CostSummary } from "@/lib/api-types";
import { STAGES } from "@/lib/contracts";
import { formatLatency, stageLatencies } from "./stage-latency";

function costSummary(perStage: CostSummary["per_stage"]): CostSummary {
  return {
    window: { since: null, until: null },
    per_stage: perStage,
    cost_histogram: [],
    cost_p50_usd: 0,
    cost_p95_usd: 0,
    cache_hit: [],
  };
}

describe("stageLatencies", () => {
  it("has nine rows in STAGES order, regardless of the summary's own row order", () => {
    const summary = costSummary([
      { stage: "proof", p50_s: 0.242, p95_s: 10.012 },
      { stage: "ingest", p50_s: 1.577, p95_s: 2.267 },
    ]);
    const rows = stageLatencies(summary);
    expect(rows.map((r) => r.stage)).toEqual([...STAGES]);
  });

  it("reads p50/p95 straight from the summary, never a typed literal", () => {
    const summary = costSummary([{ stage: "specialists", p50_s: 14.231, p95_s: 18.924 }]);
    const row = stageLatencies(summary).find((r) => r.stage === "specialists");
    expect(row?.p50).toBe(14.231);
    expect(row?.p95).toBe(18.924);
  });

  it("leaves a stage missing from the summary undefined, not a fabricated zero", () => {
    const summary = costSummary([{ stage: "ingest", p50_s: 1.577, p95_s: 2.267 }]);
    const row = stageLatencies(summary).find((r) => r.stage === "proof");
    expect(row?.p50).toBeUndefined();
    expect(row?.p95).toBeUndefined();
  });
});

describe("formatLatency", () => {
  it("formats to 1 decimal plus the unit (brand-gaps §D)", () => {
    expect(formatLatency(14.231)).toBe("14.2s");
    expect(formatLatency(0.085)).toBe("0.1s");
    expect(formatLatency(10.012)).toBe("10.0s");
  });

  it("prints an em dash for a missing value, never 0.0s", () => {
    expect(formatLatency(undefined)).toBe("—");
    expect(formatLatency(Number.NaN)).toBe("—");
  });
});
