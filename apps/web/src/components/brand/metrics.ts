// OWNER: t1a (wave 1).
//
// Google Sans Code measurements the brand layout depends on, read from the
// committed font (app/fonts/GoogleSansCode-VF-latin.woff2, unitsPerEm 2000)
// with fontTools — see scripts/brand/instance-fonts.py, which prints them.
// They are em fractions, so they hold at every size.

/** OS/2 sCapHeight 1432 / 2000. Lockup A's hairline is exactly this tall (brand-gaps §B). */
export const GSC_CAP_HEIGHT = 0.716;

/** Advance of every glyph (monospace, MONO axis pinned to 1): 1200 / 2000. */
export const GSC_ADVANCE = 0.6;

/** Left side bearing of "W" at wght 560: 26 / 2000. */
export const GSC_W_LSB_560 = 0.013;

/** Right side bearing of "S" at wght 560: 82 / 2000. */
export const GSC_S_RSB_560 = 0.041;

/** Wordmark tracking (brand-gaps §B): +0.04em — tighter than the label tier's +0.12em, so it reads as a name. */
export const WORDMARK_TRACKING = 0.04;

/** Wordmark weight on the variable axis: 560 — not 500, not 600 (brand-gaps §B). */
export const WORDMARK_WEIGHT = 560;

/** Never below 12px (brand-gaps §B minimum sizes). */
export const WORDMARK_MIN = 12;

/**
 * Horizontal extent of a wordmark of `cells` glyphs in em ("PR GUARD" is 8:
 * Google Sans Code is monospace, so every cell, the space included, is one
 * advance). From the first cell's left edge to the last cell's right edge, the
 * trailing tracking excluded. Lockup B's rail spans it (brand-gaps §B).
 */
export const wordmarkExtent = (cells: number) => ({ start: 0, end: cells * GSC_ADVANCE + (cells - 1) * WORDMARK_TRACKING });
