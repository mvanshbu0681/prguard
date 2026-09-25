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
}));

const { AccuracyRoute } = await import("./AccuracyRoute");

const EMPTY_SERIES = { weekly: [], dismissal_by_category: [], calibration: [], raw_counts: {} };

describe("AccuracyRoute — the window filter lives in the URL", () => {
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

  it("CLEAR removes both params from the URL", async () => {
    const onUrlUpdate = vi.fn();
    render(<AccuracyRoute series={EMPTY_SERIES} />, {
      wrapper: withNuqsTestingAdapter({ onUrlUpdate, hasMemory: true, searchParams: "?since=2026-08-01&until=2026-09-01" }),
    });

    fireEvent.click(screen.getByRole("button", { name: "CLEAR" }));

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const last = onUrlUpdate.mock.calls.at(-1)![0] as { searchParams: URLSearchParams };
    expect(last.searchParams.get("since")).toBeNull();
    expect(last.searchParams.get("until")).toBeNull();
  });
});
