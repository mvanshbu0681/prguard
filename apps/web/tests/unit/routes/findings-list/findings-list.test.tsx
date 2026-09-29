// <FindingsList> — one composed row per finding (rail, titled claim, where,
// who, proof and score), the grouped variant, and the keyboard contract.
// Plus the summary facets: the per-count API reads must add up to exactly what
// the rows themselves say.
import "../../ui/dom-polyfills";
import { render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setTransportBase } from "@/api/transport";
import { FindingsList } from "@/components/routes/findings-list/FindingsList";
import { groupFindings, summarize, type RepoLookupEntry } from "@/components/routes/findings-list/format";
import { useSummaryFacets } from "@/components/routes/findings-list/use-facets";
import type { Finding } from "@/lib/api-types";
import { FINDINGS, F1, F2, F3, queryWrapper, REVIEW_A, testResolver } from "../../data/sample-corpus";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => setTransportBase(null));

const LOOKUP = new Map<string, RepoLookupEntry>([
  [REVIEW_A, { label: "acme/checkout-service#4821", repository: "acme/checkout-service", name: "checkout-service", prNumber: 4821, prTitle: "Resolve account currency" }],
]);

function titled(f: Finding, title: string): Finding {
  return { ...f, title };
}

describe("FindingsList — a row", () => {
  it("renders the claim with inline code, where it lives, who raised it, proof and the score", () => {
    const row = titled({ ...F1, specialist: "bugs" }, "`charge()` dereferences a None currency");
    render(<FindingsList rows={[row]} groups={null} lookup={LOOKUP} showState={false} onOpen={vi.fn()} />);
    const el = screen.getByRole("row");
    expect(el.querySelector("code")?.textContent).toBe("charge()");
    expect(el.textContent).toContain("checkout-service #4821");
    expect(el.textContent).toContain("app/checkout.py:41");
    expect(el.textContent).toContain("Bugs");
    // The proof and gate tags render in the side column and again in the meta line;
    // CSS shows exactly one of the two per breakpoint.
    expect(within(el).getAllByText("Proven")).toHaveLength(2);
    expect(within(el).getAllByText("Blocks merge")).toHaveLength(2);
    expect(within(el).getAllByText("0.81").length).toBeGreaterThan(0);
    expect(within(el).getByRole("link")).toHaveAttribute("href", `/findings/${F1.id}`);
  });

  it("strikes a refuted claim and, in the All view, quiets rows that never reached a PR", () => {
    render(<FindingsList rows={[F2, F3]} groups={null} lookup={LOOKUP} showState onOpen={vi.fn()} />);
    const [refuted, published] = screen.getAllByRole("row");
    expect(refuted).toHaveAttribute("data-refuted");
    expect(refuted).toHaveAttribute("data-muted");
    expect(published).not.toHaveAttribute("data-muted");
  });

  it("never prints a 'Not applicable' proof tag, and names the band only for assistive tech", () => {
    const row = { ...F3, proof: { ...F3.proof!, status: "not_applicable" as const } };
    render(<FindingsList rows={[row]} groups={null} lookup={LOOKUP} showState={false} onOpen={vi.fn()} />);
    const el = screen.getByRole("row");
    expect(within(el).queryByText("N/A")).toBeNull();
    expect(within(el).getByText("high severity")).toHaveClass("sr-only");
  });

  it("prints Unscored rather than inventing a number for a finding with no severity", () => {
    render(<FindingsList rows={[{ ...F3, severity: null }]} groups={null} lookup={LOOKUP} showState={false} onOpen={vi.fn()} />);
    expect(screen.getByText("Unscored")).toBeInTheDocument();
  });
});

describe("FindingsList — grouping", () => {
  it("renders one labelled row group per pull request, rows in order", () => {
    const rows = [F1, F2, F3];
    const groups = groupFindings(rows, "pr", LOOKUP);
    render(<FindingsList rows={rows} groups={groups} lookup={LOOKUP} showState={false} onOpen={vi.fn()} />);
    const group = screen.getByRole("rowgroup", { name: /checkout-service #4821/ });
    expect(within(group).getAllByRole("row")).toHaveLength(3);
    expect(group.textContent).toContain("3 findings");
  });
});

describe("FindingsList — keyboard", () => {
  it("is one roving Tab stop; j moves real focus and Enter opens the focused row", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<FindingsList rows={[F1, F2, F3]} groups={null} lookup={LOOKUP} showState={false} onOpen={onOpen} />);
    const rows = screen.getAllByRole("row");
    expect(rows.filter((r) => r.getAttribute("tabindex") === "0")).toHaveLength(1);
    rows[0].focus();
    await user.keyboard("j");
    expect(rows[1]).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].id).toBe(F2.id);
  });
});

describe("useSummaryFacets — the API's counts equal the rows' own composition", () => {
  it("with no filter", async () => {
    const { resolver } = testResolver();
    setTransportBase(async (input) => resolver(input as Request));
    const { Wrapper } = queryWrapper();
    const { result } = renderHook(() => useSummaryFacets({}, FINDINGS.length, true), { wrapper: Wrapper });
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current).toEqual(summarize(FINDINGS));
  });

  it("under a severity floor (bands below it are 0, not queried)", async () => {
    const { resolver } = testResolver();
    setTransportBase(async (input) => resolver(input as Request));
    const { Wrapper } = queryWrapper();
    const rank = { info: 0, low: 1, medium: 2, high: 3, critical: 4 } as const;
    const kept = FINDINGS.filter((f) => f.severity && rank[f.severity.band] >= rank.high);
    const { result } = renderHook(() => useSummaryFacets({ severity_min: "high" }, kept.length, true), { wrapper: Wrapper });
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current).toEqual(summarize(kept));
  });

  it("is undefined while disabled (a lens computes the summary from rows instead)", () => {
    const { Wrapper } = queryWrapper();
    const { result } = renderHook(() => useSummaryFacets({}, 7, false), { wrapper: Wrapper });
    expect(result.current).toBeUndefined();
  });
});
