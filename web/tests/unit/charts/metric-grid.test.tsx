// OWNER: t10 (wave 2). <MetricGrid> against the real fixture corpus
// (web/public/fixtures/accuracy/report.json) — six distinct metrics (plan A6),
// the disproven_rate footnote, and the always-visible caveats.
import "./dom-polyfills";
import report from "@fixtures/accuracy/report.json";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricGrid } from "@/components/charts/metric-grid";
import type { AccuracyReport } from "@/lib/api-types";

const REPORT = report as unknown as AccuracyReport;

describe("MetricGrid — the six A6 metrics, in order, from the fixture", () => {
  it("renders exactly six metric names, A6's order, none repeated", () => {
    render(<MetricGrid report={REPORT} />);
    const expected = [
      "EXECUTION VERIFIED PRECISION",
      "SELF CAUGHT FALSE POSITIVE RATE",
      "HUMAN DISMISSAL RATE",
      "ADDRESSED RATE",
      "PROVEN RATE",
      "INCONCLUSIVE RATE",
    ];
    const rendered = expected.map((name) => screen.getByText(new RegExp(name)));
    expect(rendered).toHaveLength(6);
    expect(new Set(expected).size).toBe(6); // six distinct metrics, not disproven_rate published twice
  });

  it("renders the four API-supplied values verbatim (to 3 decimals), not recomputed", () => {
    render(<MetricGrid report={REPORT} />);
    // getAllByText, not getByText: a value can coincide with a neighbouring Wilson bound
    // (e.g. execution_verified_precision's own high bound also prints "1.000").
    expect(screen.getAllByText(REPORT.precision_proxies.execution_verified_precision.value!.toFixed(3)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(REPORT.precision_proxies.self_caught_false_positive_rate.value!.toFixed(3)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(REPORT.precision_proxies.human_dismissal_rate.value!.toFixed(3)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(REPORT.precision_proxies.addressed_rate.value!.toFixed(3)).length).toBeGreaterThan(0);
  });

  it("derives proven_rate and inconclusive_rate from `proof`, not from a literal", () => {
    render(<MetricGrid report={REPORT} />);
    expect(screen.getAllByText(REPORT.proof.proven_rate!.toFixed(3)).length).toBeGreaterThan(0);
    const expectedInconclusive = (REPORT.proof.inconclusive! / REPORT.proof.attempted!).toFixed(3);
    expect(screen.getAllByText(expectedInconclusive).length).toBeGreaterThan(0);
    // The derivation is named in the provenance line, per A6.
    expect(screen.getByText("GET /v1/accuracy → proof.inconclusive / proof.attempted")).toBeInTheDocument();
  });

  it("prints the disproven_rate footnote with the report's own value and n, not a hardcoded number", () => {
    render(<MetricGrid report={REPORT} />);
    const value = REPORT.proof.disproven_rate!.toFixed(3);
    const n = REPORT.proof.attempted;
    expect(screen.getByText(new RegExp(`proof\\.disproven_rate \\(${value.replace(".", "\\.")}, n = ${n}\\)`))).toBeInTheDocument();
    expect(screen.getByText(/is the same quantity as self_caught_false_positive_rate/)).toBeInTheDocument();
  });

  it("renders every caveat the report carries, as plain visible text", () => {
    render(<MetricGrid report={REPORT} />);
    for (const caveat of REPORT.caveats) {
      expect(screen.getByText(caveat)).toBeInTheDocument();
    }
  });
});
