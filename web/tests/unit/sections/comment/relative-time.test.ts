// OWNER: m3 (wave 3). Section 04 — "What lands in your PR".
import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "@/components/sections/comment/relative-time";

const BASE = new Date("2026-09-24T12:00:00Z").getTime();

describe("formatRelativeTime — GitHub's header chrome, computed from data (plan §14 hard rules)", () => {
  it("collapses anything under 45s to 'just now'", () => {
    expect(formatRelativeTime(new Date(BASE - 10_000).toISOString(), BASE)).toBe("just now");
  });

  it("singular minute", () => {
    expect(formatRelativeTime(new Date(BASE - 60_000).toISOString(), BASE)).toBe("1 minute ago");
  });

  it("pluralises minutes", () => {
    expect(formatRelativeTime(new Date(BASE - 5 * 60_000).toISOString(), BASE)).toBe("5 minutes ago");
  });

  it("switches to hours past ~90 minutes", () => {
    expect(formatRelativeTime(new Date(BASE - 3 * 60 * 60_000).toISOString(), BASE)).toBe("3 hours ago");
  });

  it("switches to days past ~36 hours", () => {
    expect(formatRelativeTime(new Date(BASE - 2 * 24 * 60 * 60_000).toISOString(), BASE)).toBe("2 days ago");
  });

  it("switches to weeks past ~10 days", () => {
    expect(formatRelativeTime(new Date(BASE - 14 * 24 * 60 * 60_000).toISOString(), BASE)).toBe("2 weeks ago");
  });

  it("the demo run's own finished_at renders a plausible, non-empty relative time", () => {
    const rendered = formatRelativeTime("2026-09-23T11:46:43.514000Z", BASE);
    expect(rendered).toMatch(/ago|just now/);
  });

  it("falls back to 'just now' for an unparsable timestamp rather than 'NaN ago'", () => {
    expect(formatRelativeTime("not-a-date", BASE)).toBe("just now");
  });
});
