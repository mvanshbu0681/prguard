// OWNER: t1c (wave 1). The nine pipeline station glyphs, one per STAGES entry
// (docs/design/02-design-system.md §6.1: "the same strokes become the pipeline's nine
// station glyphs, so the whole system reads as one hand").
//
//   ingest       the PR arrives: an arrow dropping into a tray
//   context      the surrounding code: lines of source inside brackets
//   specialists  one input fanning out to four parallel lanes
//   coordinator  four lanes converging to one output (the mirror of specialists)
//   severity     M2, the spirit level
//   identity     M3, the fingerprint
//   proof        M1, the capped sample vial
//   delivery     the delivery ladder: two rails, four rungs
//   finalise     M4, the seal over the chain
//
// A station glyph names a stage. Its state (pending, running, done …) is StageDot's job
// and is never encoded here, so the glyph never changes with the run.
import { STAGES } from "@/lib/contracts";
import { RUNG_ART } from "./chip-glyphs";
import { LEVEL_ART, RIDGE_ART, SEAL_ART, VIAL_ART } from "./marks";
import { MarkSvg, type Art, type MarkSvgProps } from "./svg";

export type Stage = (typeof STAGES)[number];

export const STAGE_ART: Record<Stage, Art> = {
  ingest: {
    16: (
      <g>
        <path d="M1.5 10V13.5H13.5V10" />
        <path d="M7.5 1V8" />
        <path d="M4.5 5.5L7.5 8.5L10.5 5.5" />
      </g>
    ),
    24: (
      <g>
        <path d="M1.5 15V20.5H21.5V15" />
        <path d="M11.5 2V12" />
        <path d="M6.5 8L11.5 13L16.5 8" />
      </g>
    ),
  },
  context: {
    16: (
      <g>
        <path d="M5 2.5H2.5V13.5H5M11 2.5H13.5V13.5H11" />
        <path d="M5 5.5H11M5 8.5H9M5 11.5H10" />
      </g>
    ),
    24: (
      <g>
        <path d="M8 3.5H3.5V20.5H8M16 3.5H20.5V20.5H16" />
        <path d="M8 8.5H16M8 12.5H13M8 16.5H15" />
      </g>
    ),
  },
  specialists: {
    16: (
      <g>
        <path d="M1 8.5H5.5" />
        <path d="M15 2.5H5.5V14.5H15M5.5 6.5H15M5.5 10.5H15" />
      </g>
    ),
    24: (
      <g>
        <path d="M1 12.5H8.5" />
        <path d="M23 3.5H8.5V21.5H23M8.5 9.5H23M8.5 15.5H23" />
      </g>
    ),
  },
  coordinator: {
    16: (
      <g>
        <path d="M1 2.5H10.5V14.5H1M1 6.5H10.5M1 10.5H10.5" />
        <path d="M10.5 8.5H15" />
      </g>
    ),
    24: (
      <g>
        <path d="M1 3.5H15.5V21.5H1M1 9.5H15.5M1 15.5H15.5" />
        <path d="M15.5 12.5H23" />
      </g>
    ),
  },
  severity: LEVEL_ART,
  identity: RIDGE_ART,
  proof: VIAL_ART.empty,
  // the same ladder DeliveryModeChip carries, with no rung lit
  delivery: RUNG_ART.none,
  finalise: SEAL_ART,
};

/** The station glyph for one of the nine STAGES. Decorative unless `title` is given. */
export function StageGlyph({ stage, ...props }: Omit<MarkSvgProps, "art" | "glyph"> & { stage: Stage }) {
  return <MarkSvg art={STAGE_ART[stage]} glyph={`stage-${stage}`} {...props} />;
}
