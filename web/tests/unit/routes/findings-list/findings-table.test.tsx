// OWNER: d2 (wave 3). <FindingsTable> — column formatting through the real
// composed cells (ContributionBar/ProofChip/StatusBadge/GateChip), and
// virtualization: @tanstack/react-virtual has no ResizeObserver in jsdom (see
// dom-polyfills' stub), so it renders from the `initialRect` fallback
// FindingsTable.tsx passes it — this asserts that fallback actually keeps the
// row count small, not that every row of a 300-row page is in the DOM.
import "../../ui/dom-polyfills";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { FindingsTable } from "@/components/routes/findings-list/FindingsTable";
import type { Finding } from "@/lib/api-types";

// jsdom does no layout: offsetWidth/offsetHeight are always 0, which is what
// @tanstack/react-virtual actually reads for its scroll container (not
// getBoundingClientRect, and not FindingsTable's own `initialRect` fallback —
// that only covers a element with NO ResizeObserver at all, and dom-polyfills'
// stub means one exists, so the library trusts its first, real 0x0 read). A
// fixed offsetHeight is the standard shim for testing a virtualized list under
// jsdom; scoped to this file only.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 480 });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 1200 });
});

function finding(i: number, overrides: Partial<Finding> = {}): Finding {
  return {
    id: `finding-${i}`,
    review_id: "review-1",
    fingerprint: i % 3 === 0 ? null : `${"a91f3c2e4b7d4e19".slice(0, 8)}${i}`,
    specialist: "security",
    category: "correctness",
    rule_key: "some_rule",
    title: `Finding number ${i}`,
    body_markdown: "…",
    location: { file_path: `app/billing/charge_${i}.py`, start_line: 10 + i, end_line: null, side: "RIGHT", language: "python", symbol_path: null },
    severity:
      i % 4 === 0
        ? null
        : {
            band: "high",
            score: 0.69,
            inputs: { path_sensitivity: 1, reachability: 0.9, blast_radius: 0.55, coverage_gap: 0.8, proof_confidence: 0.95, churn: 0.35 },
            weights: { path_sensitivity: 0.25, reachability: 0.2, blast_radius: 0.15, coverage_gap: 0.15, proof_confidence: 0.15, churn: 0.1 },
            explanation: "",
            notes: [],
          },
    proof: { status: "not_attempted", runner: null, isolation: null, baseline_mode: null, test_file_path: null, test_code: null, command: null, base: null, head: null, duration_ms: null, deps_install_ok: null },
    status: "proposed",
    blocking: i === 5,
    delivery: null,
    history: null,
    suppression: null,
    created_at: new Date(Date.now() - i * 3_600_000).toISOString(),
    ...overrides,
  };
}

const ROWS = Array.from({ length: 300 }, (_, i) => finding(i));

function renderTable(overrides: Partial<ComponentProps<typeof FindingsTable>> = {}) {
  const onOpenRow = vi.fn();
  const onLoadMore = vi.fn();
  const utils = render(
    <FindingsTable
      rows={ROWS}
      repoLookup={new Map([["review-1", { label: "acme/checkout-service#4821", repository: "acme/checkout-service" }]])}
      density="default"
      isInitialLoading={false}
      hasNextPage={false}
      isFetchingNextPage={false}
      onLoadMore={onLoadMore}
      onOpenRow={onOpenRow}
      height="480px"
      {...overrides}
    />,
  );
  return { ...utils, onOpenRow, onLoadMore };
}

describe("FindingsTable — virtualization", () => {
  it("renders far fewer rows than the full page (300) at a bounded height", () => {
    renderTable();
    const dataRows = screen.getAllByRole("row").filter((r) => r.hasAttribute("data-index"));
    expect(dataRows.length).toBeGreaterThan(0);
    expect(dataRows.length).toBeLessThan(ROWS.length / 2);
  });

  it("still exposes the true row count for a screen reader (aria-rowcount)", () => {
    renderTable();
    expect(screen.getByRole("grid", { name: "Findings" })).toHaveAttribute("aria-rowcount", String(ROWS.length));
  });
});

describe("FindingsTable — column formatting (the real composed components, not a re-drawn encoding)", () => {
  it("severity: the glyph's aria-label carries the 3-decimal score and band; a null severity prints the dash", () => {
    renderTable();
    expect(screen.getAllByLabelText("severity 0.690, high").length).toBeGreaterThan(0);
    // finding-0 has i % 4 === 0 → no severity.
    const row0 = screen.getByText("Finding number 0").closest("tr")!;
    expect(row0.textContent).toContain("—");
  });

  it("location is middle-truncated, mono, with the full string as a title tooltip", () => {
    renderTable({ rows: [finding(1, { location: { file_path: "app/billing/very/deeply/nested/module/charge.py", start_line: 41, end_line: null, side: "RIGHT", language: "python", symbol_path: null } })] });
    const cell = screen.getByTitle("app/billing/very/deeply/nested/module/charge.py:41");
    expect(cell.textContent).toContain("…");
    expect(cell.textContent).toMatch(/charge\.py:41$/);
  });

  it("proof renders the real ProofChip, defaulting to not_attempted when proof is null", () => {
    renderTable({ rows: [finding(2, { proof: null })] });
    expect(screen.getByText("NOT ATTEMPTED")).toBeInTheDocument();
  });

  it("status renders the real StatusBadge", () => {
    renderTable({ rows: [finding(3, { status: "published" })] });
    expect(screen.getByText("PUBLISHED")).toBeInTheDocument();
  });

  it("blocking renders a BLOCKED GateChip only when true, and a dash otherwise", () => {
    renderTable({ rows: [finding(4, { blocking: true }), finding(6, { blocking: false })] });
    expect(screen.getByText("BLOCKED")).toBeInTheDocument();
  });

  it("repository#PR comes from the review_id join, not from the finding itself", () => {
    renderTable({ rows: [finding(7)] });
    expect(screen.getByText("acme/checkout-service#4821")).toBeInTheDocument();
  });

  it("fingerprint shows the first 8 characters, bare (the table's own convention, unlike a filter chip's)", () => {
    renderTable({ rows: [finding(9, { fingerprint: "0123456789abcdef" })] });
    expect(screen.getByText("01234567")).toBeInTheDocument();
  });

  it("score is 3 decimals, tabular, separate from the severity glyph", () => {
    renderTable({ rows: [finding(11)] });
    expect(screen.getByText("0.690")).toBeInTheDocument();
  });
});

describe("FindingsTable — interaction", () => {
  it("clicking a row opens it", async () => {
    const user = userEvent.setup();
    const { onOpenRow } = renderTable({ rows: [finding(0), finding(1), finding(2)] });
    await user.click(screen.getByText("Finding number 1"));
    expect(onOpenRow).toHaveBeenCalledTimes(1);
    expect(onOpenRow.mock.calls[0][0].id).toBe("finding-1");
  });

  it("j then Enter on the focused grid opens the second row", async () => {
    const user = userEvent.setup();
    const { onOpenRow } = renderTable({ rows: [finding(0), finding(1), finding(2)] });
    // The grid wrapper itself is not a Tab stop (dashboard §1.5: one roving-tabindex
    // stop, not two) — real DOM focus starts on the active row, tabIndex 0.
    screen.getAllByRole("row").find((r) => r.getAttribute("tabindex") === "0")!.focus();
    await user.keyboard("j{Enter}");
    expect(onOpenRow).toHaveBeenCalledTimes(1);
    expect(onOpenRow.mock.calls[0][0].id).toBe("finding-1");
  });

  it("the grid wrapper carries no tabIndex of its own — the active row is the single Tab stop (dashboard §1.5)", () => {
    renderTable({ rows: [finding(0), finding(1), finding(2)] });
    const grid = screen.getByRole("grid", { name: "Findings" });
    expect(grid).not.toHaveAttribute("tabindex");
    const rows = screen.getAllByRole("row").filter((r) => r.hasAttribute("data-index"));
    expect(rows.filter((r) => r.getAttribute("tabindex") === "0")).toHaveLength(1);
  });

  it("the initial-loading state renders the real header plus skeleton rows, not the data", () => {
    renderTable({ isInitialLoading: true });
    expect(screen.getByText("Severity")).toBeInTheDocument();
    expect(screen.queryByText("Finding number 0")).not.toBeInTheDocument();
  });
});
