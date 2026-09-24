// OWNER: d2 (wave 3). <FilterBar> — the URL <-> filter state contract. It is
// presentational (filters/setFilters as props, see FilterBar.tsx's own header),
// so this exercises it against a spy setter with no nuqs adapter or router
// needed — a faithful stand-in for what useFindingFilters() actually hands it
// (src/lib/hooks/url-state.ts).
import "../../ui/dom-polyfills";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "@/components/routes/findings-list/FilterBar";
import type { FindingUrlFilters } from "@/components/routes/findings-list/types";

const NO_FILTERS: FindingUrlFilters = {
  review_id: null,
  repository: null,
  pr_number: null,
  fingerprint: null,
  status: null,
  severity_min: null,
  blocking: null,
  proof_status: [],
};

describe("FilterBar", () => {
  it("sets severity_min when a band is clicked, and clears it (null) on a second click of the same band", async () => {
    const user = userEvent.setup();
    const setFilters = vi.fn();
    render(<FilterBar filters={NO_FILTERS} setFilters={setFilters} matched={246} total={246} />);
    await user.click(screen.getByRole("radio", { name: "high" }));
    expect(setFilters).toHaveBeenCalledWith({ severity_min: "high" });

    setFilters.mockClear();
    render(<FilterBar filters={{ ...NO_FILTERS, severity_min: "high" }} setFilters={setFilters} matched={15} total={246} />);
    await user.click(screen.getAllByRole("radio", { name: "high" })[1]);
    expect(setFilters).toHaveBeenCalledWith({ severity_min: null });
  });

  it("proof_status is multi-select and empty selection clears the filter (not [])", async () => {
    const user = userEvent.setup();
    const setFilters = vi.fn();
    render(<FilterBar filters={NO_FILTERS} setFilters={setFilters} />);
    await user.click(screen.getByRole("button", { name: "proven" }));
    expect(setFilters).toHaveBeenCalledWith({ proof_status: ["proven"] });

    setFilters.mockClear();
    render(<FilterBar filters={{ ...NO_FILTERS, proof_status: ["proven"] }} setFilters={setFilters} />);
    await user.click(screen.getAllByRole("button", { name: "proven" })[1]);
    expect(setFilters).toHaveBeenCalledWith({ proof_status: null });
  });

  it("blocking is a tri-state single toggle: any / blocking / non-blocking", async () => {
    const user = userEvent.setup();
    const setFilters = vi.fn();
    render(<FilterBar filters={NO_FILTERS} setFilters={setFilters} />);
    await user.click(screen.getByRole("radio", { name: "blocking" }));
    expect(setFilters).toHaveBeenCalledWith({ blocking: true });

    setFilters.mockClear();
    await user.click(screen.getByRole("radio", { name: "non-blocking" }));
    expect(setFilters).toHaveBeenCalledWith({ blocking: false });
  });

  it("commits a text filter (repository) on blur, not on every keystroke", async () => {
    const user = userEvent.setup();
    const setFilters = vi.fn();
    render(<FilterBar filters={NO_FILTERS} setFilters={setFilters} />);
    const input = screen.getByPlaceholderText("owner/name");
    await user.type(input, "acme/checkout-service");
    expect(setFilters).not.toHaveBeenCalled();
    await user.tab();
    expect(setFilters).toHaveBeenCalledWith({ repository: "acme/checkout-service" });
  });

  it("commits a text filter on Enter and blurs the field", async () => {
    const user = userEvent.setup();
    const setFilters = vi.fn();
    render(<FilterBar filters={NO_FILTERS} setFilters={setFilters} />);
    const input = screen.getByPlaceholderText("owner/name");
    await user.type(input, "acme/ledger{Enter}");
    expect(setFilters).toHaveBeenCalledWith({ repository: "acme/ledger" });
    expect(input).not.toHaveFocus();
  });

  it("clearing pr_number sends null, not NaN or an empty string", async () => {
    const user = userEvent.setup();
    const setFilters = vi.fn();
    render(<FilterBar filters={{ ...NO_FILTERS, pr_number: 42 }} setFilters={setFilters} />);
    const input = screen.getByPlaceholderText("42");
    await user.clear(input);
    await user.tab();
    expect(setFilters).toHaveBeenCalledWith({ pr_number: null });
  });

  it("renders one chip per active filter and clears exactly that filter on click", async () => {
    const user = userEvent.setup();
    const setFilters = vi.fn();
    const filters: FindingUrlFilters = { ...NO_FILTERS, severity_min: "high", proof_status: ["proven"], blocking: true };
    render(<FilterBar filters={filters} setFilters={setFilters} matched={15} total={246} />);
    const list = screen.getByRole("list", { name: "Active filters" });
    expect(list.children).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: /Clear filter: severity/ }));
    expect(setFilters).toHaveBeenCalledWith({ severity_min: null });
  });

  it("CLEAR FILTERS resets everything at once and is absent with no active filters", () => {
    const setFilters = vi.fn();
    const { rerender } = render(<FilterBar filters={NO_FILTERS} setFilters={setFilters} />);
    expect(screen.queryByRole("button", { name: "CLEAR FILTERS" })).not.toBeInTheDocument();
    rerender(<FilterBar filters={{ ...NO_FILTERS, blocking: true }} setFilters={setFilters} />);
    expect(screen.getByRole("button", { name: "CLEAR FILTERS" })).toBeInTheDocument();
  });

  it("prints matched of total, tabular, and an ellipsis while either is still loading", () => {
    const { rerender } = render(<FilterBar filters={NO_FILTERS} setFilters={vi.fn()} matched={15} total={246} />);
    expect(screen.getByText("15 of 246")).toBeInTheDocument();
    rerender(<FilterBar filters={NO_FILTERS} setFilters={vi.fn()} />);
    expect(screen.getByText("…")).toBeInTheDocument();
  });
});
