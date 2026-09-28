// OWNER: t1a (wave 1). src/components/brand/palette.ts holds literal hex for the
// renderers that cannot read CSS custom properties (Satori, the favicon canvas,
// the committed rasters). Each value must equal its token's hex fallback in
// app/tokens/core.css layer C, or the OG card and the tab icon drift from the
// product.
import { describe, expect, it } from 'vitest';
import { BRAND_HEX, FLAT_HEX, WITNESS_HEX, flattenWhite } from '@/components/brand';
import { readCss } from './css';

const TOKEN_OF: Record<keyof typeof BRAND_HEX, string> = {
  ink0: '--ink-0',
  ink1: '--ink-1',
  ink2: '--ink-2',
  textPrimary: '--text-primary',
  textBody: '--text-body',
  textDim: '--text-dim',
  signalText: '--signal-text',
  signal: '--signal',
  signalLo: '--signal-lo',
  signalTintLo: '--signal-tint-lo',
  alarmText: '--alarm-text',
  alarmHi: '--alarm-hi',
  alarm: '--alarm',
  alarmTintLo: '--alarm-tint-lo',
};

/** The hex fallbacks: core.css layer C, `@supports not (color: oklch(0 0 0)) { … }`. */
function hexFallbacks(): Map<string, string> {
  const source = readCss('app/tokens/core.css');
  const start = source.indexOf('@supports not (color: oklch(0 0 0))');
  expect(start).toBeGreaterThan(-1);
  const block = source.slice(start, source.indexOf('}', source.indexOf('{', source.indexOf('{', start) + 1)));
  const out = new Map<string, string>();
  for (const m of block.matchAll(/(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) out.set(m[1], m[2].toUpperCase());
  return out;
}

describe('BRAND_HEX', () => {
  const fallbacks = hexFallbacks();

  it('matches every token hex fallback in app/tokens/core.css', () => {
    for (const [name, token] of Object.entries(TOKEN_OF) as [keyof typeof BRAND_HEX, string][]) {
      expect(fallbacks.get(token), token).toBeDefined();
      expect(BRAND_HEX[name], `${name} ↔ ${token}`).toBe(fallbacks.get(token));
    }
  });

  it('has no green and no hue outside the three families (brand-gaps §A)', () => {
    for (const hex of Object.values(BRAND_HEX)) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      // Green-dominant means g clearly above both r and b; cyan (g ≈ b) is signal, not green.
      expect(g > r + 24 && g > b + 24, hex).toBe(false);
    }
  });
});

describe('flattenWhite', () => {
  it('composites alpha-white over an opaque base the way the browser does', () => {
    // The flattened values core.css documents beside each alpha rule (layer A comments).
    expect(flattenWhite(0.055, BRAND_HEX.ink0)).toBe('#16171A');
    expect(flattenWhite(0.09, BRAND_HEX.ink0)).toBe('#1E2023');
    expect(flattenWhite(0.14, BRAND_HEX.ink0)).toBe('#2B2C2F');
    expect(flattenWhite(0.22, BRAND_HEX.ink0)).toBe('#3E4042');
    expect(flattenWhite(0, BRAND_HEX.ink0)).toBe(BRAND_HEX.ink0);
    expect(flattenWhite(1, BRAND_HEX.ink0)).toBe('#FFFFFF');
  });

  it('pre-flattens the rules the OG card draws', () => {
    expect(FLAT_HEX.ruleHairOnInk0).toBe('#16171A');
    expect(FLAT_HEX.rule1OnInk0).toBe('#1E2023');
    expect(FLAT_HEX.rule2OnInk0).toBe('#2B2C2F');
  });
});

describe('WITNESS_HEX', () => {
  it('equals the landing tokens the marks are drawn in (--lime, --ink)', () => {
    const hero = readCss('src/components/v2/hero/hero.module.css');
    expect(hero.match(/--lime:\s*(#[0-9a-fA-F]{6})/)?.[1].toUpperCase()).toBe(WITNESS_HEX.lime);
    expect(hero.match(/--ink:\s*(#[0-9a-fA-F]{6})/)?.[1].toUpperCase()).toBe(WITNESS_HEX.ink);
    // The footer draws the eye in its own --lime.
    const footer = readCss('src/components/v2/footer/footer.module.css');
    expect(footer.match(/--lime:\s*(#[0-9a-fA-F]{6})/)?.[1].toUpperCase()).toBe(WITNESS_HEX.lime);
  });

  it('shares the product alarm red', () => {
    expect(WITNESS_HEX.alarm).toBe(BRAND_HEX.alarm);
  });
});
