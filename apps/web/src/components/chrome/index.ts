// OWNER: t1a (wave 1). The chrome every surface sits on: the substrate, the
// depth model, the evidence frame and its index/provenance grammar.
// Styles live in src/styles/chrome.css (imported once by app/globals.css).
// The .gradient-border utility (design §4.6) is CSS-only: className="gradient-border".
//
// Quick reference for consumers (the source headers carry the full rules):
//
//   Evidence frame — the ONLY way to get registration marks (plan §2 rule 1):
//     <Exhibit index="04" category="Proof bench" identifier="finding a91f3c2e"
//              meta={<Chip />} provenance="GET /v1/reviews/4e8b1d0/result → findings[0].proof"
//              capturedAt={iso} ext={fixtureOnly} density="compact" radius="container" padded>
//       …the artifact…
//     </Exhibit>
//     provenance is required (design R10). Body is unpadded unless `padded`.
//
//   Ordinary panel — no marks; bracket it with the same strips if it has a source:
//     <Surface elevation={2} variant="panel|card|inset" interactive as="section">
//       <IndexStrip index="03" category="Suppressions" meta={…} />
//       …
//       <ProvenanceStrip source="GET /v1/suppressions" />
//     </Surface>
//
//   Section head (marketing):  <SectionIndex index="05" category="Computed severity" labelAs="h2" />
//   Standalone source line:    <ProvenanceLine source="GET /v1/reviews?limit=8 → items" ext />
//   Substrate:                 <HeroBackdrop> … </HeroBackdrop> · <GraphPaper className="bg-ink-0" />
//                              · <Grain /> inside a `relative isolate` section (never page-wide)
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
