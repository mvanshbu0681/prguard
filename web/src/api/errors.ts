// OWNER: t2a (wave 1). Hand-written — not produced by `npm run api:gen`.
//
// The one error type the data layer surfaces. Every failed call made through the
// generated client rejects with an ApiError (the transport converts HTTP and
// network failures before the client sees them), so a hook's `error` always has
// a status, the §6.0 envelope fields and the endpoint that failed. That is what
// lets the QueryClient refuse to retry a 4xx, the poll back off on a network
// error, and a write toast print `POST /v1/findings/{id}/suppress · 422`.
import { stripBasePath } from "./routes";

/** Spec §6.0: the body of every non-2xx response. */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown> | null;
    request_id?: string | null;
  };
}

export interface ApiErrorInit {
  status: number;
  code: string;
  message: string;
  method: string;
  path: string;
  details?: Record<string, unknown> | null;
  requestId?: string | null;
  body?: unknown;
}

/** Codes the client assigns itself when no envelope arrived. Not in the §6.0 registry. */
export const CLIENT_ERROR_CODES = {
  /** No response: offline, DNS, CORS, connection refused. status 0. */
  NETWORK_ERROR: "NETWORK_ERROR",
  /** A thrown value that was not an HTTP failure (serialisation, programming error). status 0. */
  CLIENT_ERROR: "CLIENT_ERROR",
} as const;

export class ApiError extends Error {
  override readonly name = "ApiError";
  /** HTTP status; 0 when no response arrived. */
  readonly status: number;
  /** §6.0 code (RESULT_NOT_READY …), `HTTP_<status>` for a body without an envelope, or a CLIENT_ERROR_CODES value. */
  readonly code: string;
  readonly details: Record<string, unknown> | null;
  readonly requestId: string | null;
  /** Upper-case HTTP method of the failed request. */
  readonly method: string;
  /** Path of the failed request with its real ids, no origin, no query: `/v1/findings/a91f…/suppress`. */
  readonly path: string;
  /** The parsed body (envelope, FastAPI `{detail}`) or its text. */
  readonly body: unknown;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.status = init.status;
    this.code = init.code;
    this.details = init.details ?? null;
    this.requestId = init.requestId ?? null;
    this.method = init.method.toUpperCase();
    this.path = init.path;
    this.body = init.body;
  }

  /** `POST /v1/findings/a91f…/suppress` */
  get endpoint(): string {
    return `${this.method} ${this.path}`;
  }

  /** The path with every id cut to its short form (plan A10): `/v1/findings/a91f3c2e/suppress`. For display; `path` keeps ids whole. */
  get displayPath(): string {
    return shortenPathIds(this.path);
  }

  /** No response arrived at all. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }

  /** The status as printed in a toast or an error frame: `422`, or `no response`. */
  get statusLabel(): string {
    return this.status > 0 ? String(this.status) : "no response";
  }

  /** `POST /v1/findings/a91f…/suppress · 422` — the endpoint and the status, the form every write toast carries. */
  get label(): string {
    return `${this.endpoint} · ${this.statusLabel}`;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Plan A10's short ids in a route path: a review id keeps 7 characters
 * (`/v1/reviews/4e8b1d0/result`), any other id 8 (`/v1/findings/a91f3c2e`).
 * Only UUID-shaped segments are cut; everything else is left as sent.
 */
export function shortenPathIds(path: string): string {
  const parts = path.split("/");
  return parts.map((segment, i) => (UUID_SEGMENT.test(segment) ? segment.slice(0, parts[i - 1] === "reviews" ? 7 : 8) : segment)).join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return isRecord(value) && isRecord(value.error) && typeof value.error.code === "string" && typeof value.error.message === "string";
}

/** The route path (`/v1/…`): the API base's own path prefix removed. */
function routePath(url: URL, basePath: string): string {
  return stripBasePath(url.pathname, basePath);
}

/** Build the ApiError for a non-2xx response. Reads the body; never throws. */
export async function apiErrorFromResponse(response: Response, request: Request, basePath = ""): Promise<ApiError> {
  const method = request.method;
  const path = routePath(new URL(request.url), basePath);
  let text = "";
  try {
    text = await response.text();
  } catch {
    // body already consumed or unreadable — keep the status
  }
  let body: unknown = text;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON (a proxy's HTML error page); keep the text
    }
  }
  if (isErrorEnvelope(body)) {
    return new ApiError({
      status: response.status,
      code: body.error.code,
      message: body.error.message,
      details: body.error.details ?? null,
      requestId: body.error.request_id ?? response.headers.get("x-request-id"),
      method,
      path,
      body,
    });
  }
  // FastAPI's default 422 body ({"detail": [...]}) when no envelope handler ran.
  if (isRecord(body) && "detail" in body) {
    const detail = body.detail;
    const first = Array.isArray(detail) && isRecord(detail[0]) ? detail[0] : null;
    const message = typeof detail === "string" ? detail : first && typeof first.msg === "string" ? first.msg : response.statusText || `HTTP ${response.status}`;
    return new ApiError({
      status: response.status,
      code: response.status === 422 ? "VALIDATION_ERROR" : `HTTP_${response.status}`,
      message,
      details: Array.isArray(detail) ? { detail } : null,
      requestId: response.headers.get("x-request-id"),
      method,
      path,
      body,
    });
  }
  const snippet = typeof body === "string" ? body.trim().slice(0, 200) : "";
  return new ApiError({
    status: response.status,
    code: `HTTP_${response.status}`,
    message: response.statusText || snippet || `HTTP ${response.status}`,
    requestId: response.headers.get("x-request-id"),
    method,
    path,
    body,
  });
}

/** The ApiError for a request that produced no response at all. */
export function networkError(request: Request, cause: unknown, basePath = ""): ApiError {
  const message = cause instanceof Error && cause.message ? cause.message : "The request produced no response.";
  return new ApiError({
    status: 0,
    code: CLIENT_ERROR_CODES.NETWORK_ERROR,
    message,
    method: request.method,
    path: routePath(new URL(request.url), basePath),
    body: cause,
  });
}

/** Normalise anything a query or mutation rejected with into an ApiError. */
export function toApiError(value: unknown, fallback: { method?: string; path?: string } = {}): ApiError {
  if (value instanceof ApiError) return value;
  if (isErrorEnvelope(value)) {
    return new ApiError({
      status: 0,
      code: value.error.code,
      message: value.error.message,
      details: value.error.details ?? null,
      requestId: value.error.request_id ?? null,
      method: fallback.method ?? "GET",
      path: fallback.path ?? "",
      body: value,
    });
  }
  const message = value instanceof Error ? value.message : typeof value === "string" ? value : "Unexpected client error.";
  return new ApiError({
    status: 0,
    code: CLIENT_ERROR_CODES.CLIENT_ERROR,
    message,
    method: fallback.method ?? "GET",
    path: fallback.path ?? "",
    body: value,
  });
}

/** True for an AbortController cancellation (TanStack cancels on unmount and key change). */
export function isAbortError(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { name?: unknown }).name === "AbortError";
}
