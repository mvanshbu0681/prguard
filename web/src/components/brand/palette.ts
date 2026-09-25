// OWNER: t1a (wave 1).
//
// Literal hex for the renderers that cannot read CSS custom properties: the OG
// card (Satori: no var(), no oklch — brand-gaps §C), the live favicon canvas and
// the committed brand assets (scripts/brand). Everything in the DOM uses the
// tokens instead (var(--signal) …). Each value is the token's hex fallback in
// app/tokens/core.css layer C; tests/unit/chrome/palette.test.ts fails the
// build if one drifts. Alpha-white rules are pre-flattened over --ink-0 (or
// the named surface), because Satori and PNG favicons have no backdrop to blend.

export const BRAND_HEX = {
  ink0: '#080A0D',
  ink1: '#0F1114',
  ink2: '#16191C',
  textPrimary: '#EEF0F3',
  textBody: '#CDD1D6',
  textDim: '#8D9399',
  signalText: '#7AECF8',
  signal: '#2ECEDD',
  signalLo: '#0698A4',
  signalTintLo: '#111A1E',
  alarmText: '#FFBFB7',
  alarmHi: '#FD8074',
  alarm: '#F64F47',
  alarmTintLo: '#241719',
} as const;

/** White at `alpha` composited over `base` (sRGB, what the browser does for oklch(1 0 0 / a) on an opaque surface). */
export function flattenWhite(alpha: number, base: string): string {
  const channels = base
    .replace('#', '')
    .match(/../g)!
    .map((h) => parseInt(h, 16));
  const out = channels.map((c) => Math.round(c + (255 - c) * alpha));
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Alpha-white rules and grids flattened for flat-colour renderers. */
export const FLAT_HEX = {
  /** --rule-hair (0.055) over --ink-0 — also the 64px major graph-paper line (minor 0.028 + major 0.028 ≈ 0.055). */
  ruleHairOnInk0: flattenWhite(0.055, BRAND_HEX.ink0),
  /** --rule-1 (0.09) over --ink-0. */
  rule1OnInk0: flattenWhite(0.09, BRAND_HEX.ink0),
  /** --rule-1 (0.09) over --ink-2 (panel edges inside the card). */
  rule1OnInk2: flattenWhite(0.09, BRAND_HEX.ink2),
  /** --rule-2 (0.14) over --ink-0 — the mark's corner ticks (brand-gaps §A colour table) and Lockup A's hairline. */
  rule2OnInk0: flattenWhite(0.14, BRAND_HEX.ink0),
  /** --rule-2 (0.14) over --ink-2. */
  rule2OnInk2: flattenWhite(0.14, BRAND_HEX.ink2),
} as const;
