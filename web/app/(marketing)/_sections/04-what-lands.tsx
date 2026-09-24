// OWNER: m3 (wave 3). Section 04 of 9 (plan T8) — "What lands in your PR"
// (docs/design/06-brand-gaps-and-corrections.md §E: the section E adds to the
// blueprint, inserted here by the frozen app/(marketing)/page.tsx). Keep the
// named export and the section id: the id is a deep-link target.
//
// The section-index grammar this renders: "/ 04 — WHAT LANDS IN YOUR PR"
// (tests/unit/marketing-shell/sections.test.ts checks this string against
// MARKETING_SECTIONS' category for id="comment" — keep them equal).
//
// Server component (no "use client" anywhere in this section's tree): every
// string renders from ReviewResult.review_payload at build time, so the
// section is complete server HTML at first paint — no IntersectionObserver,
// no scroll, no client fetch gates a single character of it. The white
// "GitHub" band's only motion is a single CSS opacity reveal, wired the same
// engine-free way every other [data-anim] element on the site is (T3's
// revealer, src/motion/reveal.ts) — no GSAP import, so src/components/evidence's
// dashboard-safety rule (no gsap in this tree) is moot here, but this file
// avoids it anyway on principle.
import type { CSSProperties } from "react";
import { ProvenanceLine, SectionIndex } from "@/components/chrome";
import { getDemoResult } from "@/lib/fixtures";
import { ANIM_PROPS } from "@/motion/attrs";
import { GithubCommentMock, GithubSummaryMock } from "@/components/sections/comment/GithubCommentMock";
import { asReviewPayload, findProvenComment } from "@/components/sections/comment/review-payload";

const INDEX_ID = "what-lands-index";

export function WhatLandsInYourPR() {
  const result = getDemoResult();
  const payload = asReviewPayload(result.review_payload);
  const provenComment = findProvenComment(payload);
  const { owner, name } = result.repository;
  const prNumber = result.pull_request.number;
  const postLine = `POST /repos/${owner}/${name}/pulls/${prNumber}/reviews  →  { "event": "${payload.event}", … }`;

  return (
    <section id="comment" aria-labelledby={INDEX_ID} className="border-b border-rule-hair">
      <div className="mx-auto max-w-[1200px] px-4 pb-12 pt-20 md:px-8 md:pb-16 md:pt-28">
        <SectionIndex index="04" category="WHAT LANDS IN YOUR PR" labelId={INDEX_ID} />
        <h2 className="type-display-h2 mt-6 max-w-[18ch] text-text-primary md:mt-8">One comment. Never an approval.</h2>
        <p className="type-body mt-5 max-w-[58ch] text-text-body md:mt-6">
          PRGuard posts exactly one review per run, with <code className="font-mono text-[0.92em] text-text-primary">event: COMMENT</code>. It has never posted{" "}
          <code className="font-mono text-[0.92em] text-text-primary">APPROVE</code>, and the code path to do so does not exist — there is a test that asserts it on every
          build.
        </p>
      </div>

      {/* Full-bleed #f6f8fa band: the only section on the site in GitHub's own light chrome
          (brand-gaps §E). One 240ms (--dur-reveal) opacity reveal, once, nothing else — no
          hover on the mock, no scroll parallax, no typing. It is a photograph of a thing that
          already happened. .reveal (src/styles/motion.css) falls back to --dur-enter (420ms on
          this, the marketing, surface) unless --motion-dur is set here, so the override below
          is what actually pins this to --dur-reveal rather than the default enter duration. */}
      <div
        {...ANIM_PROPS}
        className="reveal w-full bg-[#f6f8fa] py-12 md:py-16"
        style={{ colorScheme: "light", "--motion-dur": "var(--dur-reveal)" } as CSSProperties}
      >
        <div className="mx-auto max-w-[880px] px-4 md:px-8">
          <GithubCommentMock payload={payload} provenComment={provenComment} finishedAt={result.timing?.finished_at} />
          <GithubSummaryMock payload={payload} />
          {/* Inverted here only (brand-gaps §E): --ink-0 text on the white band, not --text-dim.
              chrome.css keeps every .prg-* rule in @layer components (its own header says so),
              so this Tailwind utility wins the cascade without touching that frozen file. */}
          <ProvenanceLine source={postLine} className="mt-8 text-ink-0" />
        </div>
      </div>
    </section>
  );
}
