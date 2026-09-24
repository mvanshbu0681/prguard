// OWNER: t5 (wave 2). The segment ramp — one hue, six lightness steps (dashboard
// blueprint §3a, landing blueprint §05): `oklch(0.86 → 0.51, C 0.09, H 205)` in
// SEVERITY_INPUTS' weight-descending order, brightest = biggest lever. This is a
// DIFFERENT ramp from the band colours (`--sev-*` in app/tokens/core.css): the six
// segments encode which INPUT moved the score; the ticks and the band label encode
// WHERE the score landed. No token exists for this ramp (core.css is t0-owned and
// frozen), so it is computed here rather than hard-coded per step.
import type { SeverityBand } from "@/lib/contracts";

const RAMP_L_START = 0.86;
const RAMP_L_END = 0.51;
const RAMP_C = 0.09;
const RAMP_H = 205;

/** `oklch(l c h)` for the segment at `index` of `total` (0 = brightest = the biggest weight). */
export function segmentColor(index: number, total: number): string {
  const t = total <= 1 ? 0 : index / (total - 1);
  const l = RAMP_L_START + (RAMP_L_END - RAMP_L_START) * t;
  return `oklch(${l.toFixed(4)} ${RAMP_C} ${RAMP_H})`;
}

/** One lightness step brighter (hover/keyboard-focus, §3a: "brightens one lightness step"), clamped to the ramp's own ceiling. */
export function segmentColorHover(index: number, total: number): string {
  const t = total <= 1 ? 0 : index / (total - 1);
  const step = (RAMP_L_START - RAMP_L_END) / Math.max(1, total - 1);
  const l = Math.min(RAMP_L_START, RAMP_L_START + (RAMP_L_END - RAMP_L_START) * t + step);
  return `oklch(${l.toFixed(4)} ${RAMP_C} ${RAMP_H})`;
}

/**
 * `proof_confidence` reuses its ramp step plus this 2px 45° hatch — the only input
 * about the system's own certainty rather than about the code (§3a). Drawn as a
 * darker diagonal repeat over the segment's own fill, not a second colour.
 */
export const PROOF_CONFIDENCE_HATCH = "repeating-linear-gradient(45deg, oklch(0 0 0 / 0.32) 0px, oklch(0 0 0 / 0.32) 1px, transparent 1px, transparent 3px)";

/**
 * The band colour for TEXT (band label, glyph letter). `--sev-critical` is
 * byte-identical to `--alarm`, which is FILL-ONLY (design-system §1.5 R2, plan hard
 * rule): critical text uses `--alarm-text` instead, never the raw band token. The
 * other four bands are not fill-only, so their own `--sev-*` token is safe as text
 * (matches <SeverityMeter>'s glyph-letter precedent, @/components/badges).
 *
 * Literal strings, not a template (`` `text-sev-${band}` ``): Tailwind's scanner
 * only picks up class names it can see whole in source.
 */
export const BAND_TEXT_CLASS: Record<SeverityBand, string> = {
  info: "text-sev-info",
  low: "text-sev-low",
  medium: "text-sev-medium",
  high: "text-sev-high",
  critical: "text-alarm-text",
};

/** The band colour for a FILL (promoted tick) — safe to use directly, `--alarm` included (R2 restricts text, not fills). */
export const BAND_FILL_CLASS: Record<SeverityBand, string> = {
  info: "bg-sev-info",
  low: "bg-sev-low",
  medium: "bg-sev-medium",
  high: "bg-sev-high",
  critical: "bg-sev-critical",
};
