// OWNER: d3 (wave 3). Pure derivations behind /findings/[id]
// (src/components/routes/finding-detail/format.ts): location labels, delivery
// exactness, relative time, and the suppress form's validation rules.
import { describe, expect, it } from "vitest";
import {
  deliveredExactLine,
  formatDurationMs,
  formatRelativeAge,
  githubCommentUrl,
  hasSuppressFormErrors,
  locationRangeLabel,
  suppressRequestFrom,
  validateSuppressForm,
  type SuppressFormValues,
} from "@/components/routes/finding-detail/format";

describe("locationRangeLabel", () => {
  it("prints just the file when no line is known", () => {
    expect(locationRangeLabel("app/checkout.py")).toBe("app/checkout.py");
    expect(locationRangeLabel("app/checkout.py", null)).toBe("app/checkout.py");
  });
  it("prints a single line", () => {
    expect(locationRangeLabel("app/checkout.py", 41)).toBe("app/checkout.py:41");
    expect(locationRangeLabel("app/checkout.py", 41, 41)).toBe("app/checkout.py:41");
  });
  it("prints a range with an en dash", () => {
    expect(locationRangeLabel("app/checkout.py", 41, 44)).toBe("app/checkout.py:41–44");
  });
});

describe("deliveredExactLine", () => {
  it("is null when either side is unknown", () => {
    expect(deliveredExactLine(null, 41)).toBeNull();
    expect(deliveredExactLine(41, null)).toBeNull();
    expect(deliveredExactLine(undefined, undefined)).toBeNull();
  });
  it("is true when the delivered line matches the reported line", () => {
    expect(deliveredExactLine(41, 41)).toBe(true);
  });
  it("is false when the delivered line differs (inline_nearest)", () => {
    expect(deliveredExactLine(39, 41)).toBe(false);
  });
});

describe("githubCommentUrl", () => {
  it("builds a real comment permalink from the ids the API returned", () => {
    expect(githubCommentUrl("acme", "checkout-service", 4821, 555)).toBe("https://github.com/acme/checkout-service/pull/4821#issuecomment-555");
  });
});

describe("formatDurationMs", () => {
  it("prints one decimal and a unit", () => {
    expect(formatDurationMs(14200)).toBe("14.2s");
    expect(formatDurationMs(420)).toBe("0.4s");
  });
  it("is null for missing or non-finite input", () => {
    expect(formatDurationMs(null)).toBeNull();
    expect(formatDurationMs(undefined)).toBeNull();
    expect(formatDurationMs(Number.NaN)).toBeNull();
  });
});

describe("formatRelativeAge", () => {
  const now = new Date("2026-09-23T12:00:00Z");
  it("says just now under 45 seconds", () => {
    expect(formatRelativeAge("2026-09-23T11:59:30Z", now)).toBe("just now");
  });
  it("picks the largest whole unit", () => {
    expect(formatRelativeAge("2026-09-23T11:48:00Z", now)).toBe("12m ago");
    expect(formatRelativeAge("2026-09-23T00:00:00Z", now)).toBe("12h ago");
    expect(formatRelativeAge("2026-09-19T12:00:00Z", now)).toBe("4d ago");
  });
  it("is an em dash for an unparseable date", () => {
    expect(formatRelativeAge("not-a-date", now)).toBe("—");
  });
});

describe("validateSuppressForm", () => {
  const base: SuppressFormValues = { scope: "line", reason: "accepted risk", expiresAt: "", matchPath: "" };
  const now = new Date("2026-09-23T12:00:00Z");

  it("has no errors for a valid line-scoped form", () => {
    expect(validateSuppressForm(base, now)).toEqual({});
    expect(hasSuppressFormErrors(validateSuppressForm(base, now))).toBe(false);
  });

  it("requires a non-empty, non-whitespace reason", () => {
    expect(validateSuppressForm({ ...base, reason: "" }, now).reason).toBeDefined();
    expect(validateSuppressForm({ ...base, reason: "   " }, now).reason).toBeDefined();
  });

  it("requires match_path when scope is pattern", () => {
    const errors = validateSuppressForm({ ...base, scope: "pattern", matchPath: "" }, now);
    expect(errors.matchPath).toBeDefined();
    expect(validateSuppressForm({ ...base, scope: "pattern", matchPath: "src/api/**" }, now).matchPath).toBeUndefined();
  });

  it("does not require match_path for non-pattern scopes", () => {
    for (const scope of ["line", "file", "repo", "tenant"] as const) {
      expect(validateSuppressForm({ ...base, scope, matchPath: "" }, now).matchPath).toBeUndefined();
    }
  });

  it("rejects an expiry that is not a valid date", () => {
    expect(validateSuppressForm({ ...base, expiresAt: "not-a-date" }, now).expiresAt).toBeDefined();
  });

  it("rejects an expiry in the past or present", () => {
    expect(validateSuppressForm({ ...base, expiresAt: "2020-01-01T00:00" }, now).expiresAt).toBeDefined();
    expect(validateSuppressForm({ ...base, expiresAt: now.toISOString().slice(0, 16) }, now).expiresAt).toBeDefined();
  });

  it("accepts a future expiry", () => {
    expect(validateSuppressForm({ ...base, expiresAt: "2027-01-01T00:00" }, now).expiresAt).toBeUndefined();
  });

  it("reports every failing field at once", () => {
    const errors = validateSuppressForm({ scope: "pattern", reason: "  ", expiresAt: "nope", matchPath: "" }, now);
    expect(Object.keys(errors).sort()).toEqual(["expiresAt", "matchPath", "reason"]);
  });
});

describe("suppressRequestFrom", () => {
  it("trims the reason and omits match_path outside scope=pattern", () => {
    const request = suppressRequestFrom({ scope: "line", reason: "  accepted risk  ", expiresAt: "", matchPath: "src/x" });
    expect(request).toEqual({ scope: "line", reason: "accepted risk", expires_at: null, match_path: null });
  });

  it("carries match_path only for scope=pattern, trimmed", () => {
    const request = suppressRequestFrom({ scope: "pattern", reason: "vendor code", expiresAt: "", matchPath: " src/api/** " });
    expect(request.match_path).toBe("src/api/**");
  });

  it("serialises a given expiry to an ISO instant", () => {
    const request = suppressRequestFrom({ scope: "repo", reason: "tracked in ENG-4102", expiresAt: "2027-01-01T00:00", matchPath: "" });
    expect(request.expires_at).toBe(new Date("2027-01-01T00:00").toISOString());
  });
});
