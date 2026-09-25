// Section 8, rebuilt on the otoma8.com "CONTACT" composition: a photographic
// band inset 12px from the page edge, a left-to-right shade, a trust row, a
// 52/500 heading and the lime pill. Here the pill is the real run form (the
// hero's "Run a review" lands on #run), restyled from the old closing section.
import Image from "next/image";
import { getAccuracy, getReviewsIndex } from "@/lib/fixtures";
import { DEMO_SHORT } from "@/lib/demo-ids";
import { CtaForm } from "./CtaForm";
import s from "./cta.module.css";

const SPECIALISTS = [
  { initials: "BG", color: "#1f2937" },
  { initials: "SC", color: "#475569" },
  { initials: "TS", color: "#334155" },
  { initials: "QA", color: "#57534e" },
];
const MAX_CHIPS = 3;

/** The demo PR first, then up to two more distinct `owner/repo#n` pairs from the run list. */
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

export function Cta() {
  const accuracy = getAccuracy();
  const proven = accuracy.proof.proven ?? 0;
  const reviews = accuracy.runs.succeeded ?? 0;

  return (
    <section id="run" className={s.section} aria-labelledby="run-title">
      <div className={s.band}>
        <Image src="/marketing/cta-grass.jpg" alt="" fill sizes="100vw" className={s.photo} />
        <span className={s.shade} aria-hidden />

        <div className={`${s.content} ${s.reveal}`}>
          <div className={s.trust}>
            <span className={s.avatars} aria-hidden>
              {SPECIALISTS.map((p) => (
                <span key={p.initials} style={{ background: p.color }}>
                  {p.initials}
                </span>
              ))}
            </span>
            <p className={s.trustText}>
              {proven} bugs proven across {reviews} reviews
            </p>
          </div>

          <h2 id="run-title" className={s.h2}>
            <span>Proven, or it</span>
            <span>doesn&rsquo;t block.</span>
          </h2>
          <p className={s.sub}>
            Paste a pull request and watch PRGuard review it, stage by stage. It is read‑only: nothing is written to the PR.
          </p>

          <CtaForm chips={buildChips()} />
        </div>
      </div>
    </section>
  );
}
