// Section 2, rebuilt on the otoma8.com "ABOUT US" composition: a mission
// headline with inline icon badges, then a bento of four stat cards. Server
// component; every number is read from the demo corpus's accuracy report.
import Image from "next/image";
import { FlaskConical, Undo2 } from "lucide-react";
import { getAccuracy } from "@/lib/fixtures";
import s from "./why.module.css";

const SPECIALISTS = [
  { initials: "BG", name: "bugs", color: "#1f2937" },
  { initials: "SC", name: "security", color: "#475569" },
  { initials: "TS", name: "tests", color: "#334155" },
  { initials: "QA", name: "quality", color: "#57534e" },
];

export function Why() {
  const a = getAccuracy();
  const proven = a.proof.proven ?? 0;
  const raised = a.findings.proposed ?? 0;
  const dropped = a.findings.dropped_by_coordinator ?? 0;
  const suppressed = a.findings.suppressed ?? 0;
  const published = a.findings.published ?? 0;
  const perReview = (a.findings.per_review_published_mean ?? 0).toFixed(3);
  const selfCaught = a.precision_proxies.self_caught_false_positive_rate;
  const median = a.runs.median_duration_seconds ?? 0;
  const pct = (n: number) => `${raised ? (n / raised) * 100 : 0}%`;

  return (
    <section id="why" className={s.section} aria-labelledby="why-title">
      <div className={s.inner}>
        <p className={`${s.eyebrow} ${s.reveal}`}>
          <span aria-hidden>•</span>Why PRGuard
        </p>
        <h2 id="why-title" className={`${s.h2} ${s.reveal}`}>
          <span>A reviewer that earns trust</span>
          <span>
            by proving
            <span className={`${s.badge} ${s.badgeSky}`} aria-hidden>
              <FlaskConical size={18} strokeWidth={2} />
            </span>
            every claim
          </span>
          <span className={s.grey}>
            and
            <span className={`${s.badge} ${s.badgeLime}`} aria-hidden>
              <Undo2 size={18} strokeWidth={2.2} />
            </span>
            owning its mistakes.
          </span>
        </h2>

        <div className={s.grid}>
          {/* 1 — photographic card with an inset stat */}
          <article className={`${s.card} ${s.tall} ${s.photoCard} ${s.reveal}`}>
            <Image src="/marketing/hero-sky.jpg" alt="" fill sizes="(max-width: 640px) 100vw, 33vw" />
            <div className={s.photoTop}>
              <span className={s.brand}>PRGuard</span>
              <span className={s.chip} aria-hidden>
                <FlaskConical size={17} strokeWidth={1.8} />
              </span>
            </div>
            <div className={s.inset}>
              <span className={s.num}>{proven}</span>
              <p className={s.body}>bugs proven by execution, each one shipped with the failing test that proves it.</p>
            </div>
          </article>

          {/* 2 — grey card: what actually reaches the pull request */}
          <article className={`${s.card} ${s.tall} ${s.greyCard} ${s.reveal} ${s.reveal2}`}>
            <p className={s.label}>Findings per review</p>
            <span className={s.bigNum}>{perReview}</span>
            <div className={s.people}>
              <span className={s.avatars} aria-hidden>
                {SPECIALISTS.map((p) => (
                  <span key={p.name} style={{ background: p.color }} title={p.name}>
                    {p.initials}
                  </span>
                ))}
              </span>
              <span className={s.peopleNote}>4 specialists in parallel, 1&nbsp;coordinator</span>
            </div>
            <div className={s.funnel}>
              <div className={s.funnelBar} role="img" aria-label={`${raised} raised: ${published} published, ${suppressed} suppressed, ${dropped} dropped`}>
                <i style={{ width: pct(published), background: "#131313" }} />
                <i style={{ width: pct(suppressed), background: "#94a3b8" }} />
                <i style={{ width: pct(dropped), background: "#cbd5e1" }} />
              </div>
              <div className={s.funnelKey}>
                <span>
                  <i className={s.swatch} style={{ background: "#131313" }} />
                  <b>{published}</b> published
                </span>
                <span>
                  <i className={s.swatch} style={{ background: "#94a3b8" }} />
                  <b>{suppressed}</b> suppressed
                </span>
                <span>
                  <i className={s.swatch} style={{ background: "#cbd5e1" }} />
                  <b>{dropped}</b> dropped
                </span>
              </div>
              <p className={s.body} style={{ color: "rgba(19,19,19,.72)" }}>
                of {raised} raised. The coordinator drops speculation, nitpicks and duplicates before you see them.
              </p>
            </div>
          </article>

          {/* 3 — lime over navy */}
          <div className={s.stack}>
            <article className={`${s.card} ${s.limeCard} ${s.reveal} ${s.reveal3}`}>
              <p className={s.label}>Self-caught false positives</p>
              <span className={s.bigNum}>{(selfCaught.value ?? 0).toFixed(3)}</span>
              <p className={s.body}>Claims it refuted with its own test before they reached a pull request.</p>
              <span className={s.nMark}>n = {selfCaught.n}</span>
            </article>
            <article className={`${s.card} ${s.navyCard} ${s.reveal} ${s.reveal3}`}>
              <p className={s.label}>Median review</p>
              <span className={s.navyNum}>
                {median.toFixed(1)}
                <span className={s.unit}>s</span>
              </span>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
