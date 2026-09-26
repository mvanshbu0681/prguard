// OWNER: t1c (wave 1). The pure logic behind the chips: 3-decimal scores, bands, labels.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { NO_SCORE, SEVERITY_BANDS, bandForScore, bandRank, chipLabel, formatScore } from "@/components/badges";
import { SEVERITY_THRESHOLDS } from "@/lib/contracts";

describe("formatScore — brand-gaps §D: 3 decimals, always", () => {
  it("pads and rounds to exactly three decimals", () => {
    expect(formatScore(0.81)).toBe("0.810");
    expect(formatScore(0)).toBe("0.000");
    expect(formatScore(1)).toBe("1.000");
    expect(formatScore(0.75)).toBe("0.750");
    expect(formatScore(0.1234)).toBe("0.123");
  });

  it("never prints a negative zero", () => {
    expect(formatScore(-0)).toBe("0.000");
    expect(formatScore(-0.0001)).toBe("0.000");
  });

  it("prints a dash, never an invented 0.000, when there is no number", () => {
    expect(formatScore(Number.NaN)).toBe(NO_SCORE);
    expect(formatScore(Number.POSITIVE_INFINITY)).toBe(NO_SCORE);
  });

  it("has three decimals for every finite input (property)", () => {
    fc.assert(
      fc.property(fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }), (v) => {
        expect(formatScore(v)).toMatch(/^-?\d+\.\d{3}$/);
      }),
    );
  });

  it("prints a score outside 0..1 as received, so a backend defect looks like one", () => {
    expect(formatScore(1.2)).toBe("1.200");
  });
});

describe("bands", () => {
  it("ranks info 1 … critical 5 (the meter's fill count)", () => {
    expect(SEVERITY_BANDS.map(bandRank)).toEqual([1, 2, 3, 4, 5]);
    expect(bandRank("critical")).toBe(5);
    expect(bandRank("info")).toBe(1);
  });

  it("uses the frozen thresholds with ≥ semantics", () => {
    const { low, medium, high, critical } = SEVERITY_THRESHOLDS;
    expect(bandForScore(0)).toBe("info");
    expect(bandForScore(low - 0.001)).toBe("info");
    expect(bandForScore(low)).toBe("low");
    expect(bandForScore(medium - 0.001)).toBe("low");
    expect(bandForScore(medium)).toBe("medium");
    expect(bandForScore(high - 0.001)).toBe("medium");
    expect(bandForScore(high)).toBe("high");
    expect(bandForScore(critical - 0.001)).toBe("high");
    expect(bandForScore(critical)).toBe("critical");
    expect(bandForScore(0.81)).toBe("critical");
  });
});

describe("chipLabel — a state is its value, in mono caps", () => {
  it("upper-cases and replaces underscores", () => {
    expect(chipLabel("proven")).toBe("PROVEN");
    expect(chipLabel("not_attempted")).toBe("NOT ATTEMPTED");
    expect(chipLabel("skipped_no_env")).toBe("SKIPPED NO ENV");
    expect(chipLabel("inline_nearest")).toBe("INLINE NEAREST");
  });
});
