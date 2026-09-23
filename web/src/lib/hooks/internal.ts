// OWNER: t2a (wave 1). Shared plumbing for the hooks in this folder; not a public API.
import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getFindingQueryKey,
  getReviewResultQueryKey,
  getReviewStatusQueryKey,
  listAuditEventsQueryKey,
  listFindingsQueryKey,
  listSuppressionsQueryKey,
} from "@/api/@tanstack/react-query.gen";
import { isAbortError, toApiError, type ApiError } from "@/api/errors";
import { listReviewsQueryKey } from "@/api/ext";

/** Await a generated SDK call made with throwOnError: true; any rejection becomes an ApiError. */
export async function unwrap<T>(call: Promise<{ data: T }>, fallback: { method: string; path: string }): Promise<T> {
  try {
    return (await call).data;
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw toApiError(error, fallback);
  }
}

/** The generated `_id` of each operation, read off the generated key builders so it cannot drift. */
export const OPERATION = {
  getReviewStatus: getReviewStatusQueryKey({ path: { review_id: "" } })[0]._id,
  getReviewResult: getReviewResultQueryKey({ path: { review_id: "" } })[0]._id,
  listFindings: listFindingsQueryKey()[0]._id,
  getFinding: getFindingQueryKey({ path: { finding_id: "" } })[0]._id,
  listSuppressions: listSuppressionsQueryKey()[0]._id,
  listAuditEvents: listAuditEventsQueryKey()[0]._id,
  listReviews: listReviewsQueryKey()[0]._id,
} as const;

/** The `_id` of a generated-style query key, or null. */
export function operationOf(queryKey: QueryKey): string | null {
  const head = queryKey[0];
  return typeof head === "object" && head !== null && typeof (head as { _id?: unknown })._id === "string" ? (head as { _id: string })._id : null;
}

export function byOperation(...operations: string[]) {
  const set = new Set(operations);
  return (query: Query) => {
    const op = operationOf(query.queryKey);
    return op !== null && set.has(op);
  };
}

/** Everything a suppression or a revocation changes: findings (lists, details,
 *  the result documents that embed them), the ledger, and the audit trail. */
export const SUPPRESSION_AFFECTED = [
  OPERATION.listFindings,
  OPERATION.getFinding,
  OPERATION.getReviewResult,
  OPERATION.listSuppressions,
  OPERATION.listAuditEvents,
] as const;

/** The invalidation set for every ledger write, written once. */
export function invalidateSuppressionAffected(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ predicate: byOperation(...SUPPRESSION_AFFECTED) });
}

/** The toast every failed write raises (dashboard §2.0: toasts are for write outcomes). */
export function toastWriteFailure(error: ApiError): void {
  const parts = [error.code, error.message, error.requestId].filter(Boolean);
  toast.error(error.label, { description: parts.join(" · ") });
}

/** An id for an optimistic row. crypto.randomUUID needs a secure context. */
export function tempId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
