// OWNER: T3. cubic-bezier() as a function must equal the CSS definition, because
// GSAP timelines run on it while the stylesheet runs on the browser's own solver.
import { describe, expect, it } from "vitest";
import { bezierAxis, bezierYRange, cubicBezier, easeFn, progressAt } from "@/motion/bezier";
import { EASE } from "@/motion/tokens";

/** Reference: bisect x(t) = p to 1e-12, then y(t). Slow and obviously correct. */
function reference(x1: number, y1: number, x2: number, y2: number, p: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (bezierAxis(mid, x1, x2) < p) lo = mid;
    else hi = mid;
  }
  return bezierAxis((lo + hi) / 2, y1, y2);
}

const SAMPLES = Array.from({ length: 101 }, (_, i) => i / 100);

describe("cubicBezier", () => {
  it.each(Object.entries(EASE))("%s matches the reference solver within 1e-6", (_name, token) => {
    const f = easeFn(token.points);
    for (const p of SAMPLES) expect(Math.abs(f(p) - reference(...token.points, p))).toBeLessThan(1e-6);
  });

  it.each(Object.entries(EASE))("%s is exact at the endpoints and monotone", (_name, token) => {
    const f = easeFn(token.points);
    expect(f(0)).toBe(0);
    expect(f(1)).toBe(1);
    let prev = -Infinity;
    for (const p of SAMPLES) {
      const y = f(p);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = y;
    }
  });

  it("agrees with the CSS `ease` keyword at 50% (0.8024)", () => {
    expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024033877, 6);
  });

  it("clamps outside [0, 1] and short-circuits the linear curve", () => {
    const f = easeFn(EASE.snap.points);
    expect(f(-1)).toBe(0);
    expect(f(2)).toBe(1);
    expect(f(Number.NaN)).toBe(0);
    expect(cubicBezier(0.3, 0.3, 0.7, 0.7)(0.42)).toBe(0.42);
  });

  it("rejects x control points outside [0, 1]", () => {
    expect(() => cubicBezier(-0.1, 0, 0.5, 1)).toThrow(RangeError);
    expect(() => cubicBezier(0.5, 0, 1.2, 1)).toThrow(RangeError);
  });

  it("mass winds up longer and arrests harder than instrument (the point of the token)", () => {
    const mass = easeFn(EASE.mass.points);
    const instrument = easeFn(EASE.instrument.points);
    expect(mass(0.2)).toBeLessThan(instrument(0.2));
    expect(mass(0.9)).toBeGreaterThan(0.99);
  });
});

describe("progressAt", () => {
  it.each(Object.entries(EASE))("inverts %s", (_name, token) => {
    const f = easeFn(token.points);
    for (const v of [0.05, 0.25, 0.5, 0.75, 0.95]) expect(f(progressAt(token.points, v))).toBeCloseTo(v, 6);
    expect(progressAt(token.points, 0)).toBe(0);
    expect(progressAt(token.points, 1)).toBe(1);
  });
});

describe("bezierYRange", () => {
  it("finds overshoot and undershoot", () => {
    expect(bezierYRange([0.34, 1.56, 0.64, 1]).max).toBeGreaterThan(1); // easeOutBack
    expect(bezierYRange([0.36, 0, 0.66, -0.56]).min).toBeLessThan(0); // easeInBack
    expect(bezierYRange([0.2, 1.1, 0.4, 0]).max).toBeGreaterThan(1); // y1 > 1 overshoots too
  });

  it("keeps every PRGuard curve inside [0, 1]", () => {
    for (const token of Object.values(EASE)) {
      const { min, max } = bezierYRange(token.points);
      expect(min).toBeGreaterThanOrEqual(0);
      expect(max).toBeLessThanOrEqual(1);
    }
  });
});
