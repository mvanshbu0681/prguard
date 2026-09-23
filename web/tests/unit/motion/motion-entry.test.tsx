// OWNER: T3. The dashboard-only Motion entry.
import { act, render, screen, waitFor } from "@testing-library/react";
import { MotionConfigContext } from "motion/react";
import { useContext } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ANIM_LATE_CLASS, ANIM_READY_CLASS } from "@/motion/handshake";
import { m, MOTION_DEFAULT_TRANSITION, MotionProvider, transitions, useSequence } from "@/motion/motion";
import { MOTION_ATTR, setMotionOverride } from "@/motion/reduced";
import { CEILING, dampingRatio, DUR_S, EASE } from "@/motion/tokens";

const html = document.documentElement;

function ConfigProbe() {
  const config = useContext(MotionConfigContext);
  return <output data-testid="config">{JSON.stringify({ reducedMotion: config.reducedMotion, transition: config.transition })}</output>;
}

afterEach(() => html.removeAttribute(MOTION_ATTR));

describe("MotionProvider", () => {
  it("loads the deferred features, then disarms the handshake after one Motion frame", async () => {
    html.classList.remove(ANIM_READY_CLASS, ANIM_LATE_CLASS);
    html.removeAttribute("data-anim-runtime");
    render(
      <MotionProvider>
        <m.div data-testid="row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      </MotionProvider>,
    );
    expect(screen.getByTestId("row")).toBeInTheDocument();
    await waitFor(() => expect(html.getAttribute("data-anim-runtime")).toBe("motion"));
    expect(html.classList.contains(ANIM_READY_CLASS) || html.classList.contains(ANIM_LATE_CLASS)).toBe(true);
  });

  it("defaults to reducedMotion 'user' and a --dur-2 / --ease-snap tween (no springs)", () => {
    render(
      <MotionProvider>
        <ConfigProbe />
      </MotionProvider>,
    );
    const config = JSON.parse(screen.getByTestId("config").textContent!);
    expect(config.reducedMotion).toBe("user");
    expect(config.transition).toEqual({ type: "tween", duration: DUR_S.state, ease: [...EASE.snap.points] });
    expect(MOTION_DEFAULT_TRANSITION).toBe(transitions.state);
  });

  it("forces reducedMotion 'always' while html[data-motion=reduced] is set (the footer toggle)", async () => {
    render(
      <MotionProvider>
        <ConfigProbe />
      </MotionProvider>,
    );
    await act(async () => setMotionOverride("reduced"));
    await waitFor(() => expect(JSON.parse(screen.getByTestId("config").textContent!).reducedMotion).toBe("always"));
    await act(async () => setMotionOverride(null));
    await waitFor(() => expect(JSON.parse(screen.getByTestId("config").textContent!).reducedMotion).toBe("user"));
  });
});

describe("transitions", () => {
  it("sit on the token grid and under the 220ms dashboard ceiling, except the evidence components", () => {
    const grid = new Set([0, 90, 120, 160, 180, 240, 420, 1400]);
    for (const [name, t] of Object.entries(transitions)) {
      if (t.type !== "tween") continue;
      const ms = Math.round((t.duration as number) * 1000);
      expect(grid.has(ms)).toBe(true);
      if (name === "evidenceEnter") expect(ms).toBe(420); // brand-gaps §2 ruling 7
      else if (name === "evidenceReveal") expect(ms).toBe(240);
      else expect(ms).toBeLessThanOrEqual(CEILING.dashboard);
      expect(Object.values(EASE).some((e) => JSON.stringify([...e.points]) === JSON.stringify(t.ease))).toBe(true);
    }
  });

  it("the one spring is critically damped", () => {
    const s = transitions.layoutSpring as { stiffness: number; damping: number; mass: number };
    expect(dampingRatio(s)).toBeGreaterThanOrEqual(1);
  });

  it("re-exports the engine-free useSequence for dashboard replays", () => {
    expect(typeof useSequence).toBe("function");
  });
});
