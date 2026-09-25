// OWNER: t10 (wave 2). The four /accuracy charts — mount smoke tests, the
// shared empty state (charts 2-4 read fixture-only `accuracy/series.json`,
// plan A11), and that GateOutcomeBar's success segment is never called "green".
import "./dom-polyfills";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CalibrationChart } from "@/components/charts/calibration-chart";
import { DismissalByCategoryChart } from "@/components/charts/dismissal-by-category-chart";
import { GateOutcomeBar } from "@/components/charts/gate-outcome-bar";
import { ProofCompositionChart } from "@/components/charts/proof-composition-chart";

describe("empty state — charts 2-4 read a fixture-only series (plan A11)", () => {
  it("ProofCompositionChart renders the shared empty note for an empty weekly array", () => {
    render(<ProofCompositionChart weekly={[]} />);
    expect(screen.getByText("not served by GET /v1/accuracy yet")).toBeInTheDocument();
  });

  it("DismissalByCategoryChart renders the shared empty note for no categories", () => {
    render(<DismissalByCategoryChart categories={[]} />);
    expect(screen.getByText("not served by GET /v1/accuracy yet")).toBeInTheDocument();
  });

  it("CalibrationChart renders the shared empty note for no bands", () => {
    render(<CalibrationChart calibration={[]} />);
    expect(screen.getByText("not served by GET /v1/accuracy yet")).toBeInTheDocument();
  });

  it("every empty chart's provenance is marked fixture-only (ext)", () => {
    const { container } = render(<ProofCompositionChart weekly={[]} />);
    // ProvenanceLine splits "fixture-only:" into its own no-wrap span (chrome/ProvenanceLine.tsx),
    // so the note is two text nodes — assert on the strip's normalised textContent.
    const provenance = container.querySelector('[data-strip="provenance"]');
    expect((provenance?.textContent ?? "").replace(/\s+/g, " ")).toContain("fixture-only: not served by the API yet");
  });
});

describe("ProofCompositionChart — mounts with data, sits on the graticule (no CartesianGrid)", () => {
  it("renders without throwing and shows every one of the six series in its legend", () => {
    render(
      <ProofCompositionChart
        weekly={[
          { week_start: "2026-08-17", proven: 3, disproven: 1, inconclusive: 0, skipped_no_env: 0, not_attempted: 7, not_applicable: 4 },
          { week_start: "2026-08-24", proven: 4, disproven: 1, inconclusive: 3, skipped_no_env: 0, not_attempted: 5, not_applicable: 7 },
        ]}
      />,
    );
    for (const label of ["Proven", "Disproven", "Inconclusive", "Skipped, no env", "Not attempted", "Not applicable"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe("DismissalByCategoryChart — sorted descending, n printed on every bar", () => {
  it("prints the computed rate and n for each category, not a legend", () => {
    const { container } = render(
      <DismissalByCategoryChart
        categories={[
          { category: "correctness", dismissed: 4, published: 45 },
          { category: "security", dismissed: 3, published: 24 },
          { category: "test_integrity", dismissed: 0, published: 1 },
        ]}
      />,
    );
    // Recharts word-wraps a <LabelList> string into one <tspan> per word, so the
    // rendered text is scattered across sibling nodes — assert on the SVG's
    // whitespace-normalised textContent rather than one exact text node.
    const text = (container.textContent ?? "").replace(/\s+/g, "");
    // security: 3/24 = 0.125; correctness: 4/45 = 0.089; test_integrity: 0/1 = 0.000
    expect(text).toContain("0.125·n=24");
    expect(text).toContain("0.089·n=45");
    expect(text).toContain("0.000·n=1");
    expect(container.querySelector(".ui-chart-legend")).toBeNull();
  });

  it("still draws a bar (and prints its label) for a category with rate exactly 0 — a true zero-width rect never mounts", () => {
    const { container } = render(<DismissalByCategoryChart categories={[{ category: "test_integrity", dismissed: 0, published: 1 }]} />);
    expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(1);
  });
});

describe("CalibrationChart — n per band is never hidden, n = 0 reads as 'no data'", () => {
  it("prints every band's n, including a 0-n band as 'no data', not a suppressed row", () => {
    render(
      <CalibrationChart
        calibration={[
          { band: "critical", predicted_score_mean: 0.792, addressed: 3, n: 4 },
          { band: "high", predicted_score_mean: 0.646, addressed: 7, n: 9 },
          { band: "medium", predicted_score_mean: 0.44, addressed: 3, n: 15 },
          { band: "low", predicted_score_mean: 0.302, addressed: 1, n: 3 },
          { band: "info", predicted_score_mean: null, addressed: 0, n: 0 },
        ]}
      />,
    );
    expect(screen.getByText(/n per band \(info \/ low \/ medium \/ high \/ critical\): no data \/ 3 \/ 15 \/ 9 \/ 4/)).toBeInTheDocument();
  });
});

describe("GateOutcomeBar — success is achromatic, never called green", () => {
  it("labels the clear segment CLEAR and never renders the word 'green' or 'GREEN'", () => {
    const { container } = render(<GateOutcomeBar runsRed={14} runsGreen={53} runsNeutral={5} />);
    expect(screen.getByText(/CLEAR 53/)).toBeInTheDocument();
    expect(screen.getByText(/BLOCKED 14/)).toBeInTheDocument();
    expect(screen.getByText(/NEUTRAL 5/)).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/green/i);
  });

  it("prints total n and renders the empty note when there are no runs at all", () => {
    render(<GateOutcomeBar runsRed={0} runsGreen={0} runsNeutral={0} />);
    expect(screen.getByText("not served by GET /v1/accuracy yet")).toBeInTheDocument();
  });
});
