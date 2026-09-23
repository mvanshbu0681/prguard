// OWNER: t2a (wave 1).
//
// THE suppression reducer (dashboard §6: "one pure reducer shared by the
// optimistic path and the server response, so both compute the identical next
// state"). Three callers, one function:
//   - useSuppressFinding's onMutate applies it with a patch built from the
//     request (a `pending:` id), so the row strikes through before the network;
//   - its onSuccess applies it again with the patch built from the 201 body,
//     replacing the pending id with the real one;
//   - the fixture resolver applies it to its in-memory overlay, so fixture mode
//     serves exactly the state the client predicted.
// Side effects of POST /v1/findings/{id}/suppress on the finding (spec §6.6):
// status → suppressed, and the finding carries its suppression. Nothing else
// changes — in particular not `blocking`, which only the gate sets (spec §4.4).
//
// Pure and React-free: no imports beyond types.
import type { InfiniteData } from "@tanstack/react-query";
import type { Finding, FindingList, FindingSuppression, ReviewResult, SuppressRequest, SuppressionCreated } from "@/lib/api-types";

/** What a finding carries about its suppression (Finding.suppression). */
export type SuppressionPatch = FindingSuppression;

export const PENDING_SUPPRESSION_PREFIX = "pending:";

export function isPendingSuppression(suppression: FindingSuppression | null | undefined): boolean {
  return !!suppression && suppression.suppression_id.startsWith(PENDING_SUPPRESSION_PREFIX);
}

/** The reducer. Returns a new Finding; never mutates its input. */
export function suppressFindingReducer(finding: Finding, patch: SuppressionPatch): Finding {
  return {
    ...finding,
    status: "suppressed",
    suppression: {
      suppression_id: patch.suppression_id,
      scope: patch.scope,
      reason: patch.reason,
      created_by: patch.created_by ?? null,
      expires_at: patch.expires_at ?? null,
    },
  };
}

/** The optimistic patch: what the request says, under a pending id. */
export function patchFromRequest(request: SuppressRequest, options: { tempId: string; actorId?: string | null }): SuppressionPatch {
  return {
    suppression_id: `${PENDING_SUPPRESSION_PREFIX}${options.tempId}`,
    scope: request.scope,
    reason: request.reason,
    created_by: options.actorId ?? null,
    expires_at: request.expires_at ?? null,
  };
}

/** The confirmed patch: what the 201 says. */
export function patchFromCreated(created: SuppressionCreated): SuppressionPatch {
  return {
    suppression_id: created.suppression_id,
    scope: created.scope,
    reason: created.reason,
    created_by: created.created_by ?? null,
    expires_at: created.expires_at ?? null,
  };
}

// Appliers for every cache shape that holds findings. Each returns its input
// unchanged (same reference) when the finding is not in it, so an unrelated
// query does not re-render.

export function applySuppressionToFinding(finding: Finding, findingId: string, patch: SuppressionPatch): Finding {
  return finding.id === findingId ? suppressFindingReducer(finding, patch) : finding;
}

function mapFindings(findings: Finding[] | undefined, findingId: string, patch: SuppressionPatch): Finding[] | undefined {
  if (!findings || !findings.some((f) => f.id === findingId)) return findings;
  return findings.map((f) => applySuppressionToFinding(f, findingId, patch));
}

export function applySuppressionToList(list: FindingList, findingId: string, patch: SuppressionPatch): FindingList {
  const items = mapFindings(list.items, findingId, patch);
  return items === list.items ? list : { ...list, items };
}

export function applySuppressionToPages(data: InfiniteData<FindingList>, findingId: string, patch: SuppressionPatch): InfiniteData<FindingList> {
  const pages = data.pages.map((page) => applySuppressionToList(page, findingId, patch));
  return pages.every((page, i) => page === data.pages[i]) ? data : { ...data, pages };
}

export function applySuppressionToResult(result: ReviewResult, findingId: string, patch: SuppressionPatch): ReviewResult {
  const findings = mapFindings(result.findings, findingId, patch);
  return findings === result.findings ? result : { ...result, findings };
}
