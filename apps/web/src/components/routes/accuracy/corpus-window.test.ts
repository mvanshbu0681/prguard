// The windowed self-report is only citable if, with no window, it IS the
// generator's all-time report. These tests pin that, then check a window.
import { describe, expect, it } from "vitest";
import audit from "@fixtures/audit/events.json";
import findings from "@fixtures/findings/index.json";
import report from "@fixtures/accuracy/report.json";
import reviews from "@fixtures/reviews/index.json";
import series from "@fixtures/accuracy/series.json";
import type { AccuracyReport } from "@/lib/api-types";
import { corpusFromFixtures, round3, windowedAccuracy } from "./corpus-window";

const REPORT = report as unknown as AccuracyReport;
const corpus = corpusFromFixtures({
  reviews: (reviews as unknown as { items: never[] }).items,
  findings: (findings as unknown as { items: never[] }).items,
  audit: (audit as unknown as { items: never[] }).items,
  report: REPORT,
});

describe("windowedAccuracy with no window", () => {
  const { report: r, series: s } = windowedAccuracy(corpus, null, null);

  it("reproduces every count and rate in accuracy/report.json", () => {
    expect(r.runs).toEqual(REPORT.runs);
    expect(r.findings).toEqual(REPORT.findings);
    expect(r.proof).toEqual(REPORT.proof);
    expect(r.gate).toEqual(REPORT.gate);
    expect(r.precision_proxies).toEqual(REPORT.precision_proxies);
  });

  it("reproduces the weekly composition, dismissal by category and calibration in series.json", () => {
    const S = series as unknown as { weekly: unknown[]; dismissal_by_category: unknown[]; calibration: unknown[] };
    expect(s.weekly).toEqual(S.weekly);
    expect(s.dismissal_by_category).toEqual(S.dismissal_by_category);
    expect(s.calibration).toEqual(S.calibration);
  });
});

describe("windowedAccuracy for a window", () => {
  const since = "2026-09-16T00:00:00.000Z";
  const { report: r, series: s } = windowedAccuracy(corpus, since, null);
  const runsInWindow = (reviews as { items: { created_at: string }[] }).items.filter((x) => Date.parse(x.created_at) >= Date.parse(since));

  it("reads only the runs created inside it, and everything through them", () => {
    expect(r.runs.total).toBe(runsInWindow.length);
    expect(r.runs.total).toBeLessThan(REPORT.runs.total!);
    expect((r.gate.runs_red ?? 0) + (r.gate.runs_green ?? 0) + (r.gate.runs_neutral ?? 0)).toBeLessThanOrEqual(r.runs.total!);
    expect(r.proof.attempted).toBe((r.proof.proven ?? 0) + (r.proof.disproven ?? 0) + (r.proof.inconclusive ?? 0) + (r.proof.skipped_no_env ?? 0));
    expect(r.window.since).toBe(since);
  });

  it("keeps every rate a subset over its own population", () => {
    for (const m of Object.values(r.precision_proxies)) {
      if (m.value != null) expect(m.value).toBeLessThanOrEqual(1);
    }
    expect(s.weekly.every((w) => w.week_start >= "2026-09-14")).toBe(true);
  });

  it("an empty window is empty, not zero-filled rates", () => {
    const empty = windowedAccuracy(corpus, "2030-01-01T00:00:00.000Z", null).report;
    expect(empty.runs.total).toBe(0);
    expect(empty.precision_proxies.human_dismissal_rate.value).toBeNull();
  });
});

describe("round3 matches Python's round(x, 3)", () => {
  it("rounds the exact binary value, and exact ties to even", () => {
    expect(round3(0.7925)).toBe(0.792); // really 0.79249999…
    expect(round3(0.0625)).toBe(0.062); // an exact tie → even
    expect(round3(0.1875)).toBe(0.188);
    expect(round3(1 / 3)).toBe(0.333);
  });
});
