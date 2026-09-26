// OWNER: t10 (wave 2). Pure logic — no React, no DOM.
//
// The Wilson score interval at 95% confidence (z = 1.96 by default), the one
// piece of arithmetic every accuracy surface renders next to a rate: dashboard
// blueprint §2.10, landing blueprint §10. The backend returns `value` and `n`;
// the interval is presentation, computed client-side from the same two numbers
// (plan A6/A7 — nothing here is hand-typed, every input comes from a fixture or
// the API).
//
//   center = (p̂ + z²/2n) / (1 + z²/n)
//   half   = z/(1 + z²/n) · √( p̂(1-p̂)/n + z²/4n² )
//
// `successes` and `n` are counts, not a pre-divided rate — callers that only
// have a rounded rate (an AccuracyMetric's `value`) recover the count with
// `Math.round(value * n)`, which is exact for the corpus's integer counts
// (backend rates are rounded to RATIO_PRECISION = 3 decimals, and for every n
// this build renders the rounding error is well under the 0.5 needed to flip
// the recovered integer).

export interface WilsonInterval {
  low: number;
  high: number;
}

/**
 * Wilson score interval for `successes` out of `n` trials. `n = 0` (no
 * observations) has no defined interval — returns `{ low: 0, high: 0 }` rather
 * than NaN, so a caller that forgets to special-case "no data" still renders a
 * degenerate bar instead of crashing.
 */
export function wilson(successes: number, n: number, z = 1.96): WilsonInterval {
  if (!Number.isFinite(n) || n <= 0) return { low: 0, high: 0 };
  if (!Number.isFinite(successes)) return { low: 0, high: 0 };
  const phat = clamp01(successes / n);
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (phat + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n));
  return { low: clamp01(center - half), high: clamp01(center + half) };
}

/**
 * Recovers an integer count from a rate already rounded to 3 decimals
 * (brand-gaps §D numeric style) — the standard way this file's callers turn an
 * `AccuracyMetric.value` back into the `successes` `wilson()` wants.
 */
export function successesFromRate(value: number, n: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(n) || n <= 0) return 0;
  return Math.round(clamp01(value) * n);
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}
