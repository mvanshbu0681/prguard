// OWNER: t1a (wave 1). The chrome every surface sits on: the substrate, the
// depth model, the evidence frame and its index/provenance grammar.
// Styles live in src/styles/chrome.css (imported once by app/globals.css).
// The .gradient-border utility (design §4.6) is CSS-only: className="gradient-border".
export { GraphPaper, Grain, HeroBackdrop, type GraphPaperProps, type GrainProps, type HeroBackdropProps } from './Substrate';
export { Surface, type SurfaceElevation, type SurfaceProps, type SurfaceVariant } from './Surface';
export {
  Exhibit,
  IndexStrip,
  ProvenanceStrip,
  type ExhibitDensity,
  type ExhibitProps,
  type IndexStripProps,
  type ProvenanceStripProps,
} from './Exhibit';
export { IndexLabel, SectionIndex, indexText, type IndexLabelProps, type IndexParts, type SectionIndexProps } from './SectionIndex';
export { PROVENANCE_EXT_NOTE, ProvenanceLine, formatCaptured, type ProvenanceLineProps } from './ProvenanceLine';
export type { PolymorphicProps } from './polymorphic';
