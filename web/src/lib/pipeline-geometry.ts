// OWNER: t7 (wave 2). The nine-stage pipeline's geometry — and ONLY its geometry: pure
// numbers and path strings, no React, no DOM. <StageRail> (@/components/evidence/StageRail)
// is the only consumer; nothing else may import this file, so a retune here can only ever
// move one diagram.
//
// docs/design/03-landing-blueprint.md §06 "Composition": "Three breakpoint geometries
// generated from one TS constants file with an elbow(from, to) helper. Do not attempt to
// make one bezier survive 1440 -> 375. Every reference that solved this authored separate
// geometry." docs/design/02-design-system.md §1.11 and plan §13 A4 restate the same
// three-set rule for the dashboard's own rail.
//
// Three PIPELINE_BREAKPOINTS, not four: `wide` (>=1280) serves BOTH the landing section and
// the dashboard's live-run header — their layouts are the same horizontal rail at the same
// aspect, so forking a fourth "dashboard" set would duplicate geometry no widths need
// duplicated. `medium` covers tablet widths on both surfaces. `vertical` (<768) is the one
// spine geometry both surfaces fall back to below 768px — landing's unpinned mobile section
// and the dashboard's own mobile layout, which is exactly what plan §13's brief means by
// "vertical for <768 and for the dashboard": the dashboard does not get a fourth geometry,
// it reuses this one below its own 768px breakpoint.
//
// S3 "specialists" is never a plain station: STATIONS[bp].specialists is the fork's ENTRY
// point (docs/design/03 §06: "the diagram's whole argument"). The fork's four lanes run from
// there to FORK[bp].exit, which then closes with a short EDGES["specialists"->"coordinator"]
// segment starting at that exit point (never at the specialists station itself) — the one
// edge whose `d` is not a plain station-to-station elbow, because the fork has to visibly
// reconverge before the line reaches `coordinator`.

import { STAGES, type Stage } from "./contracts";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type PipelineBreakpoint = "wide" | "medium" | "vertical";

/** Ascending min-width in px; `vertical` has no floor (it is the fallback below `medium`). */
export const PIPELINE_BREAKPOINTS: readonly { readonly name: PipelineBreakpoint; readonly minWidth: number }[] = [
  { name: "vertical", minWidth: 0 },
  { name: "medium", minWidth: 768 },
  { name: "wide", minWidth: 1280 },
] as const;

/** The breakpoint a container of `width` px renders at. Below 768 -> vertical, matching both surfaces. */
export function breakpointFor(width: number): PipelineBreakpoint {
  let name: PipelineBreakpoint = "vertical";
  for (const bp of PIPELINE_BREAKPOINTS) if (width >= bp.minWidth) name = bp.name;
  return name;
}

export const FORK_LANES = ["bugs", "security", "tests", "quality"] as const;
export type ForkLaneKey = (typeof FORK_LANES)[number];

export interface ElbowOptions {
  /** 0..1: how far each control point reaches toward the midpoint. 0.5 (default) is symmetric. */
  bend?: number;
  /** The axis the tangent runs along at both ends. "x": horizontal in/out (a horizontal rail).
   *  "y": vertical in/out (a vertical spine). Default "x". */
  axis?: "x" | "y";
  /** false: emit only the `C ...` segment, so it continues an open path (no leading `M`). */
  move?: boolean;
}

/**
 * ONE elbow between two points, as a cubic Bézier `C` segment (optionally preceded by its
 * own `M`). Two points sharing the tangent axis's cross-coordinate (same y on axis "x", same
 * x on axis "y") render as a dead-straight line — the control points fall on the segment
 * itself — so every ordinary stage-to-stage connector is `elbow(a, b)` with no special case,
 * and only the fork's lanes (which genuinely bend) look curved. This is the one routine every
 * edge and every fork lane in this file is built from.
 */
export function elbow(from: Point, to: Point, options: ElbowOptions = {}): string {
  const bend = options.bend ?? 0.5;
  const axis = options.axis ?? "x";
  const move = options.move ?? true;
  const c1 = axis === "x" ? { x: from.x + (to.x - from.x) * bend, y: from.y } : { x: from.x, y: from.y + (to.y - from.y) * bend };
  const c2 = axis === "x" ? { x: to.x - (to.x - from.x) * bend, y: to.y } : { x: to.x, y: to.y - (to.y - from.y) * bend };
  const head = move ? `M${from.x} ${from.y} ` : "";
  return `${head}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`;
}

/**
 * One fork lane: entry curves off-axis to `offset` for a flat run, then curves back to exit.
 * `axis` matches the elbow's — "x" bends the lane away in y (a horizontal rail's parallel
 * bars), "y" bends it away in x (a vertical spine's indented column). `runFraction` (0..1) is
 * how much of the entry-exit span the flat run occupies; the rest is the two curves.
 */
export function forkLane(entry: Point, exit: Point, offset: number, axis: "x" | "y" = "x", runFraction = 0.44): string {
  if (axis === "x") {
    const span = exit.x - entry.x;
    const half = (span * runFraction) / 2;
    const midX = entry.x + span / 2;
    const runStart: Point = { x: midX - half, y: offset };
    const runEnd: Point = { x: midX + half, y: offset };
    return [elbow(entry, runStart, { axis }), `L${runEnd.x} ${runEnd.y}`, elbow(runEnd, exit, { axis, move: false })].join(" ");
  }
  const span = exit.y - entry.y;
  const half = (span * runFraction) / 2;
  const midY = entry.y + span / 2;
  const runStart: Point = { x: offset, y: midY - half };
  const runEnd: Point = { x: offset, y: midY + half };
  return [elbow(entry, runStart, { axis }), `L${runEnd.x} ${runEnd.y}`, elbow(runEnd, exit, { axis, move: false })].join(" ");
}

export interface PipelineEdge {
  readonly from: Stage;
  readonly to: Stage;
  readonly d: string;
}

export interface ForkLaneGeometry {
  readonly key: ForkLaneKey;
  readonly d: string;
  /** Where the lane's own latency chip / hover target sits (its flat run's midpoint). */
  readonly labelAt: Point;
}

export interface ForkGeometry {
  readonly entry: Point;
  readonly exit: Point;
  readonly lanes: readonly ForkLaneGeometry[];
}

export interface PipelineGeometry {
  readonly name: PipelineBreakpoint;
  readonly orientation: "horizontal" | "vertical";
  readonly width: number;
  readonly height: number;
  readonly viewBox: string;
  /** One point per STAGES entry; `specialists` is the fork's entry point (see module header). */
  readonly stations: Readonly<Record<Stage, Point>>;
  /** All eight adjacent STAGES pairs. Every edge but one is a plain station-to-station
   *  connector; "specialists" -> "coordinator" instead starts at the fork's own exit point
   *  (module header) — the short segment that closes it. */
  readonly edges: readonly PipelineEdge[];
  readonly fork: ForkGeometry;
  /** Where the S3 caption ("wall clock = max(lane), not sum") sits. */
  readonly forkCaptionAt: Point;
}

function horizontalGeometry(name: "wide" | "medium"): PipelineGeometry {
  const wide = name === "wide";
  const width = wide ? 1200 : 900;
  const height = wide ? 200 : 220;
  const margin = wide ? 40 : 36;
  const baseline = wide ? 100 : 112;
  const usable = width - margin * 2;
  const step = usable / (STAGES.length - 1);
  const x = (i: number) => margin + step * i;

  const stations = Object.fromEntries(STAGES.map((key, i) => [key, { x: x(i), y: baseline }])) as Record<Stage, Point>;

  const specialistsIndex = STAGES.indexOf("specialists");
  const coordinatorIndex = STAGES.indexOf("coordinator");
  const entry = stations.specialists;
  // The fork closes just short of `coordinator`, leaving a short plain edge into its node.
  const exit: Point = { x: entry.x + (stations.coordinator.x - entry.x) * 0.62, y: baseline };
  const laneGap = wide ? 30 : 26;
  const laneOffsets: readonly [ForkLaneKey, number][] = [
    ["bugs", -laneGap * 2],
    ["security", -laneGap],
    ["tests", laneGap],
    ["quality", laneGap * 2],
  ];
  const lanes: ForkLaneGeometry[] = laneOffsets.map(([key, dy]) => ({
    key,
    d: forkLane(entry, exit, baseline + dy, "x"),
    labelAt: { x: (entry.x + exit.x) / 2, y: baseline + dy },
  }));

  const edges: PipelineEdge[] = [];
  for (let i = 0; i < STAGES.length - 1; i++) {
    if (i === specialistsIndex) continue; // the specialists -> coordinator pair is the fork itself
    const from = STAGES[i];
    const to = STAGES[i + 1];
    edges.push({ from, to, d: elbow(stations[from], stations[to], { axis: "x" }) });
  }
  // The fork's own exit -> coordinator edge, inserted where specialists -> coordinator would sit.
  edges.splice(coordinatorIndex - 1, 0, { from: "specialists", to: "coordinator", d: elbow(exit, stations.coordinator, { axis: "x" }) });

  return {
    name,
    orientation: "horizontal",
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    stations,
    edges,
    fork: { entry, exit, lanes },
    forkCaptionAt: { x: (entry.x + exit.x) / 2, y: baseline + laneGap * 2 + 26 },
  };
}

function verticalGeometry(): PipelineGeometry {
  const width = 390;
  const marginTop = 36;
  const spineX = 54;
  const rowGap = 88;
  // specialists gets a taller gap so its indented fork group fits beside the spine.
  const forkGap = 220;

  const stations = {} as Record<Stage, Point>;
  let y = marginTop;
  for (const stage of STAGES) {
    stations[stage] = { x: spineX, y };
    y += stage === "specialists" ? forkGap : rowGap;
  }
  const height = y - rowGap + marginTop;

  const entry = stations.specialists;
  const exit: Point = { x: spineX, y: entry.y + forkGap * 0.62 };
  // An indented group fed by four short fork curves (landing §06 mobile): each lane bows out
  // to its own indent and back, stacked the way the horizontal breakpoints stack in y.
  const indent = 96;
  const laneGap = 34;
  const laneOffsets: readonly [ForkLaneKey, number][] = [
    ["bugs", indent - laneGap * 1.5],
    ["security", indent - laneGap * 0.5],
    ["tests", indent + laneGap * 0.5],
    ["quality", indent + laneGap * 1.5],
  ];
  const lanes: ForkLaneGeometry[] = laneOffsets.map(([key, dx]) => ({
    key,
    d: forkLane(entry, exit, dx, "y"),
    labelAt: { x: dx, y: (entry.y + exit.y) / 2 },
  }));

  const edges: PipelineEdge[] = [];
  const specialistsIndex = STAGES.indexOf("specialists");
  for (let i = 0; i < STAGES.length - 1; i++) {
    if (i === specialistsIndex) continue;
    const from = STAGES[i];
    const to = STAGES[i + 1];
    edges.push({ from, to, d: elbow(stations[from], stations[to], { axis: "y" }) });
  }
  const coordinatorIndex = STAGES.indexOf("coordinator");
  edges.splice(coordinatorIndex - 1, 0, { from: "specialists", to: "coordinator", d: elbow(exit, stations.coordinator, { axis: "y" }) });

  return {
    name: "vertical",
    orientation: "vertical",
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    stations,
    edges,
    fork: { entry, exit, lanes },
    forkCaptionAt: { x: spineX, y: exit.y + 22 },
  };
}

/** The one constants file plan §13 A4 requires: three geometries, all derived here. */
export const PIPELINE_GEOMETRY: Readonly<Record<PipelineBreakpoint, PipelineGeometry>> = {
  wide: horizontalGeometry("wide"),
  medium: horizontalGeometry("medium"),
  vertical: verticalGeometry(),
};

export function geometryFor(width: number): PipelineGeometry {
  return PIPELINE_GEOMETRY[breakpointFor(width)];
}

/** A point as percentages of its geometry's viewBox, for HTML overlays positioned over the SVG. */
export function asPercent(point: Point, geometry: PipelineGeometry): { left: string; top: string } {
  return { left: `${(point.x / geometry.width) * 100}%`, top: `${(point.y / geometry.height) * 100}%` };
}
