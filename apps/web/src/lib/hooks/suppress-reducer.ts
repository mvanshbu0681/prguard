// OWNER: t2a (wave 1).
//
// THE suppression reducer (dashboard §6: "one pure reducer shared by the
// optimistic path and the server response, so both compute the identical next
// state"). Three callers, one set of functions:
//   - useSuppressFinding's onMutate applies it with a patch built from the
//     request (a `pending:` id), so the row strikes through before the network;
//   - its onSuccess applies it again with the patch built from the 201 body,
//     replacing the pending id with the real one;
//   - the fixture resolver applies it to its in-memory overlay, so fixture mode
//     serves exactly the state the client predicted.
//
// What POST /v1/findings/{id}/suppress changes, as the backend does it
// (api/routes_suppressions.py and api/routes_reviews.py at eeb1be8):
//   - the finding: status → suppressed, it carries its suppression, and
//     blocking → false (is_blocking() requires status == published, spec §4.4);
//   - its run, because the backend assembles both documents live from finding
//     rows: the status and result counts move one finding into `suppressed`,
//     gate.blocking_finding_ids drops it (gate.reason is re-derived from that
//     list; the stored conclusion does not change), and the result's
//     delivery.ladder_breakdown stops counting it, since the ladder counts
//     published findings only.
// Every function returns its input unchanged (same reference) when there is
// nothing to change, so an unrelated cache entry does not re-render, and a
// second application (the confirmed patch over the optimistic one) moves no
// count twice.
//
// Pure and React-free: no imports beyond types.
import type { InfiniteData } from "@tanstack/react-query";
import type {
  Finding,
  FindingList,
  FindingSuppression,
  GateInfo,
  LadderBreakdown,
  ResultCounts,
  ReviewResult,
  RunCounts,
  SuppressRequest,
  SuppressionCreated,
} from "@/lib/api-types";
import type { DeliveryMode } from "@/lib/contracts";

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
    blocking: false,
    suppression: {
      suppression_id: patch.suppression_id,
      scope: patch.scope,
      reason: patch.reason,
      created_by: patch.created_by ?? null,
      expires_at: patch.expires_at ?? null,
    },
  };
}

/** The optimistic patch: what the request says, under a pending id. The backend trims the reason. */
export function patchFromRequest(request: SuppressRequest, options: { tempId: string; actorId?: string | null }): SuppressionPatch {
  return {
    suppression_id: `${PENDING_SUPPRESSION_PREFIX}${options.tempId}`,
    scope: request.scope,
    reason: request.reason.trim(),
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

// ---------------------------------------------------------------------------
// What moved: a finding's status bucket and its blocking flag.
// ---------------------------------------------------------------------------

export interface FindingTransition {
  from: Finding["status"];
  to: Finding["status"];
  /** It was blocking and no longer is. */
  unblocked: boolean;
  /** The rung that stops counting it: it was published and no longer is. */
  leftLadder: DeliveryMode | null;
}

/** null when the finding's status and blocking flag did not change (a re-application). */
export function findingTransition(before: Finding, after: Finding): FindingTransition | null {
  const unblocked = !!before.blocking && !after.blocking;
  if (before.status === after.status && !unblocked) return null;
  const leftLadder = before.status === "published" && after.status !== "published" ? (before.delivery?.mode ?? null) : null;
  return { from: before.status, to: after.status, unblocked, leftLadder };
}

/** In a result, `proposed` is the run's total, not a bucket (routes_reviews.py); these four are status buckets. */
const RESULT_BUCKETS = ["published", "suppressed", "dropped", "disproven"] as const;
/** In a status, `proposed` is the backlog still to be triaged: a bucket. */
const STATUS_BUCKETS = ["proposed", "published", "suppressed"] as const;

function moveCounts<C extends Record<string, number | undefined>>(counts: C | undefined, t: FindingTransition | null, buckets: readonly string[]): C | undefined {
  if (!counts || !t) return counts;
  const next: Record<string, number | undefined> = { ...counts };
  const bump = (key: string, by: number) => {
    if (!buckets.includes(key) && key !== "blocking") return;
    next[key] = Math.max(0, (next[key] ?? 0) + by);
  };
  if (t.from !== t.to) {
    bump(t.from, -1);
    bump(t.to, 1);
  }
  if (t.unblocked) bump("blocking", -1);
  return next as C;
}

export function applyTransitionToResultCounts(counts: ResultCounts | undefined, t: FindingTransition | null): ResultCounts | undefined {
  return moveCounts(counts, t, RESULT_BUCKETS);
}

export function applyTransitionToRunCounts(counts: RunCounts | undefined, t: FindingTransition | null): RunCounts | undefined {
  return moveCounts(counts, t, STATUS_BUCKETS);
}

/** gate.reason exactly as the backend derives it from the live blocking list (routes_reviews._gate_reason). */
export function gateReason(conclusion: GateInfo["conclusion"], blockingCount: number): string {
  if (conclusion === "failure") {
    const subject = blockingCount === 1 ? "1 finding carries" : `${blockingCount} findings carry`;
    return `${subject} a repro test that passes at base and fails at head.`;
  }
  if (conclusion === "neutral") return "Nothing could be executed in this run, so nothing is claimed or blocked.";
  return "No finding was both proven by execution and severe enough to block.";
}

function applyTransitionToGate(gate: GateInfo | null | undefined, findingId: string, t: FindingTransition | null): GateInfo | null | undefined {
  if (!gate || !t?.unblocked || !gate.blocking_finding_ids?.includes(findingId)) return gate;
  const blocking = gate.blocking_finding_ids.filter((id) => id !== findingId);
  return { ...gate, blocking_finding_ids: blocking, reason: gateReason(gate.conclusion, blocking.length) };
}

const RUNGS = ["inline_exact", "inline_nearest", "file_level", "summary_only"] as const;

function applyTransitionToLadder(ladder: LadderBreakdown | undefined, t: FindingTransition | null): LadderBreakdown | undefined {
  const rung = t?.leftLadder;
  if (!ladder || !rung || !(RUNGS as readonly string[]).includes(rung)) return ladder;
  const key = rung as (typeof RUNGS)[number];
  return { ...ladder, [key]: Math.max(0, (ladder[key] ?? 0) - 1) };
}

// ---------------------------------------------------------------------------
// Appliers for every cache shape that holds findings.
// ---------------------------------------------------------------------------

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

/** The result document, re-derived the way the backend assembles it: findings, counts, gate blocking list, ladder. */
export function applySuppressionToResult(result: ReviewResult, findingId: string, patch: SuppressionPatch): ReviewResult {
  const before = result.findings?.find((f) => f.id === findingId);
  if (!before) return result;
  const after = suppressFindingReducer(before, patch);
  const t = findingTransition(before, after);
  const ladder = applyTransitionToLadder(result.delivery?.ladder_breakdown, t);
  return {
    ...result,
    findings: result.findings!.map((f) => (f.id === findingId ? after : f)),
    counts: applyTransitionToResultCounts(result.counts, t),
    gate: applyTransitionToGate(result.gate, findingId, t),
    delivery: result.delivery && ladder !== result.delivery.ladder_breakdown ? { ...result.delivery, ladder_breakdown: ladder } : result.delivery,
  };
}
