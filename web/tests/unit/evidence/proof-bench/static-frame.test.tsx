// OWNER: t4 (wave 2). mode="static" renders the complete frame-0 end state: no JS required
// for the claim to land (docs/design/03 §01 "Animation": "Frame 0 … the bench is already in
// its final state"). No scan line, both excerpts fully present, verdict stamped.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProofBench } from "@/components/evidence/ProofBench/ProofBench";
import type { FindingProof } from "@/components/evidence/ProofBench/props";

const PROVEN: FindingProof = {
  status: "proven",
  runner: "docker",
  isolation: "isolated",
  baseline_mode: "compared",
  test_file_path: "tests/test_repro_7e3f1a.py",
  test_code: null,
  command: "pytest tests/test_repro_7e3f1a.py -q -p no:cacheprovider",
  base: { exit_code: 0, excerpt: ".                                                                        [100%]\n1 passed in 0.42s" },
  head: {
    exit_code: 1,
    excerpt:
      "F                                                                        [100%]\n" +
      "=================================== FAILURES ===================================\n" +
      "E       AttributeError: 'NoneType' object has no attribute 'currency'\n" +
      "1 failed in 0.39s",
  },
  duration_ms: 1304,
  deps_install_ok: true,
};

function renderBench(mode: "static" | "replay" = "static") {
  return render(
    <ProofBench
      proof={PROVEN}
      density="detail"
      mode={mode}
      findingId="a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d"
      baseSha="7c41a09e3b5d2f8a1c6e4b9d7f0a2c5e8b3d6f19"
      headSha="9c2d4b1f6a8e3c5d7b9f1a2e4c6d8b0f3a5c7e92"
      blocking
      index="01"
      provenance="GET /v1/reviews/4e8b1d0c/result → findings[0].proof"
      capturedAt="2026-09-23T11:46:28.228000Z"
    />,
  );
}

describe('<ProofBench mode="static">', () => {
  it("renders every line of both excerpts", () => {
    const { container } = renderBench("static");
    const text = container.textContent ?? "";
    for (const line of [...PROVEN.base!.excerpt!.split("\n"), ...PROVEN.head!.excerpt!.split("\n")]) {
      if (!line.trim()) continue;
      expect(text).toContain(line.trim().length ? line : line);
    }
    expect(text).toContain("1 passed in 0.42s");
    expect(text).toContain("1 failed in 0.39s");
    expect(text).toContain("AttributeError: 'NoneType' object has no attribute 'currency'");
  });

  it("renders the checkout command for both SHAs", () => {
    const { container } = renderBench("static");
    const text = container.textContent ?? "";
    expect(text).toContain("git checkout 7c41a09");
    expect(text).toContain("git checkout 9c2d4b1");
  });

  it("stamps the verdict rail and the chip, unanimated", () => {
    const { container, getByText } = renderBench("static");
    expect(getByText("PASSES AT BASE · FAILS AT HEAD · PROVEN")).toBeInTheDocument();
    expect(getByText("→ blocks merge")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="proof-chip"][data-status="proven"]')).not.toBeNull();
  });

  it("never renders the marketing-only scan line", () => {
    const { container } = renderBench("static");
    expect(container.querySelector(".scan")).toBeNull();
  });

  it("never carries the animation attribute at rest", () => {
    const { container } = renderBench("static");
    expect(container.querySelector("[data-pb-anim]")).toBeNull();
  });

  it("draws registration marks — this is an evidence frame", () => {
    const { container } = renderBench("static");
    expect(container.querySelectorAll("[data-registration-mark]").length).toBe(4);
  });
});

// A realistic capture (public/fixtures/reviews/4e8b1d0c…result.json findings[0].proof.head):
// 12 excerpt lines plus the checkout command is 13 lines, well past what a fixed 210px pane
// (8 lines, DETAIL_PANE_VISIBLE_LINES) can show without its own scroll cutting off the tail.
// Reviewed defect: at density="detail" this left the `E` line and the run summary — the
// pane's entire reason for existing — scrolled out of view on load.
const REALISTIC_HEAD_EXCERPT =
  "F                                                                        [100%]\n" +
  "=================================== FAILURES ===================================\n" +
  "______________________ test_charge_uses_account_currency _______________________\n" +
  "\n" +
  "    def test_charge_uses_account_currency():\n" +
  '        acct = resolve_account("acct_7f31")\n' +
  '>       assert charge(acct, 1200).currency == "usd"\n' +
  "               ^^^^^^^^^^^^^^^^^^^^^^^^^^^\n" +
  "E       AttributeError: 'NoneType' object has no attribute 'currency'\n" +
  "\n" +
  "tests/test_repro_7e3f1a.py:41: AttributeError\n" +
  "1 failed in 0.39s";

const REALISTIC: FindingProof = {
  ...PROVEN,
  head: { exit_code: 1, excerpt: REALISTIC_HEAD_EXCERPT },
};

describe('<ProofBench mode="static"> — a pane longer than the fixed detail height', () => {
  it("keeps the failing pane's error line and run summary visible without scrolling", () => {
    const { container } = render(
      <ProofBench
        proof={REALISTIC}
        density="detail"
        mode="static"
        findingId="a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d"
        baseSha="7c41a09e3b5d2f8a1c6e4b9d7f0a2c5e8b3d6f19"
        headSha="9c2d4b1f6a8e3c5d7b9f1a2e4c6d8b0f3a5c7e92"
        blocking
        index="01"
        provenance="GET /v1/reviews/4e8b1d0c/result → findings[0].proof"
        capturedAt="2026-09-23T11:46:28.228000Z"
      />,
    );
    const panes = container.querySelectorAll(".prg-terminal__viewport");
    const headPane = panes[panes.length - 1]!;
    const headText = headPane.textContent ?? "";

    // The load-bearing lines a viewer must see without touching the pane.
    expect(headText).toContain("AttributeError: 'NoneType' object has no attribute 'currency'");
    expect(headText).toContain("1 failed in 0.39s");

    // The pane shows at most DETAIL_PANE_VISIBLE_LINES (8) lines — the exact budget a fixed
    // 210px pane (22px lines, 16px padding) can render with none of them clipped — so nothing
    // rendered sits below an unscrolled fold. The command line and the earliest banner lines
    // are what gave way; they are the least load-bearing part of the capture.
    const lineCount = headPane.querySelectorAll(".prg-terminal__line").length;
    expect(lineCount).toBeLessThanOrEqual(8);
    expect(headText).not.toContain("git checkout");
    expect(headText).not.toContain("=================================== FAILURES");
  });
});
