// OWNER: d5 (wave 3). The brief's "overview links" test: the recent-runs
// table links each row to /runs/<id>, the headline metrics link to /accuracy,
// and the demo run panel links to /runs/<demo id>. @/lib/hooks is mocked —
// these are unit tests of the route's composition, not of the fixture
// resolver's network path (which fetches real JSON over HTTP and belongs to
// t2a's own suite).
import "../../ui/dom-polyfills";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_IDS } from "@/lib/demo-ids";
import type { ReviewListItem } from "@/lib/api-types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// `vi.doMock` only changes what a FUTURE import resolves to — a route module
// already imported in an earlier test stays cached with its old mock closed
// over. Every test below resets the module registry first, so its dynamic
// `import()` re-evaluates the route against that test's own mock.
afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/hooks");
});

// Deliberately NOT plan A10's demo review id (4e8b1d0c…) — the DemoRunPanel
// "not found" case below needs a run that is genuinely a different review.
const REVIEW_ITEM: ReviewListItem = {
  review_id: "006da01c-0000-4000-8000-000000000000",
  status: "succeeded",
  trigger: "webhook",
  repository: { owner: "acme", name: "checkout-service" },
  pull_request: { number: 4821, title: "Resolve account currency at charge time", author: "mhollis" },
  risk_tier: "full",
  gate_conclusion: "failure",
  counts: { proposed: 12, published: 3, suppressed: 1, dropped: 7, disproven: 1, blocking: 1 },
  cost_usd_estimate: 1.4496,
  duration_seconds: 41.2,
  created_at: "2026-09-23T11:46:01.902000Z",
  finished_at: "2026-09-23T11:46:43.514000Z",
};

describe("RecentRunsPanel — every row links to /runs/<id>", () => {
  it("renders a real anchor for the fetched run, not a click-only row", async () => {
    vi.doMock("@/lib/hooks", () => ({
      useReviewList: () => ({ data: { items: [REVIEW_ITEM], page: { has_more: false }, totals: { matched: 1 } }, isPending: false, isError: false }),
    }));
    const { RecentRunsPanel } = await import("@/components/routes/overview/RecentRunsPanel");
    render(<RecentRunsPanel compact={false} />);
    const link = screen.getByRole("link", { name: /acme\/checkout-service#4821/ });
    expect(link).toHaveAttribute("href", `/runs/${REVIEW_ITEM.review_id}`);
  });

  it("an empty list names the filter and offers the next action, never a bare 'No data'", async () => {
    vi.doMock("@/lib/hooks", () => ({
      useReviewList: () => ({ data: { items: [], page: { has_more: false }, totals: { matched: 0 } }, isPending: false, isError: false }),
    }));
    const { RecentRunsPanel } = await import("@/components/routes/overview/RecentRunsPanel");
    render(<RecentRunsPanel compact={false} />);
    expect(screen.getByText(/No reviews yet\./)).toBeInTheDocument();
  });
});

describe("DemoRunPanel — links to /runs/<demo id>", () => {
  it("finds the demo run in the shared list and links to it", async () => {
    const demoItem: ReviewListItem = { ...REVIEW_ITEM, review_id: DEMO_IDS.demo_review_id };
    vi.doMock("@/lib/hooks", () => ({
      useReviewList: () => ({ data: { items: [demoItem], page: { has_more: false }, totals: { matched: 1 } }, isPending: false, isError: false }),
    }));
    const { DemoRunPanel } = await import("@/components/routes/overview/DemoRunPanel");
    render(<DemoRunPanel />);
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute("href", `/runs/${DEMO_IDS.demo_review_id}`);
  });

  it("renders nothing when the demo run is not in the current list, rather than a broken link", async () => {
    vi.doMock("@/lib/hooks", () => ({
      useReviewList: () => ({ data: { items: [REVIEW_ITEM], page: { has_more: false }, totals: { matched: 1 } }, isPending: false, isError: false }),
    }));
    const { DemoRunPanel } = await import("@/components/routes/overview/DemoRunPanel");
    const { container } = render(<DemoRunPanel />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("HeadlineMetrics — every card links to /accuracy", () => {
  it("wraps all three headline metrics in a link to the full report", async () => {
    const metric = (n: number) => ({ value: 0.91, n, definition: "…" });
    vi.doMock("@/lib/hooks", () => ({
      useAccuracy: () => ({
        data: {
          precision_proxies: {
            execution_verified_precision: metric(312),
            self_caught_false_positive_rate: metric(537),
            human_dismissal_rate: metric(240),
            addressed_rate: metric(120),
          },
        },
        isPending: false,
        isError: false,
      }),
    }));
    const { HeadlineMetrics } = await import("@/components/routes/overview/HeadlineMetrics");
    render(<HeadlineMetrics />);
    const links = screen.getAllByRole("link", { name: /read the full accuracy report/ });
    expect(links).toHaveLength(3);
    for (const link of links) expect(link).toHaveAttribute("href", "/accuracy");
  });
});
