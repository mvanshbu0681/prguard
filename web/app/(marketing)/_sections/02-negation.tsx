// OWNER: m2 (wave 3). Section 02 of 9 (plan T8) — THE NEGATION
// (docs/design/03-landing-blueprint.md §02). Reframes the problem before
// section 03 pays the credibility tax: "the bottleneck is not a shortage of
// opinions, it is a shortage of evidence." Bare graph paper, no panel, no
// registration marks (§02 "Composition": this section carries no artefact),
// read in under two seconds and scrolled past.
//
// Server component: no fixture data — §02 is pure typographic argument, not
// evidence, so nothing here is rendered from an API/fixture value. The frozen
// app/(marketing)/page.tsx imports the named export `Negation`; the section id
// `negation` is a nav/footer deep-link target (app/(marketing)/layout.tsx sets
// scroll-margin-top for it).
import { GraphPaper } from "@/components/chrome";
import { NegationRules } from "@/components/sections/negation/NegationRules";
import styles from "@/components/sections/negation/negation.module.css";
import { cn } from "@/lib/utils";

// brand-gaps §2 ruling 10: the original ~20-word uppercase mono bridge line
// violates design-system §2.3's own 4-word cap on the label tier. Rewritten as
// four short mono-caps fragments on one rule, per the ruling's exact wording.
const BRIDGE_ITEMS = ["PROVES IT", "RANKS IT", "REMEMBERS", "ON THE RECORD"] as const;

export function Negation() {
  return (
    <GraphPaper
      as="section"
      id="negation"
      className="relative isolate border-b border-rule-hair bg-ink-0"
    >
      <NegationRules className="flex flex-col">
        {/* Full-bleed hairline, tick at 25% of its width (§02: "a single tick
            mark each at 25% and 75%"). */}
        <div data-negation-rule className={cn(styles.rule, styles.ruleTop)} aria-hidden="true" />

        <div className="mx-auto flex w-full max-w-[900px] flex-col items-center gap-6 px-4 py-16 text-center md:px-8 md:py-20">
          <p className={cn(styles.line, "text-balance text-text-primary")}>The bottleneck is not a shortage of opinions.</p>
          <p className={cn(styles.line, "text-balance text-text-dim")}>It is a shortage of evidence.</p>

          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 type-label text-text-dim">
            {BRIDGE_ITEMS.map((item, i) => (
              <span key={item} className="inline-flex items-center gap-2 whitespace-nowrap">
                {item}
                {i < BRIDGE_ITEMS.length - 1 ? (
                  <span aria-hidden="true" className="text-text-disabled">
                    ·
                  </span>
                ) : null}
              </span>
            ))}
          </p>
        </div>

        {/* Tick at 75% on the bottom rule. */}
        <div data-negation-rule className={cn(styles.rule, styles.ruleBottom)} aria-hidden="true" />
      </NegationRules>
    </GraphPaper>
  );
}
