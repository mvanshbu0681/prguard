// OWNER: d4 (wave 3). Pure formatting/derivation for /suppressions (no React).
import { describe, expect, it } from "vitest";
import { formatRelativeDay, formatUtcDate, formatUtcStamp, ledgerState, matchLabel, shortSuppressionId } from "@/components/routes/suppressions/format";
import { SUPPRESSIONS } from "@/lib/fixture-sample";

describe("formatUtcStamp / formatUtcDate", () => {
  it("prints a full absolute UTC stamp with Z, unlike ChainRail's time-of-day-only form", () => {
    expect(formatUtcStamp("2026-09-19T14:22:07.483Z")).toBe("2026-09-19 14:22:07Z");
  });
  it("prints just the date for an expiry line", () => {
    expect(formatUtcDate("2026-10-15T00:00:00Z")).toBe("2026-10-15");
  });
  it("passes through an unparsable string rather than throwing", () => {
    expect(formatUtcStamp("not-a-date")).toBe("not-a-date");
  });
});

describe("formatRelativeDay", () => {
  const now = new Date("2026-09-20T00:00:00Z").getTime();
  it("reads 'today' for the same day", () => {
    expect(formatRelativeDay("2026-09-20T08:00:00Z", now)).toBe("today");
  });
  it("reads a future day as 'in N days'", () => {
    expect(formatRelativeDay("2026-10-01T00:00:00Z", now)).toBe("in 11 days");
    expect(formatRelativeDay("2026-09-21T00:00:00Z", now)).toBe("in 1 day");
  });
  it("reads a past day as 'N days ago'", () => {
    expect(formatRelativeDay("2026-09-15T00:00:00Z", now)).toBe("5 days ago");
    expect(formatRelativeDay("2026-09-19T00:00:00Z", now)).toBe("1 day ago");
  });
});

describe("matchLabel", () => {
  it("prefers match_path when the row has one", () => {
    expect(matchLabel(SUPPRESSIONS[0]!)).toBe("vendor/**");
  });
  it("falls back to rule_key when there is no match_path", () => {
    expect(matchLabel(SUPPRESSIONS[1]!)).toBe("rule bare_except");
  });
  it("falls back to an em dash when the row carries neither (never fabricates a value)", () => {
    expect(matchLabel({ ...SUPPRESSIONS[1]!, rule_key: null, match_path: null })).toBe("—");
  });
});

describe("shortSuppressionId", () => {
  it("takes the first 8 characters", () => {
    expect(shortSuppressionId("s1000000-0000-4000-8000-000000000001")).toBe("s1000000");
  });
});

describe("ledgerState (re-exported from @/lib/fixture-query)", () => {
  it("revoked_at wins over everything else", () => {
    expect(ledgerState(SUPPRESSIONS[2]!, Date.now())).toBe("revoked");
  });
  it("an explicit active:false row (computed at corpus generation time) reads expired", () => {
    expect(ledgerState(SUPPRESSIONS[1]!, Date.now())).toBe("expired");
  });
  it("active:true with no expiry reads active", () => {
    expect(ledgerState(SUPPRESSIONS[0]!, Date.now())).toBe("active");
  });
});

describe("scope, expiry and hash helpers", () => {
  it("orders scopes by reach, one finding (1) to every repository (5)", async () => {
    const { scopeLevel, SCOPE_ORDER } = await import("@/components/routes/suppressions/format");
    expect(SCOPE_ORDER.map(scopeLevel)).toEqual([1, 2, 3, 4, 5]);
    expect(scopeLevel("tenant")).toBe(5);
  });
  it("counts whole days to an expiry, negative once passed, null when open-ended", async () => {
    const { daysUntil } = await import("@/components/routes/suppressions/format");
    const now = Date.parse("2026-09-23T12:00:00Z");
    expect(daysUntil("2026-10-15T00:00:00Z", now)).toBe(22);
    expect(daysUntil("2026-09-10T00:00:00Z", now)).toBe(-13);
    expect(daysUntil(null, now)).toBeNull();
  });
  it("prints a compact countdown: days under 60, then weeks, then months", async () => {
    const { compactDays } = await import("@/components/routes/suppressions/format");
    expect(compactDays(22)).toBe("22d");
    expect(compactDays(63)).toBe("9w");
    expect(compactDays(200)).toBe("7mo");
  });
  it("abbreviates a 64-hex hash as first 8 … last 4, and leaves short strings whole", async () => {
    const { shortHash } = await import("@/components/routes/suppressions/format");
    expect(shortHash("70f2459184df78fcdcbae1df66c153908fbaa353d9d8658c11b4b31d5d67333d")).toBe("70f24591…333d");
    expect(shortHash("abc")).toBe("abc");
    expect(shortHash(null)).toBe("—");
  });
});
