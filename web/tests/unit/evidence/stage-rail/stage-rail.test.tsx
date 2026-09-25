// OWNER: t7 (wave 2). <StageRail> component tests: the live aria-live discipline (design
// §8.4 — announces only on stage_index CHANGE) and the engine boundary (toolchain facts:
// evidence components must not import gsap or @/motion/useReplay).
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StageRail, stageStatesFromReviewStatus, type StageEntry } from "@/components/evidence/StageRail";
import { STAGES, type Stage, type StageState } from "@/lib/contracts";
import { installIntersectionObserver } from "../../motion/helpers";

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

// ---------------------------------------------------------------------------------------
// replay mode — the schedule useSequence drives, the PLAY/PAUSE control (SC 2.2.2 — the
// auto-triggered ~20s conveyor needs a way to be stopped, design §8.5) and the gate landing
// only on the sequence's own terminal beat. `@/motion/in-view`'s own contract ("where
// IntersectionObserver is missing, the callback runs immediately") means autoplay "in-view"
// fires as soon as this mounts in jsdom (no polyfill installed here) — exactly what lets
// these tests drive the schedule deterministically with no IntersectionObserver mock.
// ---------------------------------------------------------------------------------------
describe("replay mode — the schedule, PLAY/PAUSE and the gate's terminal beat", () => {
  // specialists gets extra room so its own fork-completion stagger (STAGGER.lane) has space
  // to assert on; every other stage is short, so the whole run advances fast under fake timers.
  const SHORT_DURATIONS: Partial<Record<Stage, number>> = {
    ingest: 40,
    context: 40,
    specialists: 200,
    coordinator: 40,
    severity: 40,
    identity: 40,
    proof: 40,
    delivery: 40,
    finalise: 40,
  };
  const TOTAL = Object.values(SHORT_DURATIONS).reduce((sum: number, ms) => sum + (ms ?? 0), 0);
  const SPECIALISTS_DONE_AT = SHORT_DURATIONS.ingest! + SHORT_DURATIONS.context! + SHORT_DURATIONS.specialists!;

  function stageState(container: HTMLElement, stage: Stage) {
    return container.querySelector(`[data-stage="${stage}"]`)?.getAttribute("data-state");
  }
  function laneState(container: HTMLElement, lane: string) {
    return container.querySelector(`[data-lane="${lane}"]`)?.getAttribute("data-state");
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances stage states at the instants durationsMs (x time_scale, already applied by the caller) schedules", () => {
    const { container } = render(<StageRail mode="replay" orientation="horizontal" stages={[]} durationsMs={SHORT_DURATIONS} />);
    // Autoplay's first step lands synchronously (createSequencer's own `begin(0)` contract).
    expect(stageState(container, "ingest")).toBe("running");
    expect(stageState(container, "context")).toBe("pending");

    act(() => void vi.advanceTimersByTime(SHORT_DURATIONS.ingest!));
    expect(stageState(container, "ingest")).toBe("done");
    expect(stageState(container, "context")).toBe("running");

    act(() => void vi.advanceTimersByTime(SHORT_DURATIONS.context!));
    expect(stageState(container, "context")).toBe("done");
    expect(stageState(container, "specialists")).toBe("running");
  });

  it("the fork's four lanes flip to done on the 0/60/120/180ms stagger, never all at once (motion tokens STAGGER.lane)", () => {
    // useSequence lands each beat "on the frame nearest its time (±half a frame)"
    // (src/motion/useSequence.ts's own header) — every checkpoint below sits well clear of
    // its neighbouring lane's own due instant (a >=30ms margin either side) so the assertion
    // never depends on which side of one frame a step happened to land.
    const { container } = render(<StageRail mode="replay" orientation="horizontal" stages={[]} durationsMs={SHORT_DURATIONS} />);

    act(() => void vi.advanceTimersByTime(SPECIALISTS_DONE_AT));
    expect(stageState(container, "specialists")).toBe("done"); // the station itself flips atomically
    expect(laneState(container, "bugs")).toBe("done"); // +0: synchronous with the station
    expect(laneState(container, "security")).toBe("running"); // +60, not yet
    expect(laneState(container, "tests")).toBe("running"); // +120, not yet
    expect(laneState(container, "quality")).toBe("running"); // +180, not yet

    act(() => void vi.advanceTimersByTime(40)); // +40: still short of security's own +60
    expect(laneState(container, "security")).toBe("running");
    expect(laneState(container, "quality")).toBe("running");

    act(() => void vi.advanceTimersByTime(60)); // +100: past security's +60, short of tests' +120
    expect(laneState(container, "security")).toBe("done");
    expect(laneState(container, "tests")).toBe("running");
    expect(laneState(container, "quality")).toBe("running");

    act(() => void vi.advanceTimersByTime(100)); // +200: past every lane's own offset, incl. +180
    expect(laneState(container, "tests")).toBe("done");
    expect(laneState(container, "quality")).toBe("done");
  });

  it("the gate renders only once the sequence's terminal beat has applied, never before", () => {
    const { container } = render(
      <StageRail mode="replay" orientation="horizontal" stages={[]} durationsMs={SHORT_DURATIONS} gate="success" />,
    );
    expect(container.querySelector('[data-slot="gate-block"]')).toBeNull();

    act(() => void vi.advanceTimersByTime(TOTAL - 40));
    expect(container.querySelector('[data-slot="gate-block"]')).toBeNull();

    act(() => void vi.advanceTimersByTime(80)); // past the last step; still inside the hold
    expect(container.querySelector('[data-slot="gate-block"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="gate-block"]')?.getAttribute("data-conclusion")).toBe("success");
  });

  it("onPlay fires only when the PLAY control itself is pressed, never for the autoplay that armed it", () => {
    const onPlay = vi.fn();
    render(<StageRail mode="replay" orientation="horizontal" stages={[]} durationsMs={SHORT_DURATIONS} onPlay={onPlay} />);
    expect(onPlay).not.toHaveBeenCalled(); // autoplay already ran to arm this render

    act(() => void vi.advanceTimersByTime(TOTAL + 1200)); // past the run and its hold
    fireEvent.click(screen.getByText("PLAY"));
    expect(onPlay).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("PAUSE")); // pausing the fresh run is not a "play"
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("the rest frame (stages all `done`, nothing ever played) shows the fork's four lanes done, not stuck in the stagger's own `running` fallback", () => {
    // Regression: `replayEnded` starts true for replay mode ("rest state = end frame") —
    // the fork-completion stagger must only read from `laneOverride` while an actual run is
    // in flight (`!replayEnded`), or a rest frame handed an all-done `stages` (this lab
    // page's own default prop, and every reduced-motion first paint, since autoplay never
    // calls jumpToEnd there) would show the four lanes as `running` with nothing scheduled
    // to ever flip them. IntersectionObserver is mocked and never told to `enter`, so
    // autoplay stays armed but unfired — the true pre-interaction rest frame.
    const uninstall = installIntersectionObserver();
    try {
      const ALL_DONE = STAGES.map((key) => ({ key, state: "done" as const }));
      const { container } = render(<StageRail mode="replay" orientation="horizontal" stages={ALL_DONE} durationsMs={SHORT_DURATIONS} />);
      for (const lane of ["bugs", "security", "tests", "quality"]) expect(laneState(container, lane)).toBe("done");
    } finally {
      uninstall();
    }
  });

  it("PAUSE freezes the current frame (SC 2.2.2 — the auto-triggered conveyor can be stopped)", () => {
    const onPlay = vi.fn();
    const { container } = render(
      <StageRail mode="replay" orientation="horizontal" stages={[]} durationsMs={SHORT_DURATIONS} onPlay={onPlay} />,
    );
    act(() => void vi.advanceTimersByTime(SHORT_DURATIONS.ingest!));
    expect(stageState(container, "context")).toBe("running");

    fireEvent.click(screen.getByText("PAUSE"));
    act(() => void vi.advanceTimersByTime(5000)); // nothing advances while paused
    expect(stageState(container, "context")).toBe("running");
    expect(stageState(container, "specialists")).toBe("pending");
    expect(onPlay).not.toHaveBeenCalled(); // pausing is never a "play"
    expect(screen.getByText("PLAY")).toBeInTheDocument(); // the control's own face flips back
  });
});
