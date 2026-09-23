// OWNER: t2a (wave 1). The generated client's wiring: base URL, transport,
// error mapping, the call log, the route table, cursors and lossless JSON.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { client } from "@/api/client.gen";
import { decodeCursor, encodeCursor, keysetPage } from "@/api/cursor";
import { ApiError, isApiError, shortenPathIds } from "@/api/errors";
import { isLosslessNumber, parseLosslessJson, stringifyLosslessJson } from "@/api/lossless";
import { API_ROUTES, matchRoute, routeLabel, stripBasePath } from "@/api/routes";
import { getFinding, listFindings } from "@/api/sdk.gen";
import { apiTransport, clearApiCalls, getApiCalls, setTransportBase, subscribeApiCalls } from "@/api/transport";
import { API_BASE } from "@/lib/env";
import { findingsQuery } from "@/lib/hooks";
import { F1, FINDINGS, testResolver } from "./sample-corpus";

afterEach(() => {
  setTransportBase(null);
  clearApiCalls();
});

function respond(status: number, body: string, contentType = "application/json") {
  setTransportBase(async () => new Response(body, { status, headers: { "content-type": contentType, "x-request-id": "req_hdr" } }));
}

describe("the generated client", () => {
  it("is born pointing at API_BASE and sending through the transport", () => {
    expect(client.getConfig().baseUrl).toBe(API_BASE);
    expect(client.getConfig().fetch).toBe(apiTransport);
  });

  it("rejects with an ApiError that keeps the status and the §6.0 envelope", async () => {
    respond(409, JSON.stringify({ error: { code: "RESULT_NOT_READY", message: "not yet", details: { stage_index: 3 }, request_id: "req_1" } }));
    const error = await getFinding({ path: { finding_id: "abc" }, throwOnError: true }).catch((e: unknown) => e);
    expect(isApiError(error)).toBe(true);
    expect(error).toMatchObject({ status: 409, code: "RESULT_NOT_READY", message: "not yet", details: { stage_index: 3 }, requestId: "req_1", method: "GET", path: "/v1/findings/abc" });
    expect((error as ApiError).label).toBe("GET /v1/findings/abc · 409");
  });

  it("prints plan A10's short ids: 7 characters for a review, 8 for anything else, UUIDs only", () => {
    expect(shortenPathIds("/v1/reviews/4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41/result")).toBe("/v1/reviews/4e8b1d0/result");
    expect(shortenPathIds("/v1/findings/a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d/suppress")).toBe("/v1/findings/a91f3c2e/suppress");
    expect(shortenPathIds("/v1/suppressions/5D20B7F4-9C1A-4E8B-A6D3-1F7E9B2C4A60")).toBe("/v1/suppressions/5D20B7F4");
    expect(shortenPathIds("/v1/findings/f-9c2e")).toBe("/v1/findings/f-9c2e");
    const error = new ApiError({ status: 422, code: "VALIDATION_ERROR", message: "x", method: "post", path: "/v1/findings/a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d/suppress" });
    expect(error.displayPath).toBe("/v1/findings/a91f3c2e/suppress");
    expect(error.path).toBe("/v1/findings/a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d/suppress");
  });

  it("keeps the backend's validation envelope whole: details.errors survives for the UI", async () => {
    const body = { error: { code: "VALIDATION_ERROR", message: "The request body failed validation.", details: { errors: [{ loc: ["body"], msg: "Value error, reason is required and must be non-empty", type: "value_error" }] }, request_id: "0f3a" } };
    respond(422, JSON.stringify(body));
    const error = (await getFinding({ path: { finding_id: "abc" }, throwOnError: true }).catch((e: unknown) => e)) as ApiError;
    expect(error).toMatchObject({ status: 422, code: "VALIDATION_ERROR", requestId: "0f3a", details: body.error.details });
  });

  it("maps FastAPI's default 422 body and a non-JSON proxy page", async () => {
    respond(422, JSON.stringify({ detail: [{ loc: ["query", "limit"], msg: "Input should be less than or equal to 200", type: "less_than_equal" }] }));
    expect(await listFindings({ throwOnError: true }).catch((e: unknown) => e)).toMatchObject({ status: 422, code: "VALIDATION_ERROR", message: "Input should be less than or equal to 200", requestId: "req_hdr" });
    respond(502, "<html>Bad gateway</html>", "text/html");
    expect(await listFindings({ throwOnError: true }).catch((e: unknown) => e)).toMatchObject({ status: 502, code: "HTTP_502" });
  });

  it("turns no response into status 0 NETWORK_ERROR, and lets an abort through untouched", async () => {
    setTransportBase(async () => {
      throw new TypeError("Failed to fetch");
    });
    const error = (await listFindings({ throwOnError: true }).catch((e: unknown) => e)) as ApiError;
    expect(error).toMatchObject({ status: 0, code: "NETWORK_ERROR", isNetworkError: true, statusLabel: "no response" });
    expect(error.label).toBe("GET /v1/findings · no response");

    setTransportBase(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    const aborted = await listFindings({ throwOnError: true }).catch((e: unknown) => e);
    expect(isApiError(aborted)).toBe(false);
    expect(aborted).toMatchObject({ name: "AbortError" });
  });

  it("records every call — route, status, latency, item count — while someone listens", async () => {
    const { resolver } = testResolver();
    setTransportBase(resolver);
    const seen: string[] = [];
    const off = subscribeApiCalls((c) => c && seen.push(c.route));
    await listFindings({ query: { limit: 3 }, throwOnError: true });
    await getFinding({ path: { finding_id: F1.id }, throwOnError: true });
    await getFinding({ path: { finding_id: "missing" } });
    off();
    const calls = getApiCalls();
    expect(calls.map((c) => [c.route, c.status, c.items, c.code])).toEqual([
      ["GET /v1/findings", 200, 3, null],
      ["GET /v1/findings/{finding_id}", 200, null, null],
      ["GET /v1/findings/{finding_id}", 404, null, "FINDING_NOT_FOUND"],
    ]);
    expect(calls[0]!.search).toBe("?limit=3");
    expect(calls[2]!.requestId).toMatch(/^fx_/);
    expect(seen).toHaveLength(3);
    expect(Object.isFrozen(calls)).toBe(true);
    clearApiCalls();
    expect(getApiCalls()).toEqual([]);
  });

  it("serialises every §6.5 filter the way the resolver parses it", async () => {
    let url = "";
    setTransportBase(async (input) => {
      url = (input as Request).url;
      return new Response(JSON.stringify({ items: [], page: { limit: 50, has_more: false }, totals: { matched: 0 } }), { headers: { "content-type": "application/json" } });
    });
    await listFindings({ query: findingsQuery({ severity_min: "high", blocking: true, proof_status: ["proven", "disproven"], pr_number: 7, limit: 10 }), throwOnError: true });
    const q = new URL(url).searchParams;
    expect(q.get("severity_min")).toBe("high");
    expect(q.get("blocking")).toBe("true");
    expect(q.getAll("proof_status")).toEqual(["disproven", "proven"]);
    expect(q.get("pr_number")).toBe("7");
    expect(q.get("limit")).toBe("10");
  });
});

describe("findingsQuery", () => {
  it("drops empty values and normalises proof_status so equivalent filters share a cache entry", () => {
    expect(findingsQuery({})).toBeUndefined();
    expect(findingsQuery({ status: null, fingerprint: "", proof_status: [] })).toBeUndefined();
    expect(findingsQuery({ proof_status: ["proven"] })).toEqual({ proof_status: "proven" });
    expect(findingsQuery({ proof_status: "proven" })).toEqual({ proof_status: "proven" });
    expect(findingsQuery({ proof_status: ["proven", "disproven", "proven"] })).toEqual({ proof_status: ["disproven", "proven"] });
    expect(findingsQuery({ blocking: false, pr_number: 0 })).toEqual({ blocking: false, pr_number: 0 });
  });
});

describe("the route table", () => {
  it("is exactly the OpenAPI document's operations plus the one extension (plan A11)", () => {
    const spec = JSON.parse(readFileSync(join(process.cwd(), "openapi", "openapi.json"), "utf8")) as { paths: Record<string, Record<string, unknown>> };
    const fromSpec = Object.entries(spec.paths).flatMap(([path, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${path}`));
    const real = API_ROUTES.filter((r) => !("ext" in r)).map((r) => `${r.method} ${r.path}`);
    expect(real.sort()).toEqual(fromSpec.sort());
    expect(fromSpec).toHaveLength(14);
    expect(API_ROUTES.filter((r) => "ext" in r).map((r) => `${r.method} ${r.path}`)).toEqual(["GET /v1/reviews"]);
  });

  it("matches templates, names wrong methods and strips a base path", () => {
    expect(matchRoute("GET", "/v1/findings/a91f")).toMatchObject({ kind: "match", params: { finding_id: "a91f" } });
    expect(matchRoute("PUT", "/v1/findings/a91f")).toEqual({ kind: "method", allowed: ["GET"] });
    expect(matchRoute("GET", "/v1/nothing")).toEqual({ kind: "none" });
    expect(routeLabel("POST", "/v1/findings/x/suppress")).toBe("POST /v1/findings/{finding_id}/suppress");
    expect(stripBasePath("/api/v1/audit/", "/api")).toBe("/v1/audit");
    expect(stripBasePath("/v1/audit", "/")).toBe("/v1/audit");
  });
});

describe("cursors", () => {
  it("decode the spec's own example and round-trip", () => {
    expect(decodeCursor("eyJpZCI6ImYtOWMyZSJ9")).toEqual({ id: "f-9c2e" });
    expect(decodeCursor(encodeCursor({ seq: 1428 }))).toEqual({ seq: 1428 });
    expect(decodeCursor("%%%")).toBeNull();
    expect(decodeCursor(btoa("[1,2]"))).toBeNull();
  });

  it("page by key, not offset", () => {
    const all = FINDINGS;
    const page = keysetPage(all, all, (f) => f.id, null, 3)!;
    expect(page).toMatchObject({ hasMore: true, nextKey: all[2]!.id });
    expect(keysetPage(all, all, (f) => f.id, "nope", 3)).toBeNull();
    expect(keysetPage(all, all, (f) => f.id, all[6]!.id, 3)).toEqual({ items: [], hasMore: false, nextKey: null });
  });
});

describe("lossless JSON (plan A8)", () => {
  it("keeps every float lexeme and every large integer, and leaves safe integers plain", () => {
    const text = '{"seq":1428,"payload":{"a":1.0,"b":0.5,"c":-0.0,"d":1e-05,"e":1.5e-07,"f":1e16,"g":123456789012345678.0,"h":12345678901234567890,"s":"caf\\u00e9"}}';
    const value = parseLosslessJson(text) as { seq: unknown; payload: Record<string, unknown> };
    expect(value.seq).toBe(1428);
    for (const key of ["a", "b", "c", "d", "e", "f", "g", "h"]) expect(isLosslessNumber(value.payload[key])).toBe(true);
    expect(String(value.payload.a)).toBe("1.0");
    expect(stringifyLosslessJson(value)).toBe(text.replace("caf\\u00e9", "café"));
  });
});

describe("the run list's live fallback (NEXT_PUBLIC_FIXTURES=0)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    localStorage.clear();
  });

  it("lists the runs this browser created, read back through the real endpoints", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIXTURES", "0");
    vi.resetModules();
    const ext = await import("@/api/ext");
    const transport = await import("@/api/transport");
    const { resolver } = testResolver();
    const requested: string[] = [];
    transport.setTransportBase(async (input) => {
      requested.push(new URL((input as Request).url).pathname);
      return resolver(input as Request);
    });
    const accepted = (id: string, created_at: string) => ({
      review_id: id,
      status: "queued" as const,
      trigger: "api" as const,
      repository: { owner: "acme", name: "checkout-service" },
      pull_request: { number: 4821, head_sha: null },
      poll_url: `/v1/reviews/${id}`,
      result_url: `/v1/reviews/${id}/result`,
      created_at,
    });
    ext.rememberCreatedReview(accepted(FINDINGS[0]!.review_id, "2026-09-19T14:00:00Z"));
    ext.rememberCreatedReview(accepted("gone-0000", "2026-09-20T00:00:00Z"));
    const list = await ext.listReviews();
    expect(requested).not.toContain("/v1/reviews"); // nothing invented on the wire
    expect(list.items.map((r) => r.review_id)).toEqual([FINDINGS[0]!.review_id]); // the 404 run is dropped
    expect(list.items[0]).toMatchObject({ status: "succeeded", gate_conclusion: "failure", cost_usd_estimate: 0.0412, pull_request: { number: 4821 } });
    expect(list.totals.matched).toBe(1);
    expect(ext.getRememberedReviews()).toHaveLength(2);
  });
});
