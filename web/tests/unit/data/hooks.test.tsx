// OWNER: t2a (wave 1). Every data hook, end to end through the generated client,
// the transport and the fixture resolver over the inline corpus.
import { act, renderHook, waitFor } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isLosslessNumber } from "@/api/lossless";
import { setTransportBase } from "@/api/transport";
import {
  findingsHref,
  getRememberedReviews,
  useAccuracy,
  useAudit,
  useAuditInfinite,
  useCreateReview,
  useFinding,
  useFindingFilters,
  useFindings,
  useFindingsInfinite,
  useHealthz,
  useReadyz,
  useRerunReview,
  useReviewList,
  useReviewResult,
  useReviewStatus,
  useRevokeSuppression,
  useSuppressions,
} from "@/lib/hooks";
import { makeQueryClient } from "@/lib/query";
import { F1, F3, FINDINGS, REVIEW_A, queryWrapper, testResolver } from "./sample-corpus";

const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));

let resolver: ReturnType<typeof testResolver>["resolver"];

beforeEach(() => {
  resolver = testResolver().resolver;
  setTransportBase(resolver);
  localStorage.clear();
  toastError.mockReset();
  toastSuccess.mockReset();
});
afterEach(() => setTransportBase(null));

function render<T>(hook: () => T) {
  // The production client: its retry policy is part of what is tested.
  const { Wrapper, queryClient } = queryWrapper(makeQueryClient());
  return { ...renderHook(hook, { wrapper: Wrapper }), queryClient };
}

describe("findings", () => {
  it("useFindings applies the filters and reports totals.matched", async () => {
    const { result } = render(() => useFindings({ severity_min: "high", proof_status: "proven" }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items?.map((f) => f.id)).toEqual([F1.id]);
    expect(result.current.data?.totals?.matched).toBe(1);
  });

  it("useFindingsInfinite follows next_cursor until has_more is false", async () => {
    const { result } = render(() => useFindingsInfinite({ limit: 3 }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
    await act(() => result.current.fetchNextPage());
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(3));
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.data?.pages.flatMap((p) => p.items ?? []).map((f) => f.id)).toEqual(FINDINGS.map((f) => f.id));
  });

  it("useFinding surfaces a 404 as an ApiError and does not retry it", async () => {
    const calls = vi.fn();
    setTransportBase(async (input) => {
      calls();
      return resolver(input as Request);
    });
    const { result } = render(() => useFinding("missing-id"));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 404, code: "FINDING_NOT_FOUND", endpoint: "GET /v1/findings/missing-id" });
    expect(calls).toHaveBeenCalledTimes(1);
  });
});

describe("audit", () => {
  it("useAudit parses losslessly: Python's 1.0 stays a LosslessNumber with lexeme 1.0", async () => {
    const { result } = render(() => useAudit({ finding_id: F1.id }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [proposed, executed] = result.current.data!.items!;
    expect(proposed!.seq).toBe(2);
    expect(isLosslessNumber(proposed!.payload!.proof_confidence)).toBe(true);
    expect(String(proposed!.payload!.proof_confidence)).toBe("1.0");
    expect(String(proposed!.payload!.tiny)).toBe("1e-05");
    expect(executed!.payload!.head_exit_code).toBe(1);
    expect(executed!.tenant_id).toBeTruthy();
    expect(result.current.data!.chain).toMatchObject({ verified: true, checked: 2 });
  });

  it("useAuditInfinite windows the chain by seq cursor", async () => {
    const { result } = render(() => useAuditInfinite({ limit: 2 }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.data!.pages.flatMap((p) => p.items ?? []).map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(result.current.hasNextPage).toBe(false);
  });
});

describe("the ledger", () => {
  it("useSuppressions reads active rows with totals; useRevokeSuppression revokes and refetches", async () => {
    const { result } = render(() => ({ active: useSuppressions(), inactive: useSuppressions({ active: false }), revoke: useRevokeSuppression() }));
    await waitFor(() => expect(result.current.active.isSuccess && result.current.inactive.isSuccess).toBe(true));
    expect(result.current.active.data?.totals).toEqual({ active: 2, expired: 1, revoked: 1 });
    const target = result.current.active.data!.items![0]!.suppression_id;
    act(() => result.current.revoke.mutate({ suppressionId: target, actorId: "vansh.m" }));
    await waitFor(() => expect(result.current.revoke.isSuccess).toBe(true));
    expect(result.current.revoke.data).toMatchObject({ suppression_id: target, active: false });
    await waitFor(() => expect(result.current.active.data?.totals).toEqual({ active: 1, expired: 1, revoked: 2 }));
    expect(result.current.inactive.data?.items?.map((s) => s.suppression_id)).toContain(target);
    // Only UUID-shaped ids are shortened; the sample's `s1000000-…` is not hex, so it prints whole.
    expect(toastSuccess).toHaveBeenCalledWith(
      "SUPPRESSION REVOKED",
      expect.objectContaining({ description: expect.stringMatching(new RegExp(`^DELETE /v1/suppressions/${target} · 200 · fx_\\w+$`)) }),
    );
  });

  it("a failed revoke raises a toast carrying `DELETE /v1/suppressions/{id} · 404`", async () => {
    const { result } = render(() => useRevokeSuppression());
    act(() => result.current.mutate({ suppressionId: "s-missing" }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastError).toHaveBeenCalledWith(
      "SUPPRESSION NOT REVOKED",
      expect.objectContaining({ description: expect.stringMatching(/^DELETE \/v1\/suppressions\/s-missing · 404 · fx_\w+ · SUPPRESSION_NOT_FOUND: No suppression with that id$/) }),
    );
  });
});

describe("runs", () => {
  it("useCreateReview: 202, remembered for the live run list, and the status poll starts over", async () => {
    const { result } = render(() => ({ create: useCreateReview(), status: useReviewStatus(REVIEW_A) }));
    await waitFor(() => expect(result.current.status.data?.status).toBe("succeeded"));
    act(() => result.current.create.mutate({ pr_url: "https://github.com/acme/checkout-service/pull/4821" }));
    await waitFor(() => expect(result.current.create.isSuccess).toBe(true));
    expect(result.current.create.data).toMatchObject({ review_id: REVIEW_A, status: "queued", trigger: "api" });
    expect(getRememberedReviews().map((r) => r.review_id)).toEqual([REVIEW_A]);
    await waitFor(() => expect(result.current.status.data).toMatchObject({ status: "running", stage_index: 1 }));
  });

  it("useReviewResult while the run is live: 409 RESULT_NOT_READY, not retried; partial works", async () => {
    await resolver(new Request("http://localhost:8000/v1/reviews", { method: "POST", body: JSON.stringify({ pr_url: "a/b#1" }), headers: { "content-type": "application/json" } }));
    const { result } = render(() => ({ full: useReviewResult(REVIEW_A), partial: useReviewResult(REVIEW_A, { partial: true }) }));
    await waitFor(() => expect(result.current.full.isError && result.current.partial.isSuccess).toBe(true));
    expect(result.current.full.error).toMatchObject({ status: 409, code: "RESULT_NOT_READY" });
    expect(result.current.partial.data).toMatchObject({ status: "running", findings: [] });
  });

  it("a failed create raises a toast carrying `POST /v1/reviews · 422` and the §6.0 code; a success stays quiet by default", async () => {
    const { result } = render(() => useCreateReview());
    act(() => result.current.mutate({ pr_url: "not a pull request" }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastError).toHaveBeenCalledWith(
      "REVIEW NOT QUEUED",
      expect.objectContaining({
        description: expect.stringMatching(/^POST \/v1\/reviews · 422 · fx_\w+ · INVALID_PR_URL: Could not parse a GitHub pull request from the supplied URL$/),
      }),
    );
    await act(() => result.current.mutateAsync({ pr_url: "acme/checkout-service#4821" }));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("useRerunReview: 202, the run replays from stage 1, and `RE-RUN QUEUED` says so", async () => {
    const { result } = render(() => ({ rerun: useRerunReview(), status: useReviewStatus(REVIEW_A) }));
    await waitFor(() => expect(result.current.status.data?.status).toBe("succeeded"));
    act(() => result.current.rerun.mutate({ reviewId: REVIEW_A }));
    await waitFor(() => expect(result.current.rerun.isSuccess).toBe(true));
    expect(result.current.rerun.data).toMatchObject({ review_id: REVIEW_A, trigger: "rerun" });
    await waitFor(() => expect(result.current.status.data).toMatchObject({ status: "running", stage_index: 1 }));
    expect(toastSuccess).toHaveBeenCalledWith("RE-RUN QUEUED", expect.objectContaining({ description: expect.stringMatching(/^POST \/v1\/reviews\/4e8b1d0\/rerun · 202 · fx_\w+$/) }));
  });

  it("useReviewList lists runs newest first", async () => {
    const { result } = render(() => useReviewList({ limit: 2 }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items.map((r) => r.review_id)[0]).toBe(REVIEW_A);
    expect(result.current.data?.page.has_more).toBe(true);
    expect(result.current.data?.totals.matched).toBe(3);
  });
});

describe("accuracy and health", () => {
  it("useAccuracy, useHealthz and useReadyz", async () => {
    const { result } = render(() => ({ accuracy: useAccuracy(), health: useHealthz(), ready: useReadyz() }));
    await waitFor(() => expect(result.current.accuracy.isSuccess && result.current.health.isSuccess && result.current.ready.isSuccess).toBe(true));
    expect(result.current.accuracy.data?.proof.proven_rate).toBe(0.574);
    expect(result.current.health.data).toEqual({ status: "ok", version: "fixtures@eeb1be8" });
    expect(result.current.ready.data?.status).toBe("ready");
  });
});

describe("URL state (nuqs)", () => {
  it("findingsHref writes the deep link a judge is dropped into", () => {
    expect(findingsHref("/findings", { severity_min: "high", proof_status: ["proven"], blocking: true })).toBe("/findings?severity_min=high&blocking=true&proof_status=proven");
  });

  it("useFindingFilters reads the URL and useFindings runs it", async () => {
    const { Wrapper: QueryWrapper } = queryWrapper(makeQueryClient());
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NuqsTestingAdapter searchParams="?severity_min=high&proof_status=proven&proof_status=inconclusive&blocking=false">
        <QueryWrapper>{children}</QueryWrapper>
      </NuqsTestingAdapter>
    );
    const { result } = renderHook(
      () => {
        const [filters] = useFindingFilters();
        return { filters, findings: useFindings(filters) };
      },
      { wrapper },
    );
    expect(result.current.filters).toMatchObject({ severity_min: "high", blocking: false, proof_status: ["proven", "inconclusive"], review_id: null });
    await waitFor(() => expect(result.current.findings.isSuccess).toBe(true));
    // high or critical, proven or inconclusive, not blocking: F3 only (F1 blocks).
    expect(result.current.findings.data?.items?.map((f) => f.id)).toEqual([F3.id]);
  });
});
