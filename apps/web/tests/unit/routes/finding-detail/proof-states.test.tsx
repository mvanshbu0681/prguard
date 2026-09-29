// Every proof state is its own layout on /findings/[id]: the verdict sentence,
// the base → head run tiles when the repro ran, the test and the captured
// output — and the quiet card when nothing executed. A refuted claim stays
// legible (the page never deletes the claim it refutes).
import "../../ui/dom-polyfills";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClaimCard } from "@/components/routes/finding-detail/ClaimCard";
import { ProofCard } from "@/components/routes/finding-detail/ProofCard";
import type { Finding } from "@/lib/api-types";
import { F1, F2, F3, F4 } from "../../data/sample-corpus";

const run = (exit_code: number | null, excerpt: string | null) => ({ exit_code, excerpt });
function withProof(f: Finding, over: Partial<NonNullable<Finding["proof"]>>): Finding {
  return {
    ...f,
    proof: {
      status: "not_attempted",
      runner: "docker",
      isolation: "isolated",
      baseline_mode: "compared",
      test_file_path: "tests/test_repro_7e3f1a.py",
      test_code: "def test_x():\n    assert charge() is not None\n",
      command: "pytest tests/test_repro_7e3f1a.py -q",
      base: null,
      head: null,
      duration_ms: 1304,
      deps_install_ok: true,
      ...over,
    },
  };
}

describe("ProofCard", () => {
  it("proven: the verdict, base passed → head failed, the repro test and the failing output", () => {
    const f = withProof(F1, { status: "proven", base: run(0, "1 passed in 0.42s"), head: run(1, "E   AttributeError: 'NoneType'\n1 failed in 0.39s") });
    render(<ProofCard finding={f} review={undefined} />);
    expect(screen.getByRole("heading", { name: "Proven: passes at base, fails at head." })).toBeInTheDocument();
    const runs = screen.getByLabelText("Runs at base and head");
    expect(within(runs).getByText("Passed")).toBeInTheDocument();
    expect(within(runs).getByText("Failed")).toBeInTheDocument();
    expect(runs.textContent).toContain("1 passed in 0.42s · exit 0");
    expect(screen.getByText("tests/test_repro_7e3f1a.py")).toBeInTheDocument();
    // The failing side is the output shown first.
    expect(screen.getByRole("region", { name: "Output at head" }).textContent).toContain("1 failed in 0.39s");
    expect(screen.getByText("That is what lets it hold the merge.", { exact: false })).toBeInTheDocument();
  });

  it("refuted: says Witness refuted the claim and shows both passing runs as the evidence", () => {
    const f = withProof(F2, { status: "disproven", base: run(0, "1 passed in 0.58s"), head: run(0, "1 passed in 0.61s") });
    render(<ProofCard finding={f} review={undefined} />);
    expect(screen.getByRole("heading", { name: "Witness refuted this claim." })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Runs at base and head")).getAllByText("Passed")).toHaveLength(2);
  });

  it("inconclusive: reads the reason off the two runs (fails at both commits → predates the PR)", () => {
    const f = withProof(F3, { status: "inconclusive", base: run(1, "1 failed in 0.47s"), head: run(1, "1 failed in 0.45s") });
    render(<ProofCard finding={f} review={undefined} />);
    expect(screen.getByRole("heading", { name: "Inconclusive." })).toBeInTheDocument();
    expect(screen.getByText(/failure predates this pull request/)).toBeInTheDocument();
  });

  it("not attempted: a quiet card with no run tiles and no output", () => {
    render(<ProofCard finding={{ ...F4, proof: null }} review={undefined} />);
    expect(screen.getByRole("heading", { name: "Not executed." })).toBeInTheDocument();
    expect(screen.queryByLabelText("Runs at base and head")).toBeNull();
    expect(screen.queryByText("Captured output")).toBeNull();
  });

  it("no environment: the repro was written but never run, so the test shows and no runs do", () => {
    const f = withProof(F4, { status: "skipped_no_env", base: run(null, null), head: run(null, null), duration_ms: 0 });
    render(<ProofCard finding={f} review={undefined} />);
    expect(screen.getByRole("heading", { name: "No runnable environment." })).toBeInTheDocument();
    expect(screen.queryByLabelText("Runs at base and head")).toBeNull();
    expect(screen.getByText("The repro test Witness wrote")).toBeInTheDocument();
  });
});

describe("ClaimCard", () => {
  it("still renders a refuted claim's own words, marked refuted", () => {
    const { container } = render(<ClaimCard finding={F2} />);
    expect(container.querySelector('[data-slot="claim-markdown"]')?.textContent).toBe(F2.body_markdown);
    expect(container.querySelector("[data-refuted]")).not.toBeNull();
  });

  it("is not marked refuted otherwise, and names the specialist and rule", () => {
    const { container } = render(<ClaimCard finding={F1} />);
    expect(container.querySelector("[data-refuted]")).toBeNull();
    expect(container.textContent).toContain("unguarded_none_attribute");
  });
});
