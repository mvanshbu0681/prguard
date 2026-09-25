// OWNER: m5 (wave 3). Pure formatting behind section 07's two panels.
import { describe, expect, it } from "vitest";
import {
  formatExpiry,
  formatIsoDate,
  formatLineRange,
  occurrenceCaption,
  occurrenceCountPhrase,
  symbolName,
} from "@/components/sections/record/format";

describe("formatLineRange", () => {
  it("renders a range when the lines differ", () => {
    expect(formatLineRange(41, 44)).toBe("41–44");
  });
  it("renders one number when the finding is a single line", () => {
    expect(formatLineRange(41, 41)).toBe("41");
  });
});

describe("symbolName", () => {
  it("takes the trailing symbol off a file::symbol path", () => {
    expect(symbolName("app/billing/charge.py::charge")).toBe("charge");
  });
  it("returns the whole string when there is no '::'", () => {
    expect(symbolName("app/billing/charge.py")).toBe("app/billing/charge.py");
  });
});

describe("formatIsoDate", () => {
  it("keeps the date component of a full ISO instant", () => {
    expect(formatIsoDate("2026-09-23T11:46:43.519182Z")).toBe("2026-09-23");
  });
});

describe("formatExpiry", () => {
  it("prints 'no expiry' for a null expires_at — never an invented date (plan A7)", () => {
    expect(formatExpiry(null)).toBe("no expiry");
    expect(formatExpiry(undefined)).toBe("no expiry");
  });
  it("prints the expiry date when one is set", () => {
    expect(formatExpiry("2026-12-01T00:00:00Z")).toBe("expires 2026-12-01");
  });
});

describe("occurrenceCountPhrase", () => {
  it("says 'both occurrences' at exactly two — the real occurrence_count in the corpus", () => {
    expect(occurrenceCountPhrase(2)).toBe("both occurrences");
  });
  it("says 'the one occurrence' at exactly one, so a single-occurrence corpus still reads correctly", () => {
    expect(occurrenceCountPhrase(1)).toBe("the one occurrence");
  });
  it("says 'all N occurrences' at any other count, so a regenerated corpus still reads correctly", () => {
    expect(occurrenceCountPhrase(3)).toBe("all 3 occurrences");
  });
});

describe("occurrenceCaption", () => {
  it("names the pre-completion status when the run did not succeed", () => {
    expect(occurrenceCaption({ runStatus: "cancelled", gateConclusion: null, blocking: false })).toBe(
      "The review was cancelled before a verdict was recorded.",
    );
  });
  it("says the finding blocked the merge when it did", () => {
    expect(occurrenceCaption({ runStatus: "succeeded", gateConclusion: "failure", blocking: true })).toBe(
      "This review ran to completion and the finding blocked the merge.",
    );
  });
  it("names a gate failure that did not block this particular finding", () => {
    expect(occurrenceCaption({ runStatus: "succeeded", gateConclusion: "failure", blocking: false })).toBe(
      "This review ran to completion; the gate recorded a failure.",
    );
  });
  it("falls back to a plain completion sentence otherwise", () => {
    expect(occurrenceCaption({ runStatus: "succeeded", gateConclusion: "success", blocking: false })).toBe("This review ran to completion.");
  });
});
