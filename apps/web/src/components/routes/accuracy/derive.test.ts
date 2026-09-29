// The copy /accuracy writes about its numbers is derived, so test it against
// the corpus it will actually render.
import { describe, expect, it } from "vitest";
import report from "@fixtures/accuracy/report.json";
import series from "@fixtures/accuracy/series.json";
import type { AccuracySeriesExt } from "@/components/charts";
import type { AccuracyReport } from "@/lib/api-types";
import { calibrationPoints, calibrationReading, dismissalRows, duration, headline, niceScale, proxy } from "./derive";

const R = report as unknown as AccuracyReport;
const S = series as unknown as AccuracySeriesExt;

describe("proxies", () => {
  it("recover the integer counts behind each rate", () => {
    expect(proxy(R.precision_proxies.self_caught_false_positive_rate)).toMatchObject({ k: 5, n: 42 });
    expect(proxy(R.precision_proxies.human_dismissal_rate)).toMatchObject({ k: 16, n: 105 });
    expect(proxy(R.precision_proxies.addressed_rate)).toMatchObject({ k: 14, n: 31 });
  });

  it("carry a Wilson interval that contains the rate", () => {
    const p = proxy(R.precision_proxies.execution_verified_precision);
    expect(p.ci!.low).toBeCloseTo(0.867, 3);
    expect(p.ci!.high).toBe(1);
  });

  it("say no data rather than inventing a zero", () => {
    expect(proxy({ value: null, n: 0, definition: "" })).toMatchObject({ value: null, ci: null });
  });
});

describe("copy", () => {
  it("headline is counts, not adjectives", () => {
    expect(headline(R)).toEqual({ title: "26 bugs proven by execution,", soft: "and 5 of its own claims refuted first." });
  });

  it("calibration reading pools the bands and states the sample-size caveat", () => {
    const { points, empty } = calibrationPoints(S);
    expect(empty).toEqual(["info"]);
    const [verdict, caveat] = calibrationReading(points);
    expect(verdict).toContain("Critical and high: 10 of 13 addressed (77%)");
    expect(verdict).toContain("Medium and low: 4 of 18 (22%)");
    expect(caveat).toContain("No band has more than 15 findings");
  });

  it("dismissal rows sort by rate, highest first", () => {
    expect(dismissalRows(S).map((r) => r.category)).toEqual(["performance", "maintainability", "security", "correctness", "test_integrity"]);
  });

  it("median review keeps its decimal", () => {
    expect(duration(28.707)).toBe("28.7s");
  });

  it("axis maxima are clean", () => {
    expect(niceScale(30)).toEqual({ max: 30, step: 10 });
    expect(niceScale(31)).toEqual({ max: 40, step: 10 });
  });
});
