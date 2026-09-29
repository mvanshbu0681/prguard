// OWNER: d5 (wave 3). The brief's "accuracy window filter in the URL" test.
// @/lib/hooks is mocked (a unit test of the route's composition, not of the
// network path) and nuqs's own NuqsTestingAdapter stands in for the app
// router — onUrlUpdate is the spy the brief's assertion reads.
import "../../../../tests/unit/charts/dom-polyfills";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { describe, expect, it, vi } from "vitest";
import type { AccuracyReport } from "@/lib/api-types";

const metric = (n: number): AccuracyReport["precision_proxies"]["execution_verified_precision"] => ({ value: 0.91, n, definition: "…" });

const REPORT: AccuracyReport = {
  window: { since: null, until: null, repository: null },
  runs: { total: 76, succeeded: 70, failed: 4, cancelled: 2, median_duration_seconds: 41.2 },
  findings: { proposed: 900, published: 240, suppressed: 30, dropped_by_coordinator: 600, per_review_published_mean: 3.2 },
  proof: { attempted: 537, proven: 312, disproven: 75, inconclusive: 80, skipped_no_env: 70, proven_rate: 0.581, disproven_rate: 0.14 },
  precision_proxies: {
    execution_verified_precision: metric(312),
    self_caught_false_positive_rate: metric(537),
    human_dismissal_rate: metric(240),
    addressed_rate: metric(120),
  },
  gate: { runs_red: 3, runs_green: 65, runs_neutral: 8, break_glass_overrides: 0 },
  caveats: [],
};

vi.mock("@/lib/hooks", () => ({
  useAccuracy: (filter: { since?: string | null; until?: string | null }) => ({
    data: { ...REPORT, window: { since: filter?.since ?? null, until: filter?.until ?? null, repository: null } },
    isPending: false,
    isError: false,
  }),
  auditHref: (path: string) => path,
}));

const { AccuracyRoute } = await import("./AccuracyRoute");
const { corpusFromFixtures, windowedAccuracy } = await import("./corpus-window");
const fx = {
  reviews: (await import("@fixtures/reviews/index.json")).default as unknown as { items: never[] },
  findings: (await import("@fixtures/findings/index.json")).default as unknown as { items: never[] },
  audit: (await import("@fixtures/audit/events.json")).default as unknown as { items: never[] },
  report: (await import("@fixtures/accuracy/report.json")).default as unknown as AccuracyReport,
};
const CORPUS = corpusFromFixtures({ reviews: fx.reviews.items, findings: fx.findings.items, audit: fx.audit.items, report: fx.report });

const EMPTY_SERIES = { weekly: [], dismissal_by_category: [], calibration: [], raw_counts: {} };

describe("AccuracyRoute — the numbers on screen are the report's", () => {
  it("writes the headline from the counts and shows each proxy's value, n and interval", () => {
    render(<AccuracyRoute series={EMPTY_SERIES} />, { wrapper: withNuqsTestingAdapter() });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("312 bugs proven by execution, and 75 of its own claims refuted first.");
    // All four proxies render the backend's rounded value, with n in plain words and a 95% interval.
    expect(screen.getAllByText("0.910")).toHaveLength(4);
    expect(screen.getByText(/284 of 312 executed, published findings held up/)).toBeInTheDocument();
    expect(screen.getAllByText(/95% interval 0\.\d{3}–0\.\d{3}/).length).toBeGreaterThanOrEqual(4);
    // The API's own definitions are one disclosure away, verbatim.
    expect(screen.getByText("How these are computed")).toBeInTheDocument();
    // The gate: 3 red of 76 verdicts.
    expect(screen.getByText(/of 76 gates held a merge/)).toBeInTheDocument();
  });
});

describe("AccuracyRoute — the window filter lives in the URL", () => {
  it("a preset writes a whole-day since from the corpus's frozen now, and leaves until open", async () => {
    const onUrlUpdate = vi.fn();
    render(<AccuracyRoute series={EMPTY_SERIES} />, { wrapper: withNuqsTestingAdapter({ onUrlUpdate, hasMemory: true }) });

    fireEvent.click(screen.getByRole("button", { name: "7 days" }));

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const last = onUrlUpdate.mock.calls.at(-1)![0] as { searchParams: URLSearchParams };
    expect(last.searchParams.get("since")).toBe("2026-09-16");
    expect(last.searchParams.get("until")).toBeNull();
  });

  it("setting Since pushes ?since=… into the URL", async () => {
    const onUrlUpdate = vi.fn();
    render(<AccuracyRoute series={EMPTY_SERIES} />, { wrapper: withNuqsTestingAdapter({ onUrlUpdate, hasMemory: true }) });

    fireEvent.change(screen.getByLabelText("Since"), { target: { value: "2026-08-01" } });

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const last = onUrlUpdate.mock.calls.at(-1)![0] as { searchParams: URLSearchParams };
    expect(last.searchParams.get("since")).toBe("2026-08-01");
  });

  it("setting Until pushes ?until=… into the URL, alongside an already-set Since", async () => {
    const onUrlUpdate = vi.fn();
    render(<AccuracyRoute series={EMPTY_SERIES} />, {
      wrapper: withNuqsTestingAdapter({ onUrlUpdate, hasMemory: true, searchParams: "?since=2026-08-01" }),
    });

    fireEvent.change(screen.getByLabelText("Until"), { target: { value: "2026-09-01" } });

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const last = onUrlUpdate.mock.calls.at(-1)![0] as { searchParams: URLSearchParams };
    expect(last.searchParams.get("since")).toBe("2026-08-01");
    expect(last.searchParams.get("until")).toBe("2026-09-01");
  });

  it("a URL that already carries the window hydrates the two date inputs from it", async () => {
    render(<AccuracyRoute series={EMPTY_SERIES} />, {
      wrapper: withNuqsTestingAdapter({ searchParams: "?since=2026-08-01&until=2026-09-01" }),
    });
    expect(screen.getByLabelText("Since")).toHaveValue("2026-08-01");
    expect(screen.getByLabelText("Until")).toHaveValue("2026-09-01");
  });

  it("Clear removes both params from the URL", async () => {
    const onUrlUpdate = vi.fn();
    render(<AccuracyRoute series={EMPTY_SERIES} />, {
      wrapper: withNuqsTestingAdapter({ onUrlUpdate, hasMemory: true, searchParams: "?since=2026-08-01&until=2026-09-01" }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const last = onUrlUpdate.mock.calls.at(-1)![0] as { searchParams: URLSearchParams };
    expect(last.searchParams.get("since")).toBeNull();
    expect(last.searchParams.get("until")).toBeNull();
  });
});

describe("AccuracyRoute — a window really changes the numbers in fixture mode", () => {
  it("recomputes the report for the window from the corpus, and says which window it is", () => {
    render(<AccuracyRoute series={EMPTY_SERIES} corpus={CORPUS} />, { wrapper: withNuqsTestingAdapter({ searchParams: "?since=2026-09-16" }) });
    const expected = windowedAccuracy(CORPUS, "2026-09-16T00:00:00.000Z", null).report;
    expect(expected.runs.total).toBeLessThan(76);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`${expected.proof.proven} bugs proven by execution`);
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(screen.getByText("Last 7 days").closest("p")).toHaveTextContent(`${expected.runs.total} runs graded`);
  });

  it("refuses an inverted range inline and never writes it to the URL", async () => {
    const onUrlUpdate = vi.fn();
    render(<AccuracyRoute series={EMPTY_SERIES} corpus={CORPUS} />, {
      wrapper: withNuqsTestingAdapter({ onUrlUpdate, hasMemory: true, searchParams: "?until=2026-08-01" }),
    });
    fireEvent.change(screen.getByLabelText("Since"), { target: { value: "2026-09-01" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/can't be after To/);
    expect(onUrlUpdate).not.toHaveBeenCalled();
  });

  it("an inverted range that arrives in the URL is flagged and not applied", () => {
    render(<AccuracyRoute series={EMPTY_SERIES} corpus={CORPUS} />, {
      wrapper: withNuqsTestingAdapter({ searchParams: "?since=2026-09-01&until=2026-08-01" }),
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/isn't applied/);
    // Not applied: the page is the all-time report (the mocked query), not an empty window.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("312 bugs proven by execution");
  });
});
