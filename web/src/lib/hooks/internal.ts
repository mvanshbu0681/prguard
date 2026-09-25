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
import { isAbortError, shortenPathIds, toApiError, type ApiError } from "@/api/errors";
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

/** What a confirmed write's success toast prints besides the endpoint. */
export interface WriteReceipt {
  status: number;
  requestId: string | null;
}

/** Status and X-Request-Id of each confirmed write, keyed by the body the hook resolved with. */
const receipts = new WeakMap<object, WriteReceipt>();

/** Like unwrap(), and remembers the response's status and X-Request-Id for receiptOf(). */
export async function unwrapWrite<T extends object>(call: Promise<{ data: T; response: Response }>, fallback: { method: string; path: string }): Promise<T> {
  try {
    const { data, response } = await call;
    receipts.set(data, { status: response.status, requestId: response.headers.get("x-request-id") });
    return data;
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw toApiError(error, fallback);
  }
}

/** The receipt of a body unwrapWrite() resolved with. */
export function receiptOf(data: object): WriteReceipt | undefined {
  return receipts.get(data);
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

/**
 * Everything a suppression or a revocation changes: findings (lists, details,
 * the result documents that embed them), the ledger, the audit trail, and the
 * run counts the backend derives from finding rows (a run's status and the run
 * list).
 */
export const SUPPRESSION_AFFECTED = [
  OPERATION.listFindings,
  OPERATION.getFinding,
  OPERATION.getReviewResult,
  OPERATION.listSuppressions,
  OPERATION.listAuditEvents,
  OPERATION.getReviewStatus,
  OPERATION.listReviews,
] as const;

/** The invalidation set for every ledger write, written once. */
export function invalidateSuppressionAffected(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ predicate: byOperation(...SUPPRESSION_AFFECTED) });
}

// ---------------------------------------------------------------------------
// Write toasts. Toasts are for write outcomes only (dashboard §2.0); a read
// failure is an inline error frame. The shape follows t1b's Toaster (design
// §5.14): a mono caps title of four words at most, a body that reads like a
// provenance line — `POST /v1/findings/a91f3c2e/suppress · 422 · fx_00000c` —
// and an error that stays until dismissed.
// ---------------------------------------------------------------------------

/** Auto-dismiss for a success (design §5.14). */
export const WRITE_TOAST_MS = 5000;

/** `POST /v1/findings/a91f3c2e/suppress · 201 · fx_00000c` */
export function writeLine(method: string, path: string, status: number | string, requestId?: string | null): string {
  return [`${method.toUpperCase()} ${shortenPathIds(path)}`, String(status), requestId].filter(Boolean).join(" · ");
}

/** `VALIDATION_ERROR: reason is required and must be non-empty` — the §6.0 code and the most specific message the envelope has. */
export function errorSummary(error: ApiError): string {
  const issues = (error.details as { errors?: unknown } | null)?.errors;
  const first = Array.isArray(issues) && typeof issues[0]?.msg === "string" ? String(issues[0].msg).replace(/^Value error, /, "") : null;
  return `${error.code}: ${first ?? error.message}`.replace(/\.$/, "");
}

/** A failed write: the title, then the endpoint and status, then what the server said. */
export function toastWriteFailure(title: string, error: ApiError): void {
  toast.error(title, {
    description: `${writeLine(error.method, error.path, error.statusLabel, error.requestId)} · ${errorSummary(error)}`,
    duration: Infinity,
    closeButton: true,
  });
}

/** A write the server confirmed. Nothing is raised when the body carries no receipt. */
export function toastWriteSuccess(title: string, method: string, path: string, data: object): void {
  const receipt = receiptOf(data);
  if (receipt) toast.success(title, { description: writeLine(method, path, receipt.status, receipt.requestId), duration: WRITE_TOAST_MS });
}

export interface WriteHookOptions {
  /** Raise the success toast (a caps title, then `METHOD path · status · request id`). A failure always raises its toast. */
  notify?: boolean;
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
