// @vitest-environment node
// OWNER: m3 (wave 3). Section 04 of 9 — "What lands in your PR"
// (docs/design/06-brand-gaps-and-corrections.md §E). Brief's binding tests:
// the rendered body equals the fixture payload (spot-check strings); event
// is COMMENT; no emoji in the output.
//
// The section imports "server-only" (via @/lib/fixtures); mocking it and
// rendering under jsdom + @testing-library/react does not reliably intercept
// that bare specifier (see github-markdown.test.tsx's header note), so this
// file follows the same pattern as tests/unit/data/fixtures-on-disk.test.ts
// and tests/unit/evidence/contribution-bar/geometry.test.ts: node environment,
// vi.mock("server-only", …), and string assertions over the rendered markup
// (renderToStaticMarkup — the tests/unit/chrome/og.test.tsx pattern) rather
// than a jsdom query API a server component tree does not need.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { renderToStaticMarkup } from "react-dom/server";
import { WhatLandsInYourPR } from "../../../../app/(marketing)/_sections/04-what-lands";
import { getDemoResult } from "@/lib/fixtures";
import { asReviewPayload } from "@/components/sections/comment/review-payload";

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

function strip(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("WhatLandsInYourPR (section 04)", () => {
  const html = renderToStaticMarkup(<WhatLandsInYourPR />);
  const text = strip(html);

  it("keeps the frozen section id and the index/H2 grammar", () => {
    expect(html).toContain('id="comment"');
    // MARKETING_SECTIONS' category is already upper-cased (src/components/
    // marketing-shell/sections.ts), and tests/unit/marketing-shell/sections.test.ts
    // asserts this exact string exists verbatim in this file's source.
    expect(text).toContain("/ 04 — WHAT LANDS IN YOUR PR");
    expect(text).toContain("One comment. Never an approval.");
  });

  it("renders the fixed subhead copy verbatim (brand-gaps §E — not paraphrased)", () => {
    expect(text).toContain(
      "Witness posts exactly one review per run, with event: COMMENT. It has never posted APPROVE, and the code path to do so does not exist — there is a test that asserts it on every build.",
    );
  });

  it("the rendered body equals the fixture payload — spot-check strings (brief TESTS)", () => {
    const result = getDemoResult();
    expect(text).toContain("proof_status: proven");
    expect(text).toContain("0.810");
    expect(text).toContain("app/billing/charge.py");
    expect(text).toContain(result.pull_request.head_sha!.slice(0, 7));
    expect(text).toContain(result.pull_request.base_sha!.slice(0, 7));
    expect(text).toContain("Witness reviewed");
    expect(text).toContain(`${result.timing?.duration_seconds}s`);
    expect(text).toContain("raised");
    expect(text).toContain("dropped at the coordinator");
  });

  it("event is COMMENT, never APPROVE — asserted from the same fixture read", () => {
    const payload = asReviewPayload(getDemoResult().review_payload);
    expect(payload.event).toBe("COMMENT");
    expect(text).toContain('"event": "COMMENT"');
    expect(text).toContain("Comment");
    expect(html).not.toMatch(/"event":\s*"APPROVE"/);
  });

  it("no emoji anywhere in the section", () => {
    expect(EMOJI_RE.test(text)).toBe(false);
  });

  it("the provenance line names the real POST endpoint and the payload's own event value", () => {
    const result = getDemoResult();
    const expected = `POST /repos/${result.repository.owner}/${result.repository.name}/pulls/${result.pull_request.number}/reviews`;
    expect(text).toContain(expected);
  });

  it("has no registration marks (this mock is GitHub's chrome, never an <Exhibit>)", () => {
    expect(html).not.toContain("data-registration-mark");
    expect(html).not.toContain("data-exhibit");
  });

  it("the terminal output stays inside a closed <details>", () => {
    expect(html).toMatch(/<details[^>]*>/);
    expect(html).not.toMatch(/<details[^>]*\sopen(=|[\s>])/);
  });
});
