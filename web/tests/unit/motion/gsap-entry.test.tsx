// OWNER: T3. The marketing-only GSAP entry: registered once, on the token curves,
// disarms the handshake only after a real frame, degrades instead of throwing.
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { easeFn } from "@/motion/bezier";
import { disarmHandshakeOnNextFrame, ensureGsap, gsap, MEDIA, motionMedia, ScrollTrigger, sweepScrollTriggers, useGSAP, type MotionConditions } from "@/motion/gsap";
import { GsapRuntime } from "@/motion/GsapRuntime";
import { ANIM_READY_CLASS, ANIM_RUNTIME_ATTR } from "@/motion/handshake";
import { MOTION_ATTR, REDUCED_QUERY } from "@/motion/reduced";
import { stopAutoReveal } from "@/motion/reveal";
import { DUR_S, EASE } from "@/motion/tokens";

// A controllable matchMedia, installed before gsap.ts registers ScrollTrigger (jsdom has none).
const media = vi.hoisted(() => {
  const state = new Map<string, boolean>();
  const listeners = new Map<string, Set<() => void>>();
  const bucket = (q: string) => listeners.get(q) ?? listeners.set(q, new Set()).get(q)!;
  const mql = (q: string) => ({
    get matches() {
      return q.trim() === "all" || state.get(q) === true;
    },
    media: q,
    onchange: null,
    addListener: (cb: () => void) => bucket(q).add(cb),
    removeListener: (cb: () => void) => bucket(q).delete(cb),
    addEventListener: (_t: string, cb: () => void) => bucket(q).add(cb),
    removeEventListener: (_t: string, cb: () => void) => bucket(q).delete(cb),
    dispatchEvent: () => false,
  });
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: mql });
  window.scrollTo = () => {}; // ScrollTrigger.refresh() scrolls; jsdom only logs "not implemented"
  return {
    set(q: string, matches: boolean) {
      state.set(q, matches);
      for (const cb of [...bucket(q)]) cb();
    },
    reset: () => state.clear(),
  };
});

const g = globalThis as { __prguardGsap?: string };
const html = document.documentElement;
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

afterEach(() => {
  vi.restoreAllMocks();
  media.reset();
  html.removeAttribute(MOTION_ATTR);
});

describe("ensureGsap", () => {
  it("registered on import, with the token curves as named eases and grid defaults", () => {
    expect(g.__prguardGsap).toBe("ok");
    for (const token of Object.values(EASE)) {
      const registered = gsap.parseEase(token.gsap);
      const expected = easeFn(token.points);
      for (const p of [0.1, 0.33, 0.5, 0.8]) expect(registered(p)).toBeCloseTo(expected(p), 9);
    }
    const defaults = gsap.defaults();
    expect(defaults.duration).toBe(DUR_S.enter); // an unspecified tween lands on --dur-4 …
    const ease = defaults.ease as (p: number) => number; // … on --ease-instrument (GSAP stores it parsed)
    const instrument = easeFn(EASE.instrument.points);
    for (const p of [0.2, 0.5, 0.9]) expect(ease(p)).toBeCloseTo(instrument(p), 9);
  });

  it("registers useGSAP + ScrollTrigger and ignoreMobileResize exactly once", () => {
    delete g.__prguardGsap;
    const register = vi.spyOn(gsap, "registerPlugin");
    const config = vi.spyOn(ScrollTrigger, "config");
    expect(ensureGsap()).toBe(true);
    expect(ensureGsap()).toBe(true);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(useGSAP, ScrollTrigger);
    expect(config).toHaveBeenCalledTimes(1);
    expect(config).toHaveBeenCalledWith({ ignoreMobileResize: true });
  });

  it("loading the module disarms nothing: registration is its only side effect", async () => {
    html.classList.remove(ANIM_READY_CLASS);
    html.removeAttribute(ANIM_RUNTIME_ATTR);
    await frame();
    await frame();
    expect(html.classList.contains(ANIM_READY_CLASS)).toBe(false); // never mid-hydration
  });

  it("if registration fails, leaves the handshake armed so content force-reveals", async () => {
    html.classList.remove(ANIM_READY_CLASS);
    html.removeAttribute(ANIM_RUNTIME_ATTR);
    delete g.__prguardGsap;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(gsap, "registerPlugin").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(ensureGsap()).toBe(false);
    expect(g.__prguardGsap).toBe("failed");
    disarmHandshakeOnNextFrame(); // a mounted runtime asks, but there is no runtime
    await frame();
    await frame();
    expect(html.classList.contains(ANIM_READY_CLASS)).toBe(false);
    expect(html.hasAttribute(ANIM_RUNTIME_ATTR)).toBe(false);
    g.__prguardGsap = "ok";
  });

  it("disarms the handshake on the first GSAP frame after it is asked (from an effect), not before", async () => {
    html.classList.remove(ANIM_READY_CLASS);
    html.removeAttribute(ANIM_RUNTIME_ATTR);
    disarmHandshakeOnNextFrame();
    expect(html.hasAttribute(ANIM_RUNTIME_ATTR)).toBe(false); // synchronously: nothing yet
    expect(html.classList.contains(ANIM_READY_CLASS)).toBe(false);
    await frame();
    await frame();
    expect(html.getAttribute(ANIM_RUNTIME_ATTR)).toBe("gsap");
    expect(html.classList.contains(ANIM_READY_CLASS)).toBe(true);
    stopAutoReveal();
  });
});

describe("motionMedia", () => {
  it("yields a reduced-motion context and rebuilds on the media query and on the page toggle", async () => {
    const runs: MotionConditions[] = [];
    const cleanups: number[] = [];
    const handle = motionMedia((c) => {
      runs.push(c);
      return () => cleanups.push(runs.length);
    });
    expect(runs).toEqual([{ reduced: false, desktop: false, coarse: false }]);

    html.setAttribute(MOTION_ATTR, "reduced");
    await vi.waitFor(() => expect(runs).toHaveLength(2));
    expect(runs[1].reduced).toBe(true);
    expect(cleanups).toEqual([1]); // the previous run was reverted first

    html.removeAttribute(MOTION_ATTR);
    await vi.waitFor(() => expect(runs).toHaveLength(3));
    expect(runs[2].reduced).toBe(false);

    media.set(REDUCED_QUERY, true);
    await vi.waitFor(() => expect(runs.at(-1)?.reduced).toBe(true));
    await new Promise((r) => setTimeout(r, 10)); // GSAP folds media changes less than 2ms apart into one
    media.set(MEDIA.desktop, true);
    await vi.waitFor(() => expect(runs.at(-1)).toEqual({ reduced: true, desktop: true, coarse: false }));

    const count = runs.length;
    handle.revert();
    html.setAttribute(MOTION_ATTR, "reduced");
    await new Promise((r) => setTimeout(r, 20));
    expect(runs).toHaveLength(count);
  });
});

describe("ScrollTrigger helpers", () => {
  it("sweepScrollTriggers kills triggers whose element left the DOM", () => {
    const el = document.createElement("div");
    document.body.append(el);
    const st = ScrollTrigger.create({ trigger: el });
    expect(ScrollTrigger.getAll()).toContain(st);
    expect(sweepScrollTriggers()).toBe(0);
    el.remove();
    expect(sweepScrollTriggers()).toBe(1);
    expect(ScrollTrigger.getAll()).not.toContain(st);
  });

  it("<GsapRuntime /> sweeps and refreshes after a route change frame", async () => {
    const refresh = vi.spyOn(ScrollTrigger, "refresh");
    const view = render(<GsapRuntime />);
    expect(view.container.innerHTML).toBe("");
    await frame();
    expect(refresh).toHaveBeenCalled();
    view.unmount();
  });
});
