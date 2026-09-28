// The committed brand assets. The SVGs are rebuilt from the mark's geometry and
// compared byte for byte, so a geometry or palette change that is not followed by
//   bash scripts/slot.sh browser npx tsx scripts/brand/build-assets.mts
// fails here. The Chromium-rasterised ones (favicon frames, touch icon, avatar)
// are checked pixel by pixel against the geometry instead.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { docMarkSvg, iconSvg, maskSvg } from '../../../scripts/brand/assets';
import { pngSize } from '../../../scripts/brand/ico';
import { decodePng, type DecodedPng } from '../../../scripts/brand/png';
import { MARK_FORMS, MARK_LID_POINTS, WITNESS_HEX, markGeometry, type MarkGeometry } from '@/components/brand';
import { WEB } from './css';

const file = (rel: string) => readFileSync(path.join(WEB, rel));
const text = (rel: string) => file(rel).toString('utf8');

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const pixel = (png: DecodedPng, x: number, y: number) => Array.from(png.rgba.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4));
const near = (a: number[], b: number[], tolerance = 2) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
/** An artboard point → the pixel that contains it in a raster of `g`. */
const at = (g: MarkGeometry, x: number, y: number) =>
  [Math.floor(((x - g.box.x) / g.box.side) * g.size), Math.floor(((y - g.box.y) / g.box.side) * g.size)] as const;
/** A point inside the eye, clear of both lids: just right of the pupil, on its centre line. */
const openArea = (g: MarkGeometry) => at(g, g.pupil.cx + g.pupil.r + 1.2, g.pupil.cy);

const ink = rgb(WITNESS_HEX.ink);
const lime = rgb(WITNESS_HEX.lime);

describe('committed assets match the geometry they are built from', () => {
  it('app/icon.svg', () => expect(text('app/icon.svg')).toBe(iconSvg()));
  it('public/brand/icon-mask.svg', () => expect(text('public/brand/icon-mask.svg')).toBe(maskSvg()));
  it('public/brand/witness-mark.svg', () => expect(text('public/brand/witness-mark.svg')).toBe(docMarkSvg()));
});

describe('app/icon.svg', () => {
  const svg = iconSvg();
  it('is the small-form eye in lime on a rounded ink tile', () => {
    expect(svg).toMatch(/<rect [^>]*rx="[\d.]+" fill="#131313"\/>/);
    expect(svg.match(/<path /g)).toHaveLength(2); // the lid and the pupil
    expect(svg).toContain(`stroke="${WITNESS_HEX.lime}"`);
    expect(svg).toContain(`fill="${WITNESS_HEX.lime}"`);
    expect(svg).toContain(`stroke-width="${MARK_FORMS.small.stroke}"`);
  });
});

describe('public/brand/icon-mask.svg', () => {
  it('is the eye alone in solid black (Safari pinned tab)', () => {
    const svg = maskSvg();
    expect(svg.match(/<path /g)).toHaveLength(2);
    expect(svg.match(/#000000/g)).toHaveLength(2);
    expect(svg).not.toMatch(/<style|<rect|<g/);
  });
});

describe('app/favicon.ico', () => {
  const ico = new Uint8Array(file('app/favicon.ico'));
  const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
  const entries = [0, 1].map((i) => {
    const offset = 6 + 16 * i;
    const bytes = view.getUint32(offset + 8, true);
    const start = view.getUint32(offset + 12, true);
    return { w: ico[offset], h: ico[offset + 1], png: ico.subarray(start, start + bytes) };
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

  it('is the ink tile, transparent outside its rounded corners, with a lime pupil', () => {
    for (const { png, w } of entries) {
      const img = decodePng(png);
      const g = markGeometry(w, { frame: 'tile', form: 'small' });
      expect(pixel(img, 0, 0)[3]).toBe(0); // the corner is cut away
      expect(near(pixel(img, w >> 1, 1).slice(0, 3), ink, 4)).toBe(true); // the tile's top edge, mid-width
      const [px, py] = at(g, g.pupil.cx, g.pupil.cy);
      expect(near(pixel(img, px, py).slice(0, 3), lime, 4), `${w}px pupil`).toBe(true);
    }
  });
});

describe('app/apple-icon.png and the GitHub App avatar', () => {
  const cases = [
    { rel: 'app/apple-icon.png', size: 180, g: markGeometry(180, { frame: 'touch', form: 'regular' }) },
    { rel: 'public/brand/witness-app-avatar-512.png', size: 512, g: markGeometry(512, { frame: 'circle', form: 'small' }) },
  ];

  for (const { rel, size, g } of cases) {
    // Pixel-walking a 512x512 decode in pure JS is ~1-3s alone and can pass 5s when the
    // whole suite runs in parallel. The budget is honest; the checks are unchanged.
    describe(rel, { timeout: 30_000 }, () => {
      const img = decodePng(new Uint8Array(file(rel)));

      it(`is ${size}×${size}, opaque, on a solid ink field edge to edge (no radius)`, () => {
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

      it('carries the eye only: a lime pupil and lid, the eye open (ink) between them', () => {
        const [px, py] = at(g, g.pupil.cx, g.pupil.cy);
        expect(near(pixel(img, px, py).slice(0, 3), lime, 8)).toBe(true);
        const [vx, vy] = at(g, ...MARK_LID_POINTS.vertex);
        expect(near(pixel(img, vx, vy).slice(0, 3), lime, 8)).toBe(true);
        const [ox, oy] = openArea(g);
        expect(near(pixel(img, ox, oy).slice(0, 3), ink, 8)).toBe(true);
        // Nothing but ink, lime and the anti-aliased blend between them: every channel sits between the two.
        for (let i = 0; i < img.rgba.length; i += 4) {
          const within = [0, 1, 2].every((k) => img.rgba[i + k] >= Math.min(ink[k], lime[k]) - 2 && img.rgba[i + k] <= Math.max(ink[k], lime[k]) + 2);
          if (!within) expect.fail(`${rel} pixel ${i / 4}: ${Array.from(img.rgba.subarray(i, i + 3))}`);
        }
      });
    });
  }
});
