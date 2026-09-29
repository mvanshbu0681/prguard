// /suppressions, end to end through the fixture resolver: URL filters round-trip
// through the address bar (nuqs' testing adapter), the ledger joins the finding each
// suppression silenced, and the revoke flow — confirm dialog, DELETE
// /v1/suppressions/{id}, the row flips to revoked in place without leaving the
// ledger ("revoke never deletes").
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

let onUrlUpdate: ReturnType<typeof vi.fn<OnUrlUpdateFunction>>;

beforeEach(() => {
  setTransportBase(testResolver().resolver);
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

const lastUrl = () => (onUrlUpdate.mock.calls.at(-1)![0] as { searchParams: URLSearchParams }).searchParams;
const ledger = () => screen.getByRole("list", { name: "The ledger" });
const rowOf = (text: RegExp) => screen.getByText(text).closest("li")!;
const stateGroup = () => screen.getByRole("group", { name: "Ledger state" });

describe("/suppressions — posture", () => {
  it("heads the page with the findings silenced and summarises the whole ledger", async () => {
    renderPage();
    // Sample ledger: suppressed_count 1 + 4 + 0 + 9.
    await screen.findByRole("heading", { level: 1, name: /14 findings silenced to date/ });
    // The two numbers can never read as a mismatch: the description says what each counts.
    expect(screen.getByText("2 active suppressions still silence 10 of them; the other 4 fell under rules since expired or revoked.")).toBeInTheDocument();
    expect(screen.getByText(/of those 14 findings/)).toBeInTheDocument();
    expect(screen.getByText("Silenced right now")).toBeInTheDocument();
    expect(screen.getByText("Why teams suppress")).toBeInTheDocument();
    expect(screen.getByText("How far they reach")).toBeInTheDocument();
  });

  it("joins the finding each suppression silenced, with a link to it", async () => {
    renderPage();
    await waitFor(() => expect(within(ledger()).getByText(/vendored SDK/)).toBeInTheDocument());
    const row = rowOf(/vendored SDK/);
    // F5 in the sample corpus carries suppression s1.
    expect(within(row).getByRole("link", { name: /finding f5000000/ })).toHaveAttribute("href", "/findings/f5000000-0000-4000-8000-000000000005");
  });
});

describe("/suppressions — URL filters", () => {
  it("defaults to active-only (the API's own default) and lists only the active rows", async () => {
    renderPage();
    await waitFor(() => expect(within(ledger()).getByText(/vendored SDK/)).toBeInTheDocument());
    expect(within(ledger()).getByText(/tracked in the issue tracker/)).toBeInTheDocument();
    expect(within(ledger()).queryByText(/CLI entrypoint/)).not.toBeInTheDocument(); // the expired row
    expect(within(stateGroup()).getByRole("button", { name: /^Active/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("the state control to 'All' pushes active=false into the URL and reveals the expired and revoked rows", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(within(ledger()).getByText(/vendored SDK/)).toBeInTheDocument());

    await user.click(within(stateGroup()).getByRole("button", { name: /^All/ }));

    await waitFor(() => expect(within(ledger()).getByText(/CLI entrypoint/)).toBeInTheDocument());
    expect(within(ledger()).getByText(/duplicate of s1/)).toBeInTheDocument(); // the revoked row
    expect(lastUrl().get("active")).toBe("false");
  });

  it("a row's state tag only appears when the list mixes states (never repeating the tab)", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(within(ledger()).getByText(/vendored SDK/)).toBeInTheDocument());
    expect(within(ledger()).queryByText("Active", { selector: "span" })).not.toBeInTheDocument();

    await user.click(within(stateGroup()).getByRole("button", { name: /^All/ }));
    await waitFor(() => expect(within(rowOf(/vendored SDK/)).getByText("Active", { selector: "span" })).toBeInTheDocument());
    expect(within(rowOf(/CLI entrypoint/)).getByText("Expired", { selector: "span" })).toBeInTheDocument();
  });

  it("'Revoked' narrows to revoked rows only, as ?state=revoked", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(within(ledger()).getByText(/vendored SDK/)).toBeInTheDocument());

    await user.click(within(stateGroup()).getByRole("button", { name: /^Revoked/ }));

    await waitFor(() => expect(within(ledger()).getByText(/duplicate of s1/)).toBeInTheDocument());
    expect(within(ledger()).queryByText(/vendored SDK/)).not.toBeInTheDocument();
    expect(lastUrl().get("state")).toBe("revoked");
    expect(lastUrl().get("active")).toBe("false");
  });

  it("a scope from the reach ladder filters server-side and lands in the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(within(ledger()).getByText(/vendored SDK/)).toBeInTheDocument());

    const ladder = screen.getByRole("list", { name: /by scope/ });
    await user.click(within(ladder).getByRole("button", { name: /Org/ }));

    await waitFor(() => expect(within(ledger()).queryByText(/vendored SDK/)).not.toBeInTheDocument());
    expect(within(ledger()).getByText(/tracked in the issue tracker/)).toBeInTheDocument(); // the tenant row
    expect(lastUrl().get("scope")).toBe("tenant");
  });

  it("the repository menu writes ?repository=", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(within(ledger()).getByText(/vendored SDK/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Repository: all repositories/ }));
    await user.click(await screen.findByRole("menuitemradio", { name: "acme/api-gateway" }));

    await waitFor(() => expect(lastUrl().get("repository")).toBe("acme/api-gateway"));
  });

  it("search refines the rows client-side and is kept in the URL as ?q=", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(within(ledger()).getByText(/vendored SDK/)).toBeInTheDocument());

    await user.type(screen.getByLabelText("Search the ledger"), "todo_comment");

    await waitFor(() => expect(within(ledger()).queryByText(/vendored SDK/)).not.toBeInTheDocument());
    expect(within(ledger()).getByText(/tracked in the issue tracker/)).toBeInTheDocument();
    expect(lastUrl().get("q")).toBe("todo_comment");
  });

  it("?fingerprint= arrives from a finding's deep link as a removable chip", async () => {
    const user = userEvent.setup();
    const fp = "a91f3c2e00000000000000000000000000000000000000000000000000008b4d";
    renderPage(`?fingerprint=${fp}`);
    const chip = await screen.findByTitle(fp);
    expect(within(chip).getByText("a91f3c2e…8b4d")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove the fingerprint filter" }));
    await waitFor(() => expect(lastUrl().get("fingerprint")).toBeNull());
  });
});

describe("/suppressions — revoke flow", () => {
  it("confirms in a dialog that says revoke never deletes, then flips the row to revoked in place", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(within(ledger()).getByText(/vendored SDK/)).toBeInTheDocument());

    await user.click(within(rowOf(/vendored SDK/)).getByRole("button", { name: /^Revoke/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/does not delete this row/)).toBeInTheDocument();
    expect(within(dialog).getByText(/finding it silenced is raised again/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Still in the ledger (append-only), now revoked — active-only no longer matches it.
    await user.click(within(stateGroup()).getByRole("button", { name: /^All/ }));
    await waitFor(() => {
      const row = rowOf(/vendored SDK/);
      expect(row).toHaveAttribute("data-ledger-row", "revoked");
      expect(within(row).getByText("Revoked", { selector: "span" })).toBeInTheDocument();
      expect(within(row).queryByRole("button", { name: /^Revoke/ })).not.toBeInTheDocument();
    });
  });

  it("'Keep it' closes the dialog without revoking", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(within(ledger()).getByText(/vendored SDK/)).toBeInTheDocument());

    await user.click(within(rowOf(/vendored SDK/)).getByRole("button", { name: /^Revoke/ }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep it" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(rowOf(/vendored SDK/)).toHaveAttribute("data-ledger-row", "active");
  });
});
