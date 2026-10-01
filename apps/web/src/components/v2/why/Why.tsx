// Section 2, rebuilt on the otoma8.com "ABOUT US" composition: a mission
// headline with inline icon badges, then a bento of four stat cards. Server
// component; every number is a measured review (src/sandbox/facts.ts) or a count
// of what PR Guard posted on the public sandbox (src/sandbox/snapshot.json).
import Image from "next/image";
import { GraduationCap, ScanSearch } from "lucide-react";
import {
  REVIEWERS,
  WALKTHROUGH_LOG,
  avatarColor,
  blockingReviews,
  failedChecks,
  initialsOf,
  prLabel,
  sandbox,
} from "@/sandbox";
import s from "./why.module.css";
import { TrackingMark } from "@/components/brand/TrackingMark";

export function Why() {
  const log = WALKTHROUGH_LOG;
  const posted = log.posted;
  const rejected = log.rejected;
  const filtered = log.raw - log.posted - log.rejected;
  const pct = (n: number) => `${(n / log.raw) * 100}%`;
  const posters = Object.keys(sandbox.walkthrough.reviewerCounts);
  const t = sandbox.totals;
  const planted = sandbox.planted;

  return (
    <section id="why" className={s.section} aria-labelledby="why-title">
      <div className={s.inner}>
        <p className={`${s.eyebrow} ${s.reveal}`}>
          <span aria-hidden>•</span>Why PR Guard
        </p>
        <h2 id="why-title" className={`${s.h2} ${s.reveal}`}>
          <span>A reviewer that earns trust</span>
          <span>
            by checking
            <span className={`${s.badge} ${s.badgeSky}`} aria-hidden>
              <ScanSearch size={18} strokeWidth={2} />
            </span>
            its findings
          </span>
          <span className={s.grey}>
            and
            <span className={`${s.badge} ${s.badgeLime}`} aria-hidden>
              <GraduationCap size={18} strokeWidth={2.2} />
            </span>
            learning from your team.
          </span>
        </h2>

        <div className={s.grid}>
          {/* 1 — photographic card with an inset stat */}
          <article className={`${s.card} ${s.tall} ${s.photoCard} ${s.reveal}`}>
            <Image src="/marketing/hero-sky.jpg" alt="" fill sizes="(max-width: 640px) 100vw, 33vw" />
            <div className={s.photoTop}>
              <span className={s.brand}>
                <TrackingMark size={26} className={s.brandMark} />
                PR Guard
              </span>
              <span className={s.chip} aria-hidden>
                <ScanSearch size={17} strokeWidth={1.8} />
              </span>
            </div>
            <div className={s.inset}>
              <span className={s.num}>
                {planted.caught}
                <span style={{ color: "rgba(19,19,19,.4)" }}>/{planted.planted}</span>
              </span>
              <p className={s.body}>
                planted bugs named in a finding&rsquo;s title, across {planted.reviews} reviews of {planted.changes} seeded test changes in Python,
                TypeScript, Go and Java.
              </p>
            </div>
          </article>

          {/* 2 — grey card: what actually reaches the pull request */}
          <article className={`${s.card} ${s.tall} ${s.greyCard} ${s.reveal} ${s.reveal2}`}>
            <p className={s.label}>Posted on {prLabel(log.repo, log.pr)}</p>
            <span className={s.bigNum}>{posted}</span>
            <div className={s.people}>
              <span className={s.avatars} aria-hidden>
                {posters.map((name) => (
                  <span key={name} style={{ background: avatarColor(name) }} title={name}>
                    {initialsOf(name)}
                  </span>
                ))}
              </span>
              <span className={s.peopleNote}>
                {log.reviewersRun} of {REVIEWERS.length} reviewers ran on its {log.files} files
              </span>
            </div>
            <div className={s.funnel}>
              <div className={s.funnelBar} role="img" aria-label={`${log.raw} raw: ${posted} posted, ${rejected} rejected, ${filtered} filtered`}>
                <i style={{ width: pct(posted), background: "#131313" }} />
                <i style={{ width: pct(rejected), background: "#94a3b8" }} />
                <i style={{ width: pct(filtered), background: "#cbd5e1" }} />
              </div>
              <div className={s.funnelKey}>
                <span>
                  <i className={s.swatch} style={{ background: "#131313" }} />
                  <b>{posted}</b> posted
                </span>
                <span>
                  <i className={s.swatch} style={{ background: "#94a3b8" }} />
                  <b>{rejected}</b> rejected
                </span>
                <span>
                  <i className={s.swatch} style={{ background: "#cbd5e1" }} />
                  <b>{filtered}</b> filtered
                </span>
              </div>
              <p className={s.body} style={{ color: "rgba(19,19,19,.72)" }}>
                of {log.raw} raw findings. Dedupe and filters removed {filtered}, and verification rejected {rejected} against the code.
              </p>
            </div>
          </article>

          {/* 3 — lime over navy */}
          <div className={s.stack}>
            <article className={`${s.card} ${s.limeCard} ${s.reveal} ${s.reveal3}`}>
              <p className={s.label}>Approvals or blocks</p>
              <span className={s.bigNum}>{blockingReviews() + failedChecks()}</span>
              <p className={s.body}>Every review is a comment and its check never concludes failure, so a person decides the merge.</p>
              <span className={s.nMark}>n = {t.reviews} reviews</span>
            </article>
            <article className={`${s.card} ${s.navyCard} ${s.reveal} ${s.reveal3}`}>
              <p className={s.label}>
                Median, PR opened to review
                <span style={{ display: "block", marginTop: 4, fontSize: 12, opacity: 0.6 }}>n = {t.reviewTimingN} pull requests</span>
              </p>
              <span className={s.navyNum}>
                {t.medianSecondsToFirstReview}
                <span className={s.unit}>s</span>
              </span>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
