// OWNER: t7 (wave 2). <StageRail> component tests: the live aria-live discipline (design
// §8.4 — announces only on stage_index CHANGE) and the engine boundary (toolchain facts:
// evidence components must not import gsap or @/motion/useReplay).
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StageRail, stageStatesFromReviewStatus, type StageEntry } from "@/components/evidence/StageRail";
import { STAGES, type StageState } from "@/lib/contracts";

const ALL_PENDING: StageEntry[] = STAGES.map((key) => ({ key, state: "pending" as StageState }));
const SRC_DIR = path.resolve(import.meta.dirname, "../../../../src/components/evidence/StageRail");

describe("engine boundary — no gsap, no useReplay in an evidence component", () => {
  it("StageRail.tsx imports neither gsap nor @/motion/useReplay", () => {
    const src = readFileSync(path.join(SRC_DIR, "StageRail.tsx"), "utf8");
    expect(src).not.toMatch(/from ["']gsap/);
    expect(src).not.toMatch(/from ["']@\/motion\/useReplay["']/);
  });

  it("state.ts and index.ts are equally clean", () => {
    for (const file of ["state.ts", "index.ts"]) {
      const src = readFileSync(path.join(SRC_DIR, file), "utf8");
      expect(src).not.toMatch(/gsap/);
    }
  });
});

describe("live mode — aria-live announces only on stage_index change (design §8.4)", () => {
  function liveRegion() {
    return screen.getByRole("status", { hidden: true });
  }

  it("says nothing on first paint (the region exists empty in the shell)", () => {
    render(<StageRail mode="live" orientation="horizontal" stages={ALL_PENDING} stageIndex={3} secondsSinceHeartbeat={2} />);
    expect(liveRegion()).toHaveTextContent("");
  });

  it("announces the new stage once stage_index changes", () => {
    const { rerender } = render(<StageRail mode="live" orientation="horizontal" stages={ALL_PENDING} stageIndex={3} secondsSinceHeartbeat={2} />);
    expect(liveRegion()).toHaveTextContent("");
    rerender(<StageRail mode="live" orientation="horizontal" stages={ALL_PENDING} stageIndex={4} secondsSinceHeartbeat={0} />);
    expect(liveRegion()).toHaveTextContent("Stage 4 of 9, coordinator");
  });

  it("stays silent across a re-render that does not change stage_index (never on every poll)", () => {
    const { rerender } = render(<StageRail mode="live" orientation="horizontal" stages={ALL_PENDING} stageIndex={3} secondsSinceHeartbeat={2} />);
    rerender(<StageRail mode="live" orientation="horizontal" stages={ALL_PENDING} stageIndex={4} secondsSinceHeartbeat={0} />);
    const said = liveRegion().textContent;
    rerender(<StageRail mode="live" orientation="horizontal" stages={ALL_PENDING} stageIndex={4} secondsSinceHeartbeat={5} />);
    expect(liveRegion()).toHaveTextContent(said!);
  });

  it("the heartbeat dot turns stale (data-stale) past 20s and reads the age", () => {
    render(<StageRail mode="live" orientation="horizontal" stages={ALL_PENDING} stageIndex={2} secondsSinceHeartbeat={21} />);
    expect(document.querySelector('[data-heartbeat="stale"]')).not.toBeNull();
    expect(screen.getByText(/21s since last output/)).toBeInTheDocument();
  });
});

describe("static mode — renders `stages` as given, no sequence", () => {
  it("renders every stage's given state in the hidden stage list", () => {
    const stages: StageEntry[] = STAGES.map((key, i) => ({ key, state: i < 3 ? "done" : "pending" }));
    render(<StageRail mode="static" orientation="vertical" stages={stages} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(9);
    expect(items[0]).toHaveTextContent("done");
    expect(items[8]).toHaveTextContent("pending");
  });
});

describe("stageStatesFromReviewStatus wired end to end", () => {
  it("feeds a live StageRail directly, as the dashboard will", () => {
    const stages = stageStatesFromReviewStatus({ status: "running", stage_index: 6, stage_total: 9, seconds_since_heartbeat: 3 });
    render(<StageRail mode="live" orientation="horizontal" stages={stages} stageIndex={6} secondsSinceHeartbeat={3} />);
    expect(document.querySelector('[data-stage="identity"][data-state="running"]')).not.toBeNull();
    expect(document.querySelector('[data-stage="proof"][data-state="pending"]')).not.toBeNull();
  });
});
