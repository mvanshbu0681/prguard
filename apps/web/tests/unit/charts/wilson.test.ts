// OWNER: t10 (wave 2). wilson() against known reference values.
import { describe, expect, it } from "vitest";
import { successesFromRate, wilson } from "@/components/charts/wilson";

/** Loose enough for a hand-derived reference value, tight enough to catch a formula error. */
const CLOSE = 0.001;

describe("wilson — the 95% score interval (z = 1.96)", () => {
  it("matches the textbook p = 0.5, n = 100 interval [0.404, 0.596]", () => {
    const { low, high } = wilson(50, 100);
    expect(low).toBeCloseTo(0.404, 2);
    expect(high).toBeCloseTo(0.596, 2);
  });

  it("matches a hand-derived interval for 5 of 42 (self_caught_false_positive_rate's raw counts)", () => {
    const { low, high } = wilson(5, 42);
    expect(Math.abs(low - 0.052)).toBeLessThan(CLOSE);
    expect(Math.abs(high - 0.25)).toBeLessThan(CLOSE);
  });

  it("is symmetric around 0.5 when p = 0.5", () => {
    const { low, high } = wilson(21, 42);
    expect(low).toBeCloseTo(1 - high, 6);
  });

  it("widens as n shrinks, for the same observed rate", () => {
    const wide = wilson(1, 2);
    const narrow = wilson(500, 1000);
    expect(wide.high - wide.low).toBeGreaterThan(narrow.high - narrow.low);
  });

  it("never leaves [0, 1], even at the extremes", () => {
    expect(wilson(0, 10).low).toBeGreaterThanOrEqual(0);
    expect(wilson(10, 10).high).toBeLessThanOrEqual(1);
  });

  it("handles n = 0 without NaN or throwing", () => {
    expect(wilson(0, 0)).toEqual({ low: 0, high: 0 });
    expect(wilson(5, 0)).toEqual({ low: 0, high: 0 });
    expect(Number.isNaN(wilson(0, 0).low)).toBe(false);
  });

  it("handles n negative or non-finite the same way as n = 0", () => {
    expect(wilson(1, -3)).toEqual({ low: 0, high: 0 });
    expect(wilson(1, Number.NaN)).toEqual({ low: 0, high: 0 });
  });

  it("the point estimate always sits inside its own interval", () => {
    for (const [x, n] of [
      [26, 42],
      [5, 42],
      [16, 105],
      [14, 31],
    ] as const) {
      const { low, high } = wilson(x, n);
      const phat = x / n;
      expect(phat).toBeGreaterThanOrEqual(low);
      expect(phat).toBeLessThanOrEqual(high);
    }
  });
});

describe("successesFromRate — recovering a raw count from a 3-decimal rate", () => {
  it("recovers the exact fixture counts (accuracy/report.json's own arithmetic)", () => {
    expect(successesFromRate(1.0, 25)).toBe(25);
    expect(successesFromRate(0.119, 42)).toBe(5);
    expect(successesFromRate(0.152, 105)).toBe(16);
    expect(successesFromRate(0.452, 31)).toBe(14);
    expect(successesFromRate(0.619, 42)).toBe(26);
    expect(successesFromRate(0.238, 42)).toBe(10);
  });

  it("clamps a rate outside 0..1 rather than returning a negative or oversized count", () => {
    expect(successesFromRate(-0.5, 10)).toBe(0);
    expect(successesFromRate(1.5, 10)).toBe(10);
  });

  it("is 0 for n = 0", () => {
    expect(successesFromRate(0.5, 0)).toBe(0);
  });
});
