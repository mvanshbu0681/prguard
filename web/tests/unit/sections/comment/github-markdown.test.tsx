// OWNER: m3 (wave 3). Section 04 — "What lands in your PR".
//
// GithubMarkdown takes plain text props — no "server-only" dependency — so
// this file reads the fixture corpus straight off disk (readFileSync, the
// tests/unit/chrome/og.test.tsx pattern) rather than importing @/lib/fixtures:
// that module's `import "server-only"` does not resolve cleanly for a
// jsdom-target test file under a `vi.mock("server-only", …)` — only a file
// whose docblock pragma forces the node environment gets that mock applied
// (see review-payload.test.ts / section.test.tsx). GithubMarkdown itself has
// no such import, so it renders fine under the default jsdom environment
// with @testing-library/react.
import "../../ui/dom-polyfills";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GithubMarkdown } from "@/components/sections/comment/GithubMarkdown";
import { asReviewPayload, findProvenComment } from "@/components/sections/comment/review-payload";

const WEB = path.resolve(import.meta.dirname, "../../../..");
const DEMO_REVIEW_ID = "4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41";
const demoResult = JSON.parse(readFileSync(path.join(WEB, "public", "fixtures", "reviews", `${DEMO_REVIEW_ID}.result.json`), "utf8"));
const payload = asReviewPayload(demoResult.review_payload);
const provenComment = findProvenComment(payload);

// A broad emoji / pictograph range — the brief's TESTS require zero emoji in the output.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

describe("GithubMarkdown — the proven finding's inline comment, rendered verbatim", () => {
  it("renders the exact fixture body text (spot-checks, brief TESTS)", () => {
    const { container } = render(<GithubMarkdown text={provenComment.body} />);
    const text = container.textContent ?? "";
    // proof_status: proven appears twice in this comment (the lead line and
    // the closing paragraph) — assert on textContent, not a single-match query.
    expect(text).toContain("proof_status: proven");
    expect(text).toContain("0.810");
    expect(text).toContain("charge()");
    // The proof table: base/head SHAs, verbatim (9c2d4b1 also recurs in the
    // <summary>, so this stays a substring check rather than getByText).
    expect(text).toContain("7c41a09");
    expect(text).toContain("9c2d4b1");
  });

  it("renders the <details> terminal block collapsed by default (native, no JS)", () => {
    const { container } = render(<GithubMarkdown text={provenComment.body} />);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText(/terminal output at head/)).toBeInTheDocument();
    expect(container.textContent ?? "").toContain("AttributeError: 'NoneType' object has no attribute 'currency'");
  });

  it("never emits an emoji, across every comment and the summary", () => {
    for (const comment of payload.comments) {
      const { container, unmount } = render(<GithubMarkdown text={comment.body} />);
      expect(EMOJI_RE.test(container.textContent ?? "")).toBe(false);
      unmount();
    }
    const { container: summaryContainer } = render(<GithubMarkdown text={payload.body} />);
    expect(EMOJI_RE.test(summaryContainer.textContent ?? "")).toBe(false);
  });

  it("renders the review-summary table's rows (GFM table, no details block)", () => {
    render(<GithubMarkdown text={payload.body} />);
    expect(screen.getByText("raised")).toBeInTheDocument();
    expect(screen.getByText("dropped at the coordinator")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("stacks the summary table as label/value rows under 640px (brand-gaps §E Mobile)", () => {
    const { container } = render(<GithubMarkdown text={payload.body} />);
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.className).toMatch(/max-sm:flex/);
  });
});
