// OWNER: m6 (wave 3). Section 09 of 9 (plan T8): the close (landing blueprint
// §14) with "Run one" folded in (plan A5, §11 — D2 cut its own pinned
// section, but the nav's `RUN A REVIEW →` still needs somewhere to land).
//
// index-label grammar (tests/unit/marketing-shell/sections.test.ts reads this
// file's raw source for it verbatim): / 09 — THE CLOSE
//
// Server component: the headline, the hairline-and-tick rule and the chip
// list are complete at first paint from the fixture corpus; the input,
// mutation and focus-on-arrival behaviour live in the client-only
// <RunForm> (src/components/sections/close/run-form.tsx) — the smallest
// possible client boundary.
//
// Copy is verbatim from §14 and brand-gaps §D/§G ("Proven, or it doesn't
// block." is repeated as the og:title and the README's brand line — the one
// place the four blueprints disagree on the contraction, this is the form
// that appears everywhere else). Nothing here is animated (§14: "the page
// ends on stillness") — the one exception is <RunForm>'s own state
// transitions, which are user-triggered, not scroll-triggered.
import { getReviewsIndex } from "@/lib/fixtures";
import { DEMO_SHORT } from "@/lib/demo-ids";
import { SectionIndex } from "@/components/chrome";
import { Button } from "@/components/ui/button";
import { RunForm } from "@/components/sections/close/run-form";

const MAX_CHIPS = 3;

/** The demo PR first, then up to two more distinct `owner/repo#n` pairs from the run list (plan A5). */
function buildChips(): string[] {
  const chips: string[] = [DEMO_SHORT.pullRequest];
  const seen = new Set<string>(chips);
  for (const item of getReviewsIndex().items) {
    if (chips.length >= MAX_CHIPS) break;
    const label = `${item.repository.owner}/${item.repository.name}#${item.pull_request.number}`;
    if (seen.has(label)) continue;
    seen.add(label);
    chips.push(label);
  }
  return chips;
}

export function Close() {
  const chips = buildChips();

  return (
    <section id="run" className="px-4 py-(--space-section-hero) md:px-8">
      <div className="mx-auto max-w-[1200px]">
        <SectionIndex index="09" category="THE CLOSE" rule={false} />
      </div>

      <div className="mx-auto flex max-w-[720px] flex-col items-center gap-6 text-center">
        <div className="relative mt-10 h-px w-[40%] bg-rule-1" aria-hidden="true">
          <span className="absolute top-[-3px] left-1/2 h-[7px] w-px -translate-x-1/2 bg-rule-3" />
        </div>

        <h2 className="type-display-h2 text-text-primary text-balance">Proven, or it doesn&apos;t block.</h2>

        {/* The primary CTA is the run form's own submit button below (plan A5
            folds "Run One" into this section, so there is one RUN A REVIEW →
            action, not a scroll-link duplicate of it). */}
        <Button variant="link" asChild>
          <a href="#accuracy">READ THE ACCURACY REPORT</a>
        </Button>
      </div>

      <div className="mx-auto mt-12 max-w-[720px]">
        <RunForm chips={chips} />
      </div>
    </section>
  );
}
