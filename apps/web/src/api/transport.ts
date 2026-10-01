// OWNER: t2a (wave 1). Hand-written — not produced by `npm run api:gen`.
//
// The generated client's `fetch`. Three jobs, in this order:
//  1. Send the request through the current base: the network, unless a test
//     sets another one (the demo corpus and its fixture resolver are gone).
//  2. Turn every failure into an ApiError before the generated client sees it:
//     a non-2xx response keeps its status and §6.0 envelope; no response at all
//     becomes status 0 / NETWORK_ERROR. (The generated client would otherwise
//     throw the bare parsed body and lose the status.) Aborts pass through
//     untouched so TanStack Query's cancellation works.
//  3. Record the call — method, route, status, latency, item count — in a small
//     in-memory log that /lab/t2a renders. Bodies are only read for the count
//     while someone is subscribed.
import { API_BASE } from "@/lib/env";
import { ApiError, apiErrorFromResponse, isAbortError, networkError } from "./errors";
import { routeLabel, stripBasePath } from "./routes";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ApiCall {
  /** Monotonic per page load. */
  id: number;
  method: string;
  /** Route path with real ids: `/v1/findings/a91f…`. */
  path: string;
  /** `GET /v1/findings/{finding_id}` — groups calls per endpoint. */
  route: string;
  /** `?severity_min=high` or "". */
  search: string;
  /** HTTP status; 0 = no response (network failure or abort). */
  status: number;
  ok: boolean;
  aborted: boolean;
  /** Wall time from send to headers, ms. */
  ms: number;
  /** `items.length` (lists) or `findings.length` (result) when the body carries one; null otherwise. */
  items: number | null;
  /** §6.0 code or client code on failure. */
  code: string | null;
  requestId: string | null;
  /** Date.now() at send. */
  startedAt: number;
  /** Where the response came from. */
  source: "fixture" | "network" | "custom";
}

const LOG_LIMIT = 300;
const EMPTY: readonly ApiCall[] = Object.freeze([]);
/** Immutable: a new array per change, so useSyncExternalStore(subscribeApiCalls, getApiCalls) works. */
let snapshot: readonly ApiCall[] = EMPTY;
/** Called with the new call after each record, and with no argument after clearApiCalls(). */
type CallListener = (call?: ApiCall) => void;
const listeners = new Set<CallListener>();
let nextCallId = 1;

/** Subscribe to every completed call. Returns the unsubscribe function. */
export function subscribeApiCalls(listener: CallListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The last LOG_LIMIT calls, oldest first. */
export function getApiCalls(): readonly ApiCall[] {
  return snapshot;
}

export function clearApiCalls(): void {
  snapshot = EMPTY;
  for (const listener of listeners) listener();
}

function record(call: Omit<ApiCall, "id">): void {
  const entry: ApiCall = { id: nextCallId++, ...call };
  const next = [...snapshot, entry];
  snapshot = Object.freeze(next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next);
  for (const listener of listeners) listener(entry);
}

async function countItems(response: Response): Promise<number | null> {
  try {
    const body: unknown = JSON.parse(await response.text());
    if (typeof body !== "object" || body === null) return null;
    const { items, findings } = body as { items?: unknown; findings?: unknown };
    if (Array.isArray(items)) return items.length;
    if (Array.isArray(findings)) return findings.length;
    return null;
  } catch {
    return null;
  }
}

const networkFetch: FetchLike = (input, init) => globalThis.fetch(input, init);

let baseOverride: { fetch: FetchLike; source: ApiCall["source"] } | null = null;

/** Route every client call through `base` (tests, or an explicit install). `null` restores the default. */
export function setTransportBase(base: FetchLike | null, source: ApiCall["source"] = "custom"): void {
  baseOverride = base ? { fetch: base, source } : null;
}

function currentBase(): { fetch: FetchLike; source: ApiCall["source"] } {
  if (baseOverride) return baseOverride;
  return { fetch: networkFetch, source: "network" };
}

const clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

function basePathOf(base: string): string {
  try {
    return new URL(base).pathname;
  } catch {
    return "";
  }
}

export function createTransport(options: { basePath?: string } = {}): FetchLike {
  const basePath = options.basePath ?? basePathOf(API_BASE);
  return async (input, init) => {
    const request = input instanceof Request && init === undefined ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = stripBasePath(url.pathname, basePath);
    const { fetch: send, source } = currentBase();
    const common = {
      method: request.method.toUpperCase(),
      path,
      route: routeLabel(request.method, path),
      search: url.search,
      startedAt: Date.now(),
      source,
    };
    const t0 = clock();
    let response: Response;
    try {
      response = await send(request);
    } catch (cause) {
      const ms = Math.round(clock() - t0);
      if (isAbortError(cause)) {
        record({ ...common, status: 0, ok: false, aborted: true, ms, items: null, code: null, requestId: null });
        throw cause;
      }
      const error = cause instanceof ApiError ? cause : networkError(request, cause, basePath);
      record({ ...common, status: error.status, ok: false, aborted: false, ms, items: null, code: error.code, requestId: error.requestId });
      throw error;
    }
    const ms = Math.round(clock() - t0);
    if (!response.ok) {
      const error = await apiErrorFromResponse(response, request, basePath);
      record({ ...common, status: response.status, ok: false, aborted: false, ms, items: null, code: error.code, requestId: error.requestId });
      throw error;
    }
    const items = listeners.size > 0 ? await countItems(response.clone()) : null;
    record({ ...common, status: response.status, ok: true, aborted: false, ms, items, code: null, requestId: response.headers.get("x-request-id") });
    return response;
  };
}

/** The transport the generated client is created with (src/api/runtime-config.ts). */
export const apiTransport: FetchLike = createTransport();
