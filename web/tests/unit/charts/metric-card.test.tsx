// OWNER: t10 (wave 2). <MetricCard> — 3-decimal formatting (incl. 0 and 1),
// the "no data" state, the low-n caution, and that every printed number comes
// from the `metric` prop, never a literal in the component.
import "./dom-polyfills";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricCard } from "@/components/charts/metric-card";

describe("MetricCard — value formatting (brand-gaps §D: 3 decimals, always)", () => {
  it("prints a mid-range value to exactly 3 decimals", () => {
    render(<MetricCard name="execution_verified_precision" metric={{ value: 0.91, n: 312, definition: "x" }} provenance="GET /v1/accuracy → x" />);
    expect(screen.getByText("0.910")).toBeInTheDocument();
  });

  it("prints 0 as 0.000, not a blank or a dash", () => {
    render(<MetricCard name="self_caught_false_positive_rate" metric={{ value: 0, n: 40, definition: "x" }} provenance="GET /v1/accuracy → x" />);
    expect(screen.getByText("0.000")).toBeInTheDocument();
  });

  it("prints 1 as 1.000, not 1 or 100%", () => {
    render(<MetricCard name="execution_verified_precision" metric={{ value: 1, n: 25, definition: "x" }} provenance="GET /v1/accuracy → x" />);
    expect(screen.getByText("1.000")).toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
  });

  it("prints the Wilson bounds to 3 decimals too, and the n they were computed from", () => {
    render(<MetricCard name="addressed_rate" metric={{ value: 0.452, n: 31, definition: "x" }} provenance="GET /v1/accuracy → x" />);
    expect(screen.getByText("n = 31")).toBeInTheDocument();
    // Both bounds render as 3-decimal mono numbers, not the raw wilson() floats.
    const decimals = screen.getAllByText(/^\d\.\d{3}$/);
    expect(decimals.length).toBeGreaterThanOrEqual(3); // value + low + high
  });
});

describe("MetricCard — null value (A6/A7: never an invented number)", () => {
  it("renders 'no data (n = 0)' for a null value with n = 0, never 0.000", () => {
    render(<MetricCard name="addressed_rate" metric={{ value: null, n: 0, definition: "x" }} provenance="GET /v1/accuracy → x" />);
    expect(screen.getByText("no data (n = 0)")).toBeInTheDocument();
    expect(screen.queryByText("0.000")).not.toBeInTheDocument();
  });

  it("renders 'no data' when n is missing entirely", () => {
    render(<MetricCard name="proven_rate" metric={{ value: null, definition: "x" }} provenance="GET /v1/accuracy → x" />);
    expect(screen.getByText("no data (n = 0)")).toBeInTheDocument();
  });
});

describe("MetricCard — low-n caution (dashboard §2.10: still rendered, never hidden)", () => {
  it("flags an estimate under n = 30 instead of suppressing it", () => {
    render(<MetricCard name="human_dismissal_rate" metric={{ value: 0.5, n: 12, definition: "x" }} provenance="GET /v1/accuracy → x" />);
    expect(screen.getByText("0.500")).toBeInTheDocument();
    expect(screen.getByText("n too small for a stable estimate")).toBeInTheDocument();
  });

  it("does not flag n = 30 or above", () => {
    render(<MetricCard name="human_dismissal_rate" metric={{ value: 0.5, n: 30, definition: "x" }} provenance="GET /v1/accuracy → x" />);
    expect(screen.queryByText("n too small for a stable estimate")).not.toBeInTheDocument();
  });
});

describe("MetricCard — always-visible definition and provenance", () => {
  it("renders the definition as plain text, not inside a title/tooltip attribute", () => {
    render(
      <MetricCard
        name="execution_verified_precision"
        metric={{ value: 0.91, n: 312, definition: "the share of proven findings a human confirmed" }}
        provenance="GET /v1/accuracy → precision_proxies.execution_verified_precision"
      />,
    );
    expect(screen.getByText("the share of proven findings a human confirmed")).toBeInTheDocument();
    expect(screen.getByText("GET /v1/accuracy → precision_proxies.execution_verified_precision")).toBeInTheDocument();
  });

  it("renders the metric name in caps from the `name` prop, deriving no text of its own", () => {
    render(<MetricCard name="human_dismissal_rate" metric={{ value: 0.152, n: 105, definition: "x" }} provenance="y" />);
    expect(screen.getByText(/HUMAN DISMISSAL RATE/)).toBeInTheDocument();
  });
});
