#!/usr/bin/env node
// OWNER: T3 (wave 1). `npm run motion:lint`: the motion contract as a lint.
//
// Scans app/** and src/** (CSS, TS, TSX, JS) and fails with file:line on:
//
//   compositor            a transition or animation of a property outside motion spec
//                         §6.1's allowlist. Free: transform (and translate / scale /
//                         rotate), opacity, clip-path, filter. Bounded: background-color,
//                         color, border-color, stroke-dashoffset, read as the colour-only
//                         paints Tailwind's `transition-colors` covers (outline-color,
//                         text-decoration-color, fill, stroke, gradient stops).
//                         A bounded property is a one-shot of at most 240ms: a longer
//                         duration on it (a time, a duration token, a Tailwind duration-*)
//                         is a violation.
//                         Documented exceptions: `visibility` (discrete; the fallback
//                         handshake's force-reveal, design §4.7 / motion §3.5) and `height`
//                         on the ⌘K list only (motion §4.3): a rule whose own `height` is
//                         var(--cmdk-list-height), or a selector naming cmdk-list. A
//                         keyframes block may hold `stroke-dasharray` CONSTANT (same value
//                         at 0% and 100%): the draw technique's dash, never interpolated.
//                         `transition: all`, Tailwind's `transition-all` and the bare
//                         `transition` utility (it includes box-shadow and backdrop-filter)
//                         are violations.
//   stamp-colour          any transition that covers colour on a verdict / gate / stamp
//                         element (.stamp, [data-verdict], [data-gate]): those flip in 0ms
//                         (plan §2 hard rule 3, motion §2.5).
//   overshoot             a cubic-bezier() whose curve leaves [0, 1] (y1 < 0, y2 > 1 or any
//                         other overshoot), a back / elastic / bounce / anticipate ease, or
//                         a spring with damping ratio ζ < 1 (motion §2.1, §3.2, §3.3).
//   timeline              animation-timeline (and scroll / view timelines) outside
//                         @supports (animation-timeline: …) (motion §3.2).
//   will-change           will-change in static CSS, a static style prop or a class (§6.1:
//                         add it imperatively before a timeline plays, remove it after).
//   root-custom-property  animating a CSS custom property on :root / <html> (§6.1).
//   math-random           Math.random (or GSAP random()) in motion code: replays must be
//                         frame-identical (§4.6.1). Motion code = src/motion/** and any
//                         file importing gsap, @gsap/*, motion, framer-motion or @/motion/*.
//   engine-boundary       the GSAP entries (@/motion/gsap, useReplay, GsapRuntime) imported
//                         from app/(app)/** or src/components/charts/**, or the Motion entry
//                         (@/motion/motion) from app/(marketing)/** (plan §2 hard rule 2).
//                         ESLint sees direct `gsap` imports; this sees the re-exports.
//
// Usage:
//   node scripts/lint-motion.mjs [--root <web>] [--dir <rel>]... [--json] [--no-baseline] [--print-baseline]
// Exit: 0 clean, 1 violations, 2 usage error.
//
// Baseline: violations that existed in vendored code at the wave-1 branch point are
// listed in BASELINE below, each pinned to the exact text of its line. An entry
// lapses the moment its line changes, so rewritten code is always checked.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(HERE, "..");
export const DEFAULT_DIRS = ["app", "src"];

/** Stands in for a `${…}` inside CSS text: a value known only at runtime. */
const EXPR = "__expr__";

export const RULES = {
  compositor: "transition or animation of a property outside the compositor allowlist (motion §6.1)",
  "stamp-colour": "transition on a verdict / gate / stamp colour (plan §2 rule 3, motion §2.5)",
  overshoot: "an easing or spring that overshoots (motion §2.1, §3.3)",
  timeline: "animation-timeline outside @supports (motion §3.2)",
  "will-change": "will-change in static CSS (motion §3.4 #9, §6.1)",
  "root-custom-property": "animating a CSS custom property on :root (motion §6.1)",
  "math-random": "Math.random in motion code (replays must be frame-identical)",
  "engine-boundary": "an animation engine entry imported across the route-group boundary (plan §2 rule 2)",
};

/**
 * Pre-existing violations at the wave-1 branch point (3dd27d7), all in shadcn code
 * vendored by T0 and being restyled by t1b. `fingerprint` is sha1(trimmed line)[0..12].
 */
export const BASELINE = [
  { file: "src/components/ui/badge.tsx", rule: "compositor", token: "transition-all", fingerprint: "47e774e05824" },
  { file: "src/components/ui/button.tsx", rule: "compositor", token: "transition-all", fingerprint: "8a969ee08391" },
  { file: "src/components/ui/scroll-area.tsx", rule: "compositor", token: "transition-[color,box-shadow]", fingerprint: "e33e2d6b8c1d" },
  { file: "src/components/ui/sheet.tsx", rule: "compositor", token: "transition", fingerprint: "fd11351a6a80" },
  { file: "src/components/ui/tabs.tsx", rule: "compositor", token: "transition-all", fingerprint: "c6f21a7bde44" },
  { file: "src/components/ui/toggle.tsx", rule: "compositor", token: "transition-all", fingerprint: "b644f48be99c" },
];

// ---------------------------------------------------------------------------
// The property allowlist (motion spec §6.1)
// ---------------------------------------------------------------------------

const COMPOSITOR = new Set(["transform", "translate", "scale", "rotate", "opacity", "clip-path", "-webkit-clip-path", "filter", "-webkit-filter"]);
const BOUNDED = new Set([
  "background-color",
  "color",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-block-color",
  "border-block-start-color",
  "border-block-end-color",
  "border-inline-color",
  "border-inline-start-color",
  "border-inline-end-color",
  "stroke-dashoffset",
]);
/** Tailwind's transition-colors set beyond §6.1's trio: colour-only paints of the same bounded class. */
const COLOUR_FAMILY = new Set(["outline-color", "text-decoration-color", "fill", "stroke", "--tw-gradient-from", "--tw-gradient-via", "--tw-gradient-to"]);
/** Discrete, documented: the handshake's force-reveal keyframe (design §4.7). */
const DISCRETE = new Set(["visibility"]);
/** Keyframe-internal declarations that are not animated properties. */
const KEYFRAME_META = new Set(["animation-timing-function", "animation-composition"]);
/**
 * Properties a keyframes block may hold CONSTANT (the same value at 0% and at 100%, and
 * nowhere different): a static override for the animation's duration, never
 * interpolated. The draw technique needs exactly one: its dash (src/motion/draw.ts).
 */
const CONSTANT_OK = new Set(["stroke-dasharray"]);
/**
 * The fallback handshake's page clock (src/motion/handshake.tsx, design §4.7): a 0s,
 * one-shot keyframe on <html> that sets one inherited flag at 1600ms. A single discrete
 * switch, not per-frame work, so the :root custom-property rule does not apply to it.
 */
const HANDSHAKE_CLOCK = { keyframes: "prg-force-reveal-page", property: "--prg-forced" };
const isHandshakeClock = (keyframes, prop) => keyframes === HANDSHAKE_CLOCK.keyframes && prop === HANDSHAKE_CLOCK.property;

const COLOUR_PROPS = new Set([...[...BOUNDED].filter((p) => p !== "stroke-dashoffset"), ...COLOUR_FAMILY]);

/** §6.1: a bounded property (colour, stroke-dashoffset) may only be a one-shot transition of at most this long. */
export const BOUNDED_MAX_MS = 240;
const isBounded = (p) => BOUNDED.has(p) || COLOUR_FAMILY.has(p);
/** Duration tokens (app/tokens/core.css) and their marketing values in ms. */
const DUR_TOKEN_MS = {
  "--dur-0": 0,
  "--dur-1": 120,
  "--dur-2": 180,
  "--dur-3": 240,
  "--dur-4": 420,
  "--dur-5": 1400,
  "--dur-exit": 160,
  "--dur-active": 90,
  "--dur-hover": 120,
  "--dur-state": 180,
  "--dur-reveal": 240,
  "--dur-enter": 420,
  "--dur-scan": 1400,
};
const TIME_VALUE = /^[+-]?(\d*\.)?\d+m?s$/i;
/**
 * A duration in ms from a CSS time (`300ms`, `.4s`) or a duration token (`var(--dur-4)`,
 * or `(--dur-4)` inside a Tailwind utility). Null when unknowable.
 */
export function durationMs(token) {
  const t = String(token).trim();
  if (TIME_VALUE.test(t)) return /ms$/i.test(t) ? parseFloat(t) : parseFloat(t) * 1000;
  const v = /^(?:var)?\(\s*(--[\w-]+)/.exec(t);
  return v && Object.hasOwn(DUR_TOKEN_MS, v[1]) ? DUR_TOKEN_MS[v[1]] : null;
}

const TW_COLOURS = ["color", "background-color", "border-color", "outline-color", "text-decoration-color", "fill", "stroke", "--tw-gradient-from", "--tw-gradient-via", "--tw-gradient-to"];
/** Tailwind 4.3's bare `transition` (verified against tailwindcss/dist). */
const TW_DEFAULT = [...TW_COLOURS, "opacity", "box-shadow", "transform", "translate", "scale", "rotate", "filter", "-webkit-backdrop-filter", "backdrop-filter", "display", "content-visibility", "overlay", "pointer-events"];
const TW_TRANSITION = {
  transition: TW_DEFAULT,
  "transition-all": ["all"],
  "transition-colors": TW_COLOURS,
  "transition-opacity": ["opacity"],
  "transition-shadow": ["box-shadow"],
  "transition-transform": ["transform", "translate", "scale", "rotate"],
  "transition-none": [],
};
/** tw-animate-css keyframes that animate height (layout). */
const EXTERNAL_LAYOUT_KEYFRAMES = new Set(["accordion-down", "accordion-up", "collapsible-down", "collapsible-up"]);

const TIMELINE_PROPS = new Set([
  "animation-timeline",
  "scroll-timeline",
  "scroll-timeline-name",
  "scroll-timeline-axis",
  "view-timeline",
  "view-timeline-name",
  "view-timeline-axis",
  "view-timeline-inset",
  "animation-range",
  "animation-range-start",
  "animation-range-end",
  "timeline-scope",
]);

/** CSS properties outside the allowlist that show up as GSAP / Motion tween keys. */
const BANNED_TWEEN_PROPS = new Set([
  "width", "height", "min-width", "max-width", "min-height", "max-height",
  "inline-size", "block-size", "min-inline-size", "max-inline-size", "min-block-size", "max-block-size",
  "top", "left", "right", "bottom", "inset", "inset-block", "inset-inline",
  "inset-block-start", "inset-block-end", "inset-inline-start", "inset-inline-end",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left", "margin-block", "margin-inline",
  "margin-block-start", "margin-block-end", "margin-inline-start", "margin-inline-end",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left", "padding-block", "padding-inline",
  "padding-block-start", "padding-block-end", "padding-inline-start", "padding-inline-end",
  "border", "border-width", "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-radius", "outline-width", "outline-offset",
  "box-shadow", "text-shadow", "background", "background-position", "background-position-x", "background-position-y", "background-size",
  "font-size", "font-weight", "line-height", "letter-spacing", "word-spacing",
  "gap", "row-gap", "column-gap", "flex", "flex-basis", "flex-grow", "flex-shrink",
  "grid-template-columns", "grid-template-rows",
  "stroke-width", "stroke-dasharray", "backdrop-filter", "mask-position", "mask-size", "object-position",
]);

const OVERSHOOT_GSAP = /^(back|elastic|bounce)(\.|$)/i;
const OVERSHOOT_MOTION = new Set(["backIn", "backOut", "backInOut", "anticipate"]);

const ENGINE_GSAP_ENTRIES = new Set(["gsap", "useReplay", "GsapRuntime"]);
const ENGINE_MOTION_ENTRIES = new Set(["motion", "motion-features"]);
const MOTION_IMPORT = /^(gsap|@gsap\/|motion$|motion\/|framer-motion|@\/motion(\/|$))/;

/** @param {string} step a keyframe selector: `from`, `to`, `12%`, `0%, 100%` */
function stepPercents(step) {
  return splitTop(step, ",")
    .map((s) => s.trim().toLowerCase())
    .map((s) => (s === "from" ? 0 : s === "to" ? 100 : Number.parseFloat(s)));
}

/**
 * True when `prop` holds one value through the whole keyframes block (present at 0% and
 * at 100%, never different): nothing is interpolated.
 * @param {{ props: { prop: string, value: string, step: string }[] }} kf
 * @param {string} prop
 */
export function isConstantInKeyframes(kf, prop) {
  const own = kf.props.filter((p) => p.prop === prop);
  if (!own.length) return false;
  if (new Set(own.map((p) => p.value.replace(/\s+/g, " ").trim())).size !== 1) return false;
  const steps = new Set(own.flatMap((p) => stepPercents(p.step)));
  return steps.has(0) && steps.has(100);
}

/** A keyframe declaration the allowlist does not cover but that does not animate. */
function constantOverride(kf, prop) {
  return Boolean(kf) && CONSTANT_OK.has(prop) && isConstantInKeyframes(kf, prop);
}

const CMDK_HEIGHT = /var\(\s*--cmdk-list-height\b/;

/**
 * Is `prop` allowed to transition / animate? `selector` and `ruleDecls` (the other
 * declarations of the same rule) identify the one layout exception: the ⌘K list, whose
 * height is var(--cmdk-list-height) (motion §4.3).
 * @param {string} prop
 * @param {string} [selector]
 * @param {{ prop: string, value: string }[]} [ruleDecls]
 * @returns {boolean}
 */
export function allowedProperty(prop, selector = "", ruleDecls = []) {
  const p = prop.trim().toLowerCase();
  if (COMPOSITOR.has(p) || BOUNDED.has(p) || COLOUR_FAMILY.has(p) || DISCRETE.has(p)) return true;
  if (p === "height") return /cmdk-list/.test(selector) || ruleDecls.some((d) => d.prop === "height" && CMDK_HEIGHT.test(d.value));
  return false;
}

// ---------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------

/** Split on `sep` outside parentheses and quotes. */
export function splitTop(value, sep = ",") {
  const out = [];
  let depth = 0;
  let quote = null;
  let cur = "";
  for (const ch of value) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (depth === 0 && (sep === " " ? /\s/.test(ch) : ch === sep)) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const TIME = /^[+-]?(\d*\.)?\d+m?s$/i;
const EASING_WORDS = new Set(["ease", "linear", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end"]);
const WIDE = new Set(["initial", "inherit", "unset", "revert", "revert-layer"]);

/** Properties named by a `transition` shorthand; null when unknowable (a var()). */
export function transitionProperties(value) {
  const v = value.replace(/!important\s*$/i, "").trim();
  if (/^none$/i.test(v) || WIDE.has(v.toLowerCase())) return [];
  const props = [];
  for (const item of splitTop(v, ",")) {
    const tokens = splitTop(item, " ");
    if (tokens.some((t) => /^var\(/i.test(t))) {
      const named = tokens.find((t) => /^-?-?[a-z][\w-]*$/i.test(t) && !TIME.test(t) && !EASING_WORDS.has(t.toLowerCase()) && !/^(normal|allow-discrete)$/i.test(t));
      if (!named) return null;
    }
    const prop = tokens.find(
      (t) =>
        !TIME.test(t) &&
        !EASING_WORDS.has(t.toLowerCase()) &&
        !/^(normal|allow-discrete)$/i.test(t) &&
        !/^[\w-]+\(/.test(t) &&
        !WIDE.has(t.toLowerCase()),
    );
    props.push((prop ?? "all").toLowerCase().startsWith("--") ? prop : (prop ?? "all").toLowerCase());
  }
  return props;
}

export function transitionPropertyList(value) {
  const v = value.replace(/!important\s*$/i, "").trim();
  if (/^var\(/i.test(v)) return null;
  return splitTop(v, ",").map((p) => (p.startsWith("--") ? p : p.toLowerCase()));
}

const ANIMATION_WORDS = new Set([
  "none", "infinite", "normal", "reverse", "alternate", "alternate-reverse",
  "forwards", "backwards", "both", "running", "paused", "auto", ...EASING_WORDS, ...WIDE,
]);

/** Keyframe names used by an `animation` shorthand or `animation-name`. */
export function animationNames(value) {
  const v = value.replace(/!important\s*$/i, "").trim();
  const names = [];
  for (const item of splitTop(v, ",")) {
    const name = splitTop(item, " ").find(
      (t) => !TIME.test(t) && !/^[+-]?\d*\.?\d+$/.test(t) && !ANIMATION_WORDS.has(t.toLowerCase()) && !/^[\w-]+\(/.test(t),
    );
    if (name) names.push(name.replace(/^["']|["']$/g, ""));
  }
  return names;
}

/** The y-range of cubic-bezier(x1, y1, x2, y2) over t ∈ [0, 1]. */
export function bezierYRange(y1, y2) {
  const a = 1 - 3 * y2 + 3 * y1;
  const b = 3 * y2 - 6 * y1;
  const c = 3 * y1;
  const y = (t) => ((a * t + b) * t + c) * t;
  const candidates = [0, 1];
  const A = 3 * a;
  const B = 2 * b;
  if (Math.abs(A) < 1e-12) {
    if (Math.abs(B) > 1e-12) candidates.push(-c / B);
  } else {
    const disc = B * B - 4 * A * c;
    if (disc >= 0) candidates.push((-B + Math.sqrt(disc)) / (2 * A), (-B - Math.sqrt(disc)) / (2 * A));
  }
  let min = Infinity;
  let max = -Infinity;
  for (const t of candidates) {
    if (t < 0 || t > 1) continue;
    const v = y(t);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return { min, max };
}

/** Problems with every cubic-bezier(…) in `text`. */
export function bezierProblems(text) {
  const out = [];
  for (const m of text.matchAll(/cubic-bezier\(([^)]*)\)/gi)) {
    const nums = m[1].split(/[\s,]+/).filter(Boolean).map(Number);
    if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) continue; // var() inside: not checkable
    const [x1, y1, x2, y2] = nums;
    if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
      out.push(`${m[0]} has x outside [0, 1] (invalid)`);
      continue;
    }
    const { min, max } = bezierYRange(y1, y2);
    if (y1 < 0 || y2 > 1 || min < -1e-9 || max > 1 + 1e-9) {
      out.push(`${m[0]} overshoots (y spans ${min.toFixed(3)}…${max.toFixed(3)}); nothing in this product bounces`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// A small CSS parser: declarations with line numbers, selector and at-rule context
// ---------------------------------------------------------------------------

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - starts[lo] + 1 };
  };
}

function nest(parent, child) {
  if (!parent) return child;
  const parents = splitTop(parent, ",");
  const children = splitTop(child, ",");
  const out = [];
  for (const p of parents) for (const c of children) out.push(c.includes("&") ? c.replaceAll("&", p) : `${p} ${c}`);
  return out.join(", ");
}

/**
 * @typedef {{ name: string, params: string }} CssAtRule
 * @typedef {{ prop: string, value: string, important: boolean, line: number, col: number,
 *   selector: string, ruleId: number, atRules: CssAtRule[], keyframes: string | null,
 *   keyframesId: number, keyframeStep: string | null }} CssDecl
 * @typedef {{ prop: string, value: string, step: string, line: number, col: number }} CssKeyframeProp
 * @typedef {{ id: number, name: string, line: number, col: number, props: CssKeyframeProp[] }} CssKeyframes
 */

/**
 * Parse CSS into declarations (with selector, at-rule context and line numbers) and
 * keyframe blocks. `lineOffset` / `colOffset` place CSS that lives inside a TS string.
 * @param {string} text
 * @param {{ lineOffset?: number, colOffset?: number }} [options]
 * @returns {{ decls: CssDecl[], keyframes: CssKeyframes[] }}
 */
export function parseCss(text, { lineOffset = 0, colOffset = 0 } = {}) {
  const pos = lineIndex(text);
  const decls = [];
  const keyframes = [];
  const stack = [];
  let buf = "";
  let bufStart = 0;
  let paren = 0;
  let ruleSeq = 0;
  let keyframesSeq = 0;

  const at = (offset) => {
    const p = pos(offset);
    return { line: p.line + lineOffset, col: p.line === 1 ? p.col + colOffset : p.col };
  };
  const context = () => {
    let selector = "";
    let ruleId = -1;
    let kf = null;
    let keyframesId = -1;
    let keyframeStep = null;
    const atRules = [];
    for (const f of stack) {
      if (f.kind === "rule") {
        selector = f.selector;
        ruleId = f.id;
      } else if (f.kind === "at") atRules.push({ name: f.name, params: f.params });
      else if (f.kind === "keyframes") {
        kf = f.name;
        keyframesId = f.entry.id;
      } else if (f.kind === "keyframe") keyframeStep = f.selector;
      else if (f.kind === "utility") {
        selector = f.selector;
        ruleId = f.id;
      }
    }
    return { selector, ruleId, atRules, keyframes: kf, keyframesId, keyframeStep };
  };

  const open = (prelude, offset) => {
    const top = stack[stack.length - 1];
    if (prelude.startsWith("@")) {
      const m = /^@([\w-]+)\s*([\s\S]*)$/.exec(prelude);
      const name = (m?.[1] ?? "").toLowerCase();
      const params = (m?.[2] ?? "").trim();
      if (/keyframes$/.test(name)) {
        const kf = { id: keyframesSeq++, name: params.replace(/^["']|["']$/g, ""), ...at(offset), props: [] };
        keyframes.push(kf);
        stack.push({ kind: "keyframes", name: kf.name, entry: kf });
      } else if (name === "utility") stack.push({ kind: "utility", selector: `.${params.replace(/-\*$/, "")}`, id: ruleSeq++ });
      else stack.push({ kind: "at", name, params });
      return;
    }
    if (top?.kind === "keyframes" || top?.kind === "keyframe") {
      stack.push({ kind: "keyframe", selector: prelude, entry: top.entry ?? stack.findLast((f) => f.kind === "keyframes")?.entry });
      return;
    }
    const parentSel = stack.findLast((f) => f.kind === "rule" || f.kind === "utility")?.selector ?? "";
    stack.push({ kind: "rule", selector: nest(parentSel, prelude.replace(/\s+/g, " ")), id: ruleSeq++ });
  };

  const flush = () => {
    const text2 = buf.trim();
    const start = bufStart;
    buf = "";
    if (!text2 || text2.startsWith("@")) return;
    const idx = text2.indexOf(":");
    if (idx <= 0) return;
    const rawProp = text2.slice(0, idx).trim();
    const prop = rawProp.startsWith("--") ? rawProp : rawProp.toLowerCase();
    let value = text2.slice(idx + 1).trim();
    const important = /!\s*important\s*$/i.test(value);
    value = value.replace(/!\s*important\s*$/i, "").trim();
    const ctx = context();
    const top = stack[stack.length - 1];
    const d = { prop, value, important, ...at(start), ...ctx };
    if (top?.kind === "keyframe" && top.entry) top.entry.props.push({ prop, value, step: top.selector, line: d.line, col: d.col });
    decls.push(d);
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) {
        if (text[j] === "\\") j++;
        j++;
      }
      if (!buf.trim()) bufStart = i;
      buf += text.slice(i, j + 1);
      i = j;
      continue;
    }
    if (ch === "(") paren++;
    if (ch === ")") paren = Math.max(0, paren - 1);
    if (paren === 0 && ch === "{") {
      open(buf.trim().replace(/\s+/g, " "), bufStart);
      buf = "";
      continue;
    }
    if (paren === 0 && ch === "}") {
      flush();
      stack.pop();
      continue;
    }
    if (paren === 0 && ch === ";") {
      flush();
      continue;
    }
    if (!buf.trim() && !/\s/.test(ch)) bufStart = i;
    buf += ch;
  }
  flush();
  return { decls, keyframes };
}

// ---------------------------------------------------------------------------
// Selector predicates
// ---------------------------------------------------------------------------

/** The selector's subject (last compound) is the root element: `:root`, `html`, `html.x`, `:root[data-y]`. */
export function targetsRoot(selector) {
  return splitTop(selector, ",").some((sel) => {
    const compounds = sel.split(/\s*[\s>+~]\s*/).filter(Boolean);
    const last = compounds[compounds.length - 1] ?? "";
    return /^(:root|html)(?![\w-])/i.test(last);
  });
}

const VERDICT = /\.stamp(?![\w-])|\[data-(verdict|gate)\b/;
export function isVerdictSelector(selector) {
  return VERDICT.test(selector);
}

// ---------------------------------------------------------------------------
// Checks shared by CSS files and CSS inside TS strings
// ---------------------------------------------------------------------------

/**
 * The first bounded property (colour, stroke-dashoffset) a `transition` / `transition-property`
 * declaration runs for longer than BOUNDED_MAX_MS, with that duration; null when none does
 * or the duration is unknowable. `props` are the declaration's properties, in item order.
 */
function boundedOverrun(d, props, siblings) {
  if (d.prop === "transition") {
    const items = splitTop(d.value.replace(/!important\s*$/i, ""), ",");
    for (let i = 0; i < items.length; i++) {
      const prop = props[i];
      if (!prop || !isBounded(prop)) continue;
      // The first time in an item is its duration; a second one is the delay.
      const ms = splitTop(items[i], " ").map(durationMs).find((v) => v !== null) ?? null;
      if (ms !== null && ms > BOUNDED_MAX_MS) return { prop, ms };
    }
    return null;
  }
  const prop = props.find(isBounded);
  const dur = siblings.find((s) => s.prop === "transition-duration");
  if (!prop || !dur) return null;
  const ms = Math.max(0, ...splitTop(dur.value, ",").map((t) => durationMs(t) ?? 0));
  return ms > BOUNDED_MAX_MS ? { prop, ms } : null;
}

function checkCssDecls(parsed, file, report, keyframeIndex) {
  const byRule = new Map();
  for (const d of parsed.decls) {
    if (d.ruleId >= 0) {
      if (!byRule.has(d.ruleId)) byRule.set(d.ruleId, []);
      byRule.get(d.ruleId).push(d);
    }
  }
  for (const d of parsed.decls) {
    if (d.prop.includes(EXPR)) continue; // a property name computed at runtime: not checkable
    const where = { file, line: d.line, col: d.col };
    const inSupportsTimeline = d.atRules.some((a) => a.name === "supports" && /animation-timeline/i.test(a.params) && !/^not\b/i.test(a.params));

    for (const problem of bezierProblems(d.value)) report({ ...where, rule: "overshoot", token: "cubic-bezier", message: problem });

    if (d.keyframes) {
      if (d.prop.startsWith("--")) {
        if (isHandshakeClock(d.keyframes, d.prop)) continue;
        report({ ...where, rule: "compositor", token: d.prop, message: `@keyframes ${d.keyframes} animates the custom property ${d.prop}; animate the property that consumes it (motion §6.1)` });
      } else if (!KEYFRAME_META.has(d.prop) && !allowedProperty(d.prop) && !constantOverride(parsed.keyframes.find((k) => k.id === d.keyframesId), d.prop)) {
        report({ ...where, rule: "compositor", token: d.prop, message: `@keyframes ${d.keyframes} animates \`${d.prop}\`; only transform, opacity, clip-path, filter (and bounded colour / stroke-dashoffset) may move (motion §6.1)` });
      }
      continue;
    }

    if (d.prop === "transition" || d.prop === "transition-property") {
      const props = d.prop === "transition" ? transitionProperties(d.value) : transitionPropertyList(d.value);
      if (props === null) continue;
      for (const p of props) {
        if (p.includes(EXPR)) continue; // computed at runtime: not checkable
        if (p === "all") report({ ...where, rule: "compositor", token: "all", message: "`transition: all` transitions layout properties too; name the compositor properties (motion §6.1)" });
        else if (p === "none") continue;
        else if (!allowedProperty(p, d.selector, byRule.get(d.ruleId) ?? [])) report({ ...where, rule: "compositor", token: p, message: `transition of \`${p}\`; only transform, opacity, clip-path, filter (and bounded colour / stroke-dashoffset) may transition (motion §6.1)` });
      }
      if (isVerdictSelector(d.selector) && props.some((p) => p === "all" || COLOUR_PROPS.has(p))) {
        report({ ...where, rule: "stamp-colour", token: d.prop, message: `\`${d.selector}\` transitions its colour; verdict and gate colours flip in 0ms with no transition (plan §2 rule 3)` });
      }
      const bounded = boundedOverrun(d, props, byRule.get(d.ruleId) ?? []);
      if (bounded) report({ ...where, rule: "compositor", token: bounded.prop, message: `transition of \`${bounded.prop}\` over ${bounded.ms}ms; colour and stroke-dashoffset are bounded to a one-shot of at most ${BOUNDED_MAX_MS}ms (motion §6.1)` });
      if (targetsRoot(d.selector) && props.some((p) => p === "all" || p.startsWith("--"))) {
        report({ ...where, rule: "root-custom-property", token: d.prop, message: `\`${d.selector}\` transitions a custom property on :root; that recalculates every element (motion §6.1)` });
      }
      continue;
    }

    if (d.prop === "transition-duration" && isVerdictSelector(d.selector)) {
      const nonZero = splitTop(d.value, ",").some((t) => TIME.test(t) && parseFloat(t) !== 0);
      const siblings = byRule.get(d.ruleId) ?? [];
      const explicit = siblings.find((s) => s.prop === "transition-property");
      const listed = explicit ? transitionPropertyList(explicit.value) : ["all"];
      if (nonZero && (listed === null || listed.some((p) => p === "all" || COLOUR_PROPS.has(p)))) {
        report({ ...where, rule: "stamp-colour", token: d.prop, message: `\`${d.selector}\` has a transition-duration covering colour; verdict colours flip in 0ms (plan §2 rule 3)` });
      }
      continue;
    }

    if (d.prop === "animation" || d.prop === "animation-name") {
      for (const name of animationNames(d.value)) {
        if (EXTERNAL_LAYOUT_KEYFRAMES.has(name)) report({ ...where, rule: "compositor", token: name, message: `animation \`${name}\` animates height (layout); the only layout exception is the ⌘K list (motion §4.3)` });
        if (targetsRoot(d.selector) && keyframeIndex.get(name)?.custom) {
          report({ ...where, rule: "root-custom-property", token: name, message: `\`${d.selector}\` runs @keyframes ${name}, which animates a custom property on :root (motion §6.1)` });
        }
      }
      continue;
    }

    if (TIMELINE_PROPS.has(d.prop) && !inSupportsTimeline) {
      report({ ...where, rule: "timeline", token: d.prop, message: `\`${d.prop}\` outside @supports (animation-timeline: …); Firefox parks the element at its 0% keyframe (motion §3.2)` });
      continue;
    }

    if (d.prop === "will-change" && !/^auto$/i.test(d.value)) {
      report({ ...where, rule: "will-change", token: "will-change", message: "will-change in a stylesheet; add it imperatively right before a timeline plays and remove it in onComplete (motion §3.4 #9)" });
    }
  }
}

function indexKeyframes(parsedList) {
  const index = new Map();
  for (const parsed of parsedList)
    for (const kf of parsed.keyframes) {
      const entry = index.get(kf.name) ?? { custom: false, banned: [] };
      for (const p of kf.props) {
        if (p.prop.startsWith("--")) {
          if (!isHandshakeClock(kf.name, p.prop)) entry.custom = true;
        } else if (!KEYFRAME_META.has(p.prop) && !allowedProperty(p.prop) && !constantOverride(kf, p.prop)) entry.banned.push(p.prop);
      }
      index.set(kf.name, entry);
    }
  return index;
}

// ---------------------------------------------------------------------------
// Tailwind class tokens
// ---------------------------------------------------------------------------

/** Split a class token into its variants and utility (variants end at the last top-level colon). */
export function splitUtility(token) {
  let t = token.trim();
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === ":" && depth === 0) cut = i;
  }
  const variants = cut >= 0 ? t.slice(0, cut) : "";
  t = cut >= 0 ? t.slice(cut + 1) : t;
  return { variants, utility: t.replace(/^!/, "").replace(/!$/, "") };
}

function arbitraryValue(utility, prefix) {
  if (!utility.startsWith(`${prefix}-[`) || !utility.endsWith("]")) return null;
  return utility.slice(prefix.length + 2, -1).replace(/_/g, " ");
}

/**
 * Check class tokens: entries of { token, where } (where = the string literal that
 * holds the token). `classPosition`: the strings are known to be class lists
 * (className, cn(), clsx(), cva()), so the bare `transition` word is a utility.
 */
/** A Tailwind duration utility's value in ms: duration-300, duration-(--dur-4), duration-[400ms]. Null otherwise. */
export function utilityDurationMs(utility) {
  if (!utility.startsWith("duration-")) return null;
  const v = utility.slice("duration-".length);
  if (/^\d+$/.test(v)) return Number(v);
  if (v.startsWith("(") && v.endsWith(")")) return durationMs(v);
  const arb = arbitraryValue(utility, "duration");
  return arb === null ? null : durationMs(arb);
}

function checkClassTokens(entries, report, keyframeIndex, { classPosition }) {
  const verdict = entries.some((e) => splitUtility(e.token).utility === "stamp");
  // §6.1 bounded: a class list that transitions colour may not run it for longer than 240ms.
  const longDuration = entries.find((e) => (utilityDurationMs(splitUtility(e.token).utility) ?? 0) > BOUNDED_MAX_MS);
  let boundedReported = false;
  for (const { token, where } of entries) {
    const { variants, utility } = splitUtility(token);
    if (!utility) continue;

    let props = null;
    if (Object.hasOwn(TW_TRANSITION, utility) && (utility !== "transition" || classPosition)) props = TW_TRANSITION[utility];
    else {
      const arb = arbitraryValue(utility, "transition");
      if (arb !== null) props = arb.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
    }
    const arbProp = /^\[([\w-]+):(.+)\]$/.exec(utility);
    if (arbProp) {
      const [, prop, raw] = arbProp;
      const value = raw.replace(/_/g, " ");
      const p = prop.toLowerCase();
      if (p === "transition") props = transitionProperties(value);
      else if (p === "transition-property") props = transitionPropertyList(value);
      else if (p === "animation" || p === "animation-name") {
        for (const name of animationNames(value)) checkAnimationName(name, token, where, report, keyframeIndex);
      } else if (p === "will-change" && !/^auto$/i.test(value.trim())) {
        report({ ...where, rule: "will-change", token, message: `\`${token}\` puts will-change in static markup; add it imperatively before a timeline plays (motion §3.4 #9)` });
      } else if (TIMELINE_PROPS.has(p) && !/supports-\[[^\]]*animation-timeline/.test(variants)) {
        report({ ...where, rule: "timeline", token, message: `\`${token}\` sets ${p} outside a supports-[animation-timeline:…] variant (motion §3.2)` });
      }
      for (const problem of bezierProblems(value)) report({ ...where, rule: "overshoot", token, message: problem });
    }

    if (props) {
      for (const p of props) {
        if (p === "all") report({ ...where, rule: "compositor", token, message: `\`${token}\` transitions every property, layout included; use transition-colors, transition-opacity or transition-transform (motion §6.1)` });
        else if (!allowedProperty(p)) {
          const bad = props.filter((q) => q !== "all" && !allowedProperty(q));
          report({ ...where, rule: "compositor", token, message: `\`${token}\` transitions ${bad.map((q) => `\`${q}\``).join(", ")}; use transition-colors, transition-opacity or transition-transform (motion §6.1)` });
          break;
        }
      }
      if (verdict && props.some((p) => p === "all" || COLOUR_PROPS.has(p))) {
        report({ ...where, rule: "stamp-colour", token, message: `\`${token}\` on a .stamp element softens the verdict flip; its colour changes in 0ms (plan §2 rule 3)` });
      }
      if (longDuration && !boundedReported && props.some(isBounded)) {
        boundedReported = true;
        const ms = utilityDurationMs(splitUtility(longDuration.token).utility);
        report({ ...longDuration.where, rule: "compositor", token: longDuration.token, message: `\`${token}\` with \`${longDuration.token}\` runs colour for ${ms}ms; colour and stroke-dashoffset are bounded to a one-shot of at most ${BOUNDED_MAX_MS}ms (motion §6.1)` });
      }
    }

    if (utility.startsWith("animate-")) {
      const arb = arbitraryValue(utility, "animate");
      const name = arb !== null ? animationNames(arb)[0] : utility.slice("animate-".length);
      if (name) checkAnimationName(name, token, where, report, keyframeIndex);
    }
    if (utility.startsWith("will-change-") && utility !== "will-change-auto") {
      report({ ...where, rule: "will-change", token, message: `\`${token}\` puts will-change in static markup; add it imperatively before a timeline plays and remove it after (motion §3.4 #9)` });
    }
    const easeArb = arbitraryValue(utility, "ease");
    if (easeArb !== null) for (const problem of bezierProblems(easeArb)) report({ ...where, rule: "overshoot", token, message: problem });
  }
}

function checkAnimationName(name, token, where, report, keyframeIndex) {
  if (EXTERNAL_LAYOUT_KEYFRAMES.has(name)) {
    report({ ...where, rule: "compositor", token, message: `\`${token}\` animates height (layout); the only layout exception is the ⌘K list (motion §4.3)` });
    return;
  }
  const kf = keyframeIndex.get(name);
  if (kf?.banned.length) report({ ...where, rule: "compositor", token, message: `\`${token}\` runs @keyframes ${name}, which animates ${kf.banned.join(", ")} (motion §6.1)` });
}

// ---------------------------------------------------------------------------
// TS / TSX
// ---------------------------------------------------------------------------

const CLASS_FNS = new Set(["cn", "clsx", "cx", "cva", "twMerge", "twJoin", "tv", "classNames"]);
const CSS_HINT = /(@keyframes|(^|[\s{;])(transition|transition-property|animation|animation-name|animation-timeline|will-change)\s*:)/i;

function kebab(key) {
  if (key.startsWith("--")) return key;
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^ms-/, "-ms-");
}

function scriptKind(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.(m|c)?js$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function propName(node, sf) {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier?.(node)) return node.text;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  if (ts.isComputedPropertyName(node)) {
    const e = node.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    return null;
  }
  return node.getText(sf);
}

function literalNumber(node) {
  if (!node) return null;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) {
    if (node.operator === ts.SyntaxKind.MinusToken) return -Number(node.operand.text);
    if (node.operator === ts.SyntaxKind.PlusToken) return Number(node.operand.text);
  }
  return null;
}

function literalString(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/** String fragments inside `node` (literals, template chunks), with their start positions. */
function stringsIn(node) {
  const out = [];
  const visit = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push({ text: n.text, node: n });
    else if (ts.isTemplateExpression(n)) {
      out.push({ text: n.head.text, node: n.head });
      for (const span of n.templateSpans) {
        visit(span.expression);
        out.push({ text: span.literal.text, node: span.literal });
      }
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

/** Template literal text with each ${…} replaced by `0`, for CSS parsing. */
/**
 * Template literal text for CSS parsing. A `${…}` before a unit becomes `0` (so
 * `${ms}ms` still reads as a time); anywhere else it becomes EXPR, which the checks
 * treat as unknowable rather than guessing (a dynamic property name is not a violation).
 */
function templateText(n) {
  if (ts.isNoSubstitutionTemplateLiteral(n) || ts.isStringLiteral(n)) return n.text;
  if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map((s) => `${/^(ms|s|px|%|deg|em|rem|vh|vw|fr)\b/.test(s.literal.text) ? "0" : EXPR}${s.literal.text}`).join("");
  return null;
}

function isRootExpression(node, sf) {
  const t = node.getText(sf).replace(/\s+/g, "");
  return /^(document|window\.document|globalThis\.document)\.documentElement$/.test(t) || /^document\.querySelector\((['"`])(:root|html)\1\)$/.test(t) || /^(['"`])(:root|html)\1$/.test(t);
}

function analyzeTs(rel, text, report, keyframeIndex) {
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, scriptKind(rel));
  const where = (node) => {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return { file: rel, line: line + 1, col: character + 1 };
  };

  // Imports: motion code and the engine boundary.
  const imports = [];
  const collect = (spec, node) => imports.push({ spec, node });
  const visitImports = (n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) collect(n.moduleSpecifier.text, n.moduleSpecifier);
    else if (ts.isCallExpression(n) && n.arguments.length && ts.isStringLiteral(n.arguments[0])) {
      if (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require")) collect(n.arguments[0].text, n.arguments[0]);
    }
    ts.forEachChild(n, visitImports);
  };
  visitImports(sf);

  const motionModule = (spec) => {
    if (spec.startsWith("@/motion/")) return spec.slice("@/motion/".length).replace(/\.(ts|tsx|mjs|js)$/, "");
    if (spec.startsWith(".")) {
      const abs = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
      if (abs.startsWith("src/motion/")) return abs.slice("src/motion/".length).replace(/\.(ts|tsx|mjs|js)$/, "");
    }
    return null;
  };
  const isMotionCode = rel.startsWith("src/motion/") || imports.some(({ spec }) => MOTION_IMPORT.test(spec) || motionModule(spec) !== null);

  const dashboard = rel.startsWith("app/(app)/") || rel.startsWith("src/components/charts/");
  const marketing = rel.startsWith("app/(marketing)/");
  for (const { spec, node } of imports) {
    const mod = motionModule(spec);
    if (mod === null) continue;
    if (dashboard && ENGINE_GSAP_ENTRIES.has(mod)) report({ ...where(node), rule: "engine-boundary", token: spec, message: `\`${spec}\` is the GSAP entry; GSAP never enters the dashboard (use @/motion/motion or @/motion/useSequence)` });
    if (marketing && ENGINE_MOTION_ENTRIES.has(mod)) report({ ...where(node), rule: "engine-boundary", token: spec, message: `\`${spec}\` is the Motion entry; Motion never enters marketing (use @/motion/gsap or @/motion/useReplay)` });
  }

  const checkTweenVars = (obj, label) => {
    if (!obj || !ts.isObjectLiteralExpression(obj)) return;
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue;
      const key = propName(prop.name, sf);
      if (!key) continue;
      if (key === "keyframes" && ts.isPropertyAssignment(prop)) {
        const v = prop.initializer;
        if (ts.isObjectLiteralExpression(v)) {
          for (const kfProp of v.properties) if (ts.isPropertyAssignment(kfProp)) checkTweenVars(kfProp.initializer, label);
          checkTweenVars(v, label);
        } else if (ts.isArrayLiteralExpression(v)) v.elements.forEach((e) => checkTweenVars(e, label));
        continue;
      }
      const css = kebab(key);
      if (BANNED_TWEEN_PROPS.has(css)) report({ ...where(prop.name), rule: "compositor", token: key, message: `${label} animates \`${key}\` (${css}); only transform, opacity, clip-path, filter and bounded colour may move (motion §6.1)` });
    }
  };

  const checkSpring = (obj) => {
    const values = new Map();
    for (const p of obj.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      const k = propName(p.name, sf);
      if (k) values.set(k, p.initializer);
    }
    const type = literalString(values.get("type"));
    if (type !== "spring") return;
    // Motion's own rule: physics keys win; otherwise duration keys select the bounce model.
    const physics = ["stiffness", "damping", "mass"].some((k) => values.has(k));
    const durationBased = !physics && ["duration", "visualDuration", "bounce"].some((k) => values.has(k));
    if (durationBased) {
      if (!values.has("bounce")) {
        report({ ...where(obj), rule: "overshoot", token: "spring", message: "duration-based spring without `bounce: 0` bounces by default; set bounce: 0 or use a tween (motion §3.3)" });
        return;
      }
      const bounce = literalNumber(values.get("bounce"));
      if (bounce !== null && bounce > 0) report({ ...where(obj), rule: "overshoot", token: "spring", message: `spring with bounce ${bounce} overshoots (ζ = ${(1 - bounce).toFixed(3)}); springs must be critically damped (ζ ≥ 1, motion §3.3)` });
      return;
    }
    const read = (k, d) => (values.has(k) ? literalNumber(values.get(k)) : d);
    const stiffness = read("stiffness", 100);
    const damping = read("damping", 10);
    const mass = read("mass", 1);
    if (stiffness === null || damping === null || mass === null) return;
    const zeta = damping / (2 * Math.sqrt(stiffness * mass));
    if (zeta < 1 - 1e-9) report({ ...where(obj), rule: "overshoot", token: "spring", message: `spring damping ratio ζ = ${zeta.toFixed(3)} < 1 overshoots; use LAYOUT_SPRING (ζ = 1.009) or a tween (motion §3.3)` });
  };

  const checkEaseValue = (init) => {
    const s = literalString(init);
    if (s !== null) {
      if (OVERSHOOT_GSAP.test(s) || OVERSHOOT_MOTION.has(s)) report({ ...where(init), rule: "overshoot", token: s, message: `ease "${s}" overshoots; use the instrument / snap / mass / exit tokens (motion §2.1)` });
      return;
    }
    if (ts.isIdentifier(init) && OVERSHOOT_MOTION.has(init.text)) report({ ...where(init), rule: "overshoot", token: init.text, message: `ease ${init.text} overshoots; use the instrument / snap / mass / exit tokens (motion §2.1)` });
    if (ts.isArrayLiteralExpression(init) && init.elements.length === 4) {
      const nums = init.elements.map(literalNumber);
      if (nums.every((n) => n !== null)) for (const problem of bezierProblems(`cubic-bezier(${nums.join(", ")})`)) report({ ...where(init), rule: "overshoot", token: "ease", message: problem });
    }
  };

  const checkCssString = (node) => {
    const raw = templateText(node);
    if (raw === null || !CSS_HINT.test(raw)) return;
    const start = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    const body = raw.includes("{") ? raw : `x{${raw}}`;
    const parsed = parseCss(body, { lineOffset: start.line, colOffset: start.character + (raw.includes("{") ? 1 : -1) });
    const kfIndex = new Map(keyframeIndex);
    for (const [k, v] of indexKeyframes([parsed])) kfIndex.set(k, v);
    checkCssDecls(parsed, rel, report, kfIndex);
  };

  const classPositionNodes = new Set();
  /** { token, where } for every class token in the string literals under `node`. */
  const classEntries = (node) => {
    const out = [];
    for (const s of stringsIn(node)) {
      classPositionNodes.add(s.node);
      const w = where(s.node);
      for (const token of s.text.split(/\s+/).filter(Boolean)) out.push({ token, where: w });
    }
    return out;
  };

  const visit = (node) => {
    // --- JSX attributes ---
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf);
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      const attr = (name) => attrs.find((a) => a.name.getText(sf) === name);
      const classAttr = attr("className") ?? attr("class");
      const entries = classAttr?.initializer ? classEntries(classAttr.initializer) : [];
      if (entries.length) checkClassTokens(entries, report, keyframeIndex, { classPosition: true });
      const stamped = entries.some((e) => splitUtility(e.token).utility === "stamp");
      const verdict = stamped || attrs.some((a) => /^data-(verdict|gate)$/.test(a.name.getText(sf)));
      if (verdict && !stamped) {
        // a [data-verdict] / [data-gate] element with a colour transition class
        const colourish = entries.find(({ token }) => {
          const u = splitUtility(token).utility;
          return u === "transition" || u === "transition-all" || u === "transition-colors" || (u.startsWith("transition-[") && /color|all|fill|stroke/.test(u));
        });
        if (colourish) report({ ...colourish.where, rule: "stamp-colour", token: colourish.token, message: `\`${colourish.token}\` on a verdict / gate element softens the 0ms flip (plan §2 rule 3)` });
      }
      const style = attr("style");
      const styleObj = style?.initializer && ts.isJsxExpression(style.initializer) ? style.initializer.expression : null;
      if (styleObj && ts.isObjectLiteralExpression(styleObj)) {
        for (const p of styleObj.properties) {
          if (!ts.isPropertyAssignment(p)) continue;
          const key = propName(p.name, sf);
          const value = literalString(p.initializer) ?? (ts.isTemplateExpression(p.initializer) ? templateText(p.initializer) : null);
          if (!key) continue;
          const css = kebab(key);
          const w = where(p.name);
          if (css === "will-change") report({ ...w, rule: "will-change", token: key, message: "a static willChange style; add will-change imperatively before a timeline plays (motion §3.4 #9)" });
          else if (TIMELINE_PROPS.has(css)) report({ ...w, rule: "timeline", token: key, message: `inline ${css} cannot sit inside @supports (motion §3.2)` });
          else if (value !== null && (css === "transition" || css === "transition-property")) {
            const props = css === "transition" ? transitionProperties(value) : transitionPropertyList(value);
            for (const q of props ?? []) {
              if (q.includes(EXPR)) continue;
              if (q === "all") report({ ...w, rule: "compositor", token: key, message: "inline `transition: all` transitions layout too (motion §6.1)" });
              else if (!allowedProperty(q)) report({ ...w, rule: "compositor", token: key, message: `inline transition of \`${q}\` (motion §6.1)` });
            }
            if (verdict && (props ?? []).some((q) => q === "all" || COLOUR_PROPS.has(q))) report({ ...w, rule: "stamp-colour", token: key, message: "inline transition on a verdict / gate colour; it flips in 0ms (plan §2 rule 3)" });
          } else if (value !== null && (css === "animation" || css === "animation-name")) {
            for (const name of animationNames(value)) checkAnimationName(name, key, w, report, keyframeIndex);
          }
          if (value !== null) for (const problem of bezierProblems(value)) report({ ...w, rule: "overshoot", token: key, message: problem });
        }
      }
      // Motion components: <m.div animate={…}>
      if (isMotionCode && /^(m|motion)\./.test(tag)) {
        for (const a of attrs) {
          const name = a.name.getText(sf);
          const expr = a.initializer && ts.isJsxExpression(a.initializer) ? a.initializer.expression : null;
          if (!expr) continue;
          if (/^(animate|initial|exit|while[A-Z]\w*)$/.test(name)) checkTweenVars(expr, `<${tag} ${name}>`);
          if (name === "variants" && ts.isObjectLiteralExpression(expr)) for (const v of expr.properties) if (ts.isPropertyAssignment(v)) checkTweenVars(v.initializer, `<${tag}> variant`);
        }
      }
      // <style>{`…`}</style> and <style dangerouslySetInnerHTML={{ __html: `…` }} />
      if (tag === "style") {
        const html = attr("dangerouslySetInnerHTML");
        const e = html?.initializer && ts.isJsxExpression(html.initializer) ? html.initializer.expression : null;
        if (e && ts.isObjectLiteralExpression(e)) {
          for (const p of e.properties) if (ts.isPropertyAssignment(p) && propName(p.name, sf) === "__html") stringsIn(p.initializer).forEach((s) => checkCssString(s.node));
        }
      }
    }

    // --- class helper calls: cn(), clsx(), cva() ---
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CLASS_FNS.has(node.expression.text)) {
      const entries = node.arguments.flatMap((arg) => classEntries(arg));
      if (entries.length) checkClassTokens(entries, report, keyframeIndex, { classPosition: true });
    }

    // --- every other string: hyphenated utilities, CSS text, cubic-bezier ---
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const raw = templateText(node) ?? "";
      if (CSS_HINT.test(raw)) checkCssString(node);
      else if (!classPositionNodes.has(node)) {
        const w = where(node);
        const entries = raw
          .split(/\s+/)
          .filter((t) => /^[^\s]*(transition-|animate-|will-change-|ease-\[|\[(transition|animation|will-change|view-timeline|scroll-timeline))/.test(t))
          .map((token) => ({ token, where: w }));
        if (entries.length) checkClassTokens(entries, report, keyframeIndex, { classPosition: false });
        for (const problem of bezierProblems(raw)) report({ ...w, rule: "overshoot", token: "cubic-bezier", message: problem });
      }
      if (isMotionCode && /(^|[^\w])random\(/.test(raw) && !/Math\.random/.test(raw)) {
        report({ ...where(node), rule: "math-random", token: "random()", message: "GSAP random() in motion code; replays must be frame-identical (motion §4.6.1)" });
      }
    }

    // --- property assignments anywhere: ease values and springs ---
    if (ts.isObjectLiteralExpression(node)) {
      if (isMotionCode) checkSpring(node);
      for (const p of node.properties) if (ts.isPropertyAssignment(p) && propName(p.name, sf) === "ease") checkEaseValue(p.initializer);
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const receiver = node.expression.expression;
      // document.documentElement.style.setProperty("--x", …)
      if (method === "setProperty" && ts.isPropertyAccessExpression(receiver) && receiver.name.text === "style" && isRootExpression(receiver.expression, sf)) {
        const first = node.arguments[0];
        const name = first ? (literalString(first) ?? (ts.isTemplateExpression(first) ? first.head.text : null)) : null;
        if (name?.startsWith("--")) report({ ...where(node), rule: "root-custom-property", token: name, message: `writes ${name} on :root; write it on the element that uses it (motion §2.6, §6.1)` });
      }
      // document.documentElement.animate([{ "--x": … }])
      if (method === "animate" && isRootExpression(receiver, sf)) {
        const kf = node.arguments[0];
        const objs = kf && ts.isArrayLiteralExpression(kf) ? kf.elements : kf ? [kf] : [];
        for (const o of objs)
          if (ts.isObjectLiteralExpression(o) && o.properties.some((p) => ts.isPropertyAssignment(p) && propName(p.name, sf)?.startsWith("--")))
            report({ ...where(node), rule: "root-custom-property", token: "animate", message: "animates a custom property on :root (motion §6.1)" });
      }
      // GSAP tweens: x.to(target, vars) / x.from(target, vars) / x.fromTo(target, from, to)
      if (isMotionCode && (method === "to" || method === "from" || method === "fromTo")) {
        const [target, ...rest] = node.arguments;
        const varsList = method === "fromTo" ? rest.slice(0, 2) : rest.slice(0, 1);
        for (const vars of varsList) {
          checkTweenVars(vars, `gsap .${method}()`);
          if (target && isRootExpression(target, sf) && vars && ts.isObjectLiteralExpression(vars) && vars.properties.some((p) => ts.isPropertyAssignment(p) && propName(p.name, sf)?.startsWith("--"))) {
            report({ ...where(node), rule: "root-custom-property", token: method, message: "a GSAP tween animates a custom property on :root (motion §6.1)" });
          }
        }
      }
    }

    // el.style.transition = "…" / el.style.animation = "…"
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left)) {
      const key = node.left.name.text;
      const obj = node.left.expression;
      const value = literalString(node.right);
      if (value !== null && ts.isPropertyAccessExpression(obj) && obj.name.text === "style") {
        if (key === "transition" || key === "transitionProperty") {
          const props = key === "transition" ? transitionProperties(value) : transitionPropertyList(value);
          for (const q of props ?? []) if (q === "all" || !allowedProperty(q)) report({ ...where(node), rule: "compositor", token: key, message: `style.${key} = "${value}" (motion §6.1)` });
        }
      }
    }

    if (isMotionCode && ts.isPropertyAccessExpression(node)) {
      const text = node.getText(sf).replace(/\s+/g, "");
      if (text === "Math.random") report({ ...where(node), rule: "math-random", token: "Math.random", message: "Math.random in motion code; replays must be frame-identical (motion §4.6.1)" });
      else if (/(^|\.)utils\.random$/.test(text)) report({ ...where(node), rule: "math-random", token: "gsap.utils.random", message: "gsap.utils.random in motion code; replays must be frame-identical (motion §4.6.1)" });
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set(["node_modules", ".next", "out", "build", "coverage", "test-results", "playwright-report"]);
const SKIP_FILES = [/\.d\.ts$/, /\.gen\.ts$/, /^src\/api\/(client|core)\//];

function walk(root, rel, files) {
  let entries;
  try {
    entries = readdirSync(path.join(root, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(root, r, files);
    } else if (/\.(css|tsx?|jsx?|mjs|cjs)$/.test(e.name) && !SKIP_FILES.some((re) => re.test(r))) files.push(r);
  }
}

export function fingerprint(line) {
  return createHash("sha1").update(line.trim()).digest("hex").slice(0, 12);
}

/**
 * Lint `dirs` under `root`. Returns { violations, baselined, stale, files }:
 * violations are unbaselined problems (non-empty means exit 1).
 */
export function lintMotion({ root = DEFAULT_ROOT, dirs = DEFAULT_DIRS, baseline = BASELINE, files: only } = {}) {
  const files = [];
  if (only) files.push(...only);
  else
    for (const d of dirs) {
      const abs = path.join(root, d);
      if (statSync(abs, { throwIfNoEntry: false })?.isFile()) files.push(d);
      else walk(root, d, files);
    }
  files.sort();
  const sources = new Map(files.map((f) => [f, readFileSync(path.join(root, f), "utf8")]));

  const parsedCss = new Map();
  for (const [f, text] of sources) if (f.endsWith(".css")) parsedCss.set(f, parseCss(text));
  const keyframeIndex = indexKeyframes([...parsedCss.values()]);

  const found = [];
  const seen = new Set();
  const report = (v) => {
    const key = `${v.file}:${v.line}:${v.col}:${v.rule}:${v.token}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(v);
  };

  for (const [f, parsed] of parsedCss) checkCssDecls(parsed, f, report, keyframeIndex);
  for (const [f, text] of sources) if (!f.endsWith(".css")) analyzeTs(f, text, report, keyframeIndex);

  const lines = new Map([...sources].map(([f, t]) => [f, t.split("\n")]));
  const used = new Set();
  const violations = [];
  const baselined = [];
  for (const v of found) {
    v.fingerprint = fingerprint(lines.get(v.file)?.[v.line - 1] ?? "");
    const hit = baseline.findIndex((b) => b.file === v.file && b.rule === v.rule && b.token === v.token && b.fingerprint === v.fingerprint);
    if (hit >= 0) {
      used.add(hit);
      baselined.push(v);
    } else violations.push(v);
  }
  const stale = baseline.filter((b, i) => !used.has(i) && sources.has(b.file));
  const order = (x, y) => x.file.localeCompare(y.file) || x.line - y.line || x.col - y.col;
  return { violations: violations.sort(order), baselined: baselined.sort(order), stale, files: files.length };
}

function format(v) {
  return `${v.file}:${v.line}:${v.col}  ${v.rule}  ${v.message}`;
}

function main(argv) {
  const args = { root: DEFAULT_ROOT, dirs: [], json: false, baseline: true, printBaseline: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") args.root = path.resolve(argv[++i] ?? "");
    else if (a === "--dir") args.dirs.push(argv[++i] ?? "");
    else if (a === "--json") args.json = true;
    else if (a === "--no-baseline") args.baseline = false;
    else if (a === "--print-baseline") args.printBaseline = true;
    else if (a === "-h" || a === "--help") {
      console.log("usage: node scripts/lint-motion.mjs [--root <web>] [--dir <rel>]... [--json] [--no-baseline] [--print-baseline]");
      return 0;
    } else {
      console.error(`lint-motion: unknown argument ${a}`);
      return 2;
    }
  }
  const result = lintMotion({ root: args.root, dirs: args.dirs.length ? args.dirs : DEFAULT_DIRS, baseline: args.baseline ? BASELINE : [] });
  if (args.printBaseline) {
    const entries = result.violations.map((v) => ({ file: v.file, rule: v.rule, token: v.token, fingerprint: v.fingerprint }));
    console.log(JSON.stringify(entries, null, 2));
    return 0;
  }
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return result.violations.length ? 1 : 0;
  }
  for (const v of result.violations) console.log(format(v));
  if (result.stale.length) console.log(`motion-lint: ${result.stale.length} baseline entr${result.stale.length === 1 ? "y is" : "ies are"} stale (the line changed or is fixed): remove from BASELINE in scripts/lint-motion.mjs`);
  const summary = `motion-lint: ${result.files} files · ${result.violations.length} violation${result.violations.length === 1 ? "" : "s"} · ${result.baselined.length} baselined`;
  if (result.violations.length) {
    console.log(summary);
    return 1;
  }
  console.log(`${summary} · clean`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
