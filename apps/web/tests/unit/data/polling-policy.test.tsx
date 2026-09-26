// OWNER: t2a (wave 1). The real-time policy (dashboard §5): pure functions, then
// useReviewStatus under fake timers, measuring the gaps between polls.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import { setTransportBase } from "@/api/transport";
import { useReviewStatus } from "@/lib/hooks";
import { backoffDelay, isTransientError, makeQueryClient, reviewPollInterval, shouldRetryPoll, shouldRetryQuery } from "@/lib/query";
import { finalStatus, queryWrapper } from "./sample-corpus";

const err = (status: number) => new ApiError({ status, code: status ? `HTTP_${status}` : "NETWORK_ERROR", message: "x", method: "GET", path: "/v1/reviews/r" });

describe("policy (pure)", () => {
  it("backs off 1.2s → 2.4s → 4.8s → 9.6s, capped at 10s", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(backoffDelay)).toEqual([1200, 2400, 4800, 9600, 10_000, 10_000, 10_000]);
  });

  it("classifies transient failures: no response, 5xx, 429 — never a bug", () => {
    expect([0, 500, 502, 503, 429].map((s) => isTransientError(err(s)))).toEqual([true, true, true, true, true]);
    expect([400, 401, 404, 409, 422].map((s) => isTransientError(err(s)))).toEqual([false, false, false, false, false]);
    expect(isTransientError(new TypeError("boom"))).toBe(false);
  });

  it("the default query retry never repeats a 4xx and retries a transient failure twice", () => {
    for (const s of [400, 401, 404, 409, 422, 429]) expect(shouldRetryQuery(0, err(s))).toBe(false);
    expect([0, 1, 2].map((n) => shouldRetryQuery(n, err(503)))).toEqual([true, true, false]);
    expect(shouldRetryQuery(0, err(0))).toBe(true);
    const qc = makeQueryClient();
    expect(qc.getDefaultOptions().queries?.retry).toBe(shouldRetryQuery);
    expect(qc.getDefaultOptions().mutations?.retry).toBe(false);
  });

  it("status polls retry every transient failure and stop on any other 4xx", () => {
    expect(shouldRetryPoll(50, err(0))).toBe(true);
    expect(shouldRetryPoll(50, err(429))).toBe(true);
    expect(shouldRetryPoll(0, err(404))).toBe(false);
  });

  it("polls at 1.2s while queued or running, stops at a terminal status or a non-transient error", () => {
    expect(reviewPollInterval(undefined, null)).toBe(1200);
    expect(reviewPollInterval("queued", null)).toBe(1200);
    expect(reviewPollInterval("running", null)).toBe(1200);
    expect(reviewPollInterval("running", err(503))).toBe(1200);
    for (const s of ["succeeded", "failed", "cancelled"] as const) expect(reviewPollInterval(s, null)).toBe(false);
    expect(reviewPollInterval(undefined, err(404))).toBe(false);
  });

  it("slows to 4s once a run has been silent for more than 90s (dashboard §5), and back when it speaks", () => {
    expect(reviewPollInterval("running", null, 12)).toBe(1200);
    expect(reviewPollInterval("running", null, 90)).toBe(1200);
    expect(reviewPollInterval("running", null, 91)).toBe(4000);
    expect(reviewPollInterval("running", null, 0)).toBe(1200);
    expect(reviewPollInterval("succeeded", null, 500)).toBe(false);
  });
});

describe("useReviewStatus under fake timers", () => {
  const T0 = Date.parse("2026-09-23T09:00:00Z");
  let calls: number[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    calls = [];
  });
  afterEach(() => {
    setTransportBase(null);
    vi.useRealTimers();
  });

  /** A transport that answers from a script, one entry per call. */
  function script(steps: ("network" | 404 | 429 | 503 | "running" | "succeeded")[]) {
    setTransportBase(async () => {
      calls.push(Date.now() - T0);
      const step = steps[Math.min(calls.length - 1, steps.length - 1)]!;
      if (step === "network") throw new TypeError("Failed to fetch");
      if (typeof step === "number") {
        return new Response(JSON.stringify({ error: { code: step === 404 ? "REVIEW_NOT_FOUND" : "X", message: "m", details: {}, request_id: "r" } }), {
          status: step,
          headers: { "content-type": "application/json" },
        });
      }
      const body = step === "running" ? finalStatus("r1", { status: "running", stage: "specialists", stage_index: 3, finished_at: null }) : finalStatus("r1");
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
  }

  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it("backs off after consecutive network failures, then polls at 1.2s, then stops at a terminal status", async () => {
    script(["network", "network", "network", "network", "network", "running", "running", "succeeded"]);
    const { Wrapper } = queryWrapper(makeQueryClient());
    const { result } = renderHook(() => useReviewStatus("r1"), { wrapper: Wrapper });
    await advance(0);
    expect(calls).toEqual([0]);
    // State lands a few ms after each call; sample 50 ms later.
    await advance(1250);
    expect(result.current.failureCount).toBe(2);
    expect(result.current.isError).toBe(false); // still retrying: nothing is reset
    await advance(40_000);
    // Five failures: retries after 1.2, 2.4, 4.8, 9.6 and the 10s cap; then 1.2s polls while running.
    expect(calls).toEqual([0, 1200, 3600, 8400, 18_000, 28_000, 29_200, 30_400]);
    expect(result.current.data?.status).toBe("succeeded");
    const settled = calls.length;
    await advance(30_000);
    expect(calls).toHaveLength(settled); // terminal: polling stopped
  });

  it("keeps the last status on screen while it backs off (the rail freezes, it does not reset)", async () => {
    script(["running", "network", "network", "network", "running"]);
    const { Wrapper } = queryWrapper(makeQueryClient());
    const { result } = renderHook(() => useReviewStatus("r1"), { wrapper: Wrapper });
    await advance(0);
    expect(result.current.data?.stage_index).toBe(3);
    await advance(1200 + 1200 + 2400 + 50);
    expect(result.current.failureCount).toBe(3);
    expect(result.current.data?.stage_index).toBe(3);
    expect(result.current.failureReason).toMatchObject({ status: 0, code: "NETWORK_ERROR" });
    await advance(4800);
    expect(result.current.failureCount).toBe(0);
    expect(calls).toEqual([0, 1200, 2400, 4800, 9600]);
  });

  it("stops polling on a 404 and does not retry it", async () => {
    script([404]);
    const { Wrapper } = queryWrapper(makeQueryClient());
    const { result } = renderHook(() => useReviewStatus("gone"), { wrapper: Wrapper });
    await advance(0);
    await advance(20_000);
    expect(calls).toEqual([0]);
    expect(result.current.error).toMatchObject({ status: 404, code: "REVIEW_NOT_FOUND", label: "GET /v1/reviews/gone · 404" });
  });

  it("treats 429 as a request to slow down, not to stop", async () => {
    script([429, 429, "running"]);
    const { Wrapper } = queryWrapper(makeQueryClient());
    renderHook(() => useReviewStatus("r1"), { wrapper: Wrapper });
    await advance(0);
    await advance(1200 + 2400);
    expect(calls).toEqual([0, 1200, 3600]);
  });

  it("does not poll without an id", async () => {
    script(["running"]);
    const { Wrapper } = queryWrapper(makeQueryClient());
    renderHook(() => useReviewStatus(null), { wrapper: Wrapper });
    await advance(5000);
    expect(calls).toEqual([]);
  });
});
