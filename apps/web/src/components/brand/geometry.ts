// THE PR GUARD EYE — the PR Guard mark as pure geometry. Every renderer draws
// from this module and nothing else: <Mark>, <TrackingMark>, the live favicon
// canvas, scripts/brand (icon.svg, favicon.ico, apple-icon.png, the GitHub App
// avatar) and the OG card. One source means the tab, the nav and the bot avatar
// cannot drift apart.
//
// Construction (32-unit artboard, optically centred):
//   lid     one round-capped stroke (2.8 wide, regular form): the upper lid arcs from the
//           right over the top to the left corner, then drops into a check
//           mark whose long arm is the lower lid and flicks out past the
//           right corner. Read it as an eye, then as a tick: PR Guard watched
//           the test run, and what it saw is verified.
//   pupil   a solid disc (r 3, regular form) in the open part of the eye. It is
//           the only part that moves or changes colour: <TrackingMark> lets
//           it follow the pointer, and the live favicon uses it for the
//           review's state (running → a pulsing ring, blocked → --alarm).
//
// The mark is vector-only and scales through the viewBox; the frame decides
// how much of the canvas the eye fills:
//   bare     in-page next to the wordmark: the eye spans 92% of the width
//   tile     favicons: the eye spans 88% of a rounded dark tile
//   touch    apple-touch-icon: 66%, full-bleed (iOS applies its own mask)
//   circle   circle-cropped avatars (GitHub App): 70%, and still clears the crop
//
// Two forms, like a font's optical sizes. Below 20px of eye the regular form's
// gaps (pupil to lid) fall under a pixel and blur shut, so the small form
// thickens the lid and shrinks the pupil to hold them open. The form follows
// the rendered size unless a context fixes it: tab icons are drawn small even
// in their 32px frame, because a browser shows them at 16 CSS px.

export type MarkFrame = 'bare' | 'tile' | 'touch' | 'circle';
export type MarkForm = 'regular' | 'small';
/** The pupil's live state (the live favicon, the run page). */
export type MarkLiveState = 'running' | 'clear' | 'blocked';

export const MARK_ARTBOARD = 32;
/** Never drawn below this edge in CSS px. */
export const MARK_MIN = 16;
/** Lid stroke and pupil radius per form (artboard units). */
export const MARK_FORMS: Record<MarkForm, { stroke: number; pupil: number }> = {
  regular: { stroke: 2.8, pupil: 3 },
  small: { stroke: 3.4, pupil: 2.4 },
};
/** The small form takes over when the eye would render narrower than this (CSS px). */
export const MARK_SMALL_BELOW = 20;
export const MARK_STROKE = MARK_FORMS.regular.stroke;
/**
 * The lid's construction points (artboard units): it starts on the check's long
 * arm, arcs over `control` to the left `corner`, drops to the check's `vertex`
 * and rises to the `tail`, past where it started.
 */
export const MARK_LID_POINTS = {
  start: [26.35, 12.3],
  control: [13.75, 3.1],
  corner: [2.75, 15.6],
  vertex: [11.25, 23.6],
  tail: [29.25, 10.1],
} as const;
const { start, control, corner, vertex, tail } = MARK_LID_POINTS;
/** Upper lid → check mark, as one path. */
export const MARK_LID = `M${start.join(' ')}Q${control.join(' ')} ${corner.join(' ')}L${vertex.join(' ')}L${tail.join(' ')}`;
/** The pupil at rest: right of the opening's centre (11.9, 15.6), so the eye looks forward, along the tick. */
export const MARK_PUPIL = { cx: 13, cy: 14.8, r: MARK_FORMS.regular.pupil } as const;
/**
 * How far the pupil may travel from rest (artboard units), as an ellipse. At its
 * edge the pupil still clears both lids by ≥ 0.5 in either form (tested).
 */
export const MARK_PUPIL_TRAVEL = { x: 1.2, y: 0.8 } as const;
/** The regular form's outer bounds, measured: the eye is 29.3 × 18 units. A heavier stroke grows it evenly on every side. */
export const MARK_INK = { x: 1.35, y: 7, w: 29.3, h: 18 } as const;

/** Share of the frame's width the eye's ink spans, per frame. */
export const MARK_FILL: Record<MarkFrame, number> = { bare: 0.92, tile: 0.88, touch: 0.66, circle: 0.7 };
/** Tile corner radius as a share of the tile's edge. */
export const TILE_RADIUS = 0.225;

export interface MarkGeometry {
  /** Rendered edge in CSS px. */
  size: number;
  frame: MarkFrame;
  form: MarkForm;
  /** The square viewBox, in artboard units, centred on the artboard. */
  box: { x: number; y: number; side: number };
  stroke: number;
  lid: string;
  pupil: { cx: number; cy: number; r: number };
}

/** Clear space on every side: a sixth of the mark's edge. */
export function markClearSpace(size: number): number {
  return Math.round(normaliseSize(size) / 6);
}

function normaliseSize(size: number): number {
  if (!Number.isFinite(size)) return 24;
  return Math.max(MARK_MIN, Math.round(size));
}

const n = (v: number) => Math.round(v * 1000) / 1000;

/** The form the ladder picks for an eye rendered at `size` px in `frame`. */
export function markForm(size: number, frame: MarkFrame = 'bare'): MarkForm {
  return normaliseSize(size) * MARK_FILL[frame] < MARK_SMALL_BELOW ? 'small' : 'regular';
}

export function markGeometry(size: number, options: { frame?: MarkFrame; form?: MarkForm } = {}): MarkGeometry {
  const px = normaliseSize(size);
  const frame = options.frame ?? 'bare';
  const form = options.form ?? markForm(px, frame);
  const { stroke, pupil } = MARK_FORMS[form];
  const ink = MARK_INK.w + (stroke - MARK_STROKE);
  const side = n(ink / MARK_FILL[frame]);
  const offset = n((MARK_ARTBOARD - side) / 2);
  return {
    size: px,
    frame,
    form,
    box: { x: offset, y: offset, side },
    stroke,
    lid: MARK_LID,
    pupil: { cx: MARK_PUPIL.cx, cy: MARK_PUPIL.cy, r: pupil },
  };
}

export function markViewBox(g: MarkGeometry): string {
  return `${g.box.x} ${g.box.y} ${g.box.side} ${g.box.side}`;
}

/** A circle as a path, for renderers that take only paths (Path2D, the mask icon). */
export function circlePath(cx: number, cy: number, r: number): string {
  return `M${n(cx - r)} ${n(cy)}A${r} ${r} 0 1 0 ${n(cx + r)} ${n(cy)}A${r} ${r} 0 1 0 ${n(cx - r)} ${n(cy)}Z`;
}

export type MarkPartName = 'lid' | 'pupil';

export interface MarkPart {
  part: MarkPartName;
  /** Colour role: the eye carries the tone; the pupil turns to alarm only when a live review is blocked. */
  paint: 'bar' | 'alarm';
  d: string;
  /** Stroked (round caps and joins) rather than filled, at this width in artboard units. */
  stroke?: number;
  live?: MarkLiveState;
}

/**
 * The drawable parts in paint order. `live` changes only the pupil:
 * running → a ring (the eye is still watching), clear → solid, blocked → solid in --alarm.
 */
export function markParts(g: MarkGeometry, live?: MarkLiveState): MarkPart[] {
  const { cx, cy, r } = g.pupil;
  const lid: MarkPart = { part: 'lid', paint: 'bar', d: g.lid, stroke: g.stroke };
  const pupil: MarkPart =
    live === 'running'
      ? { part: 'pupil', paint: 'bar', d: circlePath(cx, cy, r - g.stroke / 3.5), stroke: g.stroke / 1.75 }
      : { part: 'pupil', paint: live === 'blocked' ? 'alarm' : 'bar', d: circlePath(cx, cy, r) };
  if (live) pupil.live = live;
  return [lid, pupil];
}
