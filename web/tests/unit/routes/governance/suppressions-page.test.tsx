// OWNER: d4 (wave 3). /suppressions, end to end through the fixture resolver: URL
// filters round-trip through the address bar (nuqs' testing adapter), and the revoke
// flow — confirm dialog, DELETE /v1/suppressions/{id}, the row flips to revoked in
// place without leaving the ledger (dashboard-blueprint §2.8: "revoke never deletes").
import "../../ui/dom-polyfills";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTransportBase } from "@/api/transport";
import { SuppressionsPage } from "@/components/routes/suppressions";
import { makeQueryClient } from "@/lib/query";
import { testResolver } from "../../data/sample-corpus";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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
  return render(<SuppressionsPage />, { wrapper: Wrapper });
}

describe("/suppressions — URL filters", () => {
  it("defaults to active-only (the API's own default) and lists the active sample rows", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText("ACTIVE").length).toBeGreaterThan(0));
    // The sample corpus (tests/unit/data → src/lib/fixture-sample.ts) ships 2 active, 1
    // expired-by-flag and 1 revoked row; active-only should show exactly the 2 active ones.
    expect(screen.queryByText(/CLI entrypoint/)).not.toBeInTheDocument(); // the expired row's reason
    expect(screen.getByText(/vendored SDK/)).toBeInTheDocument();
  });

  it("the state toggle to 'ALL ROWS' pushes active=false into the URL and reveals the expired and revoked rows", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText(/vendored SDK/)).toBeInTheDocument());

    await user.click(screen.getByRole("radio", { name: "ALL ROWS" }));

    await waitFor(() => expect(screen.getByText(/CLI entrypoint/)).toBeInTheDocument());
    expect(screen.getByText(/duplicate of s1/)).toBeInTheDocument(); // the revoked row
    expect(onUrlUpdate).toHaveBeenCalled();
    const lastCall = onUrlUpdate.mock.calls.at(-1)![0] as { searchParams: URLSearchParams };
    expect(lastCall.searchParams.get("active")).toBe("false");
  });

  it("a repository filter typed into the URL-bound input is reflected in the querystring", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText(/vendored SDK/)).toBeInTheDocument());

    await user.type(screen.getByLabelText("Repository"), "acme/checkout-service");

    await waitFor(() => {
      const lastCall = onUrlUpdate.mock.calls.at(-1)![0] as { searchParams: URLSearchParams };
      expect(lastCall.searchParams.get("repository")).toBe("acme/checkout-service");
    });
  });

  it("?fingerprint= arrives pre-filled from a deep link (findings → ledger)", async () => {
    renderPage("?fingerprint=a91f3c2e00000000000000000000000000000000000000000000000000008b4d");
    await waitFor(() => expect(screen.getByLabelText("Fingerprint")).toHaveValue("a91f3c2e00000000000000000000000000000000000000000000000000008b4d"));
  });
});

describe("/suppressions — revoke flow", () => {
  it("confirms in a dialog that says revoke never deletes, then flips the row to revoked in place", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText(/vendored SDK/)).toBeInTheDocument());

    const row = screen.getByText(/vendored SDK/).closest("li")!;
    await user.click(within(row).getByRole("button", { name: "REVOKE" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/does not delete this row/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "REVOKE" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // The row is still in the ledger (append-only), now struck through as revoked —
    // active-only no longer matches it, so switch to ALL ROWS to see it in place.
    await user.click(screen.getByRole("radio", { name: "ALL ROWS" }));
    await waitFor(() => {
      const revokedRow = screen.getByText(/vendored SDK/).closest("li")!;
      expect(within(revokedRow).getByText("REVOKED")).toBeInTheDocument();
    });
  });
});
