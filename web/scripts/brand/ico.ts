// OWNER: t1a (wave 1).
//
// A minimal ICO encoder that embeds PNG images (the "PNG-compressed icon"
// entry, supported by every browser and by Windows since Vista). favicon.ico
// is built from the 16×16 and 32×32 renders in scripts/brand/build-assets.ts.
//
// Layout (little-endian):
//   ICONDIR       u16 reserved = 0 · u16 type = 1 (icon) · u16 count
//   ICONDIRENTRY  u8 width (0 = 256) · u8 height · u8 colours = 0 · u8 reserved = 0
//   (× count)     u16 planes = 1 · u16 bitCount = 32 · u32 bytes · u32 offset
//   image data    the PNG files, back to back, in entry order

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height from a PNG's IHDR chunk; throws if the bytes are not a PNG. */
export function pngSize(png: Uint8Array): { width: number; height: number } {
  const isPng = PNG_SIGNATURE.every((b, i) => png[i] === b);
  const ihdr = String.fromCharCode(png[12], png[13], png[14], png[15]);
  if (!isPng || ihdr !== 'IHDR') throw new Error('encodeIco: not a PNG (missing signature or IHDR)');
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export function encodeIco(pngs: Uint8Array[]): Uint8Array {
  if (pngs.length === 0) throw new Error('encodeIco: no images');
  const entries = pngs
    .map((png) => ({ png, ...pngSize(png) }))
    .sort((a, b) => a.width - b.width);
  for (const e of entries) {
    if (e.width !== e.height || e.width < 1 || e.width > 256) throw new Error(`encodeIco: ${e.width}×${e.height} is not a square icon ≤ 256`);
  }
  const headerBytes = 6 + 16 * entries.length;
  const total = headerBytes + entries.reduce((sum, e) => sum + e.png.byteLength, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, entries.length, true);
  let offset = headerBytes;
  entries.forEach((e, i) => {
    const at = 6 + 16 * i;
    out[at] = e.width === 256 ? 0 : e.width;
    out[at + 1] = e.height === 256 ? 0 : e.height;
    out[at + 2] = 0;
    out[at + 3] = 0;
    view.setUint16(at + 4, 1, true);
    view.setUint16(at + 6, 32, true);
    view.setUint32(at + 8, e.png.byteLength, true);
    view.setUint32(at + 12, offset, true);
    out.set(e.png, offset);
    offset += e.png.byteLength;
  });
  return out;
}
