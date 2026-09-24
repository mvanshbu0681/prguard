// OWNER: t10 (wave 2). Static source scan: brand-gaps §D / plan A7 — "no number
// on any surface is hardcoded." Every metric value and every `n` this folder
// renders has to come from a prop at runtime, so none of it should appear as a
// source-code literal in the component files themselves. This also guards
// against plan A7's specific failure mode: the blueprint's superseded worked
// example (`execution_verified_precision 0.91 (n=312)`,
// `self_caught_false_positive_rate 0.14 (n=537)`) is *mutually impossible*
// under the backend's real formulas and must never be copied into a component.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import report from "@fixtures/accuracy/report.json";
import { describe, expect, it } from "vitest";
import type { AccuracyReport } from "@/lib/api-types";

const REPORT = report as unknown as AccuracyReport;
const CHART_DIR = resolve(import.meta.dirname, "../../../src/components/charts");

/** Every component file that renders a metric value or an `n` — not wilson.ts/types.ts, which are pure logic with no data literals. */
const RENDERING_FILES = [
  "metric-card.tsx",
  "metric-grid.tsx",
  "chart-frame.tsx",
  "proof-composition-chart.tsx",
  "dismissal-by-category-chart.tsx",
  "calibration-chart.tsx",
  "gate-outcome-bar.tsx",
].map((name) => ({ name, path: resolve(CHART_DIR, name) }));

const SOURCES = RENDERING_FILES.map((f) => ({ ...f, source: readFileSync(f.path, "utf8") }));

/** Matches `value` as a standalone number, not as a substring of a longer digit run (so 42 doesn't match inside 1420, or 1 inside 12). */
function embedsLiteral(source: string, value: number): boolean {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![.\\d])${escaped}(?![.\\d])`).test(source);
}

describe("no hard-coded numbers — the fixture's own values never appear as source literals", () => {
  it("never embeds one of the four precision_proxies values", () => {
    const values = [
      REPORT.precision_proxies.execution_verified_precision.value,
      REPORT.precision_proxies.self_caught_false_positive_rate.value,
      REPORT.precision_proxies.human_dismissal_rate.value,
      REPORT.precision_proxies.addressed_rate.value,
    ].filter((v): v is number => typeof v === "number" && v !== 0 && v !== 1);

    for (const value of values) {
      for (const { name, source } of SOURCES) {
        expect(embedsLiteral(source, value), `${name} embeds the fixture literal ${value}`).toBe(false);
      }
    }
  });

  it("never embeds proof.proven_rate, proof.disproven_rate, or the raw proof counts", () => {
    const values = [REPORT.proof.proven_rate, REPORT.proof.disproven_rate, REPORT.proof.proven, REPORT.proof.disproven, REPORT.proof.inconclusive].filter(
      (v): v is number => typeof v === "number" && v !== 0 && v !== 1,
    );
    for (const value of values) {
      for (const { name, source } of SOURCES) {
        expect(embedsLiteral(source, value), `${name} embeds the fixture literal ${value}`).toBe(false);
      }
    }
  });

  it("never embeds one of the precision_proxies' n's, or proof.attempted", () => {
    const values = [
      REPORT.precision_proxies.execution_verified_precision.n,
      REPORT.precision_proxies.self_caught_false_positive_rate.n,
      REPORT.precision_proxies.human_dismissal_rate.n,
      REPORT.precision_proxies.addressed_rate.n,
      REPORT.proof.attempted,
    ].filter((v): v is number => typeof v === "number");
    for (const value of values) {
      for (const { name, source } of SOURCES) {
        expect(embedsLiteral(source, value), `${name} embeds the fixture's n = ${value}`).toBe(false);
      }
    }
  });

  it("never embeds the blueprint's superseded, mutually-impossible worked example (plan A7)", () => {
    const forbidden = ["0.91", "0.910", "0.14", "0.140", "312", "537"];
    for (const { name, source } of SOURCES) {
      for (const token of forbidden) {
        expect(source.includes(token), `${name} contains the stale blueprint literal "${token}"`).toBe(false);
      }
    }
  });
});
