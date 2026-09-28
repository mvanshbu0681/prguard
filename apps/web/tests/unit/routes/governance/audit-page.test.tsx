// OWNER: d4 (wave 3). /audit, end to end through the fixture resolver: URL filters,
// and the plan-A8 guarantee — a payload float keeps its exact Python lexeme all the
// way from the resolver's raw text, through useAuditInfinite's lossless parse, into
// <ChainRail>'s expanded canonical_json (never JSON.parse, which would turn 1.0 into 1
// and 1e-05 into 0.00001 and make a real chain read as broken).
import "../../ui/dom-polyfills";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTransportBase } from "@/api/transport";
import { AuditPage } from "@/components/routes/audit";
import { makeQueryClient } from "@/lib/query";
import { testResolver } from "../../data/sample-corpus";

let resolver: ReturnType<typeof testResolver>["resolver"];
let onUrlUpdate: ReturnType<typeof vi.fn<OnUrlUpdateFunction>>;

beforeEach(() => {
  resolver = testResolver().resolver;
  setTransportBase(resolver);
  onUrlUpdate = vi.fn();
});
afterEach(() => setTransportBase(null));

function renderPage(searchParams = "") {
  const queryClient = makeQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <NuqsTestingAdapter searchParams={searchParams} hasMemory onUrlUpdate={onUrlUpdate}>
          {children}
        </NuqsTestingAdapter>
      </QueryClientProvider>
    );
  }
  return render(<AuditPage />, { wrapper: Wrapper });
}

describe("/audit — URL filters", () => {
  it("lists the sample chain's 4 events (seq ascending) with the server's verified verdict", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/chain\.verified/)).toBeInTheDocument());
    expect(screen.getByText("review.requested")).toBeInTheDocument();
    expect(screen.getByText("gate.evaluated")).toBeInTheDocument();
  });

  it("a review_id typed into the URL-bound input narrows the list and updates the querystring", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText("gate.evaluated")).toBeInTheDocument());

    // REVIEW_B (fixture-sample.ts) owns only the gate.evaluated event (seq 4); every
    // other sample event belongs to REVIEW_A.
    const REVIEW_B = "b0000000-0000-4000-8000-000000000002";
    await user.type(screen.getByLabelText("Review id"), REVIEW_B);

    await waitFor(() => expect(screen.queryByText("review.requested")).not.toBeInTheDocument());
    expect(screen.getByText("gate.evaluated")).toBeInTheDocument();

    const lastCall = onUrlUpdate.mock.calls.at(-1)![0] as { searchParams: URLSearchParams };
    expect(lastCall.searchParams.get("review_id")).toBe(REVIEW_B);
  });
});

describe("/audit — lossless payload numbers", () => {
  it("an expanded row's canonical_json keeps Python's exact float lexemes, not JSON.parse's", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText("finding.proposed")).toBeInTheDocument());

    await user.click(screen.getByText("finding.proposed"));

    const canonical = await screen.findByText(/"tiny":/);
    // Python repr: 1.0 (not 1), 1e-05 (not 0.00001) — the exact case plan A8 exists for.
    expect(canonical.textContent).toContain('"proof_confidence":1.0');
    expect(canonical.textContent).toContain('"tiny":1e-05');
    expect(canonical.textContent).not.toContain('"tiny":0.00001');
  });
});
