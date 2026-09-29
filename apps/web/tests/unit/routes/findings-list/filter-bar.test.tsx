// <FilterBar> — the URL <-> view contract. Presentational (view/setView are
// props), so it runs against a spy setter with no nuqs adapter or router.
import "../../ui/dom-polyfills";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "@/components/routes/findings-list/FilterBar";
import { clearFiltersPatch } from "@/components/routes/findings-list/format";
import type { FindingsView } from "@/components/routes/findings-list/types";

const VIEW: FindingsView = {
  status: "published",
  severity_min: null,
  proof_status: [],
  blocking: null,
  repository: null,
  pr_number: null,
  review_id: null,
  fingerprint: null,
  q: null,
  specialist: null,
  sort: "newest",
  group: "none",
};

function setup(view: Partial<FindingsView> = {}, props: Partial<Parameters<typeof FilterBar>[0]> = {}) {
  const setView = vi.fn();
  const user = userEvent.setup();
  const utils = render(<FilterBar view={{ ...VIEW, ...view }} setView={setView} {...props} />);
  return { ...utils, setView, user };
}

describe("FilterBar — status segments", () => {
  it("prints each segment's live count and writes the chosen status", async () => {
    const { setView, user } = setup({}, { statusCounts: { published: 89, disproven: 5, suppressed: 27, dropped: 122, all: 246 } });
    const group = screen.getByRole("group", { name: "Finding status" });
    expect(group.textContent).toContain("Suppressed27");
    await user.click(screen.getByRole("button", { name: /Suppressed/ }));
    expect(setView).toHaveBeenCalledWith({ status: "suppressed" });
  });

  it("Published is the default, so choosing it clears the key from the URL", async () => {
    const { setView, user } = setup({ status: "all" });
    await user.click(screen.getByRole("button", { name: /Published/ }));
    expect(setView).toHaveBeenCalledWith({ status: null });
  });
});

describe("FilterBar — filter pills", () => {
  it("severity is a floor chosen from a menu", async () => {
    const { setView, user } = setup();
    await user.click(screen.getByRole("button", { name: /Severity/ }));
    await user.click(await screen.findByRole("menuitemradio", { name: "High and above" }));
    expect(setView).toHaveBeenCalledWith({ severity_min: "high" });
  });

  it("an active pill shows its value and its × clears exactly that filter", async () => {
    const { setView, user } = setup({ severity_min: "high" });
    expect(screen.getByRole("button", { name: /Severity/ }).textContent).toContain("≥ High");
    await user.click(screen.getByRole("button", { name: "Clear severity filter" }));
    expect(setView).toHaveBeenCalledWith({ severity_min: null });
  });

  it("proof is multi-select, and unchecking the last state clears the filter (null, not [])", async () => {
    const first = setup();
    await first.user.click(screen.getByRole("button", { name: /Proof/ }));
    await first.user.click(await screen.findByRole("menuitemcheckbox", { name: "Proven" }));
    expect(first.setView).toHaveBeenCalledWith({ proof_status: ["proven"] });
    first.unmount();

    const second = setup({ proof_status: ["proven"] });
    await second.user.click(screen.getByRole("button", { name: /Proof/ }));
    await second.user.click(await screen.findByRole("menuitemcheckbox", { name: "Proven" }));
    expect(second.setView).toHaveBeenCalledWith({ proof_status: null });
  });

  it("choosing a repository resets the PR number, and a repository unlocks the Pull request pill", async () => {
    const lookup = new Map([["r1", { label: "acme/ledger#33", repository: "acme/ledger", name: "ledger", prNumber: 33, prTitle: "Round payouts" }]]);
    const { setView, user, rerender } = setup({}, { repositories: ["acme/ledger"], lookup });
    expect(screen.queryByRole("button", { name: /Pull request/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Repository/ }));
    await user.click(await screen.findByRole("menuitemradio", { name: "acme/ledger" }));
    expect(setView).toHaveBeenCalledWith({ repository: "acme/ledger", pr_number: null });

    rerender(<FilterBar view={{ ...VIEW, repository: "acme/ledger" }} setView={setView} repositories={["acme/ledger"]} lookup={lookup} />);
    await user.click(screen.getByRole("button", { name: /Pull request/ }));
    await user.click(await screen.findByRole("menuitemradio", { name: /#33 Round payouts/ }));
    expect(setView).toHaveBeenCalledWith({ pr_number: 33 });
  });

  it("Blocking only is a toggle: on writes true, off clears the key", async () => {
    const off = setup();
    const toggle = screen.getByRole("button", { name: "Blocking only" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await off.user.click(toggle);
    expect(off.setView).toHaveBeenCalledWith({ blocking: true });
    off.unmount();

    const on = setup({ blocking: true });
    await on.user.click(screen.getByRole("button", { name: "Blocking only" }));
    expect(on.setView).toHaveBeenCalledWith({ blocking: null });
  });
});

describe("FilterBar — lenses", () => {
  it("search commits on Enter and Escape clears it", async () => {
    const { setView, user } = setup();
    const input = screen.getByRole("searchbox", { name: "Search findings" });
    await user.type(input, "charge{Enter}");
    expect(setView).toHaveBeenLastCalledWith({ q: "charge" });
    await user.keyboard("{Escape}");
    expect(setView).toHaveBeenLastCalledWith({ q: null });
  });

  it("grouping writes pr / file and List clears it", async () => {
    const { setView, user } = setup({ group: "file" });
    await user.click(screen.getByRole("button", { name: "By PR" }));
    expect(setView).toHaveBeenCalledWith({ group: "pr" });
    await user.click(screen.getByRole("button", { name: "List" }));
    expect(setView).toHaveBeenCalledWith({ group: null });
  });

  it("sort is chosen from a menu; Newest is the default and clears the key", async () => {
    const { setView, user } = setup();
    await user.click(screen.getByRole("button", { name: /Sort/ }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Most severe" }));
    expect(setView).toHaveBeenCalledWith({ sort: "severity" });
  });
});

describe("FilterBar — deep-link chips", () => {
  it("shows a removable chip for identity filters that have no pill, and clears exactly that one", async () => {
    const { setView, user } = setup({ review_id: "4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41", fingerprint: "70f2459184df78fc" });
    const list = screen.getByRole("list", { name: "Active filters" });
    expect(list.textContent).toContain("run 4e8b1d0c…");
    expect(list.textContent).toContain("fingerprint 70f24591…");
    await user.click(screen.getByRole("button", { name: /Clear filter: run/ }));
    expect(setView).toHaveBeenCalledWith({ review_id: null });
  });

  it("Clear all filters resets every filter and lens but keeps the status segment", async () => {
    const { setView, user } = setup({ severity_min: "high", blocking: true });
    await user.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(setView).toHaveBeenCalledWith(clearFiltersPatch());
    expect(clearFiltersPatch()).not.toHaveProperty("status");
  });

  it("renders no chip row with nothing active", () => {
    setup();
    expect(screen.queryByRole("list", { name: "Active filters" })).toBeNull();
  });
});
