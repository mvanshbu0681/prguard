import { describe, expect, it } from "vitest";
import type { Finding } from "@/lib/api-types";
import { FORK_LANES } from "@/lib/pipeline-geometry";
import { specialistCounts } from "./specialist-counts";

function finding(specialist: string | null): Finding {
  return {
    id: "f",
    review_id: "r",
    specialist,
    category: "correctness",
    rule_key: "x",
    title: "t",
    body_markdown: "",
    location: { file_path: "a.py" },
    status: "published",
    blocking: false,
    created_at: "2026-01-01T00:00:00Z",
  } as Finding;
}

describe("specialistCounts", () => {
  it("has one entry per lane, FORK_LANES order, even when a lane has no findings", () => {
    const counts = specialistCounts([]);
    expect(Object.keys(counts)).toEqual([...FORK_LANES]);
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });

  it("matches the demo run's own distribution (bugs 4, security 2, tests 2, quality 4)", () => {
    const findings = [
      ...Array(4).fill(null).map(() => finding("bugs")),
      ...Array(2).fill(null).map(() => finding("security")),
      ...Array(2).fill(null).map(() => finding("tests")),
      ...Array(4).fill(null).map(() => finding("quality")),
    ];
    expect(specialistCounts(findings)).toEqual({ bugs: 4, security: 2, tests: 2, quality: 4 });
  });

  it("ignores a finding with no specialist, or one outside the four lanes, rather than crashing", () => {
    expect(specialistCounts([finding(null), finding("coordinator")])).toEqual({ bugs: 0, security: 0, tests: 0, quality: 0 });
  });
});
