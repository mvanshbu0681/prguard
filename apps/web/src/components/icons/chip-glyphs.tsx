// OWNER: t1c (wave 1). The small glyphs the semantic chips carry, so no state is ever
// encoded by colour alone (docs/design/02-design-system.md §8.2).
//
//   LedgerGlyph  a ruled ledger page — finding status `suppressed` (§1.9: "ledger glyph")
//   GateGlyph    ■ blocked · ○ clear · — neutral · ◉ running — four shapes, no checkmark
//   RungGlyph    the delivery ladder with the rung that fired filled in; no rung = not delivered
//
// Drawn on all three grids: 12 (in chips), 16 and 24 (everywhere else).
import { MarkSvg, type Art, type MarkSvgProps } from "./svg";

type GlyphProps = Omit<MarkSvgProps, "art" | "glyph">;
const FILL = { fill: "currentColor", stroke: "none" } as const;

export const LEDGER_ART: Art = {
  12: (
    <g>
      <path d="M2.5 1.5H9.5V10.5H2.5Z" />
      <path d="M4.5 1.5V10.5" />
      <path d="M5 4.5H8M5 6.5H8M5 8.5H8" />
    </g>
  ),
  16: (
    <g>
      <path d="M3.5 1.5H12.5V14.5H3.5Z" />
      <path d="M6.5 1.5V14.5" />
      <path d="M7 5.5H11M7 8.5H11M7 11.5H11" />
    </g>
  ),
  24: (
    <g>
      <path d="M5.5 2.5H18.5V21.5H5.5Z" />
      <path d="M9.5 2.5V21.5" />
      <path d="M10 7.5H16M10 11.5H16M10 15.5H16" />
    </g>
  ),
};

/** The suppression ledger: a suppressed finding stays on the record. */
export function LedgerGlyph(props: GlyphProps) {
  return <MarkSvg art={LEDGER_ART} glyph="ledger" {...props} />;
}

/** A GateConclusion, plus `running`: the run is still going and the gate is undecided. */
export type GateGlyphState = "failure" | "neutral" | "success" | "running";

export const GATE_ART: Record<GateGlyphState, Art> = {
  failure: {
    12: <rect {...FILL} x={3} y={3} width={6} height={6} />,
    16: <rect {...FILL} x={4} y={4} width={8} height={8} />,
    24: <rect {...FILL} x={6} y={6} width={12} height={12} />,
  },
  success: {
    12: <circle cx={6} cy={6} r={3.5} />,
    16: <circle cx={8} cy={8} r={4.5} />,
    24: <circle cx={12} cy={12} r={6.5} />,
  },
  neutral: {
    12: <path d="M3 6.5H9" />,
    16: <path d="M4 8.5H12" />,
    24: <path d="M6 12.5H18" />,
  },
  running: {
    12: (
      <g>
        <circle cx={6} cy={6} r={3.5} />
        <circle {...FILL} cx={6} cy={6} r={1.5} />
      </g>
    ),
    16: (
      <g>
        <circle cx={8} cy={8} r={4.5} />
        <circle {...FILL} cx={8} cy={8} r={2} />
      </g>
    ),
    24: (
      <g>
        <circle cx={12} cy={12} r={6.5} />
        <circle {...FILL} cx={12} cy={12} r={3} />
      </g>
    ),
  },
};

/** The merge gate's shape: ■ blocked, ○ clear, — neutral, ◉ running. Never a checkmark. */
export function GateGlyph({ state, ...props }: GlyphProps & { state: GateGlyphState }) {
  return <MarkSvg art={GATE_ART[state]} glyph={`gate-${state}`} {...props} />;
}

/** Rung index on the comment ladder: 0 inline_exact · 1 inline_nearest · 2 file_level · 3 summary_only. */
export type Rung = 0 | 1 | 2 | 3;

// The rung that fired is a solid bar reaching past both rails, so its position on the
// ladder reads at a glance even at 12px, where four rungs share twelve pixels.
const RUNG_GRID = {
  12: { rails: "M3.5 0V12M8.5 0V12", ys: [1.5, 4.5, 7.5, 10.5], x1: 4, x2: 8, bar: { x: 1, w: 10, h: 3 } },
  16: { rails: "M4.5 1V15M11.5 1V15", ys: [3.5, 6.5, 9.5, 12.5], x1: 5, x2: 11, bar: { x: 1, w: 14, h: 3 } },
  24: { rails: "M6.5 1V23M17.5 1V23", ys: [4.5, 9.5, 14.5, 19.5], x1: 7, x2: 17, bar: { x: 2, w: 20, h: 5 } },
} as const;

function rungArt(fired: Rung | null): Art {
  const draw = (g: (typeof RUNG_GRID)[keyof typeof RUNG_GRID]) => (
    <g>
      <path d={g.rails} />
      <path d={g.ys.map((y) => `M${g.x1} ${y}H${g.x2}`).join("")} />
      {fired === null ? null : <rect {...FILL} x={g.bar.x} y={g.ys[fired] - g.bar.h / 2} width={g.bar.w} height={g.bar.h} />}
    </g>
  );
  return { 12: draw(RUNG_GRID[12]), 16: draw(RUNG_GRID[16]), 24: draw(RUNG_GRID[24]) };
}

export const RUNG_ART: Record<"none" | `${Rung}`, Art> = {
  none: rungArt(null),
  "0": rungArt(0),
  "1": rungArt(1),
  "2": rungArt(2),
  "3": rungArt(3),
};

/** The delivery ladder with the rung that fired filled in. `rung={null}`: nothing was delivered. */
export function RungGlyph({ rung, ...props }: GlyphProps & { rung: Rung | null }) {
  const key = rung === null ? "none" : (`${rung}` as const);
  return <MarkSvg art={RUNG_ART[key]} glyph={`rung-${key}`} {...props} />;
}
