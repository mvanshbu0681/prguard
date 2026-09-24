// OWNER: t4 (wave 2). "A replay's every visual override lives behind [data-pb-anim] …
// with that attribute absent the DOM is indistinguishable from the static render" — this is
// both the frame-0 guarantee and the reduced-motion guarantee (motion spec §5, track brief
// VERIFY: "a test asserting the replay end-state DOM equals the static frame-0 DOM").
import { act, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOTION_ATTR, setMotionOverride } from "@/motion/reduced";
import { ProofBench } from "@/components/evidence/ProofBench/ProofBench";
import { TOTAL_MS } from "@/components/evidence/ProofBench/timeline";
import type { FindingProof } from "@/components/evidence/ProofBench/props";
import { endFrame } from "../../motion/helpers";

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
    excerpt: "F                                                                        [100%]\n1 failed in 0.39s",
  },
  duration_ms: 1304,
  deps_install_ok: true,
};

const COMMON = {
  proof: PROVEN,
  findingId: "a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d",
  baseSha: "7c41a09e3b5d2f8a1c6e4b9d7f0a2c5e8b3d6f19",
  headSha: "9c2d4b1f6a8e3c5d7b9f1a2e4c6d8b0f3a5c7e92",
  blocking: true,
  index: "01",
  provenance: "GET /v1/reviews/4e8b1d0c/result → findings[0].proof",
  capturedAt: "2026-09-23T11:46:28.228000Z",
} as const;

describe("replay's end state equals its own frame-0", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a full run returns to the exact DOM it started from", () => {
    const { container } = render(<ProofBench {...COMMON} density="detail" mode="replay" replayKey="p" autoplay="none" />);
    const root = container.firstElementChild!;
    const rest = endFrame(root);

    fireEvent.keyDown(document.body, { key: "p" });
    expect(root.hasAttribute("data-pb-anim")).toBe(true); // now animating: no longer equal to rest
    expect(endFrame(root)).not.toBe(rest);

    act(() => void vi.advanceTimersByTime(TOTAL_MS + 100));

    expect(root.hasAttribute("data-pb-anim")).toBe(false); // settled: the hold ended, animating cleared
    expect(endFrame(root)).toBe(rest);
  });

  it("stepping beat by beat (the reduced-motion path) also returns to the resting frame", () => {
    setMotionOverride("reduced");
    try {
      const { container } = render(<ProofBench {...COMMON} density="detail" mode="replay" replayKey="p" autoplay="none" />);
      const root = container.firstElementChild!;
      const rest = endFrame(root);
      // 11 beats (timeline.ts BEATS): press through every one, one beat per keypress.
      for (let i = 0; i < 11; i++) fireEvent.keyDown(document.body, { key: "p" });
      expect(endFrame(root)).toBe(rest);
    } finally {
      document.documentElement.removeAttribute(MOTION_ATTR);
    }
  });
});

describe("static mode and an unplayed replay instance render the same content", () => {
  it("verdict text, consequence text and chip status match", () => {
    const staticRender = render(<ProofBench {...COMMON} density="detail" mode="static" />);
    const replayRender = render(<ProofBench {...COMMON} density="detail" mode="replay" replayKey="p" autoplay="none" />);
    const staticWithin = within(staticRender.container);
    const replayWithin = within(replayRender.container);

    expect(staticWithin.getByText("PASSES AT BASE · FAILS AT HEAD · PROVEN")).toBeInTheDocument();
    expect(replayWithin.getByText("PASSES AT BASE · FAILS AT HEAD · PROVEN")).toBeInTheDocument();
    expect(staticWithin.getByText("→ blocks merge")).toBeInTheDocument();
    expect(replayWithin.getByText("→ blocks merge")).toBeInTheDocument();

    const staticChip = staticRender.container.querySelector('[data-slot="proof-chip"]');
    const replayChip = replayRender.container.querySelector('[data-slot="proof-chip"]');
    expect(staticChip?.getAttribute("data-status")).toBe("proven");
    expect(replayChip?.getAttribute("data-status")).toBe("proven");

    staticRender.unmount();
    replayRender.unmount();
  });

  it("compact density (the dashboard's own use) never renders the scan line, even in mode=replay", () => {
    const { container } = render(<ProofBench {...COMMON} density="compact" mode="replay" replayKey="p" autoplay="none" />);
    expect(container.querySelector(".scan")).toBeNull();
  });
});
