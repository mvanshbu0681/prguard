// OWNER: m3 (wave 3). Section 04 — "What lands in your PR".
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// Next implements `import "server-only"` in its compiler; vitest has no such module
// (tests/unit/data/fixtures-on-disk.test.ts does the same).
vi.mock("server-only", () => ({}));

import { getDemoResult } from "@/lib/fixtures";
import { asReviewPayload, commentAnchor, findProvenComment, ReviewPayloadShapeError, titleCaseEvent, type PRGuardReviewComment } from "@/components/sections/comment/review-payload";

describe("asReviewPayload — narrows the demo run's real review_payload", () => {
  it("parses the demo run's actual review_payload", () => {
    const result = getDemoResult();
    const payload = asReviewPayload(result.review_payload);
    expect(payload.event).toBe("COMMENT");
    expect(payload.commit_id).toBe(result.pull_request.head_sha);
    expect(payload.comments.length).toBeGreaterThan(0);
    expect(payload.body).toContain("PRGuard");
  });

  it("throws a ReviewPayloadShapeError, not a silent empty render, on a malformed payload", () => {
    expect(() => asReviewPayload(null)).toThrow(ReviewPayloadShapeError);
    expect(() => asReviewPayload({ event: "COMMENT" })).toThrow(ReviewPayloadShapeError);
    expect(() => asReviewPayload({ event: "COMMENT", body: "x", commit_id: "y", comments: [{ path: "a" }] })).toThrow(ReviewPayloadShapeError);
  });
});

describe("findProvenComment", () => {
  it("finds the demo run's proof_status: proven comment, anchored at app/billing/charge.py", () => {
    const payload = asReviewPayload(getDemoResult().review_payload);
    const comment = findProvenComment(payload);
    expect(comment.path).toBe("app/billing/charge.py");
    expect(comment.line).toBe(44);
    expect(comment.start_line).toBe(41);
    expect(comment.body).toContain("proof_status: proven");
    // The exact fixture text this section must render verbatim (spot-checks, brief TESTS).
    expect(comment.body).toContain("severity **`0.810`** critical");
    expect(comment.body).toContain("<details><summary>terminal output at head <code>9c2d4b1</code></summary>");
    expect(comment.body).toContain("AttributeError: 'NoneType' object has no attribute 'currency'");
  });

  it("throws when no comment carries proof_status: proven", () => {
    expect(() => findProvenComment({ event: "COMMENT", body: "", commit_id: "x", comments: [] })).toThrow(ReviewPayloadShapeError);
  });
});

describe("commentAnchor — GitHub's own L41-L44 / L44 / bare-path grammar", () => {
  it("renders a range when start_line differs from line", () => {
    const c: PRGuardReviewComment = { path: "app/billing/charge.py", body: "", line: 44, start_line: 41 };
    expect(commentAnchor(c)).toBe("app/billing/charge.py · L41-L44");
  });

  it("renders a single line when there is no distinct start_line", () => {
    const c: PRGuardReviewComment = { path: "app/billing/charge.py", body: "", line: 38 };
    expect(commentAnchor(c)).toBe("app/billing/charge.py · L38");
  });

  it("renders the bare path for a file-level comment", () => {
    const c: PRGuardReviewComment = { path: "app/api/checkout.py", body: "", subject_type: "file" };
    expect(commentAnchor(c)).toBe("app/api/checkout.py");
  });
});

describe("titleCaseEvent — GitHub's UI casing of the API's event enum", () => {
  it("title-cases COMMENT without ever hard-coding it", () => {
    expect(titleCaseEvent("COMMENT")).toBe("Comment");
    expect(titleCaseEvent("APPROVE")).toBe("Approve");
    expect(titleCaseEvent("")).toBe("");
  });

  it("never posts APPROVE on the demo run (brand-gaps §E rule, M4)", () => {
    const payload = asReviewPayload(getDemoResult().review_payload);
    expect(payload.event).not.toBe("APPROVE");
  });
});
