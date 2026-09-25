// OWNER: T3. One code path for the OS preference and html[data-motion="reduced"].
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getMotionOverride,
  isReducedMotion,
  MOTION_ATTR,
  REDUCED_QUERY,
  setMotionOverride,
  subscribeReducedMotion,
  useMotionOverride,
  useReducedMotion,
} from "@/motion/reduced";
import { installMatchMedia, type MatchMediaControl } from "./helpers";

let media: MatchMediaControl;

beforeEach(() => {
  media = installMatchMedia();
});
afterEach(() => {
  media.uninstall();
  document.documentElement.removeAttribute(MOTION_ATTR);
});

describe("reduced motion", () => {
  it("is off by default and on for either trigger", () => {
    expect(isReducedMotion()).toBe(false);
    media.set(REDUCED_QUERY, true);
    expect(isReducedMotion()).toBe(true);
    media.set(REDUCED_QUERY, false);
    setMotionOverride("reduced");
    expect(document.documentElement.getAttribute(MOTION_ATTR)).toBe("reduced");
    expect(getMotionOverride()).toBe("reduced");
    expect(isReducedMotion()).toBe(true);
    setMotionOverride(null);
    expect(document.documentElement.hasAttribute(MOTION_ATTR)).toBe(false);
    expect(isReducedMotion()).toBe(false);
  });

  it("works without matchMedia (old browsers, jsdom)", () => {
    media.uninstall();
    expect(isReducedMotion()).toBe(false);
    setMotionOverride("reduced");
    expect(isReducedMotion()).toBe(true);
  });

  it("notifies subscribers on media changes and on the attribute, sharing one listener", async () => {
    let calls = 0;
    const a = subscribeReducedMotion(() => calls++);
    const b = subscribeReducedMotion(() => calls++);
    expect(media.listenerCount(REDUCED_QUERY)).toBe(1);
    media.set(REDUCED_QUERY, true, { dispatch: true });
    expect(calls).toBe(2);
    setMotionOverride("reduced");
    await waitFor(() => expect(calls).toBe(4)); // MutationObserver is async
    a();
    b();
    expect(media.listenerCount(REDUCED_QUERY)).toBe(0);
  });
});

function Probe() {
  const reduced = useReducedMotion();
  const override = useMotionOverride();
  return (
    <p>
      <span data-testid="reduced">{String(reduced)}</span>
      <span data-testid="override">{String(override)}</span>
    </p>
  );
}

describe("useReducedMotion / useMotionOverride", () => {
  it("re-render when either trigger changes", async () => {
    render(<Probe />);
    expect(screen.getByTestId("reduced").textContent).toBe("false");
    act(() => media.set(REDUCED_QUERY, true, { dispatch: true }));
    expect(screen.getByTestId("reduced").textContent).toBe("true");
    act(() => media.set(REDUCED_QUERY, false, { dispatch: true }));
    expect(screen.getByTestId("reduced").textContent).toBe("false");
    act(() => setMotionOverride("reduced"));
    await waitFor(() => expect(screen.getByTestId("reduced").textContent).toBe("true"));
    expect(screen.getByTestId("override").textContent).toBe("reduced");
  });
});
