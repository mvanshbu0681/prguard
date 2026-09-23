// OWNER: t2a (wave 1). The fixture resolver against an inline corpus. Where the
// backend's behaviour is more specific than the spec's examples, these tests pin
// the backend at eeb1be8 (api/routes_*.py), because that is what live mode serves.
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "@/api/cursor";
import type { AuditItemWithTenant } from "@/lib/api-types";
import { DEMO_IDS } from "@/lib/demo-ids";
import { jitterMs, PENDING_EVENT_HASH, setAuditHasher, type AuditHashDocument, type AuditHasher } from "@/lib/fixture-resolver";
import { FIXTURE_FILES } from "@/lib/fixture-types";
import { F1, F2, F3, F4, F5, F6, F7, FINDINGS, FP, HASH, REVIEW_A, REVIEW_B, call, sampleFiles, stubFiles, testResolver } from "./sample-corpus";

const ids = (list: { id: string }[]) => list.map((f) => f.id);
const locs = (json: { error: { details: { errors: { loc: string[] }[] } } }) => json.error.details.errors.map((e) => e.loc.join("."));

afterEach(() => setAuditHasher(null));

describe("GET /v1/findings — every §6.5 filter", () => {
  it("lists newest first with the page shape and totals.matched", async () => {
    const { resolver } = testResolver();
    const r = await call(resolver, "GET", "/v1/findings");
    expect(r.status).toBe(200);
    expect(ids(r.json.items)).toEqual(ids(FINDINGS));
    expect(r.json.page).toEqual({ limit: 50, next_cursor: null, has_more: false });
    expect(r.json.totals).toEqual({ matched: 7 });
  });

  it.each([
    ["review_id", `review_id=${REVIEW_B}`, [F4, F5]],
    ["repository (joined through the run)", "repository=acme/checkout-service", [F1, F2, F3]],
    ["pr_number", "pr_number=77", [F4, F5]],
    ["fingerprint", `fingerprint=${FP.FP1}`, [F1, F4]],
    ["status", "status=suppressed", [F5]],
    ["severity_min as a band floor", "severity_min=high", [F1, F3, F7]],
    ["severity_min=info keeps every scored finding", "severity_min=info", [F1, F2, F3, F4, F5, F7]],
    ["blocking=true", "blocking=true", [F1]],
    ["blocking=false", "blocking=false", [F2, F3, F4, F5, F6, F7]],
    ["proof_status single", "proof_status=proven", [F1, F5]],
    ["proof_status repeated", "proof_status=proven&proof_status=disproven", [F1, F2, F5]],
    ["proof_status comma-separated", "proof_status=proven,inconclusive", [F1, F3, F5]],
    ["proof: null counts as not_attempted", "proof_status=not_attempted", [F4, F6]],
    ["filters combine", "severity_min=high&proof_status=proven&blocking=true", [F1]],
  ])("%s", async (_name, qs, expected) => {
    const { resolver } = testResolver();
    const r = await call(resolver, "GET", `/v1/findings?${qs}`);
    expect(r.status).toBe(200);
    expect(ids(r.json.items)).toEqual(ids(expected));
    expect(r.json.totals.matched).toBe(expected.length);
  });

  it.each([
    ["severity_min=urgent", "query.severity_min", "literal_error"],
    ["status=open", "query.status", "literal_error"],
    ["proof_status=proven&proof_status=maybe", "query.proof_status", "literal_error"],
    ["blocking=perhaps", "query.blocking", "bool_parsing"],
    ["pr_number=seven", "query.pr_number", "int_parsing"],
    ["limit=0", "query.limit", "greater_than_equal"],
    ["limit=201", "query.limit", "less_than_equal"],
    ["limit=2.5", "query.limit", "int_parsing"],
  ])("422 VALIDATION_ERROR for %s, FastAPI-shaped", async (qs, loc, type) => {
    const { resolver } = testResolver();
    const r = await call(resolver, "GET", `/v1/findings?${qs}`);
    expect(r.status).toBe(422);
    expect(r.json.error).toMatchObject({ code: "VALIDATION_ERROR", message: "The request body failed validation.", request_id: expect.stringMatching(/^fx_/) });
    expect(r.json.error.details.errors).toEqual([{ loc: loc.split("."), msg: expect.any(String), type }]);
  });

  it("lists every bad parameter at once, like FastAPI", async () => {
    const { resolver } = testResolver();
    const r = await call(resolver, "GET", "/v1/findings?severity_min=urgent&limit=0&blocking=perhaps");
    expect(locs(r.json)).toEqual(["query.severity_min", "query.blocking", "query.limit"]);
    expect(r.json.error.details.errors[0].msg).toBe("Input should be 'info', 'low', 'medium', 'high' or 'critical'");
  });

  it("a cursor that does not decode, or that names no finding, is a 422 naming the cursor", async () => {
    const { resolver } = testResolver();
    const garbage = await call(resolver, "GET", "/v1/findings?cursor=not-base64!");
    expect(garbage.status).toBe(422);
    expect(garbage.json.error).toMatchObject({ code: "VALIDATION_ERROR", message: "The cursor is not a cursor this API issued.", details: { cursor: "not-base64!" } });
    const stranger = encodeCursor({ id: "f0000000-0000-4000-8000-00000000dead" });
    const unseen = await call(resolver, "GET", `/v1/findings?cursor=${stranger}`);
    expect(unseen.json.error).toMatchObject({ message: "That cursor points at a finding this tenant cannot see.", details: { cursor: stranger } });
  });

  it("writes cursors the way the backend does: urlsafe base64 of sorted-key JSON, no padding", () => {
    const cursor = encodeCursor({ seq: 4181, id: "f-9c2e" });
    expect(cursor).not.toMatch(/[+/=]/);
    expect(atob(cursor.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (cursor.length % 4)) % 4))).toBe('{"id":"f-9c2e","seq":4181}');
    expect(encodeCursor({ id: "f-9c2e" })).toBe("eyJpZCI6ImYtOWMyZSJ9"); // spec §6.5's own example
    // The standard alphabet with padding still decodes.
    expect(decodeCursor(btoa('{"id":"ab?>"}'))).toEqual({ id: "ab?>" });
  });

  it("walks every page with an opaque base64 cursor — no duplicates, no gaps", async () => {
    const { resolver } = testResolver();
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const qs: string = `limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const r = await call(resolver, "GET", `/v1/findings?${qs}`);
      expect(r.status).toBe(200);
      expect(r.json.totals.matched).toBe(7);
      seen.push(...ids(r.json.items));
      cursor = r.json.page.next_cursor;
      expect(r.json.page.has_more).toBe(cursor !== null);
      if (cursor) expect(decodeCursor(cursor)).toEqual({ id: r.json.items[r.json.items.length - 1].id });
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(4);
    expect(seen).toEqual(ids(FINDINGS));
  });

  it("keeps its place when the anchor stops matching between pages (keyset, not offset)", async () => {
    const { resolver } = testResolver();
    const first = await call(resolver, "GET", "/v1/findings?status=published&limit=1");
    expect(ids(first.json.items)).toEqual([F1.id]);
    // F1 leaves the filtered set: suppressing it makes status=suppressed.
    await call(resolver, "POST", `/v1/findings/${F1.id}/suppress`, { scope: "line", reason: "known issue" });
    const next = await call(resolver, "GET", `/v1/findings?status=published&limit=10&cursor=${encodeURIComponent(first.json.page.next_cursor)}`);
    expect(ids(next.json.items)).toEqual([F3.id, F4.id, F7.id]);
  });

  it("breaks created_at ties by id descending, like ORDER BY created_at DESC, id DESC", async () => {
    const files = sampleFiles();
    const twin = (id: string) => ({ ...F3, id, created_at: "2026-09-01T00:00:00Z" });
    files[FIXTURE_FILES.findingsIndex] = { items: [twin("aaaa0000-0000-4000-8000-000000000001"), twin("bbbb0000-0000-4000-8000-000000000002")] };
    const { resolver } = testResolver({ files });
    expect(ids((await call(resolver, "GET", "/v1/findings")).json.items)).toEqual(["bbbb0000-0000-4000-8000-000000000002", "aaaa0000-0000-4000-8000-000000000001"]);
  });

  it("GET /v1/findings/{id} and the 404 envelope", async () => {
    const { resolver } = testResolver();
    const ok = await call(resolver, "GET", `/v1/findings/${F3.id}`);
    expect(ok.status).toBe(200);
    expect(ok.json.id).toBe(F3.id);
    const missing = await call(resolver, "GET", "/v1/findings/nope");
    expect(missing.status).toBe(404);
    expect(missing.json).toEqual({
      error: { code: "FINDING_NOT_FOUND", message: "No finding with that id.", details: { finding_id: "nope" }, request_id: expect.stringMatching(/^fx_/) },
    });
    expect(missing.headers.get("x-request-id")).toBe(missing.json.error.request_id);
  });
});

describe("POST /v1/findings/{id}/suppress — validation and the overlay", () => {
  it.each([
    [{ scope: "line", reason: "" }, ["body"], "value_error", "Value error, reason is required and must be non-empty"],
    [{ scope: "line", reason: "   " }, ["body"], "value_error", "Value error, reason is required and must be non-empty"],
    [{ scope: "line" }, ["body", "reason"], "missing", "Field required"],
    [{ scope: "pattern", reason: "generated code" }, ["body"], "value_error", "Value error, match_path is required when scope is 'pattern'"],
    [{ scope: "pattern", reason: "generated code", match_path: " " }, ["body"], "value_error", "Value error, match_path is required when scope is 'pattern'"],
    [{ scope: "everywhere", reason: "x" }, ["body", "scope"], "literal_error", "Input should be 'line', 'file', 'pattern', 'repo' or 'tenant'"],
    [{ scope: "file", reason: "x", expires_at: "next tuesday" }, ["body", "expires_at"], "datetime_parsing", "Input should be a valid datetime"],
  ])("422 VALIDATION_ERROR for %j", async (body, loc, type, msg) => {
    const { resolver } = testResolver();
    const r = await call(resolver, "POST", `/v1/findings/${F3.id}/suppress`, body);
    expect(r.status).toBe(422);
    expect(r.json.error).toMatchObject({ code: "VALIDATION_ERROR", message: "The request body failed validation.", details: { errors: [{ loc, type, msg }] } });
    // Nothing was written.
    expect((await call(resolver, "GET", `/v1/findings/${F3.id}`)).json.status).toBe("published");
    expect((await call(resolver, "GET", "/v1/audit?event_type=suppression.created")).json.items).toEqual([]);
  });

  it("validates the body before it looks the finding up (FastAPI order), then 404s", async () => {
    const { resolver } = testResolver();
    expect((await call(resolver, "POST", `/v1/findings/${F3.id}/suppress`, "{not json")).json.error.details.errors[0]).toMatchObject({ type: "json_invalid" });
    expect((await call(resolver, "POST", "/v1/findings/f0000000-dead/suppress", { scope: "line", reason: "" })).status).toBe(422);
    const r = await call(resolver, "POST", "/v1/findings/f0000000-dead/suppress", { scope: "line", reason: "x" });
    expect(r.status).toBe(404);
    expect(r.json.error).toMatchObject({ code: "FINDING_NOT_FOUND", message: "No finding with that id.", details: { finding_id: "f0000000-dead" } });
  });

  it("201: the finding, the ledger row and a hash-chained suppression.created event all appear", async () => {
    const { resolver } = testResolver({ now: () => Date.parse("2026-09-23T10:00:00.456Z") });
    const r = await call(
      resolver,
      "POST",
      `/v1/findings/${F1.id}/suppress`,
      { scope: "pattern", reason: "  payments SDK, tracked in ENG-4102  ", match_path: "vendor/**", expires_at: "2027-03-01T02:00:00+02:00" },
      { "X-Actor-Id": "vansh.m" },
    );
    expect(r.status).toBe(201);
    const created = r.json;
    expect(created).toMatchObject({
      fingerprint: FP.FP1,
      scope: "pattern",
      match_path: "vendor/**",
      reason: "payments SDK, tracked in ENG-4102", // trimmed, as the backend stores it
      created_by: "vansh.m",
      source: "human_api",
      expires_at: "2027-03-01T00:00:00Z", // normalised to UTC, rendered with Z
      revoked_at: null,
      created_at: "2026-09-23T10:00:00Z",
      // F1's fingerprint also occurs in REVIEW_B (F4).
      affected_findings: { this_run: 1, historical: 1 },
    });
    expect(created.suppression_id).toMatch(/^[0-9a-f-]{36}$/);

    const finding = (await call(resolver, "GET", `/v1/findings/${F1.id}`)).json;
    expect(finding.status).toBe("suppressed");
    // is_blocking() requires status == published: the backend clears blocking on suppress.
    expect(finding.blocking).toBe(false);
    expect(finding.suppression).toEqual({ suppression_id: created.suppression_id, scope: "pattern", reason: created.reason, created_by: "vansh.m", expires_at: "2027-03-01T00:00:00Z" });

    const ledger = (await call(resolver, "GET", "/v1/suppressions")).json;
    expect(ledger.items[0]).toMatchObject({
      suppression_id: created.suppression_id,
      rule_key: F1.rule_key,
      category: F1.category,
      active: true,
      suppressed_count: 1,
      last_matched_at: F1.created_at,
    });
    expect(ledger.totals).toEqual({ active: 3, expired: 1, revoked: 1 });

    const audit = (await call(resolver, "GET", "/v1/audit")).json;
    const event = audit.items[audit.items.length - 1];
    expect(event).toMatchObject({
      seq: 5,
      event_type: "suppression.created",
      actor_type: "human",
      actor_id: "vansh.m",
      finding_id: F1.id,
      review_id: REVIEW_A,
      prev_hash: HASH(4),
      event_hash: PENDING_EVENT_HASH,
      tenant_id: DEMO_IDS.tenant_id,
      created_at: "2026-09-23T10:00:00Z",
    });
    // routes_suppressions.py's payload, plus the request id audit.append() echoes (spec §6.0).
    expect(event.payload).toEqual({
      suppression_id: created.suppression_id,
      scope: "pattern",
      match_path: "vendor/**",
      reason: "payments SDK, tracked in ENG-4102",
      expires_at: "2027-03-01T00:00:00+00:00",
      request_id: r.headers.get("x-request-id"),
    });
    // The pending event is not claimed as checked.
    expect(audit.chain).toEqual({ verified: true, checked: 4, first_seq: 1, last_seq: 5, broken_at_seq: null });
  });

  it("the run documents move with the finding, as the backend assembles them live", async () => {
    const { resolver } = testResolver();
    const before = (await call(resolver, "GET", `/v1/reviews/${REVIEW_A}/result`)).json;
    expect(before.counts).toMatchObject({ published: 2, suppressed: 0, blocking: 1 });
    await call(resolver, "POST", `/v1/findings/${F1.id}/suppress`, { scope: "line", reason: "accepted risk" });

    const result = (await call(resolver, "GET", `/v1/reviews/${REVIEW_A}/result`)).json;
    expect(result.findings.find((f: { id: string }) => f.id === F1.id)).toMatchObject({ status: "suppressed", blocking: false });
    expect(result.counts).toEqual({ proposed: 3, published: 1, suppressed: 1, dropped: 0, disproven: 1, blocking: 0 });
    // The stored conclusion stands; the blocking list and its sentence are derived.
    expect(result.gate).toMatchObject({ conclusion: "failure", blocking_finding_ids: [], reason: "0 findings carry a repro test that passes at base and fails at head." });
    // The ladder counts published findings only: F1 was inline_exact.
    expect(result.delivery.ladder_breakdown).toEqual({ inline_exact: 0, inline_nearest: 1, file_level: 0, summary_only: 0 });

    const status = (await call(resolver, "GET", `/v1/reviews/${REVIEW_A}`)).json;
    expect(status.counts).toEqual({ proposed: 3, published: 1, suppressed: 2, blocking: 0 });
    const listed = (await call(resolver, "GET", "/v1/reviews")).json.items.find((r: { review_id: string }) => r.review_id === REVIEW_A);
    expect(listed.counts).toMatchObject({ published: 1, suppressed: 1, blocking: 0 });
    // Another run is untouched.
    expect((await call(resolver, "GET", `/v1/reviews/${REVIEW_B}`)).json.counts).toEqual({ proposed: 3, published: 2, suppressed: 1, blocking: 1 });
  });

  it("match_path: the glob for pattern, the finding's own file for file, nothing otherwise", async () => {
    const { resolver } = testResolver();
    expect((await call(resolver, "POST", `/v1/findings/${F3.id}/suppress`, { scope: "file", reason: "x", match_path: "src/**" })).json.match_path).toBe(F3.location.file_path);
    expect((await call(resolver, "POST", `/v1/findings/${F7.id}/suppress`, { scope: "line", reason: "x", match_path: "src/**" })).json.match_path).toBeNull();
  });

  it("records `api` when no X-Actor-Id names the human", async () => {
    const { resolver } = testResolver();
    const created = (await call(resolver, "POST", `/v1/findings/${F3.id}/suppress`, { scope: "line", reason: "x" })).json;
    expect(created.created_by).toBe("api");
    const [event] = (await call(resolver, "GET", "/v1/audit?event_type=suppression.created")).json.items;
    expect(event.actor_id).toBe("api");
  });

  it("without a fingerprint, the same rule in the same file is what the decision reaches", async () => {
    const { resolver } = testResolver();
    // F7 has no fingerprint. Every sample finding shares its rule and file: F6 in its run, five elsewhere.
    const created = (await call(resolver, "POST", `/v1/findings/${F7.id}/suppress`, { scope: "line", reason: "x" })).json;
    expect(created.fingerprint).toBeNull();
    expect(created.affected_findings).toEqual({ this_run: 2, historical: 5 });
    const row = (await call(resolver, "GET", "/v1/suppressions")).json.items[0];
    expect(row.category).toBeNull();
  });

  it("chains a second pending event to the first, and re-chains both once a hasher registers", async () => {
    const { resolver } = testResolver({ hasher: undefined });
    await call(resolver, "POST", `/v1/findings/${F3.id}/suppress`, { scope: "line", reason: "one" });
    await call(resolver, "POST", `/v1/findings/${F7.id}/suppress`, { scope: "line", reason: "two" });
    let events = (await call(resolver, "GET", "/v1/audit?event_type=suppression.created")).json.items;
    expect(events.map((e: { event_hash: string }) => e.event_hash)).toEqual([PENDING_EVENT_HASH, PENDING_EVENT_HASH]);
    expect(events[0].prev_hash).toBe(HASH(4));
    expect(events[1].prev_hash).toBe(PENDING_EVENT_HASH);

    const seen: [AuditHashDocument, string | null][] = [];
    // Consistent with the sample corpus's stored hashes, so the whole chain verifies.
    setAuditHasher(async (doc, prev) => {
      seen.push([doc, prev]);
      return doc.seq <= 4 ? HASH(doc.seq) : `h(${doc.seq}|${prev})`;
    });
    events = (await call(resolver, "GET", "/v1/audit?event_type=suppression.created")).json.items;
    expect(events[0]).toMatchObject({ seq: 5, prev_hash: HASH(4), event_hash: `h(5|${HASH(4)})` });
    expect(events[1]).toMatchObject({ seq: 6, prev_hash: `h(5|${HASH(4)})`, event_hash: `h(6|h(5|${HASH(4)}))` });
    // The hasher receives exactly the backend's hashed document (plan A8).
    expect(Object.keys(seen[0]![0]).sort()).toEqual(["actor_id", "actor_type", "created_at", "event_type", "payload", "seq", "tenant_id"]);
    expect(seen[0]![0].tenant_id).toBe(DEMO_IDS.tenant_id);
    const chain = (await call(resolver, "GET", "/v1/audit")).json.chain;
    expect(chain).toEqual({ verified: true, checked: 6, first_seq: 1, last_seq: 6, broken_at_seq: null });
  });
});

describe("GET /v1/suppressions and DELETE (revoke, never delete)", () => {
  it("defaults to active rows; active=false is the whole slice; totals cover every state", async () => {
    const { resolver } = testResolver();
    const r = await call(resolver, "GET", "/v1/suppressions");
    expect(r.json.items.map((s: { suppression_id: string }) => s.suppression_id)).toEqual(["s1000000-0000-4000-8000-000000000001", "s4000000-0000-4000-8000-000000000004"]);
    expect(r.json.totals).toEqual({ active: 2, expired: 1, revoked: 1 });
    // The backend filters only when active is true (routes_suppressions.py).
    const all = await call(resolver, "GET", "/v1/suppressions?active=false");
    expect(all.json.items.map((s: { scope: string }) => s.scope)).toEqual(["pattern", "repo", "line", "tenant"]);
    expect(all.json.totals).toEqual({ active: 2, expired: 1, revoked: 1 });
  });

  it("filters by scope, fingerprint and repository", async () => {
    const { resolver } = testResolver();
    expect((await call(resolver, "GET", "/v1/suppressions?scope=tenant")).json.items).toHaveLength(1);
    // s1 suppressed F5 (fingerprint FP4, in acme/api-gateway).
    expect((await call(resolver, "GET", `/v1/suppressions?fingerprint=${FP.FP4}`)).json.items.map((s: { suppression_id: string }) => s.suppression_id)).toEqual([
      "s1000000-0000-4000-8000-000000000001",
    ]);
    expect((await call(resolver, "GET", "/v1/suppressions?repository=acme/api-gateway")).json.items.map((s: { scope: string }) => s.scope)).toEqual(["pattern"]);
    expect((await call(resolver, "GET", "/v1/suppressions?repository=other/tool")).json.items).toEqual([]);
    const bad = await call(resolver, "GET", "/v1/suppressions?scope=forever");
    expect(bad.status).toBe(422);
    expect(locs(bad.json)).toEqual(["query.scope"]);
  });

  it("DELETE sets revoked_at, keeps the row, writes suppression.revoked, and is idempotent", async () => {
    const { resolver } = testResolver({ now: () => Date.parse("2026-09-23T11:00:00Z") });
    const id = "s4000000-0000-4000-8000-000000000004";
    const r = await call(resolver, "DELETE", `/v1/suppressions/${id}`, undefined, { "X-Actor-Id": "vansh.m" });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ suppression_id: id, active: false, revoked_at: "2026-09-23T11:00:00Z", reason: "tracked in the issue tracker" });
    const all = (await call(resolver, "GET", "/v1/suppressions?active=false")).json;
    expect(all.items.map((s: { suppression_id: string }) => s.suppression_id)).toContain(id);
    expect(all.totals).toEqual({ active: 1, expired: 1, revoked: 2 });
    const again = await call(resolver, "DELETE", `/v1/suppressions/${id}`);
    expect(again.json.revoked_at).toBe("2026-09-23T11:00:00Z");
    const revoked = (await call(resolver, "GET", "/v1/audit?event_type=suppression.revoked")).json.items;
    expect(revoked).toHaveLength(1);
    expect(revoked[0]).toMatchObject({ actor_type: "human", actor_id: "vansh.m", review_id: null, finding_id: null });
    expect(revoked[0].payload).toEqual({ suppression_id: id, scope: "tenant", request_id: r.headers.get("x-request-id") });
  });

  it("revokes a suppression created in the same page", async () => {
    const { resolver } = testResolver();
    const created = (await call(resolver, "POST", `/v1/findings/${F3.id}/suppress`, { scope: "line", reason: "x" })).json;
    const r = await call(resolver, "DELETE", `/v1/suppressions/${created.suppression_id}`);
    expect(r.json).toMatchObject({ suppression_id: created.suppression_id, active: false });
    expect((await call(resolver, "GET", "/v1/suppressions")).json.items.map((s: { suppression_id: string }) => s.suppression_id)).not.toContain(created.suppression_id);
    // Revoking changes the ledger, never the finding (routes_suppressions.revoke_suppression).
    expect((await call(resolver, "GET", `/v1/findings/${F3.id}`)).json.status).toBe("suppressed");
  });

  it("judges expiry by the clock only for a row without its own active flag", async () => {
    const files = sampleFiles();
    const row = { suppression_id: "s5000000-0000-4000-8000-000000000005", scope: "line", reason: "until Tuesday", created_at: "2026-09-20T00:00:00Z", expires_at: "2026-09-22T00:00:00Z" };
    files[FIXTURE_FILES.suppressionsIndex] = { items: [row], totals: {} };
    const before = testResolver({ files, now: () => Date.parse("2026-09-21T00:00:00Z") });
    expect((await call(before.resolver, "GET", "/v1/suppressions")).json.totals).toEqual({ active: 1, expired: 0, revoked: 0 });
    const after = testResolver({ files, now: () => Date.parse("2026-09-23T00:00:00Z") });
    expect((await call(after.resolver, "GET", "/v1/suppressions")).json.totals).toEqual({ active: 0, expired: 1, revoked: 0 });
  });

  it("404 SUPPRESSION_NOT_FOUND", async () => {
    const { resolver } = testResolver();
    const r = await call(resolver, "DELETE", "/v1/suppressions/s9999");
    expect(r.status).toBe(404);
    expect(r.json.error).toMatchObject({ code: "SUPPRESSION_NOT_FOUND", message: "No suppression with that id.", details: { suppression_id: "s9999" } });
  });
});

describe("GET /v1/audit", () => {
  it("serves Python's number lexemes untouched (plan A8) and tenant_id (plan A9)", async () => {
    const { resolver } = testResolver();
    const r = await call(resolver, "GET", "/v1/audit");
    expect(r.text).toContain('"proof_confidence":1.0');
    expect(r.text).toContain('"tiny":1e-05');
    expect(r.text).toContain('"big":1e16');
    expect(r.json.items[0].tenant_id).toBe(DEMO_IDS.tenant_id);
    expect(r.json.chain).toEqual({ verified: true, checked: 4, first_seq: 1, last_seq: 4, broken_at_seq: null });
  });

  it("filters by review_id, finding_id, event_type, actor_type and since", async () => {
    const { resolver } = testResolver();
    const seqs = async (qs: string) => (await call(resolver, "GET", `/v1/audit?${qs}`)).json.items.map((e: { seq: number }) => e.seq);
    expect(await seqs(`review_id=${REVIEW_A}`)).toEqual([1, 2, 3]);
    expect(await seqs(`finding_id=${F1.id}`)).toEqual([2, 3]);
    expect(await seqs("event_type=proof.executed")).toEqual([3]);
    expect(await seqs("actor_type=ai")).toEqual([2]);
    expect(await seqs("since=2026-09-19T14:03:01Z")).toEqual([3, 4]);
    expect((await call(resolver, "GET", "/v1/audit?actor_type=robot")).status).toBe(422);
    expect((await call(resolver, "GET", "/v1/audit?since=yesterday")).status).toBe(422);
    expect((await call(resolver, "GET", "/v1/audit?limit=501")).status).toBe(422);
  });

  it("pages by seq: every row after the cursor's seq, no anchor lookup (routes_audit.py)", async () => {
    const { resolver } = testResolver();
    const first = (await call(resolver, "GET", "/v1/audit?limit=3")).json;
    expect(first.items.map((e: { seq: number }) => e.seq)).toEqual([1, 2, 3]);
    expect(first.chain).toMatchObject({ checked: 3, first_seq: 1, last_seq: 3 });
    expect(decodeCursor(first.page.next_cursor)).toEqual({ seq: 3 });
    const second = (await call(resolver, "GET", `/v1/audit?limit=3&cursor=${encodeURIComponent(first.page.next_cursor)}`)).json;
    expect(second.items.map((e: { seq: number }) => e.seq)).toEqual([4]);
    expect(second.page).toEqual({ limit: 3, next_cursor: null, has_more: false });
    // A seq that is not in the window still pages (seq > n).
    expect((await call(resolver, "GET", `/v1/audit?cursor=${encodeCursor({ seq: 1000 })}`)).json.items).toEqual([]);
    expect((await call(resolver, "GET", "/v1/audit?cursor=%25%25")).json.error).toMatchObject({ code: "VALIDATION_ERROR", details: { cursor: "%%" } });
  });

  it("reports a stored break only when it falls inside the window", async () => {
    const files = sampleFiles();
    files[FIXTURE_FILES.auditEvents] = (files[FIXTURE_FILES.auditEvents] as string).replace(
      '"verified":true,"checked":4,"first_seq":1,"last_seq":4,"broken_at_seq":null',
      '"verified":false,"checked":4,"first_seq":1,"last_seq":4,"broken_at_seq":3',
    );
    const { resolver } = testResolver({ files });
    expect((await call(resolver, "GET", "/v1/audit")).json.chain).toMatchObject({ verified: false, broken_at_seq: 3 });
    expect((await call(resolver, "GET", `/v1/audit?review_id=${REVIEW_B}`)).json.chain).toMatchObject({ verified: true, broken_at_seq: null });
  });

  it("checks neighbour linkage, and on an unfiltered page a missing seq is a deleted row", async () => {
    const relink = sampleFiles();
    relink[FIXTURE_FILES.auditEvents] = (relink[FIXTURE_FILES.auditEvents] as string).replace(`"prev_hash":"${HASH(2)}"`, `"prev_hash":"${HASH(9)}"`);
    expect((await call(testResolver({ files: relink }).resolver, "GET", "/v1/audit")).json.chain).toMatchObject({ verified: false, broken_at_seq: 3, checked: 4 });

    const excised = sampleFiles();
    excised[FIXTURE_FILES.auditEvents] = (excised[FIXTURE_FILES.auditEvents] as string).replace(/\n\{"seq":3,[^\n]*\n/, "\n");
    const { resolver } = testResolver({ files: excised });
    expect((await call(resolver, "GET", "/v1/audit")).json.chain).toMatchObject({ verified: false, broken_at_seq: 4 });
    // Filtered, a gap is the filter doing its job.
    expect((await call(resolver, "GET", "/v1/audit?actor_type=system")).json.chain).toMatchObject({ verified: true });
  });

  it("with a hasher registered, recomputes every hash in the window and names the first that fails", async () => {
    // A self-consistent chain: the corpus is hashed with the same function the verifier uses.
    const sha: AuditHasher = (doc, prev) => createHash("sha256").update(`${prev ?? ""}${JSON.stringify(doc)}`).digest("hex");
    const events: AuditItemWithTenant[] = [];
    for (let seq = 1; seq <= 3; seq++) {
      const e: AuditItemWithTenant = {
        seq,
        event_type: "review.stage_completed",
        actor_type: "system",
        actor_id: "worker",
        review_id: REVIEW_A,
        finding_id: null,
        payload: { stage: seq },
        prev_hash: events[seq - 2]?.event_hash ?? null,
        event_hash: "",
        created_at: `2026-09-19T14:0${seq}:00Z`,
        tenant_id: DEMO_IDS.tenant_id,
      };
      const { tenant_id, event_type, actor_type, actor_id, payload, created_at } = e;
      e.event_hash = sha({ tenant_id: tenant_id!, seq, event_type, actor_type, actor_id: actor_id ?? null, payload: payload!, created_at }, e.prev_hash ?? null) as string;
      events.push(e);
    }
    const files = sampleFiles();
    files[FIXTURE_FILES.auditEvents] = JSON.stringify({ items: events, chain: { verified: true, checked: 3, first_seq: 1, last_seq: 3, broken_at_seq: null } });
    expect((await call(testResolver({ files, hasher: sha }).resolver, "GET", "/v1/audit")).json.chain).toEqual({ verified: true, checked: 3, first_seq: 1, last_seq: 3, broken_at_seq: null });

    const tampered = structuredClone(events);
    tampered[1]!.payload = { stage: 99 };
    files[FIXTURE_FILES.auditEvents] = JSON.stringify({ items: tampered, chain: { verified: true } });
    expect((await call(testResolver({ files, hasher: sha }).resolver, "GET", "/v1/audit")).json.chain).toMatchObject({ verified: false, broken_at_seq: 2, checked: 3 });
  });
});

describe("the other routes", () => {
  it("GET /healthz, /readyz, /v1/accuracy and POST /webhooks/github", async () => {
    const { resolver } = testResolver();
    expect((await call(resolver, "GET", "/healthz")).json).toEqual({ status: "ok", version: "fixtures@eeb1be8" });
    expect((await call(resolver, "GET", "/readyz")).json).toMatchObject({ status: "ready", database: "fixture", workers: { running: 0, queue_depth: 0 } });
    const acc = await call(resolver, "GET", "/v1/accuracy?repository=acme/checkout-service");
    expect(acc.status).toBe(200);
    expect(acc.json.precision_proxies.execution_verified_precision).toEqual({ value: 0.775, n: 40, definition: "proven / (proven + disproven)" });
    expect((await call(resolver, "GET", "/v1/accuracy?since=last-week")).status).toBe(422);
    expect((await call(resolver, "POST", "/webhooks/github", {})).json).toEqual({ status: "ignored", reason: "fixture_mode" });
  });

  it("GET /v1/reviews (plan A11) with filters and the same page shape", async () => {
    const { resolver } = testResolver();
    const all = (await call(resolver, "GET", "/v1/reviews")).json;
    expect(all.items.map((r: { review_id: string }) => r.review_id)).toEqual([REVIEW_A, REVIEW_B, "c0000000-0000-4000-8000-000000000003"]);
    expect(all.totals).toEqual({ matched: 3 });
    expect((await call(resolver, "GET", "/v1/reviews?status=failed")).json.items).toHaveLength(1);
    expect((await call(resolver, "GET", "/v1/reviews?gate_conclusion=failure")).json.items.map((r: { review_id: string }) => r.review_id)).toEqual([REVIEW_A]);
    expect((await call(resolver, "GET", "/v1/reviews?repository=acme/api-gateway")).json.items.map((r: { review_id: string }) => r.review_id)).toEqual([REVIEW_B]);
    const page1 = (await call(resolver, "GET", "/v1/reviews?limit=2")).json;
    expect(page1.page.has_more).toBe(true);
    const page2 = (await call(resolver, "GET", `/v1/reviews?limit=2&cursor=${encodeURIComponent(page1.page.next_cursor)}`)).json;
    expect(page2.items).toHaveLength(1);
  });

  it("404 NOT_FOUND for an unknown path, 405 for a known path under another method (Starlette's, enveloped)", async () => {
    const { resolver } = testResolver();
    const unknown = await call(resolver, "GET", "/v1/repos");
    expect(unknown.status).toBe(404);
    expect(unknown.json.error).toEqual({ code: "NOT_FOUND", message: "Not Found", details: null, request_id: expect.stringMatching(/^fx_/) });
    const wrong = await call(resolver, "DELETE", "/v1/findings");
    expect(wrong.status).toBe(405);
    expect(wrong.json.error).toMatchObject({ code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed", details: null });
    expect(wrong.headers.get("allow")).toBe("GET");
  });

  it("echoes an X-Request-Id the caller sent, like the backend's middleware", async () => {
    const { resolver } = testResolver();
    const r = await call(resolver, "GET", "/v1/findings/nope", undefined, { "X-Request-Id": "req_8f3a21" });
    expect(r.headers.get("x-request-id")).toBe("req_8f3a21");
    expect(r.json.error.request_id).toBe("req_8f3a21");
  });

  it("strips the API base's own path prefix", async () => {
    const { resolver } = testResolver({ apiBase: "https://api.example.com/prguard" });
    const res = await resolver(new Request("https://api.example.com/prguard/v1/findings/" + F2.id));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(F2.id);
  });
});

describe("stub corpus (before t2b's generator runs)", () => {
  it("serves empty lists, 404 for runs and a 500 naming the stub accuracy file", async () => {
    const { resolver } = testResolver({ files: stubFiles() });
    expect((await call(resolver, "GET", "/v1/findings")).json).toMatchObject({ items: [], totals: { matched: 0 } });
    expect((await call(resolver, "GET", "/v1/suppressions")).json).toMatchObject({ items: [], totals: { active: 0, expired: 0, revoked: 0 } });
    expect((await call(resolver, "GET", "/v1/audit")).json.chain).toEqual({ verified: true, checked: 0, first_seq: null, last_seq: null, broken_at_seq: null });
    expect((await call(resolver, "GET", "/v1/reviews")).json.items).toEqual([]);
    const status = await call(resolver, "GET", `/v1/reviews/${REVIEW_A}`);
    expect(status.status).toBe(404);
    expect(status.json.error).toMatchObject({ code: "REVIEW_NOT_FOUND", message: "No review run with that id.", details: { review_id: REVIEW_A, fixture_stub: true } });
    const acc = await call(resolver, "GET", "/v1/accuracy");
    expect(acc.status).toBe(500);
    expect(acc.json.error).toMatchObject({ code: "INTERNAL_ERROR", details: { fixture: "accuracy/report.json", fixture_stub: true } });
  });

  it("loads each file once and caches it in memory", async () => {
    const { resolver, loads } = testResolver();
    await call(resolver, "GET", "/v1/findings");
    await call(resolver, "GET", "/v1/findings?status=published");
    expect(loads.filter((p) => p === FIXTURE_FILES.findingsIndex)).toHaveLength(1);
  });

  it("never asks for a file an id could not name (no stray 404s in the browser console)", async () => {
    const { resolver, loads } = testResolver();
    await call(resolver, "GET", "/v1/reviews/..%2Fmanifest");
    await call(resolver, "GET", "/v1/reviews/has%20space/result");
    expect(loads.some((p) => p.includes("..") || p.includes(" "))).toBe(false);
  });
});

describe("latency", () => {
  it("is deterministic per path, 40–160 ms", () => {
    const values = ["/v1/findings", "/v1/audit", "/v1/reviews/abc", "/healthz", `/v1/findings/${F1.id}`].map((p) => jitterMs("GET", p));
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(40);
      expect(v).toBeLessThanOrEqual(160);
    }
    expect(jitterMs("GET", "/v1/findings")).toBe(jitterMs("get", "/v1/findings"));
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  it("?latency=0 disables it; an abort during the delay rejects with AbortError", async () => {
    const { resolver, page } = testResolver({ latency: "page" });
    page.search = "?latency=0";
    const t0 = performance.now();
    await call(resolver, "GET", "/healthz");
    expect(performance.now() - t0).toBeLessThan(40);
    page.search = "?latency=5000";
    const controller = new AbortController();
    const pending = resolver(new Request("http://localhost:8000/healthz", { signal: controller.signal }));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

