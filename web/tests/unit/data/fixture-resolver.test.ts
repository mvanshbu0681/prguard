// OWNER: t2a (wave 1). The fixture resolver against an inline corpus.
import { afterEach, describe, expect, it } from "vitest";
import { decodeCursor } from "@/api/cursor";
import { DEMO_IDS } from "@/lib/demo-ids";
import { jitterMs, PENDING_EVENT_HASH, setAuditHasher, type AuditHashDocument } from "@/lib/fixture-resolver";
import { FIXTURE_FILES } from "@/lib/fixture-types";
import { F1, F2, F3, F4, F5, F6, F7, FINDINGS, FP, HASH, REVIEW_A, REVIEW_B, call, sampleFiles, stubFiles, testResolver } from "./sample-corpus";

const ids = (list: { id: string }[]) => list.map((f) => f.id);

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
    ["severity_min=urgent", "severity_min"],
    ["status=open", "status"],
    ["proof_status=proven&proof_status=maybe", "proof_status"],
    ["blocking=perhaps", "blocking"],
    ["pr_number=seven", "pr_number"],
    ["limit=0", "limit"],
    ["limit=201", "limit"],
    ["limit=2.5", "limit"],
    ["cursor=not-base64!", "cursor"],
  ])("422 VALIDATION_ERROR for %s", async (qs, field) => {
    const { resolver } = testResolver();
    const r = await call(resolver, "GET", `/v1/findings?${qs}`);
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("VALIDATION_ERROR");
    expect(r.json.error.details.field).toBe(field);
    expect(r.json.error.request_id).toMatch(/^fx_/);
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

  it("GET /v1/findings/{id} and the 404 envelope", async () => {
    const { resolver } = testResolver();
    const ok = await call(resolver, "GET", `/v1/findings/${F3.id}`);
    expect(ok.status).toBe(200);
    expect(ok.json.id).toBe(F3.id);
    const missing = await call(resolver, "GET", "/v1/findings/nope");
    expect(missing.status).toBe(404);
    expect(missing.json).toEqual({
      error: { code: "FINDING_NOT_FOUND", message: "No finding with finding_id nope.", details: { finding_id: "nope" }, request_id: expect.stringMatching(/^fx_/) },
    });
  });
});

describe("POST /v1/findings/{id}/suppress — validation and the overlay", () => {
  it.each([
    [{ scope: "line", reason: "" }, "reason"],
    [{ scope: "line", reason: "   " }, "reason"],
    [{ scope: "line" }, "reason"],
    [{ scope: "pattern", reason: "generated code" }, "match_path"],
    [{ scope: "pattern", reason: "generated code", match_path: " " }, "match_path"],
    [{ scope: "everywhere", reason: "x" }, "scope"],
    [{ scope: "file", reason: "x", expires_at: "next tuesday" }, "expires_at"],
  ])("422 VALIDATION_ERROR for %j", async (body, field) => {
    const { resolver } = testResolver();
    const r = await call(resolver, "POST", `/v1/findings/${F3.id}/suppress`, body);
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("VALIDATION_ERROR");
    expect(r.json.error.details).toEqual({ field });
    // Nothing was written.
    expect((await call(resolver, "GET", `/v1/findings/${F3.id}`)).json.status).toBe("published");
  });

  it("422 for a body that is not JSON, 404 for an unknown finding", async () => {
    const { resolver } = testResolver();
    expect((await call(resolver, "POST", `/v1/findings/${F3.id}/suppress`, "{not json")).json.error.code).toBe("VALIDATION_ERROR");
    const r = await call(resolver, "POST", "/v1/findings/f0000000-dead/suppress", { scope: "line", reason: "x" });
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe("FINDING_NOT_FOUND");
  });

  it("201: the finding, the ledger row and a hash-chained suppression.created event all appear", async () => {
    const { resolver } = testResolver({ now: () => Date.parse("2026-09-23T10:00:00.456Z") });
    const r = await call(resolver, "POST", `/v1/findings/${F1.id}/suppress`, { scope: "pattern", reason: "payments SDK, tracked in ENG-4102", match_path: "vendor/**", expires_at: "2027-03-01T00:00:00Z" }, { "X-Actor-Id": "vansh.m" });
    expect(r.status).toBe(201);
    const created = r.json;
    expect(created).toMatchObject({
      fingerprint: FP.FP1,
      scope: "pattern",
      match_path: "vendor/**",
      reason: "payments SDK, tracked in ENG-4102",
      created_by: "vansh.m",
      source: "human_api",
      expires_at: "2027-03-01T00:00:00Z",
      revoked_at: null,
      created_at: "2026-09-23T10:00:00Z",
      // F1's fingerprint also occurs in REVIEW_B (F4).
      affected_findings: { this_run: 1, historical: 1 },
    });
    expect(created.suppression_id).toMatch(/^[0-9a-f-]{36}$/);

    const finding = (await call(resolver, "GET", `/v1/findings/${F1.id}`)).json;
    expect(finding.status).toBe("suppressed");
    expect(finding.blocking).toBe(true); // only the gate sets blocking (spec §4.4)
    expect(finding.suppression).toEqual({ suppression_id: created.suppression_id, scope: "pattern", reason: created.reason, created_by: "vansh.m", expires_at: "2027-03-01T00:00:00Z" });

    const ledger = (await call(resolver, "GET", "/v1/suppressions")).json;
    expect(ledger.items[0]).toMatchObject({ suppression_id: created.suppression_id, rule_key: F1.rule_key, category: F1.category, active: true, suppressed_count: 1 });
    expect(ledger.totals).toEqual({ active: 3, expired: 1, revoked: 1 });

    // The result document embeds the finding too.
    const res = (await call(resolver, "GET", `/v1/reviews/${REVIEW_A}/result`)).json;
    expect(res.findings.find((f: { id: string }) => f.id === F1.id).status).toBe("suppressed");

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
    expect(event.payload).toMatchObject({ suppression_id: created.suppression_id, scope: "pattern", fingerprint: FP.FP1 });
    // The pending event is not claimed as checked.
    expect(audit.chain).toEqual({ verified: true, checked: 4, first_seq: 1, last_seq: 5, broken_at_seq: null });
  });

  it("match_path is ignored unless the scope is pattern", async () => {
    const { resolver } = testResolver();
    const r = await call(resolver, "POST", `/v1/findings/${F3.id}/suppress`, { scope: "file", reason: "x", match_path: "src/**" });
    expect(r.json.match_path).toBeNull();
  });

  it("chains a second pending event to the first, and re-chains both once a hasher registers", async () => {
    const { resolver } = testResolver({ hasher: undefined });
    await call(resolver, "POST", `/v1/findings/${F3.id}/suppress`, { scope: "line", reason: "one" });
    await call(resolver, "POST", `/v1/findings/${F7.id}/suppress`, { scope: "line", reason: "two" });
    let events = (await call(resolver, "GET", "/v1/audit?event_type=suppression.created")).json.items;
    expect(events.map((e: { event_hash: string }) => e.event_hash)).toEqual([PENDING_EVENT_HASH, PENDING_EVENT_HASH]);
    expect(events[0].prev_hash).toBe(HASH(4));

    const seen: [AuditHashDocument, string | null][] = [];
    setAuditHasher(async (doc, prev) => {
      seen.push([doc, prev]);
      return `h(${doc.seq}|${prev})`;
    });
    events = (await call(resolver, "GET", "/v1/audit?event_type=suppression.created")).json.items;
    expect(events[0]).toMatchObject({ seq: 5, prev_hash: HASH(4), event_hash: `h(5|${HASH(4)})` });
    expect(events[1]).toMatchObject({ seq: 6, prev_hash: `h(5|${HASH(4)})`, event_hash: `h(6|h(5|${HASH(4)}))` });
    // The hasher receives exactly the backend's hashed document (plan A8).
    expect(Object.keys(seen[0]![0]).sort()).toEqual(["actor_id", "actor_type", "created_at", "event_type", "payload", "seq", "tenant_id"]);
    expect(seen[0]![0].tenant_id).toBe(DEMO_IDS.tenant_id);
    const chain = (await call(resolver, "GET", "/v1/audit")).json.chain;
    expect(chain.checked).toBe(6);
  });
});

describe("GET /v1/suppressions and DELETE (revoke, never delete)", () => {
  it("defaults to active rows, with totals over every state in scope", async () => {
    const { resolver } = testResolver();
    const r = await call(resolver, "GET", "/v1/suppressions");
    expect(r.json.items.map((s: { suppression_id: string }) => s.suppression_id)).toEqual(["s1000000-0000-4000-8000-000000000001", "s4000000-0000-4000-8000-000000000004"]);
    expect(r.json.totals).toEqual({ active: 2, expired: 1, revoked: 1 });
    const inactive = await call(resolver, "GET", "/v1/suppressions?active=false");
    expect(inactive.json.items.map((s: { scope: string }) => s.scope)).toEqual(["repo", "line"]);
  });

  it("filters by scope, fingerprint and repository (tenant-wide rules apply everywhere)", async () => {
    const { resolver } = testResolver();
    expect((await call(resolver, "GET", "/v1/suppressions?scope=tenant")).json.items).toHaveLength(1);
    // s1 suppressed F5 (fingerprint FP4, in acme/api-gateway).
    expect((await call(resolver, "GET", `/v1/suppressions?fingerprint=${FP.FP4}`)).json.items.map((s: { suppression_id: string }) => s.suppression_id)).toEqual([
      "s1000000-0000-4000-8000-000000000001",
    ]);
    expect((await call(resolver, "GET", "/v1/suppressions?repository=acme/api-gateway")).json.items.map((s: { scope: string }) => s.scope)).toEqual(["pattern", "tenant"]);
    expect((await call(resolver, "GET", "/v1/suppressions?repository=other/tool")).json.items.map((s: { scope: string }) => s.scope)).toEqual(["tenant"]);
    expect((await call(resolver, "GET", "/v1/suppressions?scope=forever")).status).toBe(422);
  });

  it("DELETE sets revoked_at, keeps the row, writes suppression.revoked, and is idempotent", async () => {
    const { resolver } = testResolver({ now: () => Date.parse("2026-09-23T11:00:00Z") });
    const id = "s4000000-0000-4000-8000-000000000004";
    const r = await call(resolver, "DELETE", `/v1/suppressions/${id}`, undefined, { "X-Actor-Id": "vansh.m" });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ suppression_id: id, active: false, revoked_at: "2026-09-23T11:00:00Z", reason: "tracked in the issue tracker" });
    const inactive = (await call(resolver, "GET", "/v1/suppressions?active=false")).json;
    expect(inactive.items.map((s: { suppression_id: string }) => s.suppression_id)).toContain(id);
    expect(inactive.totals).toEqual({ active: 1, expired: 1, revoked: 2 });
    const again = await call(resolver, "DELETE", `/v1/suppressions/${id}`);
    expect(again.json.revoked_at).toBe("2026-09-23T11:00:00Z");
    const revoked = (await call(resolver, "GET", "/v1/audit?event_type=suppression.revoked")).json.items;
    expect(revoked).toHaveLength(1);
    expect(revoked[0]).toMatchObject({ actor_type: "human", actor_id: "vansh.m", payload: { suppression_id: id, scope: "tenant" } });
  });

  it("revokes a suppression created in the same page", async () => {
    const { resolver } = testResolver();
    const created = (await call(resolver, "POST", `/v1/findings/${F3.id}/suppress`, { scope: "line", reason: "x" })).json;
    const r = await call(resolver, "DELETE", `/v1/suppressions/${created.suppression_id}`);
    expect(r.json).toMatchObject({ suppression_id: created.suppression_id, active: false });
    expect((await call(resolver, "GET", "/v1/suppressions")).json.items.map((s: { suppression_id: string }) => s.suppression_id)).not.toContain(created.suppression_id);
  });

  it("404 SUPPRESSION_NOT_FOUND", async () => {
    const { resolver } = testResolver();
    const r = await call(resolver, "DELETE", "/v1/suppressions/s9999");
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe("SUPPRESSION_NOT_FOUND");
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

  it("pages by seq cursor and reports the verdict for the returned window", async () => {
    const { resolver } = testResolver();
    const first = (await call(resolver, "GET", "/v1/audit?limit=3")).json;
    expect(first.items.map((e: { seq: number }) => e.seq)).toEqual([1, 2, 3]);
    expect(first.chain).toMatchObject({ checked: 3, first_seq: 1, last_seq: 3 });
    expect(decodeCursor(first.page.next_cursor)).toEqual({ seq: 3 });
    const second = (await call(resolver, "GET", `/v1/audit?limit=3&cursor=${encodeURIComponent(first.page.next_cursor)}`)).json;
    expect(second.items.map((e: { seq: number }) => e.seq)).toEqual([4]);
    expect(second.page).toEqual({ limit: 3, next_cursor: null, has_more: false });
  });

  it("reports a stored break only when it falls inside the window", async () => {
    const files = sampleFiles();
    files[FIXTURE_FILES.auditEvents] = (files[FIXTURE_FILES.auditEvents] as string).replace('"verified":true,"checked":4,"first_seq":1,"last_seq":4,"broken_at_seq":null', '"verified":false,"checked":4,"first_seq":1,"last_seq":4,"broken_at_seq":3');
    const { resolver } = testResolver({ files });
    expect((await call(resolver, "GET", "/v1/audit")).json.chain).toMatchObject({ verified: false, broken_at_seq: 3 });
    expect((await call(resolver, "GET", `/v1/audit?review_id=${REVIEW_B}`)).json.chain).toMatchObject({ verified: true, broken_at_seq: null });
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

  it("404 NOT_FOUND for an unknown path, 405 for a known path under another method", async () => {
    const { resolver } = testResolver();
    const unknown = await call(resolver, "GET", "/v1/repos");
    expect(unknown.status).toBe(404);
    expect(unknown.json.error).toMatchObject({ code: "NOT_FOUND", details: { method: "GET", path: "/v1/repos" } });
    const wrong = await call(resolver, "DELETE", "/v1/findings");
    expect(wrong.status).toBe(405);
    expect(wrong.json.error).toMatchObject({ code: "METHOD_NOT_ALLOWED", details: { allowed: ["GET"] } });
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
    expect(status.json.error).toMatchObject({ code: "REVIEW_NOT_FOUND", details: { review_id: REVIEW_A, stub: true } });
    const acc = await call(resolver, "GET", "/v1/accuracy");
    expect(acc.status).toBe(500);
    expect(acc.json.error).toMatchObject({ code: "INTERNAL_ERROR", details: { fixture: "accuracy/report.json", stub: true } });
  });

  it("loads each file once and caches it in memory", async () => {
    const { resolver, loads } = testResolver();
    await call(resolver, "GET", "/v1/findings");
    await call(resolver, "GET", "/v1/findings?status=published");
    expect(loads.filter((p) => p === FIXTURE_FILES.findingsIndex)).toHaveLength(1);
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
