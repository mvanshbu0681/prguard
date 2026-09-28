// The pure builders behind the committed brand assets: every SVG, built from
// the mark's single geometry source (src/components/brand/geometry.ts).
// build-assets.mts writes them and has Chromium rasterise the PNG/ICO files
// from the same markup; the unit tests rebuild the SVGs and compare them with
// the committed files, so a change to the mark that is not followed by a re-run
// of the script fails the build.
import { markGeometry, markParts, markViewBox, TILE_RADIUS, type MarkFrame, type MarkGeometry } from '../../src/components/brand/geometry';
import { WITNESS_HEX } from '../../src/components/brand/palette';

const round = (v: number) => Math.round(v * 1000) / 1000;

/** The eye's paths. `color` paints them directly; null leaves a class per part for `css`. */
function eyePaths(g: MarkGeometry, color: string | null): string {
  return markParts(g)
    .map((p) => {
      const paint = color ? (p.stroke ? ` stroke="${color}"` : ` fill="${color}"`) : ` class="${p.part}"`;
      return p.stroke
        ? `<path${paint} fill="none" stroke-width="${p.stroke}" stroke-linecap="round" stroke-linejoin="round" d="${p.d}"/>`
        : `<path${paint} d="${p.d}"/>`;
    })
    .join('');
}

/** A background square filling the viewBox; `radius` is a share of its edge. */
function backdrop(g: MarkGeometry, color: string, radius: number): string {
  const { x, y, side } = g.box;
  const r = radius ? ` rx="${round(side * radius)}"` : '';
  return `<rect x="${x}" y="${y}" width="${side}" height="${side}"${r} fill="${color}"/>`;
}

function svg(g: MarkGeometry, body: string, css?: string): string {
  const style = css ? `<style>${css}</style>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${g.size}" height="${g.size}" viewBox="${markViewBox(g)}">${style}${body}</svg>\n`;
}

/** The mark on the rounded ink tile, lime eye, in the small form (a tab shows it at 16 CSS px): every favicon frame. */
export function tileSvg(size: number): string {
  const g = markGeometry(size, { frame: 'tile', form: 'small' });
  return svg(g, backdrop(g, WITNESS_HEX.ink, TILE_RADIUS) + eyePaths(g, WITNESS_HEX.lime));
}

/**
 * Full-bleed ink square (no radius), for rasters another system crops: the touch
 * icon (regular form) and the avatar (small form: GitHub shows it at 20px).
 */
export function solidMarkSvg(size: number, frame: Extract<MarkFrame, 'touch' | 'circle'>): string {
  const g = markGeometry(size, { frame, form: frame === 'circle' ? 'small' : 'regular' });
  return svg(g, backdrop(g, WITNESS_HEX.ink, 0) + eyePaths(g, WITNESS_HEX.lime));
}

/** app/icon.svg — the tile at 32: it holds its contrast in light and dark tab strips alike. */
export function iconSvg(): string {
  return tileSvg(32);
}

/** public/brand/icon-mask.svg — Safari pinned tab: the eye alone, solid black. */
export function maskSvg(): string {
  const g = markGeometry(16, { form: 'small' });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${markViewBox(g)}">${eyePaths(g, '#000000')}</svg>\n`;
}

/** public/brand/witness-mark.svg — the eye at 96 for docs and the README, lime on dark, ink on light. */
export function docMarkSvg(): string {
  const g = markGeometry(96);
  return svg(
    g,
    eyePaths(g, null),
    `.lid{stroke:${WITNESS_HEX.lime}}.pupil{fill:${WITNESS_HEX.lime}}` +
      `@media (prefers-color-scheme:light){.lid{stroke:${WITNESS_HEX.ink}}.pupil{fill:${WITNESS_HEX.ink}}}`,
  );
}
