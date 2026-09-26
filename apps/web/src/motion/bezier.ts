// OWNER: T3 (wave 1). CSS cubic-bezier() as a function, so GSAP timelines run on
// exactly the curves the stylesheet uses (src/motion/gsap.ts registers EASE with
// gsap.registerEase). GSAP's CustomEase plugin is deliberately not imported: the
// marketing plugin set is core + ScrollTrigger only (motion spec §3.1).
//
// Engine-free and allocation-free after construction.

import type { BezierPoints } from "./tokens";

const NEWTON_ITERATIONS = 8;
const NEWTON_MIN_SLOPE = 1e-3;
const SUBDIVISION_PRECISION = 1e-7;
const SUBDIVISION_MAX_ITERATIONS = 24;
const TABLE_SIZE = 11;
const TABLE_STEP = 1 / (TABLE_SIZE - 1);

// One axis of the curve, with P0 = 0 and P3 = 1:
//   B(t) = 3(1−t)²t·p1 + 3(1−t)t²·p2 + t³
const a = (p1: number, p2: number) => 1 - 3 * p2 + 3 * p1;
const b = (p1: number, p2: number) => 3 * p2 - 6 * p1;
const c = (p1: number) => 3 * p1;
const at = (t: number, p1: number, p2: number) => ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t;
const slope = (t: number, p1: number, p2: number) => 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1);

/** A point on one axis of the curve at parameter t (0…1). */
export function bezierAxis(t: number, p1: number, p2: number): number {
  return at(t, p1, p2);
}

export type EaseFn = (progress: number) => number;

/**
 * cubic-bezier(x1, y1, x2, y2) as `progress → eased progress`, matching the CSS
 * definition: solve x(t) = progress for t, return y(t). Endpoints are exact.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EaseFn {
  if (!(x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1)) {
    throw new RangeError(`cubic-bezier x values must be in [0, 1]; got ${x1}, ${x2}`);
  }
  if (x1 === y1 && x2 === y2) return (p) => clamp01(p);

  const table = new Float64Array(TABLE_SIZE);
  for (let i = 0; i < TABLE_SIZE; i++) table[i] = at(i * TABLE_STEP, x1, x2);

  const tForX = (x: number): number => {
    // Initial guess from the sample table, then Newton-Raphson, falling back to bisection.
    let start = 0;
    let i = 1;
    for (; i < TABLE_SIZE - 1 && table[i] <= x; i++) start += TABLE_STEP;
    i--;
    const dist = (x - table[i]) / (table[i + 1] - table[i]);
    let guess = start + dist * TABLE_STEP;
    const s = slope(guess, x1, x2);
    if (s >= NEWTON_MIN_SLOPE) {
      for (let n = 0; n < NEWTON_ITERATIONS; n++) {
        const d = slope(guess, x1, x2);
        if (d === 0) break;
        const err = at(guess, x1, x2) - x;
        if (Math.abs(err) < SUBDIVISION_PRECISION) return guess;
        guess -= err / d;
      }
      if (Math.abs(at(guess, x1, x2) - x) < SUBDIVISION_PRECISION) return guess;
    } else if (s === 0) {
      return guess;
    }
    let lo = start;
    let hi = start + TABLE_STEP;
    let t = guess;
    for (let n = 0; n < SUBDIVISION_MAX_ITERATIONS; n++) {
      t = lo + (hi - lo) / 2;
      const err = at(t, x1, x2) - x;
      if (Math.abs(err) < SUBDIVISION_PRECISION) break;
      if (err > 0) hi = t;
      else lo = t;
    }
    return t;
  };

  return (p: number) => {
    if (!(p > 0)) return 0;
    if (p >= 1) return 1;
    return at(tForX(p), y1, y2);
  };
}

/** Build the ease function for a token's control points. */
export function easeFn(points: BezierPoints): EaseFn {
  return cubicBezier(points[0], points[1], points[2], points[3]);
}

/**
 * The inverse: the input progress at which the eased output first reaches `value`
 * (e.g. when a scan line eased on EASE.mass crosses a row). Assumes a monotone
 * curve, which every PRGuard easing is (y1, y2 ∈ [0, 1]).
 */
export function progressAt(points: BezierPoints, value: number): number {
  if (!(value > 0)) return 0;
  if (value >= 1) return 1;
  const f = easeFn(points);
  let lo = 0;
  let hi = 1;
  for (let n = 0; n < 40; n++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < value) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * The range of y(t) over t ∈ [0, 1]. A curve overshoots when max > 1 or undershoots
 * when min < 0; motion spec §2.1 bans both ("nothing in this product bounces").
 */
export function bezierYRange(points: BezierPoints): { min: number; max: number } {
  const [, y1, , y2] = points;
  const candidates = [0, 1];
  // dy/dt = 3a t² + 2b t + c = 0
  const A = 3 * a(y1, y2);
  const B = 2 * b(y1, y2);
  const C = c(y1);
  if (Math.abs(A) < 1e-12) {
    if (Math.abs(B) > 1e-12) candidates.push(-C / B);
  } else {
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const r = Math.sqrt(disc);
      candidates.push((-B + r) / (2 * A), (-B - r) / (2 * A));
    }
  }
  let min = Infinity;
  let max = -Infinity;
  for (const t of candidates) {
    if (t < 0 || t > 1) continue;
    const y = at(t, y1, y2);
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return { min, max };
}

function clamp01(p: number): number {
  return p <= 0 ? 0 : p >= 1 ? 1 : p;
}
