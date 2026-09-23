// OWNER: t2a (wave 1). The one suppression reducer (dashboard §6), shared by the
// optimistic path, the server response and the fixture resolver's overlay.
import { act, renderHook, waitFor } from "@testing-library/react";
import type { InfiniteData } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTransportBase } from "@/api/transport";
import type { Finding, FindingList, SuppressionCreated } from "@/lib/api-types";
import { useAudit, useFinding, useFindings, useReviewResult, useSuppressFinding } from "@/lib/hooks";
import {
  applySuppressionToList,
  applySuppressionToPages,
  applySuppressionToResult,
  isPendingSuppression,
  patchFromCreated,
  patchFromRequest,
  suppressFindingReducer,
} from "@/lib/hooks/suppress-reducer";
import { F1, F2, F3, REVIEW_A, call, queryWrapper, result, testResolver } from "./sample-corpus";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

const request = { scope: "pattern" as const, reason: "generated client", match_path: "src/api/**", expires_at: "2027-01-01T00:00:00Z" };
const created: SuppressionCreated = {
  suppression_id: "s-real-0001",
  fingerprint: F3.fingerprint,
  scope: "pattern",
  match_path: "src/api/**",
  reason: "generated client",
  created_by: "vansh.m",
  source: "human_api",
  expires_at: "2027-01-01T00:00:00Z",
  revoked_at: null,
  affected_findings: { this_run: 1, historical: 0 },
  created_at: "2026-09-23T10:00:00Z",
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe("suppressFindingReducer (pure)", () => {
  it("the optimistic and the confirmed patch compute the identical next state, apart from the id", () => {
    const optimistic = suppressFindingReducer(F3, patchFromRequest(request, { tempId: "t1", actorId: "vansh.m" }));
    const confirmed = suppressFindingReducer(F3, patchFromCreated(created));
    expect(optimistic.suppression?.suppression_id).toBe("pending:t1");
    expect(isPendingSuppression(optimistic.suppression)).toBe(true);
    expect(isPendingSuppression(confirmed.suppression)).toBe(false);
    const withoutId = (f: Finding) => ({ ...f, suppression: { ...f.suppression!, suppression_id: "" } });
    expect(withoutId(optimistic)).toEqual(withoutId(confirmed));
  });

  it("flips status to suppressed, keeps blocking and every other field, and never mutates", () => {
    const frozen = deepFreeze(structuredClone(F1));
    const next = suppressFindingReducer(frozen, patchFromCreated(created));
    expect(next).not.toBe(frozen);
    expect(next.status).toBe("suppressed");
    expect(next.blocking).toBe(true);
    expect({ ...next, status: frozen.status, suppression: frozen.suppression }).toEqual(frozen);
    expect(suppressFindingReducer(next, patchFromCreated(created))).toEqual(next); // idempotent
  });

  it("the appliers touch only the target finding and keep references when it is absent", () => {
    const list: FindingList = { items: [F1, F2, F3], page: { limit: 50, next_cursor: null, has_more: false }, totals: { matched: 3 } };
    const patch = patchFromCreated(created);
    const next = applySuppressionToList(list, F3.id, patch);
    expect(next.items![0]).toBe(F1);
    expect(next.items![1]).toBe(F2);
    expect(next.items![2]!.status).toBe("suppressed");
    expect(applySuppressionToList(list, "absent", patch)).toBe(list);

    const pages: InfiniteData<FindingList> = { pages: [list, { ...list, items: [F2] }], pageParams: [null, "c"] };
    const nextPages = applySuppressionToPages(pages, F3.id, patch);
    expect(nextPages.pages[1]).toBe(pages.pages[1]);
    expect(nextPages.pages[0]!.items![2]!.status).toBe("suppressed");
    expect(applySuppressionToPages(pages, "absent", patch)).toBe(pages);

    const res = result(REVIEW_A, [F1, F3]);
    expect(applySuppressionToResult(res, F3.id, patch).findings![1]!.status).toBe("suppressed");
    expect(applySuppressionToResult(res, "absent", patch)).toBe(res);
  });

  it("the fixture resolver's overlay computes exactly the reducer's state from its own 201", async () => {
    const { resolver } = testResolver();
    const r = await call(resolver, "POST", `/v1/findings/${F3.id}/suppress`, request, { "X-Actor-Id": "vansh.m" });
    const served = (await call(resolver, "GET", `/v1/findings/${F3.id}`)).json as Finding;
    expect(served).toEqual(suppressFindingReducer(F3, patchFromCreated(r.json)));
  });
});

describe("useSuppressFinding — optimistic, rolled back on failure", () => {
  let release: () => void;
  let gate: Promise<void>;

  beforeEach(() => {
    toastError.mockReset();
    gate = new Promise((resolve) => (release = resolve));
  });
  afterEach(() => setTransportBase(null));

  /** The sample resolver, with every POST held until release(). */
  function install(options: { failWith?: "network" } = {}) {
    const { resolver } = testResolver();
    setTransportBase(async (input) => {
      const req = input as Request;
      if (req.method === "POST") {
        await gate;
        if (options.failWith === "network") throw new TypeError("Failed to fetch");
      }
      return resolver(req);
    });
    return resolver;
  }

  function useScreen() {
    return {
      finding: useFinding(F3.id),
      list: useFindings({ review_id: REVIEW_A }),
      result: useReviewResult(REVIEW_A),
      audit: useAudit({ event_type: "suppression.created" }),
      suppress: useSuppressFinding(),
    };
  }

  async function mount() {
    const { Wrapper, queryClient } = queryWrapper();
    const hook = renderHook(useScreen, { wrapper: Wrapper });
    await waitFor(() => {
      expect(hook.result.current.finding.data?.status).toBe("published");
      expect(hook.result.current.list.data?.items).toHaveLength(3);
      expect(hook.result.current.result.data?.findings).toHaveLength(3);
      expect(hook.result.current.audit.data?.items).toEqual([]);
    });
    return { ...hook, queryClient };
  }

  const inList = (list: FindingList | undefined) => list?.items?.find((f) => f.id === F3.id);
  const inResult = (r: { findings?: Finding[] } | undefined) => r?.findings?.find((f) => f.id === F3.id);

  it("strikes the finding everywhere before the response, then swaps in the real id and refetches", async () => {
    install();
    const { result: hook } = await mount();
    act(() => hook.current.suppress.mutate({ findingId: F3.id, request, actorId: "vansh.m" }));
    await waitFor(() => expect(hook.current.finding.data?.status).toBe("suppressed"));
    // Optimistic: every cache holding the finding shows the pending suppression.
    expect(hook.current.finding.data?.suppression?.suppression_id).toMatch(/^pending:/);
    expect(inList(hook.current.list.data)?.status).toBe("suppressed");
    expect(inResult(hook.current.result.data)?.status).toBe("suppressed");
    expect(hook.current.suppress.isPending).toBe(true);

    release();
    await waitFor(() => expect(hook.current.suppress.isSuccess).toBe(true));
    const id = hook.current.suppress.data!.suppression_id;
    await waitFor(() => {
      expect(hook.current.finding.data?.suppression?.suppression_id).toBe(id);
      expect(inList(hook.current.list.data)?.suppression?.suppression_id).toBe(id);
      // Invalidated and refetched: the audit trail now carries the event.
      expect(hook.current.audit.data?.items?.map((e) => e.event_type)).toEqual(["suppression.created"]);
    });
    expect(toastError).not.toHaveBeenCalled();
  });

  it("rolls every cache back on a 422 and raises `POST /v1/findings/{id}/suppress · 422`", async () => {
    install();
    const { result: hook } = await mount();
    const before = { finding: hook.current.finding.data, list: hook.current.list.data, result: hook.current.result.data };
    act(() => hook.current.suppress.mutate({ findingId: F3.id, request: { scope: "line", reason: "" } }));
    await waitFor(() => expect(hook.current.finding.data?.status).toBe("suppressed"));
    release();
    await waitFor(() => expect(hook.current.suppress.isError).toBe(true));
    await waitFor(() => {
      expect(hook.current.finding.data).toEqual(before.finding);
      expect(hook.current.list.data).toEqual(before.list);
      expect(hook.current.result.data).toEqual(before.result);
    });
    expect(hook.current.suppress.error).toMatchObject({ status: 422, code: "VALIDATION_ERROR", endpoint: `POST /v1/findings/${F3.id}/suppress` });
    expect(toastError).toHaveBeenCalledTimes(1);
    const [title, options] = toastError.mock.calls[0]!;
    expect(title).toBe(`POST /v1/findings/${F3.id}/suppress · 422`);
    expect(options.description).toMatch(/^VALIDATION_ERROR · reason is required and must not be empty\. · fx_/);
  });

  it("names a network failure `· no response`", async () => {
    install({ failWith: "network" });
    const { result: hook } = await mount();
    act(() => hook.current.suppress.mutate({ findingId: F3.id, request }));
    release();
    await waitFor(() => expect(hook.current.suppress.isError).toBe(true));
    await waitFor(() => expect(hook.current.finding.data?.status).toBe("published"));
    expect(toastError.mock.calls[0]![0]).toBe(`POST /v1/findings/${F3.id}/suppress · no response`);
  });
});
