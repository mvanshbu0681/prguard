// OWNER: T3 (wave 1). The motion tokens as TypeScript constants.
//
// These are the SAME numbers as the custom properties in app/tokens/core.css
// (motion spec §2 owns the values; brand-gaps §2 ruling 1 fixes --ease-mass).
// tests/unit/motion/tokens.test.ts parses core.css and fails the build if any
// value here drifts from the CSS, so a GSAP timeline, a Motion transition and a
// CSS transition can never disagree about a curve or a duration.
//
// Engine-free: no GSAP, no Motion, no DOM. Safe to import from either surface.

/** Cubic Bézier control points: x1, y1, x2, y2 (P0 = 0,0 and P3 = 1,1). */
export type BezierPoints = readonly [x1: number, y1: number, x2: number, y2: number];

export type EaseName = "instrument" | "snap" | "mass" | "exit";

export interface EaseToken {
  /** CSS custom property that carries the curve (registered in core.css `@theme static`). */
  readonly cssVar: `--ease-${EaseName}`;
  /** `var(--ease-…)`, for inline styles. */
  readonly var: `var(--ease-${EaseName})`;
  readonly points: BezierPoints;
  /** The literal curve, e.g. `cubic-bezier(0.33, 0, 0.12, 1)`. Prefer `var` in CSS. */
  readonly css: string;
  /** Name registered with gsap.registerEase() by src/motion/gsap.ts. */
  readonly gsap: EaseName;
}

function ease(name: EaseName, points: BezierPoints): EaseToken {
  return {
    cssVar: `--ease-${name}`,
    var: `var(--ease-${name})`,
    points,
    css: `cubic-bezier(${points.join(", ")})`,
    gsap: name,
  };
}

/**
 * Three curves plus linear (motion spec §2.1). No fourth curve ships, and none overshoots.
 * - instrument: every entrance, wipe, rail draw, section rule, reveal.
 * - snap: hover, focus, chip, press, the state-flip scale, tooltip.
 * - mass: EXACTLY ONE element, the proof-bench scan line (marketing only).
 * - exit: every exit / dismiss, always with DUR.exit.
 * Scroll-scrubbed values use `linear` (GSAP: "none"), never one of these.
 */
export const EASE = {
  instrument: ease("instrument", [0.33, 0, 0.12, 1]),
  snap: ease("snap", [0.2, 0, 0, 1]),
  mass: ease("mass", [0.52, 0, 0.08, 1]),
  exit: ease("exit", [0.4, 0, 1, 1]),
} as const satisfies Record<EaseName, EaseToken>;

/**
 * Duration tiers in milliseconds (motion spec §2.2, design-system §4.7 names).
 * Any duration not on this grid is a bug.
 */
export const DUR = {
  /** --dur-0: verdict, gate and chain-verified colour flips. Never a transition. */
  instant: 0,
  /** --dur-1 / --dur-hover: hover, focus ring, chip tint, registration-mark brighten. */
  hover: 120,
  /** --dur-2: the state-flip scale 1.045 → 1, tooltip, press release, dialog. */
  state: 180,
  /** --dur-3 / --dur-reveal: small reveal, underline, strike-through, opacity enter. */
  reveal: 240,
  /** --dur-4 / --dur-enter: element entrance, 2px rail wipe, section rule, chain-rail draw. */
  enter: 420,
  /** --dur-5 / --dur-scan: THE hero scan line, and nothing else. */
  scan: 1400,
  /** --dur-exit: every exit / dismiss, with EASE.exit. */
  exit: 160,
  /** --dur-active: the :active press. */
  active: 90,
} as const;

export type DurName = keyof typeof DUR;

/** The CSS custom property behind each duration name. */
export const DUR_VAR = {
  instant: "--dur-0",
  hover: "--dur-1",
  state: "--dur-2",
  reveal: "--dur-3",
  enter: "--dur-4",
  scan: "--dur-5",
  exit: "--dur-exit",
  active: "--dur-active",
} as const satisfies Record<DurName, `--dur-${string}`>;

/**
 * The dashboard's values of the design-system aliases (core.css layer D,
 * `[data-surface="app"]`): --dur-state drops to 120ms and --dur-enter to 180ms.
 * The three evidence components (ProofBench, ChainRail, ContributionBar) keep
 * DUR.enter (420ms) on both surfaces (brand-gaps §2 ruling 7).
 */
export const DUR_APP = { state: 120, enter: 180 } as const;

/** Hard ceilings (motion spec §2.2). DUR.scan is the single documented marketing exception. */
export const CEILING = { dashboard: 220, marketing: 420 } as const;

/** Stagger tokens in milliseconds (motion spec §2.3). */
export const STAGGER = {
  /** --stagger-sibling: chips, cards, ledger rows, severity segments, ladder rungs. */
  sibling: 60,
  /** --stagger-stage: the nine pipeline stations. */
  stage: 120,
  /** --stagger-row-group: terminal rows, as THREE stepped groups (ROW_GROUP_DELAYS). */
  rowGroup: 120,
  /** The four S3 lanes: applied to COMPLETION only, never to start. */
  lane: [0, 60, 120, 180],
  /** Stagger cap: the 7th and later siblings share the 6th's delay (6 items / 360ms). */
  cap: 6,
} as const;

/** Terminal row groups ignite at 0 / 120 / 240ms, never as N individual delays. */
export const ROW_GROUP_DELAYS = [0, STAGGER.rowGroup, 2 * STAGGER.rowGroup] as const;

/** Delay for the index-th sibling (0-based), capped so item 7+ shares item 6's delay. */
export function staggerDelay(index: number, step: number = STAGGER.sibling): number {
  const i = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return Math.min(i, STAGGER.cap - 1) * step;
}

/**
 * The heartbeat dot (motion spec §4.9.2 / §4.9.3). `period` matches the real poll
 * interval; at runtime it is written onto the dot element, never onto :root.
 */
export const HEARTBEAT = {
  period: 1200,
  /** 10–20s since the last output: the dot turns --marker and keeps ticking. */
  lagAfterMs: 10_000,
  /** Past 20s: the dot turns --marker and stops. */
  staleAfterMs: 20_000,
} as const;

export type HeartbeatState = "live" | "lagging" | "stale";

export function heartbeatState(ageMs: number): HeartbeatState {
  if (!(ageMs < HEARTBEAT.staleAfterMs)) return "stale"; // NaN counts as stale: no telemetry
  if (ageMs >= HEARTBEAT.lagAfterMs) return "lagging";
  return "live";
}

/** The fallback handshake (design §4.7, motion spec §3.5): content is never hidden longer than this. */
export const HANDSHAKE = { forceRevealMs: 1600 } as const;

/** Milliseconds → seconds, for GSAP `duration` / Motion `transition.duration`. */
export function sec(ms: number): number {
  return ms / 1000;
}

/** DUR in seconds (GSAP and Motion take seconds). */
export const DUR_S = {
  instant: sec(DUR.instant),
  hover: sec(DUR.hover),
  state: sec(DUR.state),
  reveal: sec(DUR.reveal),
  enter: sec(DUR.enter),
  scan: sec(DUR.scan),
  exit: sec(DUR.exit),
  active: sec(DUR.active),
} as const satisfies Record<DurName, number>;

/** A spring's damping ratio ζ = c / (2·√(k·m)). Anything below 1 overshoots. */
export function dampingRatio(spring: { stiffness: number; damping: number; mass?: number }): number {
  return spring.damping / (2 * Math.sqrt(spring.stiffness * (spring.mass ?? 1)));
}

/**
 * The ONE permitted spring (motion spec §3.3), for layoutId morphs whose travel is
 * unknown at author time. ζ = 46 / (2·√520) = 1.009 — critically damped, no overshoot.
 */
export const LAYOUT_SPRING = { type: "spring", stiffness: 520, damping: 46, mass: 1 } as const;
