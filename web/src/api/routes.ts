// OWNER: t2a (wave 1). Hand-written — not produced by `npm run api:gen`.
//
// Every route the client can call: the 14 operations in web/openapi/openapi.json
// plus the one extension (plan A11). The fixture resolver dispatches on this
// table and the transport labels its call log with it. A unit test asserts the
// non-extension rows equal the OpenAPI paths, so a regenerated schema with a new
// route fails the build until the resolver serves it.

export type HttpMethod = "GET" | "POST" | "DELETE";

export interface ApiRoute {
  method: HttpMethod;
  /** OpenAPI path template: `/v1/findings/{finding_id}`. */
  path: string;
  /** Generated operation name (openapi-ts.config.ts trims FastAPI's operationId to this). */
  operation: string;
  /** Not served by the backend today (plan A11). */
  ext?: true;
}

export const API_ROUTES = [
  { method: "GET", path: "/healthz", operation: "healthz" },
  { method: "GET", path: "/readyz", operation: "readyz" },
  { method: "POST", path: "/v1/reviews", operation: "createReview" },
  { method: "GET", path: "/v1/reviews", operation: "listReviews", ext: true },
  { method: "POST", path: "/v1/reviews/{review_id}/rerun", operation: "rerunReview" },
  { method: "GET", path: "/v1/reviews/{review_id}", operation: "getReviewStatus" },
  { method: "GET", path: "/v1/reviews/{review_id}/result", operation: "getReviewResult" },
  { method: "GET", path: "/v1/findings", operation: "listFindings" },
  { method: "GET", path: "/v1/findings/{finding_id}", operation: "getFinding" },
  { method: "POST", path: "/v1/findings/{finding_id}/suppress", operation: "suppressFinding" },
  { method: "GET", path: "/v1/suppressions", operation: "listSuppressions" },
  { method: "DELETE", path: "/v1/suppressions/{suppression_id}", operation: "revokeSuppression" },
  { method: "GET", path: "/v1/audit", operation: "listAuditEvents" },
  { method: "GET", path: "/v1/accuracy", operation: "getAccuracyReport" },
  { method: "POST", path: "/webhooks/github", operation: "receiveGithubWebhook" },
] as const satisfies readonly ApiRoute[];

export type ApiOperation = (typeof API_ROUTES)[number]["operation"];

export type RouteMatch =
  | { kind: "match"; route: ApiRoute; params: Record<string, string> }
  /** The path exists under another method (FastAPI answers 405). */
  | { kind: "method"; allowed: HttpMethod[] }
  | { kind: "none" };

function segments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function matchTemplate(template: string, pathname: string): Record<string, string> | null {
  const t = segments(template);
  const p = segments(pathname);
  if (t.length !== p.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < t.length; i++) {
    const seg = t[i]!;
    if (seg.startsWith("{") && seg.endsWith("}")) {
      let value: string;
      try {
        value = decodeURIComponent(p[i]!);
      } catch {
        return null;
      }
      params[seg.slice(1, -1)] = value;
    } else if (seg !== p[i]) {
      return null;
    }
  }
  return params;
}

/** Match a request (method + route path, base path already removed). */
export function matchRoute(method: string, pathname: string): RouteMatch {
  const upper = method.toUpperCase();
  const allowed: HttpMethod[] = [];
  for (const route of API_ROUTES) {
    const params = matchTemplate(route.path, pathname);
    if (!params) continue;
    if (route.method === upper) return { kind: "match", route, params };
    allowed.push(route.method);
  }
  return allowed.length ? { kind: "method", allowed } : { kind: "none" };
}

/** `GET /v1/findings/{finding_id}` for a concrete request, or `GET /unknown/path` when nothing matches. */
export function routeLabel(method: string, pathname: string): string {
  const m = matchRoute(method, pathname);
  return m.kind === "match" ? `${m.route.method} ${m.route.path}` : `${method.toUpperCase()} ${pathname}`;
}

/** Remove the API base's own path prefix (NEXT_PUBLIC_API_BASE may carry one). */
export function stripBasePath(pathname: string, basePath: string): string {
  const prefix = basePath.replace(/\/+$/, "");
  const stripped = prefix && (pathname === prefix || pathname.startsWith(`${prefix}/`)) ? pathname.slice(prefix.length) || "/" : pathname;
  return stripped.length > 1 ? stripped.replace(/\/+$/, "") : stripped;
}
