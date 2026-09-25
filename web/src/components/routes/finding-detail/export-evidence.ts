// OWNER: d3 (wave 3). "Export evidence" (sticky mini-header, dashboard-blueprint
// §2.7): a client-side download of exactly the JSON GET /v1/findings/{id}
// already returned — no re-formatting, no invented fields, so the exported
// file is provably the same document the page rendered from.
import type { Finding } from "@/lib/api-types";

export function findingEvidenceFilename(finding: Finding): string {
  return `finding-${finding.id.slice(0, 8)}.json`;
}

export function downloadFindingEvidence(finding: Finding): void {
  const blob = new Blob([JSON.stringify(finding, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = findingEvidenceFilename(finding);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
