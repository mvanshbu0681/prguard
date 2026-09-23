// OWNER: t1a (wave 1).
//
// THE BENCH — the PRGuard mark (docs/design/06-brand-gaps-and-corrections.md §A)
// as pure geometry. Every renderer draws from this module and nothing else:
// the <Mark> SVG, the live favicon canvas, scripts/brand (icon.svg, favicon.ico,
// apple-icon.png, the GitHub App avatar) and the OG card. One source means the
// simplification ladder cannot drift between the tab, the nav and the bot avatar.
//
// Construction (24-unit artboard, brand-gaps §A), read as OUTER bounds:
//   base bar   x 5  y 6   w 14 h 4   hollow, 1.5 stroke drawn inside, radius 1
//   seam       x 5  y 10  w 1.5 h 4  flush left (the doc's "x 5.75" is the
//                                    centreline of that 1.5 stroke)
//   head bar   x 5  y 14  w 14 h 4   solid, radius 1
//   ticks      5×5 L-shapes, outer corners at (1,1) (23,1) (1,23) (23,23),
//              1.5 thick: 2 units outside the implied 18×18 frame (3..21)
//
// Everything is snapped to whole CSS pixels for the requested size, with parity
// chosen so the glyph centres exactly, and the base bar keeps a hollow of at
// least 1px. That is what keeps a 20px nav mark and a 16px tab icon crisp at
// 1x and 2x instead of anti-aliased mud (the ladder's whole point).
//
// The ladder (brand-gaps §A, mandatory):
//   ≥ 32px                      full: corner ticks + base + seam + head
//   20–31px                     no-ticks: base + seam + head
//   ≤ 19px, and every circle    two-bars: one hollow, one solid; 2px stroke
// Never below 16px: sizes under MARK_MIN are drawn at MARK_MIN.

export type MarkForm = 'full' | 'no-ticks' | 'two-bars';
export type MarkCrop = 'square' | 'circle';
/** The head bar's live state (brand-gaps §A "the one motion", §C live favicon). */
export type MarkLiveState = 'running' | 'clear' | 'blocked';
export type TickCorner = 'tl' | 'tr' | 'bl' | 'br';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MarkGeometry {
  /** Rendered edge in CSS px (the artboard is size × size). */
  size: number;
  form: MarkForm;
  crop: MarkCrop;
  /** The hollow bar: outer bounds, stroke drawn inside. */
  base: Box & { stroke: number; r: number };
  /** The solid bar (drawn hollow only in the live `running` state). */
  head: Box & { r: number };
  /** Joins the bars flush left. Extends `base.r` into each bar so the rounded corners leave no notch. */
  seam: Box | null;
  /** Detached L-shaped registration ticks (full form only). */
  ticks: { corner: TickCorner; x: number; y: number; len: number; t: number }[];
}

export const MARK_MIN = 16;
export const MARK_LADDER = {
  /** Corner ticks appear from this size up. */
  ticksFrom: 32,
  /** The seam appears from this size up. */
  seamFrom: 20,
} as const;

/** GitHub App avatar: bars at 56% of the frame width (brand-gaps §C). */
export const CIRCLE_BAR_WIDTH = 0.56;

export function markForm(size: number, crop: MarkCrop = 'square'): MarkForm {
  if (crop === 'circle' || size < MARK_LADDER.seamFrom) return 'two-bars';
  if (size < MARK_LADDER.ticksFrom) return 'no-ticks';
  return 'full';
}

/** Clear space on every side = the height of one bar at the artboard (size ÷ 6, brand-gaps §B). */
export function markClearSpace(size: number): number {
  return Math.round(normaliseSize(size) / 6);
}

function normaliseSize(size: number): number {
  if (!Number.isFinite(size)) return 24;
  return Math.max(MARK_MIN, Math.round(size));
}

const parityOf = (n: number) => ((n % 2) + 2) % 2;

/** The integer ≥ min nearest to `ideal` whose parity matches (ties go to the smaller). */
function nearestWithParity(ideal: number, parity: number, min: number): number {
  const lo = Math.floor(ideal);
  const candidates = [lo - 2, lo - 1, lo, lo + 1, lo + 2, lo + 3].filter((n) => n >= min && parityOf(n) === parity);
  return candidates.reduce((best, n) => (Math.abs(n - ideal) < Math.abs(best - ideal) - 1e-9 ? n : best));
}

/**
 * Bar height and gap near their ideals, such that the stack (2 bars + gap) has the
 * artboard's parity and centres on a whole pixel. Minimises the summed error.
 */
function barsAndGap(size: number, idealBar: number, idealGap: number, minBar: number, minGap: number) {
  const parity = parityOf(size);
  let best: { barH: number; gap: number; err: number } | null = null;
  const around = (v: number) => [Math.floor(v) - 1, Math.floor(v), Math.ceil(v), Math.ceil(v) + 1];
  for (const barH of around(idealBar)) {
    if (barH < minBar) continue;
    for (const gap of around(idealGap)) {
      if (gap < minGap || parityOf(2 * barH + gap) !== parity) continue;
      const err = Math.abs(barH - idealBar) + Math.abs(gap - idealGap);
      if (!best || err < best.err - 1e-9) best = { barH, gap, err };
    }
  }
  // Unreachable for size ≥ MARK_MIN (a candidate of each parity always exists), kept total.
  return best ?? { barH: Math.max(minBar, Math.round(idealBar)), gap: Math.max(minGap, Math.round(idealGap)), err: 0 };
}

/** The whole-pixel stroke that best keeps both the stroke and the hollow near their ideals. */
function strokeFor(barH: number, idealStroke: number, idealHollow: number, maxStroke = Infinity): number {
  const limit = Math.min(maxStroke, Math.floor((barH - 1) / 2)); // hollow ≥ 1px, always
  let best = 1;
  let bestErr = Infinity;
  for (let s = 1; s <= Math.max(1, limit); s++) {
    const err = Math.abs(s - idealStroke) + Math.abs(barH - 2 * s - idealHollow);
    if (err < bestErr - 1e-9) {
      best = s;
      bestErr = err;
    }
  }
  return best;
}

function assemble(size: number, form: MarkForm, crop: MarkCrop, barW: number, barH: number, gap: number, stroke: number, r: number): MarkGeometry {
  const x = (size - barW) / 2;
  const y = (size - (2 * barH + gap)) / 2;
  const radius = Math.max(0, Math.min(r, stroke, Math.floor(barH / 2)));
  return {
    size,
    form,
    crop,
    base: { x, y, w: barW, h: barH, stroke, r: radius },
    head: { x, y: y + barH + gap, w: barW, h: barH, r: radius },
    seam: form === 'two-bars' ? null : { x, y: y + barH - radius, w: stroke, h: gap + 2 * radius },
    ticks: [],
  };
}

/**
 * Pixel-snapped geometry for the mark at `size` CSS px. `form` defaults to the
 * ladder; pass it explicitly only when a context fixes the form regardless of
 * pixel size (the favicon is always two-bars, even in its 32×32 frame).
 */
export function markGeometry(size: number, options: { crop?: MarkCrop; form?: MarkForm } = {}): MarkGeometry {
  const px = normaliseSize(size);
  const crop = options.crop ?? 'square';
  const form = crop === 'circle' ? 'two-bars' : (options.form ?? markForm(px, crop));
  const parity = parityOf(px);

  if (crop === 'circle') {
    // Avatar geometry (brand-gaps §C): bars at 56% of the frame width, and the
    // vertical structure laid on the grid of the 20px GitHub thread, where it
    // must survive: at 20px the base bar is 2px stroke / 1px hollow / 2px
    // stroke, the gap 2px, the head 5px solid — every horizontal edge on a
    // whole pixel at 20px and at 40px (2x), so the hollow stays a crisp dark
    // line instead of blurring into the bar. g = one pixel of that rendering;
    // at 512 the edges are exact multiples of 25.6.
    const g = px / 20;
    const barW = nearestWithParity(CIRCLE_BAR_WIDTH * px, parity, 4);
    return assemble(px, 'two-bars', crop, barW, 5 * g, 2 * g, 2 * g, Math.floor(barW / 14));
  }

  if (form === 'two-bars') {
    // The ≤19px form, drawn on a 16-unit grid: bars 14 × 5, gap 2, and the
    // stroke bumped to 2px (brand-gaps §A) — a 1px hollow at 16px, 2px at 32.
    const u = px / 16;
    const barW = nearestWithParity(14 * u, parity, 4);
    const { barH, gap } = barsAndGap(px, 5 * u, 2 * u, 3, 1);
    const stroke = Math.min(Math.max(1, Math.round(2 * u)), Math.floor((barH - 1) / 2));
    return assemble(px, form, crop, barW, barH, gap, stroke, 0);
  }

  // full / no-ticks, on the 24-unit construction grid.
  const u = px / 24;
  const barW = nearestWithParity(14 * u, parity, 4);
  const { barH, gap } = barsAndGap(px, 4 * u, 4 * u, 3, 2);
  const stroke = strokeFor(barH, 1.5 * u, u);
  const geometry = assemble(px, form, crop, barW, barH, gap, stroke, Math.floor(u));

  if (form === 'full') {
    const len = Math.round(5 * u);
    const t = Math.max(1, Math.round(1.5 * u));
    const o = Math.max(0, Math.round(u));
    const far = px - o - len;
    geometry.ticks = [
      { corner: 'tl', x: o, y: o, len, t },
      { corner: 'tr', x: far, y: o, len, t },
      { corner: 'bl', x: o, y: far, len, t },
      { corner: 'br', x: far, y: far, len, t },
    ];
  }
  return geometry;
}

/**
 * A hollow bar as four non-overlapping rects (top, bottom, left, right), for
 * rect-only rasterisers: the favicon canvas and the ICO frames. Valid for the
 * two-bar form, which has no radii.
 */
export function hollowRects(box: Box, stroke: number): Box[] {
  const inner = box.h - 2 * stroke;
  return [
    { x: box.x, y: box.y, w: box.w, h: stroke },
    { x: box.x, y: box.y + box.h - stroke, w: box.w, h: stroke },
    { x: box.x, y: box.y + stroke, w: stroke, h: inner },
    { x: box.x + box.w - stroke, y: box.y + stroke, w: stroke, h: inner },
  ];
}

/** Uniformly scale a geometry (e.g. the 16px favicon drawn into its 32×32 frame). */
export function scaleGeometry(g: MarkGeometry, k: number): MarkGeometry {
  const box = <T extends Box>(b: T): T => ({ ...b, x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k });
  return {
    ...g,
    size: g.size * k,
    base: { ...box(g.base), stroke: g.base.stroke * k, r: g.base.r * k },
    head: { ...box(g.head), r: g.head.r * k },
    seam: g.seam ? box(g.seam) : null,
    ticks: g.ticks.map((t) => ({ ...t, x: t.x * k, y: t.y * k, len: t.len * k, t: t.t * k })),
  };
}

// ---------------------------------------------------------------------------
// Paths. Filled shapes only (no strokes): butt ends and miter corners are then
// exact by construction (brand-gaps §A: no rounded terminals anywhere).
// ---------------------------------------------------------------------------

const n = (v: number) => String(Math.round(v * 1000) / 1000);

function roundedRect({ x, y, w, h }: Box, r: number): string {
  if (r <= 0) return `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`;
  return (
    `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}` +
    `V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}` +
    `H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}` +
    `V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`
  );
}

/** Outer rounded rect minus the inner hollow — draw with fill-rule evenodd. */
function hollowRect(box: Box, stroke: number, r: number): string {
  const inner = { x: box.x + stroke, y: box.y + stroke, w: box.w - 2 * stroke, h: box.h - 2 * stroke };
  return roundedRect(box, r) + roundedRect(inner, Math.max(0, r - stroke));
}

function tickPath({ corner, x, y, len, t }: MarkGeometry['ticks'][number]): string {
  const r = x + len;
  const b = y + len;
  switch (corner) {
    case 'tl':
      return `M${n(x)} ${n(y)}H${n(r)}V${n(y + t)}H${n(x + t)}V${n(b)}H${n(x)}Z`;
    case 'tr':
      return `M${n(x)} ${n(y)}H${n(r)}V${n(b)}H${n(r - t)}V${n(y + t)}H${n(x)}Z`;
    case 'bl':
      return `M${n(x)} ${n(y)}H${n(x + t)}V${n(b - t)}H${n(r)}V${n(b)}H${n(x)}Z`;
    case 'br':
      return `M${n(r - t)} ${n(y)}H${n(r)}V${n(b)}H${n(x)}V${n(b - t)}H${n(r - t)}Z`;
  }
}

export type MarkPartName = 'tick' | 'base' | 'seam' | 'head';

export interface MarkPart {
  part: MarkPartName;
  /** Which colour role the part takes: bars carry the tone, ticks the rule colour, alarm only for a blocked head. */
  paint: 'bar' | 'tick' | 'alarm';
  d: string;
  fillRule?: 'evenodd';
  /** Present on the head bar when a live state is drawn. */
  live?: MarkLiveState;
}

/**
 * The drawable parts in paint order. `live` changes only the head bar:
 * running → hollow (as the base), clear → solid, blocked → solid in --alarm.
 */
export function markParts(g: MarkGeometry, live?: MarkLiveState): MarkPart[] {
  const parts: MarkPart[] = g.ticks.map((t) => ({ part: 'tick', paint: 'tick', d: tickPath(t) }));
  parts.push({ part: 'base', paint: 'bar', d: hollowRect(g.base, g.base.stroke, g.base.r), fillRule: 'evenodd' });
  if (g.seam) parts.push({ part: 'seam', paint: 'bar', d: roundedRect(g.seam, 0) });
  const head: MarkPart =
    live === 'running'
      ? { part: 'head', paint: 'bar', d: hollowRect(g.head, g.base.stroke, g.head.r), fillRule: 'evenodd' }
      : { part: 'head', paint: live === 'blocked' ? 'alarm' : 'bar', d: roundedRect(g.head, g.head.r) };
  if (live) head.live = live;
  parts.push(head);
  return parts;
}
