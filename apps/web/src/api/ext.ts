// OWNER: t2a (wave 1). Hand-written — the one extension (plan A11).
//
// GET /v1/reviews (the run list) does not exist in the backend (dashboard §1.2,
// ask #1). /overview needs it, so:
//   - fixture mode: the fixture resolver serves it from reviews/index.json, with
//     the same filters, cursor and page shape as the other list endpoints;
//   - live mode: nothing is invented on the wire. The list is the runs THIS
//     browser created (useCreateReview remembers each 202 in localStorage), each
//     read back through the real GET /v1/reviews/{id} and, once finished,
//     GET /v1/reviews/{id}/result. Every surface that renders it says so.
// Query keys follow the generated style: [{ _id, baseUrl, query }].
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { FIXTURES } from "@/lib/env";
import { client } from "./client.gen";
import { getReviewResultQueryKey, getReviewStatusQueryKey } from "./@tanstack/react-query.gen";
import { decodeCursor, encodeCursor, keysetPage } from "./cursor";
import { ApiError, isApiError } from "./errors";
import { getReviewResult, getReviewStatus } from "./sdk.gen";
import type { GateInfo, PageInfo, RepositoryRef, ResultCounts, ReviewAccepted, ReviewResult, ReviewStatus } from "./types.gen";

/** One run in the list (web/public/fixtures/README.md → reviews/index.json). */
export interface ReviewListItem {
  review_id: string;
  status: ReviewStatus["status"];
  trigger: ReviewAccepted["trigger"];
  repository: RepositoryRef;
  pull_request: { number: number; title: string | null; author: string | null };
  risk_tier: ReviewStatus["risk_tier"];
  gate_conclusion: GateInfo["conclusion"] | null;
  counts: ResultCounts;
  cost_usd_estimate: number | null;
  duration_seconds: number | null;
  created_at: string;
  finished_at: string | null;
}

export interface ReviewList {
  items: ReviewListItem[];
  page: PageInfo;
  totals: { matched: number };
}

export interface ListReviewsQuery {
  /** `owner/name` */
  repository?: string | null;
  status?: ReviewStatus["status"] | null;
  gate_conclusion?: GateInfo["conclusion"] | null;
  /** 1–200, default 50. */
  limit?: number;
  cursor?: string | null;
}

export type ListReviewsData = {
  body?: never;
  path?: never;
  query?: ListReviewsQuery;
  url: "/v1/reviews";
};

export type ListReviewsQueryKey = [{ _id: "listReviews"; baseUrl?: string; query?: ListReviewsQuery }];

/** Same construction as the generated createQueryKey: _id, the client's baseUrl, then query when given. */
export const listReviewsQueryKey = (options?: { query?: ListReviewsQuery }): ListReviewsQueryKey => {
  const key: ListReviewsQueryKey[0] = { _id: "listReviews", baseUrl: client.getConfig().baseUrl };
  if (options?.query) key.query = options.query;
  return [key];
};

export const listReviewsOptions = (options?: { query?: ListReviewsQuery }) =>
  queryOptions<ReviewList, ApiError, ReviewList, ListReviewsQueryKey>({
    queryKey: listReviewsQueryKey(options),
    queryFn: ({ signal, client: queryClient }) => listReviews({ query: options?.query, signal, queryClient }),
  });

export async function listReviews(options: { query?: ListReviewsQuery; signal?: AbortSignal; queryClient?: QueryClient } = {}): Promise<ReviewList> {
  if (FIXTURES) {
    const { data } = await client.get<{ 200: ReviewList }, unknown, true>({
      url: "/v1/reviews",
      query: options.query as Record<string, unknown> | undefined,
      signal: options.signal,
      throwOnError: true,
    });
    return data;
  }
  return listRememberedReviews(options);
}

// ---------------------------------------------------------------------------
// Live fallback: the runs this browser created.
// ---------------------------------------------------------------------------

const REMEMBER_KEY = "witness:created-reviews:v1";
const REMEMBER_LIMIT = 20;

function readRemembered(): ReviewAccepted[] {
  try {
    const raw = globalThis.localStorage?.getItem(REMEMBER_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is ReviewAccepted =>
        typeof r === "object" && r !== null && typeof (r as ReviewAccepted).review_id === "string" && typeof (r as ReviewAccepted).created_at === "string",
    );
  } catch {
    return [];
  }
}

/** Called by useCreateReview / useRerunReview on every 202. Newest first, deduplicated, capped. */
export function rememberCreatedReview(accepted: ReviewAccepted): void {
  try {
    const next = [accepted, ...readRemembered().filter((r) => r.review_id !== accepted.review_id)].slice(0, REMEMBER_LIMIT);
    globalThis.localStorage?.setItem(REMEMBER_KEY, JSON.stringify(next));
  } catch {
    // storage full, disabled or private mode: the list simply omits the run
  }
}

export function getRememberedReviews(): ReviewAccepted[] {
  return readRemembered();
}

export function forgetRememberedReviews(): void {
  try {
    globalThis.localStorage?.removeItem(REMEMBER_KEY);
  } catch {
    // nothing to forget
  }
}

const TERMINAL: ReadonlySet<ReviewStatus["status"]> = new Set(["succeeded", "failed", "cancelled"]);

function toListItem(accepted: ReviewAccepted, status: ReviewStatus, result: ReviewResult | null): ReviewListItem {
  const counts: ResultCounts = result?.counts ?? {
    proposed: status.counts?.proposed ?? 0,
    published: status.counts?.published ?? 0,
    suppressed: status.counts?.suppressed ?? 0,
    blocking: status.counts?.blocking ?? 0,
  };
  return {
    review_id: accepted.review_id,
    status: status.status,
    trigger: accepted.trigger,
    repository: result ? { owner: result.repository.owner, name: result.repository.name } : accepted.repository,
    pull_request: {
      number: result?.pull_request.number ?? accepted.pull_request.number,
      title: result?.pull_request.title ?? null,
      author: result?.pull_request.author ?? null,
    },
    risk_tier: status.risk_tier ?? result?.risk_tier ?? null,
    gate_conclusion: result?.gate?.conclusion ?? null,
    counts,
    cost_usd_estimate: result?.cost?.usd_estimate ?? null,
    duration_seconds: result?.timing?.duration_seconds ?? null,
    created_at: accepted.created_at,
    finished_at: status.finished_at ?? result?.timing?.finished_at ?? null,
  };
}

/** A finished run's status only moves when a suppression changes its counts: re-read it at most this often. */
const TERMINAL_STATUS_STALE_MS = 30_000;

async function readRun(accepted: ReviewAccepted, signal: AbortSignal | undefined, queryClient: QueryClient | undefined): Promise<ReviewListItem | null> {
  let status: ReviewStatus;
  const fetchStatus = async () => (await getReviewStatus({ path: { review_id: accepted.review_id }, signal, throwOnError: true })).data;
  try {
    // Shared with useReviewStatus through the query cache: a live run is always re-read, a finished one every 30s.
    status = queryClient
      ? await queryClient.fetchQuery({
          queryKey: getReviewStatusQueryKey({ path: { review_id: accepted.review_id } }),
          queryFn: fetchStatus,
          staleTime: (query) => (TERMINAL.has((query.state.data as ReviewStatus | undefined)?.status ?? "queued") ? TERMINAL_STATUS_STALE_MS : 0),
        })
      : await fetchStatus();
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null; // the run is gone from the backend
    throw error;
  }
  let result: ReviewResult | null = null;
  if (TERMINAL.has(status.status)) {
    const fetchResult = async () => (await getReviewResult({ path: { review_id: accepted.review_id }, signal, throwOnError: true })).data;
    try {
      // A finished run's result never changes: cache it for the session.
      result = queryClient
        ? await queryClient.fetchQuery({ queryKey: getReviewResultQueryKey({ path: { review_id: accepted.review_id } }), queryFn: fetchResult, staleTime: Infinity })
        : await fetchResult();
    } catch (error) {
      if (!isApiError(error)) throw error;
      result = null; // the row still renders from its status
    }
  }
  return toListItem(accepted, status, result);
}

function badQuery(field: string, message: string): ApiError {
  return new ApiError({ status: 422, code: "VALIDATION_ERROR", message, details: { field }, method: "GET", path: "/v1/reviews" });
}

async function listRememberedReviews(options: { query?: ListReviewsQuery; signal?: AbortSignal; queryClient?: QueryClient }): Promise<ReviewList> {
  const query = options.query ?? {};
  const limit = query.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw badQuery("limit", "limit must be an integer from 1 to 200.");
  const rows = (await Promise.all(readRemembered().map((r) => readRun(r, options.signal, options.queryClient)))).filter(
    (r): r is ReviewListItem => r !== null,
  );
  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.review_id.localeCompare(b.review_id)));
  const matching = rows.filter(
    (r) =>
      (!query.repository || `${r.repository.owner}/${r.repository.name}` === query.repository) &&
      (!query.status || r.status === query.status) &&
      (!query.gate_conclusion || r.gate_conclusion === query.gate_conclusion),
  );
  let after: string | null = null;
  if (query.cursor) {
    const anchor = decodeCursor(query.cursor);
    if (!anchor || typeof anchor.id !== "string") throw badQuery("cursor", "cursor is not one this endpoint issued.");
    after = anchor.id;
  }
  const page = keysetPage(rows, matching, (r) => r.review_id, after, limit);
  if (!page) throw badQuery("cursor", "cursor names a run that is no longer listed.");
  return {
    items: page.items,
    page: { limit, has_more: page.hasMore, next_cursor: page.nextKey === null ? null : encodeCursor({ id: page.nextKey }) },
    totals: { matched: matching.length },
  };
}
