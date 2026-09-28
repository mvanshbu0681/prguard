// OWNER: d3 (wave 3). Public surface of the finding-detail route
// (app/(app)/findings/[id]/page.tsx is the only intended caller).
export { FindingDetailView } from "./FindingDetailView";
export { ClaimMarkdown } from "./ClaimMarkdown";
export { splitTitleSegments, TitleWithCode } from "./TitleWithCode";
export {
  deliveredExactLine,
  formatDurationMs,
  formatRelativeAge,
  githubCommentUrl,
  hasSuppressFormErrors,
  locationRangeLabel,
  suppressRequestFrom,
  validateSuppressForm,
  type SuppressFormErrors,
  type SuppressFormValues,
} from "./format";
export { downloadFindingEvidence, findingEvidenceFilename } from "./export-evidence";
export { SuppressDialog } from "./SuppressDialog";
