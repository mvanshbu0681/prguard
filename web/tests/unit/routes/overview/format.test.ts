// OWNER: d5 (wave 3). Pure formatting helpers behind /overview's recent-runs table.
import { describe, expect, it } from "vitest";
import { countsSummary, formatDurationSeconds, formatUsd, formatWhen, repoPr } from "@/components/routes/overview/format";

describe("formatUsd", () => {
  it("prints to 4 decimals, tabular", () => {
    expect(formatUsd(1.4496)).toBe("$1.4496");
    expect(formatUsd(0.0412)).toBe("$0.0412");
  });
  it("null (a still-running run) prints the em dash, never $0.0000", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(undefined)).toBe("—");
  });
});

describe("formatDurationSeconds", () => {
  it("prints to 1 decimal with its unit", () => {
    expect(formatDurationSeconds(41.2)).toBe("41.2s");
  });
  it("null prints the em dash", () => {
    expect(formatDurationSeconds(null)).toBe("—");
  });
});

describe("formatWhen", () => {
  it("passes an already-second-precision ISO timestamp through unchanged", () => {
    expect(formatWhen("2026-09-23T11:46:01Z")).toBe("2026-09-23T11:46:01Z");
  });
  it("trims sub-second precision to match the product's ISO-with-Z style", () => {
    expect(formatWhen("2026-09-23T11:46:01.902000Z")).toBe("2026-09-23T11:46:01Z");
  });
  it("a missing timestamp prints the em dash", () => {
    expect(formatWhen(null)).toBe("—");
  });
});

describe("repoPr", () => {
  it("formats owner/name#number", () => {
    expect(repoPr({ repository: { owner: "acme", name: "checkout-service" }, pull_request: { number: 4821, title: null, author: null } })).toBe(
      "acme/checkout-service#4821",
    );
  });
});

describe("countsSummary", () => {
  it("names both published and blocking when the run has a blocking finding", () => {
    expect(countsSummary({ published: 3, blocking: 1 })).toBe("3 published · 1 blocking");
  });
  it("omits blocking entirely when nothing blocks — never '0 blocking'", () => {
    expect(countsSummary({ published: 5, blocking: 0 })).toBe("5 published");
  });
  it("missing fields read as 0, not undefined in the string", () => {
    expect(countsSummary({})).toBe("0 published");
  });
});
