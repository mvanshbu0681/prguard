// /audit, end to end through the fixture resolver: the browser-side walk over a
// chain with real sha256 hashes (verified → tamper demo breaks it at the right seq
// → restore), URL filters (server-side review_id, client-side family/search), the
// ?seq= deep link, the serialiser-mismatch guard on placeholder hashes, and the
// lossless guarantee — a payload float keeps its Python lexeme all the way into the
// hashed bytes shown for an event (never JSON.parse: 1.0 must not become 1).
import "../../ui/dom-polyfills";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTransportBase } from "@/api/transport";
import { AuditPage } from "@/components/routes/audit";
import { FIXTURE_FILES } from "@/lib/fixture-types";
import { makeQueryClient } from "@/lib/query";
import { REVIEW_B, sampleFiles, testResolver } from "../../data/sample-corpus";
import { buildChain, chainText } from "./chain-fixture";

let onUrlUpdate: ReturnType<typeof vi.fn<OnUrlUpdateFunction>>;

beforeEach(() => {
  onUrlUpdate = vi.fn();
});
afterEach(() => setTransportBase(null));

async function renderPage(searchParams = "", options: { realChain?: boolean } = { realChain: true }) {
  const files = sampleFiles();
  if (options.realChain !== false) files[FIXTURE_FILES.auditEvents] = chainText(await buildChain());
  setTransportBase(testResolver({ files }).resolver);
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

const blocks = () => [...document.querySelectorAll<HTMLElement>("li[data-seq]")].map((li) => Number(li.dataset.seq));
const lastUrl = () => (onUrlUpdate.mock.calls.at(-1)![0] as { searchParams: URLSearchParams }).searchParams;

describe("/audit — verification", () => {
  it("re-computes every hash in the browser and says the chain is verified, newest event first", async () => {
    await renderPage();
    await screen.findByRole("heading", { name: "Chain verified" });
    expect(screen.getByText(/re-computed in your browser/)).toBeInTheDocument();
    expect(blocks()).toEqual([5, 4, 3, 2, 1]);
    // Every contiguous pair is joined by a verified hash link.
    expect(document.querySelectorAll('li[data-state="linked"]').length).toBe(4);
  });

  it("the tamper demo edits one payload and shows exactly where the chain breaks; restore re-verifies", async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole("heading", { name: "Chain verified" });

    await user.click(screen.getByRole("button", { name: /see what tampering looks like/i }));

    // The sample has no seq 1428, so the demo targets the newest finding.proposed (seq 2).
    await screen.findByRole("heading", { name: "Broken at #2" }, { timeout: 4000 });
    const hero = screen.getByRole("region", { name: "Audit chain verification" });
    expect(within(hero).getByText("payload.severity_band")).toBeInTheDocument();
    expect(within(hero).getByText("critical")).toBeInTheDocument();
    expect(within(hero).getByText("low")).toBeInTheDocument();
    expect(within(hero).getByText("Recorded")).toBeInTheDocument();
    expect(within(hero).getByText("Recomputed")).toBeInTheDocument();
    // The block itself is marked broken, the ones after it unverifiable, and the link above it broken.
    expect(document.querySelector('li[data-seq="2"]')!.getAttribute("data-state")).toBe("broken");
    expect(document.querySelector('li[data-seq="3"]')!.getAttribute("data-state")).toBe("after");
    expect(document.querySelector('li[data-seq="1"]')!.getAttribute("data-state")).toBe("intact");
    expect(document.querySelectorAll('li[data-state="broken"]').length).toBe(2); // the block + its incoming link

    await user.click(within(hero).getByRole("button", { name: /restore the record/i }));
    await screen.findByRole("heading", { name: "Chain verified" }, { timeout: 4000 });
    expect(document.querySelector('li[data-seq="2"]')!.getAttribute("data-state")).toBe("intact");
  });

  it("never claims tampering when the browser cannot reproduce the server's hashes (serialiser guard)", async () => {
    // The sample corpus's hashes are placeholders (000…001), which no serialiser reproduces.
    await renderPage("", { realChain: false });
    await screen.findByRole("heading", { name: "Verified by the server" });
    expect(screen.getByText(/serialiser mismatch/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Broken/ })).not.toBeInTheDocument();
  });
});

describe("/audit — filters and deep links", () => {
  it("a review_id in the URL narrows the log server-side; removing its chip clears the querystring", async () => {
    const user = userEvent.setup();
    await renderPage(`?review_id=${REVIEW_B}`);
    await waitFor(() => expect(blocks()).toEqual([5]));
    expect(within(document.querySelector<HTMLElement>('li[data-seq="5"]')!).getByText("Gate evaluated")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove the run filter" }));
    await waitFor(() => expect(blocks()).toEqual([5, 4, 3, 2, 1]));
    expect(lastUrl().get("review_id")).toBeNull();
  });

  it("family pills and seq search refine what is loaded, and write to the URL", async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole("heading", { name: "Chain verified" });

    const families = screen.getByRole("group", { name: "Event family" });
    await user.click(within(families).getByRole("button", { name: /^Overrides/ }));
    await waitFor(() => expect(blocks()).toEqual([4]));
    expect(lastUrl().get("kind")).toBe("overrides");

    await user.click(within(families).getByRole("button", { name: /^All/ }));
    await user.type(screen.getByLabelText("Search by seq, hash or text"), "#3");
    await waitFor(() => expect(blocks()).toEqual([3]));
  });

  it("?seq= opens that event and rings it", async () => {
    await renderPage("?seq=3");
    await waitFor(() => expect(document.querySelector('li[data-seq="3"]')?.hasAttribute("data-highlight")).toBe(true));
    const block = document.querySelector<HTMLElement>('li[data-seq="3"]')!;
    expect(within(block).getByRole("button", { expanded: true })).toBeInTheDocument();
    expect(within(block).getByText("Hashed bytes")).toBeInTheDocument();
    // Scrollable code blocks are focusable, named regions (axe scrollable-region-focusable).
    expect(within(block).getByRole("region", { name: "Hashed bytes of event #3" })).toHaveAttribute("tabindex", "0");
    expect(within(block).getByRole("region", { name: "Payload of event #3" })).toHaveAttribute("tabindex", "0");
  });

  it("?seq= naming no event says so near the top, and Dismiss clears it", async () => {
    const user = userEvent.setup();
    await renderPage("?seq=999999");
    const notice = await screen.findByText(/No event/);
    expect(notice.textContent).toContain("No event #999,999 on this chain.");
    expect(notice.textContent).toContain("It runs from #1 to #5.");

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByText(/No event/)).not.toBeInTheDocument());
    expect(lastUrl().get("seq")).toBeNull();
  });

  it("?seq= hidden by a filter offers to show it", async () => {
    const user = userEvent.setup();
    await renderPage(`?review_id=${REVIEW_B}&seq=3`);
    await screen.findByText(/hidden by the current filters/);

    await user.click(screen.getByRole("button", { name: "Show it" }));
    await waitFor(() => expect(document.querySelector('li[data-seq="3"]')?.hasAttribute("data-highlight")).toBe(true));
    expect(lastUrl().get("review_id")).toBeNull();
  });

  it("break-glass overrides are called out beside the log", async () => {
    await renderPage();
    const side = await screen.findByRole("complementary", { name: "Chain activity" });
    await waitFor(() => expect(within(side).getByText("1 break-glass override")).toBeInTheDocument());
    expect(within(side).getByText(/Hotfix window/)).toBeInTheDocument();
  });
});

describe("/audit — lossless payload numbers", () => {
  it("an expanded event's hashed bytes keep Python's exact float lexemes, not JSON.parse's", async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole("heading", { name: "Chain verified" });

    const block = document.querySelector<HTMLElement>('li[data-seq="2"]')!;
    await user.click(within(block).getByRole("button", { expanded: false }));

    const canonical = within(block).getByText(/"tiny":1e-05/);
    // Python repr: 1.0 (not 1), 1e-05 (not 0.00001) — the exact case plan A8 exists for.
    expect(canonical.textContent).toContain('"proof_confidence":1.0');
    expect(canonical.textContent).not.toContain('"tiny":0.00001');
    // And the browser's recomputation of those bytes matches the recorded hash.
    expect(within(block).getByText("matches")).toBeInTheDocument();
  });
});
