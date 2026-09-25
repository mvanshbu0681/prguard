// OWNER: t1a (wave 1). The committed brand assets (brand-gaps §C). The
// browser-free ones are rebuilt from the mark's geometry and compared byte for
// byte, so a geometry or palette change that is not followed by
//   bash scripts/slot.sh browser npx tsx scripts/brand/build-assets.mts
// fails here. The Chromium-rasterised ones (touch icon, avatar) are checked
// pixel by pixel against the spec instead.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { docMarkSvg, faviconIco, iconSvg, maskSvg } from '../../../scripts/brand/assets';
import { pngSize } from '../../../scripts/brand/ico';
import { decodePng, type DecodedPng } from '../../../scripts/brand/png';
import { BRAND_HEX, CIRCLE_BAR_WIDTH, markGeometry } from '@/components/brand';
import { WEB } from './css';

const file = (rel: string) => readFileSync(path.join(WEB, rel));
const text = (rel: string) => file(rel).toString('utf8');

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const pixel = (png: DecodedPng, x: number, y: number) => Array.from(png.rgba.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4));
const near = (a: number[], b: number[], tolerance = 2) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);

describe('committed assets match the geometry they are built from', () => {
  it('app/icon.svg', () => expect(text('app/icon.svg')).toBe(iconSvg()));
  it('public/brand/icon-mask.svg', () => expect(text('public/brand/icon-mask.svg')).toBe(maskSvg()));
  it('public/brand/prguard-mark.svg', () => expect(text('public/brand/prguard-mark.svg')).toBe(docMarkSvg()));
  it('app/favicon.ico', () => expect(new Uint8Array(file('app/favicon.ico'))).toEqual(faviconIco()));
});

describe('app/icon.svg', () => {
  const svg = iconSvg();
  it('is the ≤19px form on a transparent field, --signal, swapping to --ink-0 in light schemes', () => {
    expect(svg).toContain('viewBox="0 0 16 16"');
    expect(svg.match(/<path /g)).toHaveLength(2); // two bars, no seam, no ticks
    expect(svg).not.toContain('<rect'); // no background: transparent
    expect(svg).toContain(`path{fill:${BRAND_HEX.signal}}`);
    expect(svg).toMatch(new RegExp(`@media \\(prefers-color-scheme:light\\)\\{path\\{fill:${BRAND_HEX.ink0}\\}\\}`));
  });
});

describe('public/brand/icon-mask.svg', () => {
  it('is a single solid-black path (Safari pinned tab)', () => {
    const svg = maskSvg();
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(svg).toContain('fill="#000000"');
    expect(svg).not.toMatch(/<style|<rect|<g/);
  });
});

describe('app/favicon.ico', () => {
  const ico = new Uint8Array(file('app/favicon.ico'));
  const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
  const entries = [0, 1].map((i) => {
    const at = 6 + 16 * i;
    const bytes = view.getUint32(at + 8, true);
    const offset = view.getUint32(at + 12, true);
    return { w: ico[at], h: ico[at + 1], png: ico.subarray(offset, offset + bytes) };
  });

  it('holds a 16×16 and a 32×32 PNG frame', () => {
    expect([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]).toEqual([0, 1, 2]);
    expect(entries.map((e) => [e.w, e.h])).toEqual([
      [16, 16],
      [32, 32],
    ]);
    expect(entries.map((e) => pngSize(e.png))).toEqual([
      { width: 16, height: 16 },
      { width: 32, height: 32 },
    ]);
  });

  it('is --signal on --ink-0 only: fully opaque, never transparent, no anti-aliasing', () => {
    const allowed = [rgb(BRAND_HEX.ink0), rgb(BRAND_HEX.signal)];
    for (const { png } of entries) {
      const img = decodePng(png);
      for (let i = 0; i < img.rgba.length; i += 4) {
        expect(img.rgba[i + 3]).toBe(255);
        const colour = Array.from(img.rgba.subarray(i, i + 3));
        expect(allowed.some((c) => c.every((v, k) => v === colour[k])), `pixel ${i / 4}: ${colour}`).toBe(true);
      }
      expect(pixel(img, 0, 0).slice(0, 3)).toEqual(rgb(BRAND_HEX.ink0));
    }
  });

  it('draws two bars at a 2px stroke: the 16px frame has a 1px hollow in the base bar', () => {
    const img = decodePng(entries[0].png);
    const g = markGeometry(16, { form: 'two-bars' });
    const signal = rgb(BRAND_HEX.signal);
    const ink = rgb(BRAND_HEX.ink0);
    const cx = 8;
    const column = Array.from({ length: 16 }, (_, y) => (near(pixel(img, cx, y).slice(0, 3), signal, 0) ? 1 : 0)).join('');
    // Down the centre column: stroke, hollow, stroke, gap, solid head.
    const expected = Array.from({ length: 16 }, (_, y) => {
      const inBase = y >= g.base.y && y < g.base.y + g.base.h;
      const inHollow = y >= g.base.y + g.base.stroke && y < g.base.y + g.base.h - g.base.stroke;
      const inHead = y >= g.head.y && y < g.head.y + g.head.h;
      return (inBase && !inHollow) || inHead ? 1 : 0;
    }).join('');
    expect(column).toBe(expected);
    expect(column).toBe('0011011001111100');
    expect(near(pixel(img, 0, 8).slice(0, 3), ink, 0)).toBe(true);
  });
});

describe('app/apple-icon.png and the GitHub App avatar', () => {
  const cases = [
    { rel: 'app/apple-icon.png', size: 180 },
    { rel: 'public/brand/prguard-app-avatar-512.png', size: 512 },
  ];

  for (const { rel, size } of cases) {
    // Pixel-walking a 512x512 decode in pure JS is ~1-3s alone and can pass 5s when the
    // whole suite runs in parallel. The budget is honest; the checks are unchanged.
    describe(rel, { timeout: 30_000 }, () => {
      const img = decodePng(new Uint8Array(file(rel)));
      const g = markGeometry(size, { crop: 'circle' });
      const ink = rgb(BRAND_HEX.ink0);
      const signal = rgb(BRAND_HEX.signal);

      it(`is ${size}×${size}, opaque, on a solid --ink-0 field edge to edge (no radius)`, () => {
        expect([img.width, img.height]).toEqual([size, size]);
        for (let i = 3; i < img.rgba.length; i += 4) expect(img.rgba[i]).toBe(255);
        for (const [x, y] of [
          [0, 0],
          [size - 1, 0],
          [0, size - 1],
          [size - 1, size - 1],
          [size >> 1, 2],
          [2, size >> 1],
        ]) {
          expect(near(pixel(img, x, y).slice(0, 3), ink), `${rel} (${x},${y})`).toBe(true);
        }
      });

      it('carries the mark only: two --signal bars at 56% of the width, the base bar hollow', () => {
        const headRow = Math.round(g.head.y + g.head.h / 2);
        let run = 0;
        for (let x = 0; x < size; x++) if (near(pixel(img, x, headRow).slice(0, 3), signal, 8)) run++;
        expect(Math.abs(run / size - CIRCLE_BAR_WIDTH)).toBeLessThan(0.02);
        // The hollow's centre is ink; the base bar's stroke either side of it is signal.
        const cx = size >> 1;
        const hollowRow = Math.round(g.base.y + g.base.h / 2);
        expect(near(pixel(img, cx, hollowRow).slice(0, 3), ink, 8)).toBe(true);
        expect(near(pixel(img, cx, Math.round(g.base.y + g.base.stroke / 2)).slice(0, 3), signal, 8)).toBe(true);
        expect(near(pixel(img, cx, headRow).slice(0, 3), signal, 8)).toBe(true);
        // Nothing but ink and signal (plus the edge blend between them): no --alarm, no text, no ticks.
        for (let i = 0; i < img.rgba.length; i += 4) {
          const [r, gg, b] = [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]];
          expect(r <= Math.max(ink[0], signal[0]) + 2 && gg >= ink[1] - 2 && b >= ink[2] - 2, `${rel} pixel ${i / 4}`).toBe(true);
        }
      });
    });
  }
});
