// OWNER: t1c (wave 1). Every icon PR Guard renders, in one hand (docs/design/02-design-system.md §6).
//
//   Mechanic marks   ProofMark({ status }) · SeverityMark · FingerprintMark · GovernanceMark
//   Stations         StageGlyph({ stage }) for each of the nine STAGES
//   Chip glyphs      LedgerGlyph · GateGlyph({ state }) · RungGlyph({ rung })
//   Text glyphs      Play ▶ · Restore ↻ · Check ✓ · Cross ✗ · Warn ⚠ · Ellipsis ⋯ · Sigma Σ · DoubleBar ‖
//                    · SquareDot ▣ (Google Sans Code has none of these; each is one mono cell wide, 1em tall)
//   Utility chrome   Icon({ icon }) wraps lucide-react at stroke 1.5 and refuses §6.5's banned set
//
// Sizes come from ICON_SIZES (12 · 14 · 16 · 20 · 24) or their names (xs … xl). Everything
// is currentColor and aria-hidden unless given a `title` / `label`.
//
// MarkSvg renders any of the exported *_ART drawings (e.g. STAGE_ART[stage]) at a size from
// the scale; it is exported for composition, not for drawing new icons outside this folder.
export { ARTBOARD_STROKE, GLYPH_CELL, GLYPH_STROKE, ICON_SIZES, ICON_SIZE_NAMES, MarkSvg, artboardFor, iconPx } from "./svg";
export type { Art, Artboard, IconSize, IconSizeName, MarkSvgProps } from "./svg";

export { FingerprintMark, GovernanceMark, LEVEL_ART, ProofMark, RIDGE_ART, SEAL_ART, SeverityMark, VIAL_ART, VIAL_FOR_STATUS } from "./marks";
export type { VialState } from "./marks";

export { STAGE_ART, StageGlyph } from "./stages";
export type { Stage } from "./stages";

export { GATE_ART, GateGlyph, LEDGER_ART, LedgerGlyph, RUNG_ART, RungGlyph } from "./chip-glyphs";
export type { GateGlyphState, Rung } from "./chip-glyphs";

export { Check, Cross, DoubleBar, Ellipsis, GLYPH_DEFS, Play, Restore, Sigma, SquareDot, Warn } from "./glyphs";
export type { GlyphName } from "./glyphs";

export { BANNED_ICON_PATTERNS, Icon, LUCIDE_STROKE, bannedIconReason } from "./lucide";
export type { IconProps } from "./lucide";
