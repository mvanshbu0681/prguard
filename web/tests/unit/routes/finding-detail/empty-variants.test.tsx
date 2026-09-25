// OWNER: d3 (wave 3). Empty variants (dashboard-blueprint §2.7):
//   disproven       §01 CLAIM gets a strike-through + the fixed caption
//   not_attempted   §04 PROOF renders at 60% opacity, ProofBench untouched
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClaimSection } from "@/components/routes/finding-detail/ClaimSection";
import { ProofSection } from "@/components/routes/finding-detail/ProofSection";
import { F1, F2, F4 } from "../../data/sample-corpus";

describe("ClaimSection — disproven empty variant", () => {
  it("renders the refutation caption and a drawn strike-through when proof.status is disproven", () => {
    const { container } = render(<ClaimSection finding={F2} />);
    expect(screen.getByText("We refuted our own finding. It never reached your PR.")).toBeInTheDocument();
    const line = container.querySelector("svg line.draw");
    expect(line).not.toBeNull();
    expect(line).toHaveAttribute("data-anim");
  });

  it("still renders the claim's own words — the panel refutes the claim, it does not delete it", () => {
    const { container } = render(<ClaimSection finding={F2} />);
    expect(container.querySelector('[data-slot="claim-markdown"]')?.textContent).toBe(F2.body_markdown);
  });

  it("renders no strike-through or caption for a finding that was not disproven", () => {
    const { container } = render(<ClaimSection finding={F1} />);
    expect(screen.queryByText("We refuted our own finding. It never reached your PR.")).toBeNull();
    expect(container.querySelector("svg line.draw")).toBeNull();
  });
});

describe("ProofSection — not_attempted empty variant", () => {
  const notAttempted = { ...F4, proof: { status: "not_attempted" as const, runner: null, isolation: null, baseline_mode: null } };

  it("wraps the bench at 60% opacity rather than rendering an absence", () => {
    const { container } = render(<ProofSection finding={notAttempted} baseSha={null} headSha={null} reviewShort="4e8b1d0" />);
    expect(screen.getByText("PRGuard did not execute a repro test for this finding.")).toBeInTheDocument();
    const dimmed = container.querySelector(".opacity-60");
    expect(dimmed).not.toBeNull();
    expect(dimmed?.textContent).toContain("PRGuard did not execute a repro test for this finding.");
  });

  it("does not dim the bench for a proof that was attempted", () => {
    const { container } = render(<ProofSection finding={F2} baseSha={null} headSha={null} reviewShort="4e8b1d0" />);
    expect(container.querySelector(".opacity-60")).toBeNull();
  });
});
