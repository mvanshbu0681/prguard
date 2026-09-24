// OWNER: m1 (wave 3). <HeroBench> — the hero's P/D swap (landing-blueprint §01 "THE D
// KEY"; brief TESTS: "the d/p key switching logic"). jsdom (the default environment):
// this file never imports @/lib/fixtures, only plain mock finding data, so it renders
// with testing-library like any other client component test.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroBench, type HeroBenchFinding } from "@/components/sections/hero/HeroBench";
import type { FindingProof } from "@/lib/api-types";

function proof(status: FindingProof["status"], base: string, head: string): FindingProof {
  return {
    status,
    runner: "docker",
    isolation: "isolated",
    baseline_mode: "compared",
    test_file_path: "tests/test_repro_7e3f1a.py",
    test_code: null,
    command: "pytest -q tests/test_repro_7e3f1a.py",
    base: { exit_code: 0, excerpt: base },
    head: { exit_code: status === "proven" ? 1 : 0, excerpt: head },
    duration_ms: 1200,
    deps_install_ok: true,
  };
}

const PROVEN: HeroBenchFinding = {
  proof: proof("proven", "1 passed in 0.42s", "1 failed in 0.39s"),
  findingId: "a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d",
  baseSha: "7c41a09e3b5d2f8a1c6e4b9d7f0a2c5e8b3d6f19",
  headSha: "9c2d4b1f6a8e3c5d7b9f1a2e4c6d8b0f3a5c7e92",
  blocking: true,
  provenance: "GET /v1/reviews/4e8b1d0/result → findings[0].proof",
  capturedAt: "2026-09-23T11:46:28.228000Z",
};

const DISPROVEN: HeroBenchFinding = {
  proof: proof("disproven", "1 passed in 0.58s", "1 passed in 0.61s"),
  findingId: "5d20b7f4-9c1a-4e8b-a6d3-1f7e9b2c4a60",
  baseSha: PROVEN.baseSha,
  headSha: PROVEN.headSha,
  blocking: false,
  claim: "get_rate() may return None for an unsupported currency",
  provenance: "GET /v1/findings/5d20b7f4 → proof",
  capturedAt: "2026-09-23T11:47:03.000000Z",
};

describe("HeroBench — P/D key switching", () => {
  it("starts on the proven finding", () => {
    const { container } = render(<HeroBench proven={PROVEN} disproven={DISPROVEN} />);
    expect(container.textContent).toMatch(/finding a91f3c2e/);
    expect(container.textContent).toMatch(/proof_status: proven/);
    expect(container.textContent).not.toContain(DISPROVEN.claim!);
  });

  it("D swaps to the disproven counter-demo", () => {
    const { container } = render(<HeroBench proven={PROVEN} disproven={DISPROVEN} />);
    fireEvent.keyDown(window, { key: "d" });
    expect(container.textContent).toMatch(/finding 5d20b7f4/);
    expect(container.textContent).toMatch(/proof_status: disproven/);
    expect(container.textContent).toContain(DISPROVEN.claim!);
  });

  it("D again returns to the proven finding", () => {
    const { container } = render(<HeroBench proven={PROVEN} disproven={DISPROVEN} />);
    fireEvent.keyDown(window, { key: "d" });
    fireEvent.keyDown(window, { key: "d" });
    expect(container.textContent).toMatch(/finding a91f3c2e/);
    expect(container.textContent).not.toContain(DISPROVEN.claim!);
  });

  it("P returns to the proven finding from the disproven one", () => {
    const { container } = render(<HeroBench proven={PROVEN} disproven={DISPROVEN} />);
    fireEvent.keyDown(window, { key: "d" });
    fireEvent.keyDown(window, { key: "p" });
    expect(container.textContent).toMatch(/finding a91f3c2e/);
  });

  it("P replays the proven bench even when it is already showing (re-keys, does not error)", () => {
    const { container } = render(<HeroBench proven={PROVEN} disproven={DISPROVEN} />);
    expect(() => fireEvent.keyDown(window, { key: "p" })).not.toThrow();
    expect(container.textContent).toMatch(/finding a91f3c2e/);
  });

  it("is case-insensitive on the key", () => {
    const { container } = render(<HeroBench proven={PROVEN} disproven={DISPROVEN} />);
    fireEvent.keyDown(window, { key: "D" });
    expect(container.textContent).toMatch(/finding 5d20b7f4/);
  });

  it("ignores d/p while typing in an input (src/motion/keys.ts's typing guard)", () => {
    const { container } = render(
      <div>
        <input aria-label="search" />
        <HeroBench proven={PROVEN} disproven={DISPROVEN} />
      </div>,
    );
    const input = screen.getByLabelText("search");
    input.focus();
    fireEvent.keyDown(input, { key: "d" });
    expect(container.textContent).toMatch(/finding a91f3c2e/);
    expect(container.textContent).not.toMatch(/finding 5d20b7f4/);
  });

  it("announces which finding is shown on a visually-hidden live region", () => {
    render(<HeroBench proven={PROVEN} disproven={DISPROVEN} />);
    expect(screen.getByRole("status")).toHaveTextContent(/finding a91f3c2e.*proof_status: proven/);
    fireEvent.keyDown(window, { key: "d" });
    expect(screen.getByRole("status")).toHaveTextContent(/finding 5d20b7f4.*proof_status: disproven/);
  });
});
