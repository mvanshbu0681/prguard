// OWNER: d5 (wave 3). Pure logic behind /accuracy's URL window filter.
import { describe, expect, it } from "vitest";
import { sinceIso, toDateInputValue, untilIso } from "./window-filter";

describe("sinceIso", () => {
  it("widens a calendar date to the UTC instant nuqs already gives (midnight)", () => {
    expect(sinceIso(new Date("2026-08-01T00:00:00.000Z"))).toBe("2026-08-01T00:00:00.000Z");
  });
  it("null in, null out — no filter is applied", () => {
    expect(sinceIso(null)).toBeNull();
  });
});

describe("untilIso", () => {
  it("pushes the calendar date to the end of that UTC day, so a same-day window is non-empty", () => {
    expect(untilIso(new Date("2026-09-01T00:00:00.000Z"))).toBe("2026-09-01T23:59:59.999Z");
  });
  it("null in, null out", () => {
    expect(untilIso(null)).toBeNull();
  });
});

describe("toDateInputValue", () => {
  it("formats a Date as YYYY-MM-DD for a native date input", () => {
    expect(toDateInputValue(new Date("2026-08-01T00:00:00.000Z"))).toBe("2026-08-01");
  });
  it("null becomes the empty string (the input renders unset)", () => {
    expect(toDateInputValue(null)).toBe("");
  });
});
