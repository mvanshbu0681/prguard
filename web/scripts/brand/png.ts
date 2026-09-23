// OWNER: t1a (wave 1).
//
// Exact rasters for the favicon frames. The ≤19px mark is whole-pixel
// rectangles only (no radii, no anti-aliasing), so it can be drawn straight
// into a pixel buffer and encoded as a true 32-bit RGBA PNG — which is what an
// ICO's PNG entries are specified to be, and what a browser screenshot will not
// give you for an image with no transparent pixels.
import { crc32, deflateSync, inflateSync } from 'node:zlib';

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

export interface DecodedPng {
  width: number;
  height: number;
  /** RGBA, 8 bits per channel, row-major (opaque formats get alpha 255). */
  rgba: Uint8Array;
  /** The file's own colour type: 2 = RGB, 6 = RGBA. */
  colorType: number;
}

/**
 * Decode an 8-bit, non-interlaced RGB or RGBA PNG (what encodePng writes and
 * what Chromium's screenshots are). The tests use it to check the committed
 * rasters pixel by pixel. Throws on anything else.
 */
export function decodePng(png: Uint8Array): DecodedPng {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((b, i) => png[i] === b)) throw new Error('png: bad signature');
  let at = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat: Uint8Array[] = [];
  while (at < png.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(png[at + 4], png[at + 5], png[at + 6], png[at + 7]);
    const data = png.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      colorType = data[9];
      if (data[8] !== 8 || (colorType !== 2 && colorType !== 6) || data[12] !== 0) {
        throw new Error(`png: unsupported format (depth ${data[8]}, colour type ${colorType}, interlace ${data[12]})`);
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + length;
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`png: unknown filter ${filter}`);
      row[x] = (line[x] + predictor) & 0xff;
    }
  }
  if (channels === 4) return { width, height, rgba: pixels, colorType };
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
    rgba[j] = pixels[i];
    rgba[j + 1] = pixels[i + 1];
    rgba[j + 2] = pixels[i + 2];
    rgba[j + 3] = 255;
  }
  return { width, height, rgba, colorType };
}
