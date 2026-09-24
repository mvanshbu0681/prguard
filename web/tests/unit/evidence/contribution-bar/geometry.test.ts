// @vitest-environment node
// OWNER: t5 (wave 2). The pure arithmetic behind <ContributionBar> (dashboard
// blueprint §3a). No React, no DOM — see contribution-bar.test.tsx for the
// rendered component.
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

// Next implements `import "server-only"` in its compiler; vitest has no such module
// (same pattern as tests/unit/data/fixtures-on-disk.test.ts).
vi.mock("server-only", () => ({}));
import { getDemoDisprovenFinding, getDemoProvenFinding, getFindings } from "@/lib/fixtures";
import { SEVERITY_INPUTS, SEVERITY_THRESHOLDS } from "@/lib/contracts";
import {
  bandRuleText,
  contributionRows,
  explanationClauses,
  phraseFor,
  promotedTick,
  rawSegmentWidthPx,
  readoutSnapMs,
  segmentSchedule,
  sumContributions,
  TICKS,
  type SeverityValues,
} from "@/components/evidence/ContributionBar";

const inputName = fc.constantFrom(...SEVERITY_INPUTS);
const unit = fc.double({ min: 0, max: 1, noNaN: true });

function randomValues(): fc.Arbitrary<SeverityValues> {
  return fc
    .tuple(...SEVERITY_INPUTS.map(() => unit))
    .map((values) => Object.fromEntries(SEVERITY_INPUTS.map((name, i) => [name, values[i]])) as SeverityValues);
}

// The frozen weight table (plan §5 / severity.py DEFAULT_SEVERITY_WEIGHTS), sums to 1.0.
const WEIGHTS: SeverityValues = {
  path_sensitivity: 0.25,
  reachability: 0.2,
  blast_radius: 0.15,
  coverage_gap: 0.15,
  proof_confidence: 0.15,
  churn: 0.1,
};

describe("contributionRows", () => {
  it("is always in SEVERITY_INPUTS' fixed order, never sorted by value or contribution", () => {
    fc.assert(
      fc.property(randomValues(), (inputs) => {
        const rows = contributionRows(inputs, WEIGHTS);
        expect(rows.map((r) => r.name)).toEqual([...SEVERITY_INPUTS]);
      }),
      { numRuns: 500 },
    );
  });

  it("clamps out-of-range inputs to [0, 1] (severity.py's own `_clamp`)", () => {
    const rows = contributionRows({ ...WEIGHTS, path_sensitivity: 5, churn: -3 } as SeverityValues, WEIGHTS);
    expect(rows.find((r) => r.name === "path_sensitivity")!.raw).toBe(1);
    expect(rows.find((r) => r.name === "churn")!.raw).toBe(0);
  });
});

describe("segment widths sum to score × width (the arithmetic a judge can check by eye)", () => {
  it("the un-floored segment widths sum to score × trackWidth, within 1px, across 500 random inputs", () => {
    fc.assert(
      fc.property(randomValues(), fc.integer({ min: 64, max: 1280 }), (inputs, trackWidthPx) => {
        const rows = contributionRows(inputs, WEIGHTS);
        const score = sumContributions(rows);
        const totalWidthPx = rows.reduce((sum, row) => sum + rawSegmentWidthPx(row, trackWidthPx), 0);
        expect(Math.abs(totalWidthPx - score * trackWidthPx)).toBeLessThanOrEqual(1);
      }),
      { numRuns: 500 },
    );
  });

  it("the demo proven finding (0.810, critical) sums to its own score within 0.0005", () => {
    const finding = getDemoProvenFinding();
    const severity = finding.severity!;
    const rows = contributionRows(severity.inputs as unknown as SeverityValues, severity.weights as SeverityValues);
    expect(Math.abs(sumContributions(rows) - severity.score)).toBeLessThan(0.0005);
  });

  it("every finding in the fixture corpus with a severity sums within 0.0005 of its own score", () => {
    for (const finding of getFindings()) {
      if (!finding.severity) continue;
      const rows = contributionRows(finding.severity.inputs as unknown as SeverityValues, finding.severity.weights as SeverityValues);
      expect(Math.abs(sumContributions(rows) - finding.severity.score)).toBeLessThan(0.0005);
    }
  });
});

describe("promotedTick — the move that answers \"why critical and not high?\"", () => {
  it("promotes the highest threshold at or below the score, and none below .15", () => {
    expect(promotedTick(0)).toBeNull();
    expect(promotedTick(0.149)).toBeNull();
    expect(promotedTick(0.15)).toBe("low");
    expect(promotedTick(0.349)).toBe("low");
    expect(promotedTick(0.35)).toBe("medium");
    expect(promotedTick(0.549)).toBe("medium");
    expect(promotedTick(0.55)).toBe("high");
    expect(promotedTick(0.749)).toBe("high");
    expect(promotedTick(0.75)).toBe("critical");
    expect(promotedTick(1)).toBe("critical");
  });

  it("agrees with SEVERITY_THRESHOLDS for every tick key, by construction", () => {
    for (const key of TICKS) {
      expect(promotedTick(SEVERITY_THRESHOLDS[key])).toBe(key);
    }
  });

  it("the demo proven finding (0.810) promotes exactly the critical tick", () => {
    const finding = getDemoProvenFinding();
    expect(promotedTick(finding.severity!.score)).toBe("critical");
  });
});

describe("bandRuleText — the Σ row's rule", () => {
  it("prints the crossed threshold to 3 decimals for every non-info band", () => {
    expect(bandRuleText("critical")).toBe("≥ 0.750 → critical");
    expect(bandRuleText("high")).toBe("≥ 0.550 → high");
    expect(bandRuleText("medium")).toBe("≥ 0.350 → medium");
    expect(bandRuleText("low")).toBe("≥ 0.150 → low");
  });

  it("prints the floor for info", () => {
    expect(bandRuleText("info")).toBe("< 0.150 → info");
  });
});

describe("explanationClauses — matching severity.py's explain()/_phrase() by text", () => {
  it("splits on ' × ' and matches every clause of the demo proven finding to its input", () => {
    const finding = getDemoProvenFinding();
    const severity = finding.severity!;
    const rows = contributionRows(severity.inputs as unknown as SeverityValues, severity.weights as SeverityValues);
    const clauses = explanationClauses(severity.explanation, rows);
    expect(clauses.length).toBeGreaterThan(0);
    for (const clause of clauses) expect(clause.input).not.toBeNull();
    // severity.py's explain() omits any input whose measured value is 0 — proof_confidence
    // is excluded from the disproven finding's sentence (churn/etc still contribute there).
  });

  it("the disproven finding's proof_confidence (0.0) is excluded from its own explanation, so no clause claims it", () => {
    const finding = getDemoDisprovenFinding();
    const severity = finding.severity!;
    const rows = contributionRows(severity.inputs as unknown as SeverityValues, severity.weights as SeverityValues);
    expect(rows.find((r) => r.name === "proof_confidence")!.contribution).toBe(0);
    const clauses = explanationClauses(severity.explanation, rows);
    expect(clauses.some((c) => c.input === "proof_confidence")).toBe(false);
  });

  it("phraseFor mirrors severity.py's _phrase() thresholds (>= 1.0, not > 0)", () => {
    expect(phraseFor("reachability", 1)).toBe("reachable from a public entrypoint");
    expect(phraseFor("reachability", 0.5)).toBe("reachable internally");
    expect(phraseFor("path_sensitivity", 1)).toBe("sensitive path");
    expect(phraseFor("path_sensitivity", 0.9)).toBe("infrastructure path");
    expect(phraseFor("coverage_gap", 1)).toBe("untested");
    expect(phraseFor("coverage_gap", 0.5)).toBe("file tested, symbol not");
    expect(phraseFor("proof_confidence", 1)).toBe("proven");
    expect(phraseFor("proof_confidence", 0)).toBe("unproven");
    expect(phraseFor("blast_radius", 0.7)).toBe("blast radius 0.70");
    expect(phraseFor("churn", 0.3)).toBe("churn 0.30");
  });

  it("returns an empty list when there is no explanation to match against", () => {
    expect(explanationClauses(undefined, [])).toEqual([]);
  });
});

describe("segmentSchedule / readoutSnapMs — the 420ms entrance (brand-gaps §2 rulings 4, 7)", () => {
  it("six segments, 60ms apart, the last finishing at exactly 420ms", () => {
    const schedule = segmentSchedule(6, 420, 60);
    expect(schedule.map((s) => s.startMs)).toEqual([0, 60, 120, 180, 240, 300]);
    expect(schedule.every((s) => s.durationMs === 120)).toBe(true);
    expect(schedule.at(-1)!.endMs).toBe(420);
  });

  it("readoutSnapMs falls back to the schedule's own end when no tick is crossed (info band)", () => {
    const rows = contributionRows({ path_sensitivity: 0, reachability: 0, blast_radius: 0, coverage_gap: 0, proof_confidence: 0, churn: 0 }, WEIGHTS);
    const schedule = segmentSchedule(6, 420, 60);
    expect(readoutSnapMs(rows, 0, schedule)).toBe(420);
  });

  it("readoutSnapMs lands on the segment whose growth carries the cumulative front across the promoted tick", () => {
    // path_sensitivity(.25) + reachability(.20) = .45 >= .35 (medium) after segment index 1 (reachability).
    const rows = contributionRows({ path_sensitivity: 1, reachability: 1, blast_radius: 0, coverage_gap: 0, proof_confidence: 0, churn: 0 }, WEIGHTS);
    const score = sumContributions(rows);
    expect(promotedTick(score)).toBe("medium");
    const schedule = segmentSchedule(6, 420, 60);
    expect(readoutSnapMs(rows, score, schedule)).toBe(schedule[1].endMs);
  });
});
