// OWNER: T3. useReplay on real GSAP: paused-timeline-first, parked on the end frame,
// P restarts frame-identically, reduced motion yields the end frame (and beat
// stepping), autoplay never gates visibility, unmount reverts everything.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gsap } from "@/motion/gsap";
import { MOTION_ATTR, setMotionOverride } from "@/motion/reduced";
import { DUR_S, EASE } from "@/motion/tokens";
import { useReplay, useSequence, type Replay } from "@/motion/useReplay";
import { endFrame, installIntersectionObserver, observerOf } from "./helpers";

// ScrollTrigger registers through window.matchMedia, which jsdom lacks. Hoisted above the imports.
vi.hoisted(() => {
  if (typeof window.matchMedia !== "function") {
    const mql = (media: string) => ({ matches: media.trim() === "all", media, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false });
    Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: mql });
  }
});

let handle: Replay<HTMLDivElement> | null = null;

function Bench({ onEnd, autoplay }: { onEnd?: () => void; autoplay?: "none" | "mount" | "in-view" }) {
  const replay = useReplay<HTMLDivElement>(
    (tl, { q, flip, retrigger, beat, reduced }) => {
      if (!reduced) {
        tl.fromTo(q("[data-scan]"), { autoAlpha: 0.6, y: 0 }, { y: 120, duration: DUR_S.scan, ease: EASE.mass.gsap }, 0);
        tl.to(q("[data-scan]"), { autoAlpha: 0, duration: DUR_S.hover }, DUR_S.scan);
      }
      tl.fromTo(q("[data-row]"), { opacity: 0.35 }, { opacity: 1, duration: DUR_S.hover, ease: EASE.instrument.gsap, stagger: 0.12 }, 0);
      tl.fromTo(q("[data-rail]"), { scaleY: 0 }, { scaleY: 1, duration: DUR_S.enter, ease: EASE.instrument.gsap }, 0.4);
      beat("rails", 0.82);
      flip(q("[data-chip]"), "data-state", "not_attempted", "proven", 2.2);
      retrigger(q("[data-chip]"), "data-stamp", 2.2);
      beat("stamp", 2.38);
      tl.fromTo(q("[data-caption]"), { autoAlpha: 0 }, { autoAlpha: 1, duration: DUR_S.hover }, 2.4);
      beat("verdict", 2.52);
      tl.to({}, { duration: 4 }, 2.52); // the hold
    },
    { key: "p", onEnd, autoplay },
  );
  handle = replay;
  return (
    <>
      <div ref={replay.ref} data-testid="bench">
        <span data-scan="" aria-hidden style={{ visibility: "hidden" }} />
        <p data-row="">row 1</p>
        <p data-row="">row 2</p>
        <i data-rail="" />
        <span data-chip="" className="stamp" data-state="proven">
          PROVEN
        </span>
        <span data-caption="">blocks merge</span>
      </div>
      <output data-testid="state">{`${replay.isPlaying ? "playing" : "idle"} ${replay.beat}/${replay.beats}`}</output>
      <button onClick={replay.play}>play</button>
      <textarea aria-label="notes" />
    </>
  );
}

const chip = () => screen.getByTestId("bench").querySelector("[data-chip]")!;
const caption = () => screen.getByTestId("bench").querySelector<HTMLElement>("[data-caption]")!;
const rows = () => [...screen.getByTestId("bench").querySelectorAll<HTMLElement>("[data-row]")];
const tl = () => handle!.timeline()!;

/** The visible end state, minus the scan line (decoration that exists only while it moves). */
function visibleState(): string {
  const clone = screen.getByTestId("bench").cloneNode(true) as HTMLElement;
  clone.querySelector("[data-scan]")?.remove();
  return endFrame(clone);
}

afterEach(() => {
  handle = null;
  document.documentElement.removeAttribute(MOTION_ATTR);
});

describe("useReplay", () => {
  it("builds paused and rests on the end frame (the static frame)", () => {
    render(<Bench />);
    expect(tl().paused()).toBe(true);
    expect(tl().progress()).toBe(1);
    expect(chip().getAttribute("data-state")).toBe("proven");
    expect(chip().hasAttribute("data-stamp")).toBe(false); // nothing fired while parking
    expect(rows().map((r) => r.style.opacity)).toEqual(["1", "1"]);
    expect(screen.getByTestId("state").textContent).toBe("idle 3/3");
  });

  it("P restarts from t = 0: 0ms flip + stamp at 2.2s, then the hold, then the same end frame", () => {
    const onEnd = vi.fn();
    render(<Bench onEnd={onEnd} />);
    const rest = endFrame(screen.getByTestId("bench"));
    fireEvent.keyDown(document.body, { key: "p" });
    expect(screen.getByTestId("state").textContent).toMatch(/^playing/);
    expect(chip().getAttribute("data-state")).toBe("not_attempted");
    expect(rows()[0].style.opacity).toBe("0.35");
    expect(caption().style.visibility).toBe("hidden");

    // time(t, false) moves the playhead the way playback does, firing callbacks (seek() suppresses them).
    act(() => void tl().time(2.19, false));
    expect(chip().getAttribute("data-state")).toBe("not_attempted");
    expect(chip().hasAttribute("data-stamp")).toBe(false);
    act(() => void tl().time(2.2001, false));
    expect(chip().getAttribute("data-state")).toBe("proven"); // the instant, not a tween
    expect(chip().getAttribute("data-stamp")).toBe("a"); // the paired 180ms scale
    expect(onEnd).not.toHaveBeenCalled();

    act(() => void tl().progress(1));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("state").textContent).toBe("idle 3/3");
    expect(endFrame(screen.getByTestId("bench"))).toBe(rest);
  });

  it("replays are frame-identical", () => {
    render(<Bench />);
    const frames: string[][] = [];
    for (let run = 0; run < 3; run++) {
      fireEvent.keyDown(document.body, { key: "p" });
      const seen: string[] = [];
      for (const t of [0, 0.3, 0.9, 1.6, 2.25, 2.45, 3]) {
        act(() => void tl().seek(t));
        seen.push(endFrame(screen.getByTestId("bench")));
      }
      act(() => void tl().progress(1));
      frames.push(seen);
    }
    expect(frames[1]).toEqual(frames[0]);
    expect(frames[2]).toEqual(frames[0]);
  });

  it("the key binding ignores typing and modifiers", () => {
    render(<Bench />);
    fireEvent.keyDown(screen.getByLabelText("notes"), { key: "p" });
    for (const mod of ["metaKey", "ctrlKey", "altKey", "shiftKey"] as const) fireEvent.keyDown(document.body, { key: "p", [mod]: true });
    expect(tl().progress()).toBe(1);
    expect(screen.getByTestId("state").textContent).toBe("idle 3/3");
  });

  it("reduced motion: play() lands on the end frame, which equals the animated end state", () => {
    // Animated end state, full motion:
    const full = render(<Bench />);
    fireEvent.keyDown(document.body, { key: "p" });
    act(() => void tl().progress(1));
    const animated = visibleState();
    full.unmount();

    setMotionOverride("reduced");
    const onEnd = vi.fn();
    render(<Bench onEnd={onEnd} />);
    expect(visibleState()).toBe(animated); // before anything is pressed
    fireEvent.click(screen.getByText("play"));
    expect(tl().progress()).toBe(1);
    expect(tl().isActive()).toBe(false); // nothing tweens
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(visibleState()).toBe(animated);
    expect(chip().hasAttribute("data-stamp")).toBe(false); // the scale is dropped under reduced motion
  });

  it("reduced motion: P steps beat by beat with zero tweening, then wraps", () => {
    setMotionOverride("reduced");
    const onEnd = vi.fn();
    render(<Bench onEnd={onEnd} />);
    fireEvent.keyDown(document.body, { key: "p" });
    expect(screen.getByTestId("state").textContent).toBe("idle 1/3");
    expect(tl().time()).toBeCloseTo(0.82, 5);
    expect(chip().getAttribute("data-state")).toBe("not_attempted");
    expect(caption().style.visibility).toBe("hidden");
    fireEvent.keyDown(document.body, { key: "p" });
    expect(chip().getAttribute("data-state")).toBe("proven");
    expect(caption().style.visibility).toBe("hidden");
    fireEvent.keyDown(document.body, { key: "p" });
    expect(caption().style.visibility).not.toBe("hidden");
    expect(screen.getByTestId("state").textContent).toBe("idle 3/3");
    expect(onEnd).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: "p" });
    expect(screen.getByTestId("state").textContent).toBe("idle 1/3");
    expect(tl().isActive()).toBe(false);
    expect(chip().hasAttribute("data-stamp")).toBe(false); // seeks never fire callbacks
  });

  it("switching reduced motion on mid-run lands on the end frame", async () => {
    render(<Bench />);
    fireEvent.keyDown(document.body, { key: "p" });
    act(() => void tl().seek(1));
    await act(async () => setMotionOverride("reduced"));
    await vi.waitFor(() => expect(handle?.reduced).toBe(true));
    expect(tl().progress()).toBe(1);
    expect(chip().getAttribute("data-state")).toBe("proven");
    expect(screen.getByTestId("state").textContent).toBe("idle 3/3");
  });

  it("in-view autoplay never gates visibility and plays once", () => {
    const uninstall = installIntersectionObserver();
    try {
      render(<Bench autoplay="in-view" />);
      expect(chip().getAttribute("data-state")).toBe("proven"); // the end frame is already there
      expect(tl().isActive()).toBe(false);
      act(() => observerOf(screen.getByTestId("bench")).enter([screen.getByTestId("bench")]));
      expect(screen.getByTestId("state").textContent).toMatch(/^playing/);
      expect(chip().getAttribute("data-state")).toBe("not_attempted");
    } finally {
      uninstall();
    }
  });

  it("in-view autoplay does nothing under reduced motion", () => {
    const uninstall = installIntersectionObserver();
    try {
      setMotionOverride("reduced");
      render(<Bench autoplay="in-view" />);
      expect(() => observerOf(screen.getByTestId("bench"))).toThrow(); // never even observed
      expect(tl().progress()).toBe(1);
    } finally {
      uninstall();
    }
  });

  it("mount autoplay waits for fonts, then plays once", async () => {
    render(<Bench autoplay="mount" />);
    await act(async () => {});
    expect(screen.getByTestId("state").textContent).toMatch(/^playing/);
  });

  it("unmount kills the timeline (route changes revert everything)", () => {
    const view = render(<Bench />);
    const timeline = tl();
    fireEvent.keyDown(document.body, { key: "p" });
    expect(gsap.globalTimeline.getChildren(false, false, true)).toContain(timeline);
    view.unmount();
    expect(gsap.globalTimeline.getChildren(false, false, true)).not.toContain(timeline);
    fireEvent.keyDown(document.body, { key: "p" }); // unbound: no throw, no effect
  });

  it("re-exports the engine-free useSequence", () => {
    expect(typeof useSequence).toBe("function");
  });
});
