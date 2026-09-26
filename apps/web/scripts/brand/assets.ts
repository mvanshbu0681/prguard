// OWNER: t1a (wave 1).
//
// The pure builders behind the committed brand assets: every byte that does not
// need a browser to rasterise. build-assets.mts writes them; the unit tests
// rebuild them and compare with the committed files, so a change to the mark's
// geometry that is not followed by a re-run of the script fails the build.
import { hollowRects, markGeometry, markParts, scaleGeometry, type MarkGeometry } from '../../src/components/brand/geometry';
import { BRAND_HEX } from '../../src/components/brand/palette';
import { encodeIco } from './ico';
import { encodePng, rasterise } from './png';

export type Paint = { bar: string; tick: string; alarm: string };

export const SIGNAL_ON_INK: Paint = { bar: BRAND_HEX.signal, tick: '#FFFFFF', alarm: BRAND_HEX.alarm };

/** The 16px tab form every favicon file is drawn from. */
export const TAB_GEOMETRY = markGeometry(16, { form: 'two-bars' });

/** Paths with explicit fills, or with class names when `paint` is null (styled by `css`). */
export function markSvg(g: MarkGeometry, options: { paint?: Paint | null; css?: string; background?: string; tickOpacity?: number } = {}): string {
  const { paint = SIGNAL_ON_INK, css, background, tickOpacity = 0.14 } = options;
  const paths = markParts(g)
    .map((p) => {
      const rule = p.fillRule ? ' fill-rule="evenodd"' : '';
      if (!paint) return `<path class="${p.paint}"${rule} d="${p.d}"/>`;
      const opacity = p.paint === 'tick' ? ` fill-opacity="${tickOpacity}"` : '';
      return `<path fill="${paint[p.paint]}"${opacity}${rule} d="${p.d}"/>`;
    })
    .join('');
  const style = css ? `<style>${css}</style>` : '';
  const bg = background ? `<rect width="${g.size}" height="${g.size}" fill="${background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${g.size}" height="${g.size}" viewBox="0 0 ${g.size} ${g.size}">${style}${bg}${paths}</svg>\n`;
}

/** app/icon.svg — ≤19px form, --signal on transparent, --ink-0 under prefers-color-scheme: light. */
export function iconSvg(): string {
  return markSvg(TAB_GEOMETRY, {
    paint: null,
    css: `path{fill:${BRAND_HEX.signal}}@media (prefers-color-scheme:light){path{fill:${BRAND_HEX.ink0}}}`,
  });
}

/** public/brand/icon-mask.svg — Safari pinned tab: a single path, solid black. */
export function maskSvg(): string {
  const d = markParts(TAB_GEOMETRY)
    .map((p) => p.d)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#000000" fill-rule="evenodd" d="${d}"/></svg>\n`;
}

/** public/brand/prguard-mark.svg — the full mark at 96 (Lockup D) for docs and the README, light-scheme aware. */
export function docMarkSvg(): string {
  return markSvg(markGeometry(96), {
    paint: null,
    css:
      `.bar{fill:${BRAND_HEX.signal}}.tick{fill:#FFFFFF;fill-opacity:.14}` +
      `@media (prefers-color-scheme:light){.bar{fill:${BRAND_HEX.ink0}}.tick{fill:#000000}}`,
  });
}

/** One favicon frame as exact RGBA pixels: --signal on --ink-0, whole pixels, no anti-aliasing. */
export function faviconPng(g: MarkGeometry): Uint8Array {
  const rects = [...hollowRects(g.base, g.base.stroke), g.head].map((r) => ({ ...r, color: BRAND_HEX.signal }));
  return encodePng(g.size, g.size, rasterise(g.size, BRAND_HEX.ink0, rects));
}

/** app/favicon.ico — the 16×16 frame and the same form at 2x in the 32×32 frame. */
export function faviconIco(): Uint8Array {
  return encodeIco([faviconPng(TAB_GEOMETRY), faviconPng(scaleGeometry(TAB_GEOMETRY, 2))]);
}

/** The anti-aliased rasters (touch icon, avatar) come from Chromium; this is their SVG source. */
export function solidMarkSvg(g: MarkGeometry): string {
  return markSvg(g, { background: BRAND_HEX.ink0 });
}
