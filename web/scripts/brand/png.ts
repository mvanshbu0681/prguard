// OWNER: t1a (wave 1).
//
// Exact rasters for the favicon frames. The ≤19px mark is whole-pixel
// rectangles only (no radii, no anti-aliasing), so it can be drawn straight
// into a pixel buffer and encoded as a true 32-bit RGBA PNG — which is what an
// ICO's PNG entries are specified to be, and what a browser screenshot will not
// give you for an image with no transparent pixels.
import { crc32, deflateSync } from 'node:zlib';

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** #RRGGBB */
  color: string;
}

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`png: expected #RRGGBB, got ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/** An opaque size × size RGBA buffer: `background`, then each rect in order. Rects must be whole pixels. */
export function rasterise(size: number, background: string, rects: PixelRect[]): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const paint = (x0: number, y0: number, w: number, h: number, hex: string) => {
    if (![x0, y0, w, h].every(Number.isInteger)) throw new Error(`png: rect ${x0},${y0} ${w}×${h} is not on whole pixels`);
    const [r, g, b] = rgb(hex);
    for (let y = Math.max(0, y0); y < Math.min(size, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(size, x0 + w); x++) {
        const i = (y * size + x) * 4;
        px[i] = r;
        px[i + 1] = g;
        px[i + 2] = b;
        px[i + 3] = 255;
      }
    }
  };
  paint(0, 0, size, size, background);
  for (const rect of rects) paint(rect.x, rect.y, rect.w, rect.h, rect.color);
  return px;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  const typeBytes = new TextEncoder().encode(type);
  out.set(typeBytes, 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Encode RGBA pixels as a PNG: colour type 6, 8 bits per channel, filter 0 on every row. Deterministic. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (rgba.length !== width * height * 4) throw new Error('png: pixel buffer does not match the size');
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1);
  }
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
