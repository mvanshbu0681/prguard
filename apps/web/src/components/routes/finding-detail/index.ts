// Public surface of the finding-detail route (app/(app)/findings/[id]/page.tsx is the only intended caller).
export { FindingDetailView } from "./FindingDetailView";
export { ClaimMarkdown } from "./ClaimMarkdown";
export { splitTitleSegments, TitleWithCode } from "./TitleWithCode";
export {
  deliveredExactLine,
  deliveredWithinRange,
  deliveryCommentUrl,
  formatDurationMs,
  formatRelativeAge,
  githubBlobUrl,
  githubCommentUrl,
  hasSuppressFormErrors,
  locationRangeLabel,
  proofVerdict,
  runOutcome,
  suppressRequestFrom,
  validateSuppressForm,
  type SuppressFormErrors,
  type SuppressFormValues,
} from "./format";
export { downloadFindingEvidence, findingEvidenceFilename } from "./export-evidence";
export { SuppressDialog } from "./SuppressDialog";
