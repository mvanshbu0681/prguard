// OWNER: t5 (wave 2). <ContributionBar> rendered: fixed segment order, tick
// promotion in the DOM, keyboard navigation, 3-decimal formatting, and the
// glyph density's aria-label (dashboard blueprint §3a).
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { ContributionBar } from "@/components/evidence/ContributionBar";
import { SEVERITY_INPUTS } from "@/lib/contracts";

// The fixture demo finding's own inputs (plan A13): score 0.810, band critical.
const DEMO_INPUTS = { reachability: 1.0, blast_radius: 0.7, path_sensitivity: 1.0, coverage_gap: 0.5, churn: 0.3, proof_confidence: 1.0 };
const WEIGHTS = { path_sensitivity: 0.25, reachability: 0.2, blast_radius: 0.15, coverage_gap: 0.15, proof_confidence: 0.15, churn: 0.1 };
const EXPLANATION = "sensitive path × reachable from a public entrypoint × proven × blast radius 0.70 × file tested, symbol not × churn 0.30";
const SCORE = 0.81;

function detailBar(overrides: Partial<ComponentProps<typeof ContributionBar>> = {}) {
  return render(
    <ContributionBar
      score={SCORE}
      inputs={DEMO_INPUTS}
      weights={WEIGHTS}
      density="detail"
      explanation={EXPLANATION}
      findingId="a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d"
      disableEntrance
      {...overrides}
    />,
  );
}

describe("segment order — fixed, never sorted by value or contribution", () => {
  it("renders the six segments in SEVERITY_INPUTS' declared order for every density", () => {
    for (const density of ["detail", "compact"] as const) {
      const { container, unmount } = detailBar({ density });
      const segments = [...container.querySelectorAll<HTMLElement>("[data-input]")].filter((el) => el.getAttribute("role") === "img");
      expect(segments.map((s) => s.dataset.input)).toEqual([...SEVERITY_INPUTS]);
      unmount();
    }
    const { container, unmount } = render(<ContributionBar score={SCORE} inputs={DEMO_INPUTS} weights={WEIGHTS} density="glyph" />);
    const glyphSegments = [...container.querySelectorAll<HTMLElement>("[data-input]")];
    expect(glyphSegments.map((s) => s.dataset.input)).toEqual([...SEVERITY_INPUTS]);
    unmount();
  });
});

describe("tick promotion — the crossed tick, and only it, is promoted", () => {
  it("promotes exactly the .75 (critical) tick for the demo finding's score", () => {
    const { container } = detailBar();
    const ticks = [...container.querySelectorAll<HTMLElement>("[data-tick]")];
    expect(ticks).toHaveLength(4);
    const promoted = ticks.filter((t) => t.dataset.promoted === "");
    expect(promoted).toHaveLength(1);
    expect(promoted[0]!.dataset.tick).toBe("critical");
  });

  it("promotes no tick below .15 (info)", () => {
    const { container } = detailBar({ score: 0.05, inputs: { reachability: 0, blast_radius: 0, path_sensitivity: 0.2, coverage_gap: 0, churn: 0, proof_confidence: 0 } });
    const promoted = [...container.querySelectorAll<HTMLElement>("[data-promoted]")];
    expect(promoted).toHaveLength(0);
  });
});

describe("keyboard navigation — the bar is one tab stop, arrow keys move between segments", () => {
  it("is a single tab stop and moves aria-activedescendant across the six segments with ArrowRight/ArrowLeft", () => {
    const { container } = detailBar();
    const group = container.querySelector<HTMLElement>('[role="group"][tabindex="0"]')!;
    expect(group).toBeTruthy();
    expect(group.getAttribute("aria-activedescendant")).toBeFalsy();

    fireEvent.keyDown(group, { key: "ArrowRight" });
    const first = SEVERITY_INPUTS[0];
    expect(group.getAttribute("aria-activedescendant")).toMatch(new RegExp(`-seg-${first}$`));

    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(group.getAttribute("aria-activedescendant")).toMatch(new RegExp(`-seg-${SEVERITY_INPUTS[1]}$`));

    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(group.getAttribute("aria-activedescendant")).toMatch(new RegExp(`-seg-${first}$`));

    fireEvent.keyDown(group, { key: "End" });
    expect(group.getAttribute("aria-activedescendant")).toMatch(new RegExp(`-seg-${SEVERITY_INPUTS.at(-1)}$`));
  });

  it("highlights the matching table row and underlines the matching clause when a segment is active", () => {
    const { container } = detailBar();
    const group = container.querySelector<HTMLElement>('[role="group"][tabindex="0"]')!;
    fireEvent.keyDown(group, { key: "Home" }); // path_sensitivity — the first, biggest-weight segment
    const row = container.querySelector<HTMLElement>('[data-row-input="path_sensitivity"]')!;
    expect(row.className).toMatch(/bg-ink-3/);
    const underlined = container.querySelector<HTMLElement>(".underline");
    expect(underlined?.textContent).toBe("sensitive path");
  });

  it("does not move focus on unrelated keys", () => {
    const { container } = detailBar();
    const group = container.querySelector<HTMLElement>('[role="group"][tabindex="0"]')!;
    fireEvent.keyDown(group, { key: "Enter" });
    expect(group.getAttribute("aria-activedescendant")).toBeFalsy();
  });
});

describe("3-decimal formatting — never 0.81, always 0.810", () => {
  it("prints the score to exactly 3 decimals in the detail readout", () => {
    render(<ContributionBar score={SCORE} inputs={DEMO_INPUTS} weights={WEIGHTS} density="compact" disableEntrance />);
    expect(screen.getByText("0.810")).toBeInTheDocument();
  });

  it("prints the score to exactly 3 decimals in the detail readout's own slot", () => {
    const { container } = detailBar();
    expect(container.querySelector('[data-slot="contribution-bar-score"]')?.textContent).toBe("0.810");
  });

  it("prints raw, weight and contribution to their own precisions in the table", () => {
    const { container } = detailBar();
    const row = container.querySelector('[data-row-input="churn"]')!;
    const cells = [...row.querySelectorAll("td")].map((td) => td.textContent);
    // churn: raw 0.300 (3dp) · weight 0.10 (2dp, as the API sends it) · contribution 0.030 (3dp)
    expect(cells).toEqual(["0.300", "0.10", "0.030"]);
  });
});

describe("glyph density", () => {
  it("carries the exact aria-label the spec worked example gives", () => {
    render(<ContributionBar score={SCORE} inputs={DEMO_INPUTS} weights={WEIGHTS} density="glyph" band="critical" />);
    expect(screen.getByRole("img", { name: "severity 0.810, critical" })).toBeInTheDocument();
  });

  it("never renders ticks, a table or the proof_confidence hatch", () => {
    const { container } = render(<ContributionBar score={SCORE} inputs={DEMO_INPUTS} weights={WEIGHTS} density="glyph" band="critical" />);
    expect(container.querySelector("[data-tick]")).toBeNull();
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector('[data-input="proof_confidence"]')?.getAttribute("style") ?? "").not.toMatch(/repeating-linear-gradient/);
  });
});

describe("disproven findings render the clamp note honestly", () => {
  it("prints severity.notes beneath the bar", () => {
    detailBar({ score: 0.655, band: "info", notes: ["clamped to info: repro passed at head"] });
    expect(screen.getByText("clamped to info: repro passed at head")).toBeInTheDocument();
  });
});

describe("withFrame", () => {
  it("wraps the instrument in an Exhibit (registration marks) only when asked", () => {
    const { container: bare } = detailBar();
    expect(bare.querySelector("[data-registration-mark]")).toBeNull();

    const { container: framed } = detailBar({ withFrame: true });
    expect(framed.querySelector("[data-registration-mark]")).not.toBeNull();
    expect(framed.querySelectorAll("[data-registration-mark]")).toHaveLength(4);
  });
});
