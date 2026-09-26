// OWNER: m6 (wave 3). The brief's test: "PR input validation (owner/repo#n,
// URLs, garbage)". The two patterns are asserted against the backend's own
// wording so a value this module accepts is a value `POST /v1/reviews`
// accepts too (src/lib/fixture-resolver.ts, itself copied from
// routes_reviews.py's `_PR_URL` / `_PR_SHORTHAND`).
import { describe, expect, it } from "vitest";
import { EMPTY_PR_URL_MESSAGE, INVALID_PR_URL_MESSAGE, isValidPrReference, validatePrReference } from "@/components/sections/close/pr-validation";

describe("isValidPrReference", () => {
  it.each([
    "acme/checkout-service#4821",
    "tiangolo/fastapi#12908",
    "a.b-c_d/e.f-g_h#1",
    "https://github.com/owner/repo/pull/4821",
    "http://github.com/owner/repo/pull/4821",
    "github.com/owner/repo/pull/4821",
    "www.github.com/owner/repo/pull/4821",
    "https://GITHUB.com/owner/repo/PULLS/4821",
    "https://github.com/owner/repo/pull/4821?diff=split",
    "https://github.com/owner/repo/pull/4821#discussion_r1",
    "  acme/checkout-service#4821  ",
  ])("accepts %s", (candidate) => {
    expect(isValidPrReference(candidate)).toBe(true);
  });

  it.each([
    "",
    "   ",
    "not a pull request",
    "acme/checkout-service",
    "acme/checkout-service#",
    "acme#4821",
    "https://gitlab.com/owner/repo/pull/4821",
    "https://github.com/owner/repo/issues/4821",
    "https://github.com/owner/repo",
    "javascript:alert(1)",
  ])("rejects %s", (candidate) => {
    expect(isValidPrReference(candidate)).toBe(false);
  });
});

describe("validatePrReference", () => {
  it("trims a valid shorthand and returns it as the value to submit", () => {
    const result = validatePrReference("  acme/checkout-service#4821  ");
    expect(result).toEqual({ ok: true, value: "acme/checkout-service#4821" });
  });

  it("passes a valid URL through unchanged (the backend accepts either shape verbatim)", () => {
    const url = "https://github.com/acme/checkout-service/pull/4821";
    expect(validatePrReference(url)).toEqual({ ok: true, value: url });
  });

  it("reports the empty case distinctly from a malformed one", () => {
    expect(validatePrReference("")).toEqual({ ok: false, message: EMPTY_PR_URL_MESSAGE });
    expect(validatePrReference("   ")).toEqual({ ok: false, message: EMPTY_PR_URL_MESSAGE });
  });

  it("shows the backend's own INVALID_PR_URL wording on garbage", () => {
    expect(validatePrReference("definitely not a pull request")).toEqual({ ok: false, message: INVALID_PR_URL_MESSAGE });
    expect(INVALID_PR_URL_MESSAGE).toBe("Could not parse a GitHub pull request from the supplied URL.");
  });
});
