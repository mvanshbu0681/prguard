// OWNER: m4 (wave 3). Section 05's band legend must never drift from
// SEVERITY_THRESHOLDS — this is the test that would catch it doing so.
import { describe, expect, it } from "vitest";
import { bandLegend, bandLegendText } from "@/components/sections/instrument/band-legend";
import { SEVERITY_BANDS, SEVERITY_THRESHOLDS } from "@/lib/contracts";

describe("bandLegend", () => {
  it("has five entries in SEVERITY_BANDS order", () => {
    const entries = bandLegend();
    expect(entries.map((e) => e.band)).toEqual([...SEVERITY_BANDS]);
  });

  it("gives info a strict '<' and every other band a '≥'", () => {
    const [info, ...rest] = bandLegend();
    expect(info.op).toBe("<");
    expect(rest.every((e) => e.op === "≥")).toBe(true);
  });

  it("reads every threshold from SEVERITY_THRESHOLDS, never a typed literal", () => {
    const entries = bandLegend();
    const byBand = Object.fromEntries(entries.map((e) => [e.band, e.value]));
    expect(byBand.info).toBe(SEVERITY_THRESHOLDS.low);
    expect(byBand.low).toBe(SEVERITY_THRESHOLDS.low);
    expect(byBand.medium).toBe(SEVERITY_THRESHOLDS.medium);
    expect(byBand.high).toBe(SEVERITY_THRESHOLDS.high);
    expect(byBand.critical).toBe(SEVERITY_THRESHOLDS.critical);
  });

  it("renders the blueprint's exact grammar", () => {
    expect(bandLegendText(" | ")).toBe("info < 0.15 | low ≥ 0.15 | medium ≥ 0.35 | high ≥ 0.55 | critical ≥ 0.75");
  });

  it("would move if SEVERITY_THRESHOLDS changed — a regression guard, not a duplicate constant", () => {
    // The legend is generated, not typed: this asserts the CURRENT frozen thresholds
    // print correctly, so a future edit to contracts.ts is caught here rather than by
    // a visitor doing arithmetic by hand on a stale mobile screenshot.
    expect(SEVERITY_THRESHOLDS).toEqual({ low: 0.15, medium: 0.35, high: 0.55, critical: 0.75 });
  });
});
