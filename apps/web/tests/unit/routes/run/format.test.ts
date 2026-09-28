// OWNER: d1 (wave 3). Pure logic behind /runs/[id] (track brief: "TESTS: mode selection by
// status; the ladder breakdown sums to published; cost/token formatting").
import { describe, expect, it } from "vitest";
import {
  cacheHitShare,
  formatDurationSeconds,
  formatElapsed,
  formatPercent,
  formatTokenCount,
  formatUsd,
  ladderTotal,
  ladderUnaccounted,
  NO_VALUE,
  runMode,
} from "@/components/routes/run/format";

describe("runMode", () => {
  it("reads LIVE while queued or running", () => {
    expect(runMode("queued")).toBe("live");
    expect(runMode("running")).toBe("live");
  });

  it("reads RESULT once terminal", () => {
    expect(runMode("succeeded")).toBe("result");
    expect(runMode("failed")).toBe("result");
    expect(runMode("cancelled")).toBe("result");
  });

  it("treats an unknown status as LIVE rather than a premature RESULT", () => {
    expect(runMode(null)).toBe("live");
    expect(runMode(undefined)).toBe("live");
  });
});

describe("formatTokenCount", () => {
  it("thin-space groups from the right, in threes", () => {
    expect(formatTokenCount(97763)).toBe("97 763");
    expect(formatTokenCount(201759)).toBe("201 759");
    expect(formatTokenCount(52484)).toBe("52 484");
    expect(formatTokenCount(7)).toBe("7");
    expect(formatTokenCount(0)).toBe("0");
  });

  it("prints NO_VALUE for a missing count, never an invented zero", () => {
    expect(formatTokenCount(null)).toBe(NO_VALUE);
    expect(formatTokenCount(undefined)).toBe(NO_VALUE);
    expect(formatTokenCount(Number.NaN)).toBe(NO_VALUE);
  });
});

describe("formatUsd", () => {
  it("renders to exactly 4 decimals", () => {
    expect(formatUsd(1.4496)).toBe("$1.4496");
    expect(formatUsd(0)).toBe("$0.0000");
    expect(formatUsd(0.001)).toBe("$0.0010");
  });

  it("prints NO_VALUE for a missing estimate", () => {
    expect(formatUsd(null)).toBe(NO_VALUE);
    expect(formatUsd(undefined)).toBe(NO_VALUE);
  });
});

describe("formatDurationSeconds / formatElapsed", () => {
  it("keeps one decimal on the recorded duration", () => {
    expect(formatDurationSeconds(41.2)).toBe("41.2s");
    expect(formatDurationSeconds(0)).toBe("0.0s");
  });

  it("formats the ticking elapsed readout as Ns or Nm SSs", () => {
    expect(formatElapsed(9)).toBe("9s");
    expect(formatElapsed(65)).toBe("1m 05s");
    expect(formatElapsed(3661)).toBe("61m 01s");
  });

  it("prints NO_VALUE for a negative or missing value, never a fabricated one", () => {
    expect(formatDurationSeconds(null)).toBe(NO_VALUE);
    expect(formatElapsed(-1)).toBe(NO_VALUE);
    expect(formatElapsed(null)).toBe(NO_VALUE);
  });
});

describe("cacheHitShare / formatPercent", () => {
  it("matches the demo run's own numbers (input 97763, cache read 201759)", () => {
    const share = cacheHitShare(201759, 97763);
    expect(share).toBeCloseTo(201759 / 299522, 10);
    expect(formatPercent(share)).toBe("67%");
  });

  it("is null (not zero, not NaN) when nothing has been billed yet", () => {
    expect(cacheHitShare(0, 0)).toBeNull();
    expect(cacheHitShare(undefined, undefined)).toBeNull();
    expect(formatPercent(null)).toBe(NO_VALUE);
  });
});

describe("ladder accounting", () => {
  it("sums the four rungs, matching the demo run's real ladder (1+1+1+0 = 3)", () => {
    const ladder = { inline_exact: 1, inline_nearest: 1, file_level: 1, summary_only: 0 };
    expect(ladderTotal(ladder)).toBe(3);
    expect(ladderUnaccounted(3, ladder)).toBe(0);
  });

  it("treats a missing ladder as zero, never throwing", () => {
    expect(ladderTotal(null)).toBe(0);
    expect(ladderTotal(undefined)).toBe(0);
  });

  it("flags a mismatch instead of silently rendering 0 silently dropped", () => {
    const ladder = { inline_exact: 1, inline_nearest: 0, file_level: 0, summary_only: 0 };
    // published (3) says three findings reached the pull request; only one rung is accounted for.
    expect(ladderUnaccounted(3, ladder)).toBe(2);
  });
});
