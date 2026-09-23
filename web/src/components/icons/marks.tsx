// OWNER: t1c (wave 1). The four bespoke mechanic marks (docs/design/02-design-system.md §6.1).
//
//   ProofMark        a sample vial with a fill line — one drawing per proof_status
//   SeverityMark     a spirit level with a bubble
//   FingerprintMark  a ridge pattern: concentric arches with ONE deliberate break
//   GovernanceMark   a wax seal over a chain link
//
// Geometry rules (§6.4): integer coordinates, stroke centres on the half pixel, free
// stroke ends on whole pixels, butt caps, miter joins, fill none, stroke currentColor.
// Solid areas (the sample in the vial, the bubble, the wax) are `fill="currentColor"`
// shapes with integer edges. Every drawing exists on the 16 and 24 grids; the vial also
// on the hinted 12 grid because it is the glyph inside every proof chip.
import type { ProofStatus } from "@/lib/contracts";
import { MarkSvg, type Art, type MarkSvgProps } from "./svg";

type MarkProps = Omit<MarkSvgProps, "art" | "glyph">;

const FILL = { fill: "currentColor", stroke: "none" } as const;

/* ------------------------------------------------------------------------------------
   M1 — the proof vial. A capped sample vial; the top edge of the sample is the fill line.
     filled  proven          the sample reaches the fill line
     struck  disproven       empty, struck through — the claim was refuted by execution
     half    inconclusive    the sample reaches half way — a human must decide
     empty   not_attempted   capped and empty: prepared, never run
     open    not_applicable  no cap, nothing inside: there is nothing to prove
     ghost   skipped_no_env  capped, dashed walls: there was no sandbox to run it in
   Six silhouettes that stay distinct in greyscale and forced-colors mode, where the
   chip's fill and hue are gone and the glyph is the only channel left (§8.6).
   ------------------------------------------------------------------------------------ */

export type VialState = "filled" | "struck" | "half" | "empty" | "open" | "ghost";

export const VIAL_FOR_STATUS: Record<ProofStatus, VialState> = {
  proven: "filled",
  disproven: "struck",
  inconclusive: "half",
  not_attempted: "empty",
  not_applicable: "open",
  skipped_no_env: "ghost",
};

type Box = { x: number; y: number; w: number; h: number };
type VialGrid = {
  cap: Box;
  body: string;
  /** the uncapped vessel: the walls end in a rim as wide as the missing cap */
  open: string;
  dash: string;
  full: Box;
  half: Box;
  strike: string;
};

const VIAL_GRID: Record<12 | 16 | 24, VialGrid> = {
  12: {
    cap: { x: 2, y: 1, w: 8, h: 2 },
    body: "M3.5 3V10.5H8.5V3",
    open: "M2 3.5H3.5V10.5H8.5V3.5H10",
    dash: "1.5 1.5",
    full: { x: 4, y: 4, w: 4, h: 6 },
    half: { x: 4, y: 7, w: 4, h: 3 },
    strike: "M1.5 11.5L10.5 0.5",
  },
  16: {
    cap: { x: 3, y: 1, w: 10, h: 3 },
    body: "M5.5 4V14.5H10.5V4",
    open: "M3 4.5H5.5V14.5H10.5V4.5H13",
    dash: "2 1.5",
    full: { x: 6, y: 6, w: 4, h: 8 },
    half: { x: 6, y: 10, w: 4, h: 4 },
    strike: "M2 15L14 1",
  },
  24: {
    cap: { x: 5, y: 2, w: 14, h: 4 },
    body: "M8.5 6V21.5H15.5V6",
    open: "M5 6.5H8.5V21.5H15.5V6.5H19",
    dash: "3 2",
    full: { x: 9, y: 9, w: 6, h: 12 },
    half: { x: 9, y: 15, w: 6, h: 6 },
    strike: "M3 22.5L21 1.5",
  },
};

const box = (key: string, b: Box) => <rect key={key} {...FILL} x={b.x} y={b.y} width={b.w} height={b.h} />;

function vialArt(state: VialState): Art {
  const draw = (g: VialGrid) => (
    <g>
      {state !== "open" ? box("cap", g.cap) : null}
      <path d={state === "open" ? g.open : g.body} strokeDasharray={state === "ghost" ? g.dash : undefined} />
      {state === "filled" ? box("sample", g.full) : null}
      {state === "half" ? box("sample", g.half) : null}
      {state === "struck" ? <path d={g.strike} /> : null}
    </g>
  );
  return { 12: draw(VIAL_GRID[12]), 16: draw(VIAL_GRID[16]), 24: draw(VIAL_GRID[24]) };
}

export const VIAL_ART: Record<VialState, Art> = {
  filled: vialArt("filled"),
  struck: vialArt("struck"),
  half: vialArt("half"),
  empty: vialArt("empty"),
  open: vialArt("open"),
  ghost: vialArt("ghost"),
};

/** M1. The vial drawing for a proof_status — the mandatory glyph on every proof chip. */
export function ProofMark({ status, ...props }: MarkProps & { status: ProofStatus }) {
  const state = VIAL_FOR_STATUS[status];
  return <MarkSvg art={VIAL_ART[state]} glyph={`vial-${state}`} {...props} />;
}

/* ------------------------------------------------------------------------------------
   M2 — the spirit level. A vial tube, two centre marks, one bubble between them.
   ------------------------------------------------------------------------------------ */

export const LEVEL_ART: Art = {
  16: (
    <g>
      <path d="M1.5 5.5H14.5V10.5H1.5Z" />
      <path d="M4.5 5.5V10.5M11.5 5.5V10.5" />
      <ellipse {...FILL} cx={8} cy={8} rx={2} ry={1.25} />
    </g>
  ),
  24: (
    <g>
      <path d="M2.5 8.5H21.5V15.5H2.5Z" />
      <path d="M7.5 8.5V15.5M16.5 8.5V15.5" />
      <ellipse {...FILL} cx={12} cy={12} rx={2.5} ry={1.75} />
    </g>
  ),
};

/** M2. Severity is a reading off a calibrated instrument. */
export function SeverityMark(props: MarkProps) {
  return <MarkSvg art={LEVEL_ART} glyph="level" {...props} />;
}

/* ------------------------------------------------------------------------------------
   M3 — the fingerprint. Nested arches (a loop pattern) around a core, with exactly one
   deliberate break — the minutia — in the second ridge from the outside. Ridge spacing
   is 3 units so every leg lands on a half pixel.
   ------------------------------------------------------------------------------------ */

function arcPoint(cx: number, cy: number, r: number, deg: number): string {
  const t = (deg * Math.PI) / 180;
  const x = cx + r * Math.cos(t);
  const y = cy + r * Math.sin(t);
  return `${+x.toFixed(3)} ${+y.toFixed(3)}`;
}

export const RIDGE_ART: Art = {
  16: (
    <g>
      {/* core */}
      <path d="M6.5 11.5V9A1.5 1.5 0 0 1 9.5 9V10.5" />
      {/* ridge 2 — the break sits between -58° and -34° */}
      <path d={`M3.5 15V9A4.5 4.5 0 0 1 ${arcPoint(8, 9, 4.5, -58)}`} />
      <path d={`M${arcPoint(8, 9, 4.5, -34)}A4.5 4.5 0 0 1 12.5 9V13`} />
      {/* ridge 3 — outermost, arch only */}
      <path d={`M${arcPoint(8, 9, 7.5, 166)}A7.5 7.5 0 1 1 ${arcPoint(8, 9, 7.5, 14)}`} />
    </g>
  ),
  24: (
    <g>
      <path d="M10.5 16.5V13A1.5 1.5 0 0 1 13.5 13V15" />
      <path d="M7.5 20V13A4.5 4.5 0 0 1 16.5 13V18.5" />
      {/* ridge 3 — the break */}
      <path d={`M4.5 23V13A7.5 7.5 0 0 1 ${arcPoint(12, 13, 7.5, -58)}`} />
      <path d={`M${arcPoint(12, 13, 7.5, -36)}A7.5 7.5 0 0 1 19.5 13V21`} />
      <path d={`M${arcPoint(12, 13, 10.5, 162)}A10.5 10.5 0 1 1 ${arcPoint(12, 13, 10.5, 18)}`} />
    </g>
  ),
};

/** M3. The semantic fingerprint: identity survives the code moving. */
export function FingerprintMark(props: MarkProps) {
  return <MarkSvg art={RIDGE_ART} glyph="ridges" {...props} />;
}

/* ------------------------------------------------------------------------------------
   M4 — the wax seal over a chain link. One chain link on the diagonal (the reading every
   viewer already has for "link"), and a solid wax disc pressed over its middle. The link
   is cut back from the wax by a clear gap so the seal reads as lying on top of it. At 24
   the wax carries a struck rim — the impression — which 16 is too small to hold.
   ------------------------------------------------------------------------------------ */

const r3 = (v: number) => +v.toFixed(3);

/** The two visible ends of a stadium-shaped link from p1 to p2 (radius r), cut back to `clear` around its midpoint. */
function linkEnds(p1: [number, number], p2: [number, number], r: number, clear: number): [string, string] {
  const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const d = [(p2[0] - p1[0]) / len, (p2[1] - p1[1]) / len];
  const n = [-d[1] * r, d[0] * r];
  const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const half = Math.sqrt(Math.max(clear * clear - r * r, 0));
  const P = (x: number, y: number) => `${r3(x)} ${r3(y)}`;
  const side = (s: 1 | -1) => ({
    cutNear2: P(mid[0] + s * n[0] + half * d[0], mid[1] + s * n[1] + half * d[1]),
    cutNear1: P(mid[0] + s * n[0] - half * d[0], mid[1] + s * n[1] - half * d[1]),
    end2: P(p2[0] + s * n[0], p2[1] + s * n[1]),
    end1: P(p1[0] + s * n[0], p1[1] + s * n[1]),
  });
  const a = side(1);
  const b = side(-1);
  return [
    `M${a.cutNear2}L${a.end2}A${r} ${r} 0 0 0 ${b.end2}L${b.cutNear2}`,
    `M${a.cutNear1}L${a.end1}A${r} ${r} 0 0 1 ${b.end1}L${b.cutNear1}`,
  ];
}

const SEAL16 = linkEnds([3.5, 12.5], [12.5, 3.5], 2.5, 3 + 0.625 + 0.8);
const SEAL24 = linkEnds([5, 19], [19, 5], 3.75, 4.5 + 0.75 + 1.2);

export const SEAL_ART: Art = {
  16: (
    <g>
      <path d={SEAL16[0]} />
      <path d={SEAL16[1]} />
      <circle {...FILL} cx={8} cy={8} r={3} />
    </g>
  ),
  24: (
    <g>
      <path d={SEAL24[0]} />
      <path d={SEAL24[1]} />
      {/* the wax, with its struck rim cut out (even-odd) */}
      <path
        {...FILL}
        fillRule="evenodd"
        d="M7.5 12A4.5 4.5 0 1 0 16.5 12A4.5 4.5 0 1 0 7.5 12ZM9 12A3 3 0 1 0 15 12A3 3 0 1 0 9 12ZM9.75 12A2.25 2.25 0 1 0 14.25 12A2.25 2.25 0 1 0 9.75 12Z"
      />
    </g>
  ),
};

/** M4. Governance: the record is sealed and chained. */
export function GovernanceMark(props: MarkProps) {
  return <MarkSvg art={SEAL_ART} glyph="seal" {...props} />;
}
