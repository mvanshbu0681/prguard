// OWNER: t2a (wave 1). The simulated live run (plan A5), driven with fake timers.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAGES } from "@/lib/contracts";
import { createFixtureResolver, FixtureMissingError } from "@/lib/fixture-resolver";
import { simFrame, simTiming, STUB_STAGE_MS } from "@/lib/fixture-sim";
import { DEMO_RUN, DEMO_STARTS, DEMO_TOTAL_MS, REVIEW_A, REVIEW_C, call, finalStatus, memoryStorage, sampleFiles, stubFiles, testResolver } from "./sample-corpus";

const T0 = Date.parse("2026-09-23T09:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("simFrame (pure)", () => {
  const timing = simTiming(DEMO_RUN);

  it("scales every duration by time_scale and keeps the nine STAGES in order", () => {
    expect(timing.stages.map((s) => s.key)).toEqual([...STAGES]);
    expect(timing.stages.map((s) => s.durationMs)).toEqual([500, 1000, 1500, 500, 500, 500, 2000, 1000, 500]);
    expect(timing.source).toBe("fixture");
  });

  it("advances stage_index 1 → 9 at the cumulative boundaries, then finishes", () => {
    for (let i = 0; i < 9; i++) {
      expect(simFrame(timing, DEMO_STARTS[i]!).stageIndex).toBe(i + 1);
      expect(simFrame(timing, DEMO_STARTS[i]! + 1).stage).toBe(STAGES[i]);
    }
    expect(simFrame(timing, DEMO_TOTAL_MS - 1)).toMatchObject({ phase: "running", stageIndex: 9 });
    expect(simFrame(timing, DEMO_TOTAL_MS)).toMatchObject({ phase: "done", stageIndex: 9, totalMs: DEMO_TOTAL_MS });
  });

  it("resets seconds_since_heartbeat on every 1200 ms tick", () => {
    const ages = [0, 999, 1000, 1199, 1200, 2199, 2200, 2399, 2400].map((ms) => simFrame(timing, ms).secondsSinceHeartbeat);
    expect(ages).toEqual([0, 0, 1, 1, 0, 0, 1, 1, 0]);
  });

  it("freezes the heartbeat at the stall stage and never finishes", () => {
    const f = simFrame(timing, DEMO_STARTS[2]! + 25_000, { stallAtStage: 3 });
    expect(f).toMatchObject({ phase: "running", stageIndex: 3, stage: "specialists", secondsSinceHeartbeat: 25, stalled: true });
    expect(simFrame(timing, 10_000_000, { stallAtStage: 3 }).phase).toBe("running");
  });

  it("stops a failed run at its recorded stage", () => {
    expect(simFrame(timing, DEMO_STARTS[2]! + 10, { lastStage: 3 })).toMatchObject({ phase: "running", stageIndex: 3 });
    expect(simFrame(timing, DEMO_STARTS[3]!, { lastStage: 3 })).toMatchObject({ phase: "done", stageIndex: 3, totalMs: DEMO_STARTS[3] });
  });

  it("falls back to nine equal stages while live/demo-run.json is a stub", () => {
    const stub = simTiming(null);
    expect(stub.source).toBe("stub");
    expect(stub.stages.every((s) => s.durationMs === STUB_STAGE_MS && s.label === null)).toBe(true);
  });
});

async function status(resolver: ReturnType<typeof testResolver>["resolver"], id = REVIEW_A) {
  return (await call(resolver, "GET", `/v1/reviews/${id}`)).json;
}

describe("the simulated run through the resolver", () => {
  it("POST /v1/reviews → 202 for the demo id, then stage_index 1 → 9 and the final status file", async () => {
    const { resolver } = testResolver();
    const accepted = await call(resolver, "POST", "/v1/reviews", { pr_url: "octocat/hello-world#42" });
    expect(accepted.status).toBe(202);
    expect(accepted.json).toMatchObject({
      review_id: REVIEW_A,
      status: "queued",
      trigger: "api",
      poll_url: `/v1/reviews/${REVIEW_A}`,
      result_url: `/v1/reviews/${REVIEW_A}/result`,
      created_at: "2026-09-23T09:00:00Z",
      deduplicated: false,
    });

    const seen: number[] = [];
    for (let i = 0; i < 9; i++) {
      vi.setSystemTime(T0 + DEMO_STARTS[i]! + 100);
      const s = await status(resolver);
      expect(s).toMatchObject({ status: "running", stage: STAGES[i], stage_index: i + 1, stage_total: 9, stage_label: DEMO_RUN.stages[i]!.label, finished_at: null, error: null });
      expect(s.started_at).toBe("2026-09-23T09:00:00Z");
      seen.push(s.stage_index);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    vi.setSystemTime(T0 + DEMO_TOTAL_MS);
    expect(await status(resolver)).toEqual(finalStatus(REVIEW_A));
  });

  it("reveals each value only after the stage that produces it", async () => {
    const { resolver } = testResolver();
    await call(resolver, "POST", "/v1/reviews", { pr_url: "https://github.com/acme/checkout-service/pull/4821" });
    const at = async (stage: number) => {
      vi.setSystemTime(T0 + DEMO_STARTS[stage - 1]! + 10);
      return status(resolver);
    };
    expect(await at(1)).toMatchObject({ head_sha: null, risk_tier: null, counts: { proposed: 0, published: 0, suppressed: 0, blocking: 0 } });
    expect((await at(2)).head_sha).toBe(finalStatus(REVIEW_A).head_sha);
    expect((await at(3)).risk_tier).toBe("full");
    expect((await at(5)).counts).toEqual({ proposed: 3, published: 0, suppressed: 0, blocking: 0 });
    expect((await at(7)).counts).toEqual({ proposed: 3, published: 0, suppressed: 1, blocking: 0 });
    expect((await at(9)).counts).toEqual({ proposed: 3, published: 2, suppressed: 1, blocking: 1 });
  });

  it("the heartbeat age resets every 1200 ms tick while the poll runs", async () => {
    const { resolver } = testResolver();
    await call(resolver, "POST", "/v1/reviews", { pr_url: "a/b#1" });
    const ages: number[] = [];
    for (const t of [0, 1100, 1200, 2300, 2400, 3500, 3600]) {
      vi.setSystemTime(T0 + t);
      ages.push((await status(resolver)).seconds_since_heartbeat);
    }
    expect(ages).toEqual([0, 1, 0, 1, 0, 1, 0]);
  });

  it("GET /result: 409 RESULT_NOT_READY while running, partial=true for what exists, the result when done", async () => {
    const { resolver } = testResolver();
    await call(resolver, "POST", "/v1/reviews", { pr_url: "a/b#1" });
    vi.setSystemTime(T0 + DEMO_STARTS[3]! + 10);
    const notReady = await call(resolver, "GET", `/v1/reviews/${REVIEW_A}/result`);
    expect(notReady.status).toBe(409);
    // routes_reviews.py: the backend's own message, and only the run's status in details.
    expect(notReady.json.error).toEqual({
      code: "RESULT_NOT_READY",
      message: "The run has not finished; retry, or pass ?partial=true.",
      details: { status: "running" },
      request_id: expect.stringMatching(/^fx_/),
    });
    const partial = await call(resolver, "GET", `/v1/reviews/${REVIEW_A}/result?partial=true`);
    expect(partial.status).toBe(200);
    expect(partial.json).toMatchObject({ status: "running", gate: null, delivery: null, findings: [], review_payload: null, risk_tier: "full" });
    vi.setSystemTime(T0 + DEMO_TOTAL_MS + 1);
    const done = await call(resolver, "GET", `/v1/reviews/${REVIEW_A}/result`);
    expect(done.status).toBe(200);
    expect(done.json).toMatchObject({ status: "succeeded", gate: { conclusion: "failure" } });
  });

  it("a second POST while running is deduplicated (E21) unless options.force", async () => {
    const { resolver } = testResolver();
    await call(resolver, "POST", "/v1/reviews", { pr_url: "a/b#1" });
    vi.setSystemTime(T0 + 2000);
    const dup = await call(resolver, "POST", "/v1/reviews", { pr_url: "a/b#1" });
    expect(dup.json).toMatchObject({ deduplicated: true, status: "running", created_at: "2026-09-23T09:00:00Z" });
    expect((await status(resolver)).stage_index).toBe(3);
    const forced = await call(resolver, "POST", "/v1/reviews", { pr_url: "a/b#1", options: { force: true } });
    expect(forced.json.deduplicated).toBe(false);
    expect((await status(resolver)).stage_index).toBe(1);
  });

  it("422 INVALID_PR_URL / VALIDATION_ERROR on POST /v1/reviews", async () => {
    const { resolver } = testResolver();
    const bad = await call(resolver, "POST", "/v1/reviews", { pr_url: "https://gitlab.com/a/b/-/merge_requests/1" });
    expect(bad.status).toBe(422);
    expect(bad.json.error).toMatchObject({ code: "INVALID_PR_URL", message: "Could not parse a GitHub pull request from the supplied URL.", details: { pr_url: "https://gitlab.com/a/b/-/merge_requests/1" } });
    expect((await call(resolver, "POST", "/v1/reviews", {})).json.error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: { errors: [{ loc: ["body", "pr_url"], msg: "Field required", type: "missing" }] },
    });
    // routes_reviews.py accepts no scheme, `pulls`, any case, a trailing path, and the shorthand.
    for (const pr_url of ["github.com/octocat/hello-world/pull/42", "https://GitHub.com/octocat/hello-world/pulls/42/files", " octocat/hello-world#42 "]) {
      expect((await call(resolver, "POST", "/v1/reviews", { pr_url, options: { force: true } })).status, pr_url).toBe(202);
    }
  });

  it("?stall=1 freezes the heartbeat at S3 so the >20s stale state can be seen", async () => {
    const { resolver, page } = testResolver();
    page.search = "?stall=1";
    await call(resolver, "POST", "/v1/reviews", { pr_url: "a/b#1" });
    vi.setSystemTime(T0 + DEMO_STARTS[2]! + 21_500);
    expect(await status(resolver)).toMatchObject({ status: "running", stage: "specialists", stage_index: 3, seconds_since_heartbeat: 21 });
    vi.setSystemTime(T0 + DEMO_STARTS[2]! + 121_000);
    expect((await status(resolver)).seconds_since_heartbeat).toBe(121);
    page.search = "?stall=1&stall_stage=7";
    expect((await status(resolver)).stage_index).toBe(7);
  });

  it("?replay=1 starts the demo run from stage 1 on first poll, once per page load", async () => {
    const storage = memoryStorage();
    const { resolver } = testResolver({ storage, search: "?replay=1" });
    expect((await status(resolver)).stage_index).toBe(1);
    vi.setSystemTime(T0 + DEMO_STARTS[4]! + 1);
    expect((await status(resolver)).stage_index).toBe(5);

    // A reload mid-run (a new resolver on the same sessionStorage) continues it.
    const reload = testResolver({ storage, search: "?replay=1" }).resolver;
    expect((await status(reload)).stage_index).toBe(5);

    // Finished: this page load keeps showing the final status…
    vi.setSystemTime(T0 + DEMO_TOTAL_MS + 5);
    expect((await status(reload)).status).toBe("succeeded");
    // …and the next page load with ?replay=1 plays it again.
    const again = testResolver({ storage, search: "?replay=1" }).resolver;
    expect(await status(again)).toMatchObject({ status: "running", stage_index: 1 });
  });

  it("without ?replay=1 or a POST the demo id serves its stored status", async () => {
    const { resolver } = testResolver();
    expect(await status(resolver)).toEqual(finalStatus(REVIEW_A));
  });

  it("a rerun of a failed run replays it up to the stage it failed at", async () => {
    const { resolver } = testResolver();
    const r = await call(resolver, "POST", `/v1/reviews/${REVIEW_C}/rerun`);
    expect(r.status).toBe(202);
    expect(r.json).toMatchObject({ review_id: REVIEW_C, trigger: "rerun", repository: { owner: "other", name: "tool" }, pull_request: { number: 3, head_sha: null } });
    vi.setSystemTime(T0 + DEMO_STARTS[2]! + 1);
    expect((await status(resolver, REVIEW_C)).stage_index).toBe(3);
    vi.setSystemTime(T0 + DEMO_STARTS[3]!);
    expect(await status(resolver, REVIEW_C)).toMatchObject({ status: "failed", stage_index: 3, error: { code: "LLM_UNAVAILABLE" } });
    expect((await call(resolver, "POST", "/v1/reviews/zzz/rerun")).status).toBe(404);
  });

  it("the run list shows a simulated run as running, and /readyz counts it", async () => {
    const { resolver } = testResolver();
    await call(resolver, "POST", "/v1/reviews", { pr_url: "a/b#1" });
    vi.setSystemTime(T0 + 1000);
    const list = (await call(resolver, "GET", "/v1/reviews?status=running")).json;
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ review_id: REVIEW_A, status: "running", gate_conclusion: null, finished_at: null, created_at: "2026-09-23T09:00:00Z" });
    expect((await call(resolver, "GET", "/readyz")).json.workers.running).toBe(1);
  });

  it("advances with the stub corpus too: fallback timing, then a terminal state marked fixture_stub", async () => {
    const { resolver } = testResolver({ files: stubFiles(), search: "?replay=1" });
    expect(await status(resolver)).toMatchObject({ status: "running", stage_index: 1, stage_label: null });
    vi.setSystemTime(T0 + 4 * STUB_STAGE_MS + 1);
    expect((await status(resolver)).stage_index).toBe(5);
    vi.setSystemTime(T0 + 9 * STUB_STAGE_MS);
    expect(await status(resolver)).toMatchObject({ status: "succeeded", stage_index: 9, degradations: ["fixture_stub"], finished_at: "2026-09-23T09:00:18Z" });
  });

  it("keeps working when sessionStorage throws (private mode)", async () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => undefined };
    const files = sampleFiles();
    const resolver = createFixtureResolver({
      latency: 0,
      storage: broken,
      hasher: null,
      pageParams: () => new URLSearchParams("?replay=1"),
      load: async (p) => {
        if (!(p in files)) throw new FixtureMissingError(p);
        return files[p]!;
      },
    });
    expect((await status(resolver)).status).toBe("running");
  });
});
