// OWNER: T3. useSequence: timed beats with no animation engine (the dashboard's replay).
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOTION_ATTR, setMotionOverride } from "@/motion/reduced";
import { createSequencer, useSequence, type SequenceClock, type SequenceStep } from "@/motion/useSequence";
import { endFrame, installIntersectionObserver, observerOf } from "./helpers";

/** A deterministic clock: timers fire at their due millisecond, frames every 16ms. */
function manualClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; cb: () => void }>();
  const frames = new Map<number, () => void>();
  let framesPaused = false;
  const clock: SequenceClock = {
    now: () => now,
    requestFrame: (cb) => {
      const id = nextId++;
      frames.set(id, cb);
      return id;
    },
    cancelFrame: (id) => void frames.delete(id),
    setTimer: (cb, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + Math.max(0, ms), cb });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (id) => void timers.delete(id as unknown as number),
  };
  const runFrames = () => {
    const due = [...frames];
    frames.clear();
    due.forEach(([, cb]) => cb());
  };
  return {
    clock,
    now: () => now,
    pauseFrames: (paused: boolean) => (framesPaused = paused),
    runFrames,
    advance(ms: number) {
      const end = now + ms;
      while (now < end) {
        now += 1;
        for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
          if (t.at <= now && timers.has(id)) {
            timers.delete(id);
            t.cb();
          }
        }
        if (!framesPaused && now % 16 === 0) runFrames();
      }
    },
  };
}

function logSteps(times: number[], log: { label: string; at: number }[], now: () => number): SequenceStep[] {
  return times.map((t, i) => ({ at: t, label: `s${i}`, apply: () => log.push({ label: `s${i}`, at: now() }) }));
}

describe("createSequencer", () => {
  it("applies every step, in order, on the frame nearest its time", () => {
    const c = manualClock();
    const log: { label: string; at: number }[] = [];
    const times = [0, 100, 250, 250, 1000];
    const seq = createSequencer(() => logSteps(times, log, c.now), { clock: c.clock });
    seq.restart();
    expect(log).toEqual([{ label: "s0", at: 0 }]); // the step at 0 lands synchronously
    c.advance(1100);
    expect(log.map((l) => l.label)).toEqual(["s0", "s1", "s2", "s3", "s4"]);
    for (const { label, at } of log) {
      const due = times[Number(label.slice(1))];
      expect(Math.abs(at - due)).toBeLessThanOrEqual(9); // within half a frame (+1ms timer resolution)
    }
  });

  it("holds after the last step, then ends", () => {
    const c = manualClock();
    const onEnd = vi.fn();
    const seq = createSequencer(() => logSteps([0, 200], [], c.now), { clock: c.clock, hold: () => 400, onEnd });
    seq.restart();
    c.advance(590);
    expect(onEnd).not.toHaveBeenCalled();
    expect(seq.state().playing).toBe(true);
    c.advance(20);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(seq.state()).toMatchObject({ playing: false, progress: 1 });
  });

  it("pauses and resumes from where it stopped", () => {
    const c = manualClock();
    const log: { label: string; at: number }[] = [];
    const seq = createSequencer(() => logSteps([0, 100, 300], log, c.now), { clock: c.clock });
    seq.restart();
    c.advance(150);
    seq.pause();
    expect(seq.state().playing).toBe(false);
    c.advance(5000);
    expect(log).toHaveLength(2);
    seq.play();
    c.advance(200);
    expect(log).toHaveLength(3);
    expect(log[2].at - 5150).toBeGreaterThanOrEqual(140); // 150ms after resuming, not at once
  });

  it("catches up after a stalled frame without skipping or reordering", () => {
    const c = manualClock();
    const log: { label: string; at: number }[] = [];
    const seq = createSequencer(() => logSteps([0, 50, 60, 70, 400], log, c.now), { clock: c.clock });
    seq.restart();
    c.pauseFrames(true);
    c.advance(300);
    expect(log).toHaveLength(1);
    c.pauseFrames(false);
    c.runFrames();
    expect(log.map((l) => l.label)).toEqual(["s0", "s1", "s2", "s3"]);
  });

  it("restart resets to the start state; the same steps give the same frames every run", () => {
    const runs: number[][] = [];
    for (let r = 0; r < 3; r++) {
      const c = manualClock();
      const log: { label: string; at: number }[] = [];
      const reset = vi.fn();
      const seq = createSequencer(() => logSteps([0, 120, 240, 2200, 2400], log, c.now), { clock: c.clock, reset });
      seq.restart();
      c.advance(3000);
      expect(reset).toHaveBeenCalledTimes(1);
      runs.push(log.map((l) => l.at));
    }
    expect(runs[1]).toEqual(runs[0]);
    expect(runs[2]).toEqual(runs[0]);
  });

  it("jumpToEnd applies everything at once, in order (the reduced-motion end frame)", () => {
    const c = manualClock();
    const log: { label: string; at: number }[] = [];
    const onEnd = vi.fn();
    const seq = createSequencer(() => logSteps([0, 1400, 2200, 2400], log, c.now), { clock: c.clock, onEnd, reset: () => log.push({ label: "reset", at: 0 }) });
    seq.jumpToEnd();
    expect(log.map((l) => l.label)).toEqual(["reset", "s0", "s1", "s2", "s3"]);
    expect(log.every((l) => l.at === 0)).toBe(true);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(seq.state()).toMatchObject({ playing: false, progress: 1, beat: 4, beats: 4 });
  });

  it("stepBeat walks beat by beat with no timing, then wraps", () => {
    const c = manualClock();
    const log: string[] = [];
    const onEnd = vi.fn();
    const steps: SequenceStep[] = [
      { at: 0, apply: () => log.push("scan") },
      { at: 400, apply: () => log.push("rail"), beat: false },
      { at: 1400, apply: () => log.push("rails") },
      { at: 2200, apply: () => log.push("stamp") },
    ];
    const seq = createSequencer(() => steps, { clock: c.clock, onEnd, reset: () => log.push("reset") });
    expect(seq.state()).toMatchObject({ beat: 3, beats: 3, progress: 1 }); // at rest = the end frame
    seq.stepBeat();
    expect(log).toEqual(["reset", "scan"]);
    expect(seq.state().beat).toBe(1);
    seq.stepBeat();
    expect(log.slice(2)).toEqual(["rail", "rails"]);
    seq.stepBeat();
    expect(log.slice(4)).toEqual(["stamp"]);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(seq.state()).toMatchObject({ beat: 3, playing: false });
    seq.stepBeat();
    expect(log.slice(5)).toEqual(["reset", "scan"]);
    c.advance(5000);
    expect(log).toHaveLength(7); // stepping never schedules anything
  });

  it("dispose stops every timer", () => {
    const c = manualClock();
    const log: { label: string; at: number }[] = [];
    const seq = createSequencer(() => logSteps([0, 100], log, c.now), { clock: c.clock });
    seq.restart();
    seq.dispose();
    c.advance(1000);
    expect(log).toHaveLength(1);
  });
});

// --- the hook ------------------------------------------------------------------

function Bench({ autoplay }: { autoplay?: "none" | "in-view" }) {
  // Beats set React state (the recommended form); the server render is the end frame.
  const [phase, setPhase] = useState("verdict");
  // Destructured: the pattern the React Compiler lint accepts (see src/motion/useSequence.ts).
  const { ref, play, isPlaying, beat, beats, progress } = useSequence<HTMLDivElement>(
    [
      { at: 0, apply: () => setPhase("scan") },
      { at: 1400, apply: () => setPhase("rails") },
      { at: 2200, apply: () => setPhase("verdict") },
    ],
    { key: "p", hold: 4000, reset: () => setPhase("start"), autoplay },
  );
  return (
    <section ref={ref}>
      <div data-testid="bench" data-phase={phase}>
        bench
      </div>
      <output data-testid="state">{`${isPlaying ? "playing" : "idle"} ${beat}/${beats} ${progress.toFixed(3)}`}</output>
      <button onClick={play}>play</button>
      <input aria-label="search" />
    </section>
  );
}

describe("useSequence", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.removeAttribute(MOTION_ATTR);
  });

  it("rests on the end frame; P replays from t = 0 and returns to the same frame", () => {
    render(<Bench />);
    const bench = screen.getByTestId("bench");
    const rest = endFrame(bench);
    expect(screen.getByTestId("state").textContent).toBe("idle 3/3 1.000");
    fireEvent.keyDown(document.body, { key: "p" });
    expect(bench.getAttribute("data-phase")).toBe("scan");
    expect(screen.getByTestId("state").textContent).toMatch(/^playing/);
    act(() => void vi.advanceTimersByTime(1500));
    expect(bench.getAttribute("data-phase")).toBe("rails");
    act(() => void vi.advanceTimersByTime(800));
    expect(bench.getAttribute("data-phase")).toBe("verdict");
    expect(screen.getByTestId("state").textContent).toMatch(/^playing/); // the 4s hold
    act(() => void vi.advanceTimersByTime(4000));
    expect(screen.getByTestId("state").textContent).toBe("idle 3/3 1.000");
    expect(endFrame(bench)).toBe(rest);
  });

  it("ignores P while typing and with a modifier", () => {
    render(<Bench />);
    fireEvent.keyDown(screen.getByLabelText("search"), { key: "p" });
    fireEvent.keyDown(document.body, { key: "p", ctrlKey: true });
    expect(screen.getByTestId("bench").getAttribute("data-phase")).toBe("verdict");
    expect(screen.getByTestId("state").textContent).toBe("idle 3/3 1.000");
  });

  it("under reduced motion, play lands on the end frame at once and P steps beat by beat", async () => {
    setMotionOverride("reduced");
    render(<Bench />);
    await act(async () => {}); // let the attribute observer settle
    const bench = screen.getByTestId("bench");
    const rest = endFrame(bench);
    fireEvent.click(screen.getByText("play"));
    expect(endFrame(bench)).toBe(rest);
    expect(screen.getByTestId("state").textContent).toBe("idle 3/3 1.000");
    fireEvent.keyDown(document.body, { key: "p" });
    expect(bench.getAttribute("data-phase")).toBe("scan");
    expect(screen.getByTestId("state").textContent).toBe("idle 1/3 0.000");
    fireEvent.keyDown(document.body, { key: "p" });
    expect(bench.getAttribute("data-phase")).toBe("rails");
    fireEvent.keyDown(document.body, { key: "p" });
    expect(bench.getAttribute("data-phase")).toBe("verdict");
    expect(endFrame(bench)).toBe(rest);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(bench.getAttribute("data-phase")).toBe("verdict"); // nothing was scheduled
  });

  it("autoplays once when it enters the viewport, never before", () => {
    const uninstall = installIntersectionObserver();
    try {
      render(<Bench autoplay="in-view" />);
      const bench = screen.getByTestId("bench");
      expect(bench.getAttribute("data-phase")).toBe("verdict");
      const section = bench.parentElement!;
      act(() => observerOf(section).enter([section]));
      expect(bench.getAttribute("data-phase")).toBe("scan");
    } finally {
      uninstall();
    }
  });
});
