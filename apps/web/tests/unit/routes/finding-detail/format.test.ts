// OWNER: d3 (wave 3). Pure derivations behind /findings/[id]
// (src/components/routes/finding-detail/format.ts): location labels, delivery
// exactness, relative time, and the suppress form's validation rules.
import { describe, expect, it } from "vitest";
import {
  deliveredExactLine,
  deliveredWithinRange,
  deliveryCommentUrl,
  expiryValue,
  fixed3,
  ledgerHref,
  suppressionState,
  githubBlobUrl,
  proofVerdict,
  runOutcome,
  severityTerms,
  summaryLine,
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

describe("links built from API ids", () => {
  it("an inline or file-level rung links a review comment; anything else the conversation", () => {
    expect(deliveryCommentUrl("acme", "checkout-service", 4821, 7, "inline_exact")).toBe("https://github.com/acme/checkout-service/pull/4821#discussion_r7");
    expect(deliveryCommentUrl("acme", "checkout-service", 4821, 7, "summary_only")).toBe("https://github.com/acme/checkout-service/pull/4821#issuecomment-7");
  });

  it("links the reported lines at a commit", () => {
    expect(githubBlobUrl("acme", "checkout-service", "9c2d4b1", "app/billing/charge.py", 41, 44)).toBe("https://github.com/acme/checkout-service/blob/9c2d4b1/app/billing/charge.py#L41-L44");
    expect(githubBlobUrl("acme", "x", "abc", "a.py", 3, 3)).toBe("https://github.com/acme/x/blob/abc/a.py#L3");
    expect(githubBlobUrl("acme", "x", "abc", "a.py")).toBe("https://github.com/acme/x/blob/abc/a.py");
  });

  it("a multi-line comment anchored on the range's last line is inside the range", () => {
    expect(deliveredWithinRange(44, 41, 44)).toBe(true);
    expect(deliveredWithinRange(38, 34, 35)).toBe(false);
    expect(deliveredWithinRange(null, 41, 44)).toBeNull();
  });
});

describe("runOutcome / summaryLine", () => {
  it("reads each run from its exit code and pytest's own last line", () => {
    expect(runOutcome({ exit_code: 0, excerpt: ".   [100%]\n1 passed in 0.42s" })).toEqual({ kind: "passed", label: "Passed", summary: "1 passed in 0.42s", exitCode: 0 });
    expect(runOutcome({ exit_code: 1, excerpt: "E  boom\n1 failed in 0.39s" }).kind).toBe("failed");
    expect(runOutcome({ exit_code: 2, excerpt: "!!!! Interrupted: 1 error during collection !!!!\n1 error in 0.11s" }).kind).toBe("error");
    expect(runOutcome({ exit_code: 124, excerpt: "\ndocker kill after 90s (PROOF_TIMEOUT)\n" })).toMatchObject({ kind: "timeout", summary: "docker kill after 90s (PROOF_TIMEOUT)" });
    expect(runOutcome(null).kind).toBe("not_run");
    expect(summaryLine("===== 1 failed in 0.39s =====")).toBe("1 failed in 0.39s");
  });
});

describe("proofVerdict", () => {
  const ctx = { blocking: false, status: "published" };
  it("names why an inconclusive proof settled nothing, from the runs themselves", () => {
    const both = (b: number, h: number, extra = {}) => proofVerdict({ status: "inconclusive", base: { exit_code: b }, head: { exit_code: h }, ...extra }, ctx).body;
    expect(both(1, 1)).toMatch(/predates this pull request/);
    expect(both(2, 2)).toMatch(/errors before any assertion/);
    expect(both(0, 124)).toMatch(/timed out/);
    expect(both(0, 1, { deps_install_ok: false })).toMatch(/Dependencies failed/);
    expect(both(0, 1)).toMatch(/does not settle the claim/);
  });

  it("ties a proven verdict to the gate only when the finding actually blocks", () => {
    expect(proofVerdict({ status: "proven" }, { blocking: true, status: "published" }).body).toMatch(/hold the merge/);
    expect(proofVerdict({ status: "proven" }, { blocking: false, status: "suppressed" }).body).toMatch(/suppressed/);
    expect(proofVerdict({ status: "disproven" }, ctx).title).toBe("Witness refuted this claim.");
    expect(proofVerdict(null, ctx).title).toBe("Not executed.");
  });
});

describe("severityTerms / fixed3", () => {
  it("is input × weight per input, and the terms sum to the score", () => {
    const inputs = { path_sensitivity: 1, reachability: 1, blast_radius: 0.7, coverage_gap: 0.5, proof_confidence: 1, churn: 0.3 };
    const weights = { path_sensitivity: 0.25, reachability: 0.2, blast_radius: 0.15, coverage_gap: 0.15, proof_confidence: 0.15, churn: 0.1 };
    const terms = severityTerms(Object.keys(weights), inputs, weights);
    expect(terms[2]).toMatchObject({ label: "Blast radius", input: 0.7, weight: 0.15 });
    expect(fixed3(terms[2].contribution)).toBe("0.105");
    expect(fixed3(terms.reduce((a, t) => a + t.contribution, 0))).toBe("0.810");
  });
});

describe("expiryValue — the suppress form's quick picks", () => {
  const now = new Date("2026-09-23T12:00:00Z");
  it("never is empty; N days is an ISO instant that far out; a picked day ends at 23:59 that day", () => {
    expect(expiryValue("never", "", now)).toBe("");
    expect(expiryValue("30", "", now)).toBe("2026-10-23T12:00:00.000Z");
    expect(expiryValue("date", "2026-10-05", now)).toBe("2026-10-05T23:59");
    expect(expiryValue("date", "", now)).toBe("");
  });
  it("every pick passes the form's own validation", () => {
    for (const v of [expiryValue("7", "", now), expiryValue("date", "2026-10-05", now)]) {
      expect(validateSuppressForm({ scope: "line", reason: "r", expiresAt: v, matchPath: "" }, now)).toEqual({});
    }
  });
});

describe("suppressionState / ledgerHref — link to the ledger tab that holds the row", () => {
  const now = Date.parse("2026-09-23T12:00:00Z");
  it("reads revoked, expired and active off the ledger row", () => {
    expect(suppressionState({ revoked_at: "2026-09-01T00:00:00Z", expires_at: null }, now)).toBe("revoked");
    expect(suppressionState({ expires_at: "2026-09-10T00:00:00Z" }, now)).toBe("expired");
    expect(suppressionState({ expires_at: "2026-10-10T00:00:00Z", active: true }, now)).toBe("active");
    expect(suppressionState({ active: false }, now)).toBe("expired");
    expect(suppressionState({}, now)).toBe("active");
  });
  it("active rows open the default tab; expired and revoked rows open theirs", () => {
    expect(ledgerHref("abc", "active")).toBe("/suppressions?fingerprint=abc");
    expect(ledgerHref("abc", "revoked")).toBe("/suppressions?active=false&state=revoked&fingerprint=abc");
    expect(ledgerHref(null, "expired")).toBe("/suppressions?active=false&state=expired");
  });
});
