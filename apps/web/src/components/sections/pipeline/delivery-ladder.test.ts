import { describe, expect, it } from "vitest";
import type { Finding, LadderBreakdown, ResultCounts } from "@/lib/api-types";
import { DELIVERY_RUNG_MODES, deliveryLadder, silentlyDropped } from "./delivery-ladder";

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: "f",
    review_id: "r",
    category: "correctness",
    rule_key: "x",
    title: "t",
    body_markdown: "",
    location: { file_path: "a.py", start_line: 1, end_line: 1 },
    status: "published",
    blocking: false,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Finding;
}

describe("deliveryLadder", () => {
  it("has four rungs in DELIVERY_RUNG_MODES order, never including not_delivered", () => {
    const rungs = deliveryLadder(undefined, []);
    expect(rungs.map((r) => r.mode)).toEqual([...DELIVERY_RUNG_MODES]);
    expect((rungs.map((r) => r.mode) as string[]).includes("not_delivered")).toBe(false);
  });

  it("reads every count from the ladder breakdown, never a typed literal", () => {
    const ladder: LadderBreakdown = { inline_exact: 1, inline_nearest: 1, file_level: 1, summary_only: 0 };
    const rungs = deliveryLadder(ladder, []);
    expect(rungs.map((r) => r.count)).toEqual([1, 1, 1, 0]);
  });

  it("defaults every rung to 0 when the ladder is missing, not undefined", () => {
    const rungs = deliveryLadder(undefined, []);
    expect(rungs.every((r) => r.count === 0)).toBe(true);
  });

  it("computes the inline_nearest drift note from the finding's own location, matching the fixture (delivered_line 38, end_line 35 → 3)", () => {
    const findings = [
      finding({
        location: { file_path: "app/billing/charge.py", start_line: 34, end_line: 35 },
        delivery: { mode: "inline_nearest", delivered_line: 38 },
      }),
    ];
    const rungs = deliveryLadder({ inline_nearest: 1 }, findings);
    const nearest = rungs.find((r) => r.mode === "inline_nearest");
    expect(nearest?.note).toBe("line drifted 3 lines since the diff was captured");
  });

  it("omits the drift note when no finding used inline_nearest", () => {
    const rungs = deliveryLadder({ inline_exact: 1 }, [finding({ delivery: { mode: "inline_exact", delivered_line: 44 } })]);
    expect(rungs.find((r) => r.mode === "inline_nearest")?.note).toBeUndefined();
  });

  it("never attaches a drift note to a rung other than inline_nearest", () => {
    const findings = [finding({ location: { file_path: "a.py", start_line: 1, end_line: 1 }, delivery: { mode: "inline_nearest", delivered_line: 9 } })];
    const rungs = deliveryLadder({ inline_nearest: 1 }, findings);
    expect(rungs.filter((r) => r.mode !== "inline_nearest").every((r) => r.note === undefined)).toBe(true);
  });
});

describe("silentlyDropped", () => {
  it("is 0 when every published finding reached a rung — the demo run's own invariant (3 published, 1+1+1 delivered)", () => {
    const counts: ResultCounts = { published: 3 };
    const ladder: LadderBreakdown = { inline_exact: 1, inline_nearest: 1, file_level: 1, summary_only: 0 };
    expect(silentlyDropped(counts, ladder)).toBe(0);
  });

  it("is the gap between published and delivered, computed, never asserted", () => {
    const counts: ResultCounts = { published: 5 };
    const ladder: LadderBreakdown = { inline_exact: 2, inline_nearest: 0, file_level: 0, summary_only: 0 };
    expect(silentlyDropped(counts, ladder)).toBe(3);
  });

  it("floors at 0 rather than going negative", () => {
    const counts: ResultCounts = { published: 1 };
    const ladder: LadderBreakdown = { inline_exact: 4 };
    expect(silentlyDropped(counts, ladder)).toBe(0);
  });

  it("treats a missing counts or ladder as zero, not a crash", () => {
    expect(silentlyDropped(undefined, undefined)).toBe(0);
    expect(silentlyDropped(null, null)).toBe(0);
  });
});
