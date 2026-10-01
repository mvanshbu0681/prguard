// PR Guard v2 hero, rebuilt on the otoma8.com system: a photographic frame with
// the nav inside it, a centred Plus Jakarta headline, the lime pill with its
// arrow chip, and a drifting row of real product cards. Server component: every
// number on it is what PR Guard posted on the public sandbox (src/sandbox).
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { TrackingMark } from "@/components/brand/TrackingMark";
import { APP_URL, BOT, CODE_CHECKS, MODEL_REVIEWERS, WALKTHROUGH_LOG, blockingReviews, failedChecks, prLabel, sandbox } from "@/sandbox";
import { v2FontVariables } from "../fonts";
import { HeroCards, type HeroCardData } from "./cards";
import s from "./hero.module.css";

const HOUR = 3_600_000;

/** Reviews per hour from the first review to the last, with empty hours as 0. */
function reviewsPerHour(): number[] {
  const counts = new Map(sandbox.reviewsByHour.map((h) => [Date.parse(h.hour), h.count]));
  const hours = [...counts.keys()].sort((a, b) => a - b);
  if (!hours.length) return [];
  const out: number[] = [];
  for (let t = hours[0]; t <= hours[hours.length - 1]; t += HOUR) out.push(counts.get(t) ?? 0);
  return out;
}

function heroData(): HeroCardData {
  const show = sandbox.showcase;
  const comment = show.findings.find((f) => f.verified && f.severity === "high") ?? show.findings[0];
  const top = show.severityCounts[0];
  return {
    reviewLabel: prLabel(show.repo, show.pr),
    priority: show.priority?.alt ?? "",
    risk: show.risk?.alt ?? "",
    findings: show.findings.length,
    severityCounts: show.severityCounts,
    topSeverityLabel: top ? `${top.count} ${top.severity}` : "",
    commentTitle: comment?.title ?? "",
    commentVerified: comment?.verified ?? false,
    checkConclusion: show.check?.conclusion ?? "",
    checkTitle: show.check?.title ?? "",
    walkthroughLabel: prLabel(WALKTHROUGH_LOG.repo, WALKTHROUGH_LOG.pr),
    raw: WALKTHROUGH_LOG.raw,
    posted: WALKTHROUGH_LOG.posted,
    rejected: WALKTHROUGH_LOG.rejected,
    pullRequestsReviewed: sandbox.totals.pullRequestsReviewed,
    reviews: sandbox.totals.reviews,
    reviewsPerHour: reviewsPerHour(),
    helpSeconds: sandbox.commands.asked.find((c) => c.command === "@prguard help")?.answeredInSeconds ?? null,
    bot: BOT,
  };
}

const NAV = [
  { href: "#proof", label: "Product" },
  { href: "#pipeline", label: "How it works" },
  { href: "#team", label: "Reviewers" },
  { href: sandbox.orgUrl, label: "Sandbox" },
];

export function Hero() {
  const d = heroData();
  const t = sandbox.totals;

  return (
    <section id="proof" className={`${s.wrap} ${v2FontVariables}`} aria-labelledby="hero-title">
      <div className={s.frame}>
        {/* The photo box is taller than the frame and anchored to the top, which pushes
            the cumulus tower down under the cards and keeps open sky behind the copy. */}
        <div className={s.photoBox} aria-hidden>
          <Image src="/marketing/hero-sky.jpg" alt="" fill priority sizes="100vw" className={s.photo} />
        </div>
        <div className={s.shade} aria-hidden />

        <header className={`${s.nav} ${s.rise}`}>
          <Link href="/" className={s.logo} aria-label="PR Guard home">
            <TrackingMark size={30} className={s.logoMark} />
            PR Guard
          </Link>
          <nav className={s.links} aria-label="Primary">
            {NAV.map((n) => (
              <Link key={n.label} href={n.href} className={s.link}>
                {n.label}
              </Link>
            ))}
          </nav>
          <Link href={APP_URL} className={`${s.pill} ${s.navCta}`}>
            <span className={s.navCtaFull}>Install on GitHub</span>
            <span className={s.navCtaShort}>Install</span>
          </Link>
        </header>

        <div className={s.content}>
          <h1 id="hero-title" className={`${s.h1} ${s.rise}`} style={{ ["--d" as string]: "80ms" }}>
            AI code review that
            <span className={s.soft}>checks its findings</span>
          </h1>
          <p className={`${s.sub} ${s.rise}`} style={{ ["--d" as string]: "180ms" }}>
            PR Guard runs {MODEL_REVIEWERS} AI reviewers and {CODE_CHECKS} code checks on every pull request, re-checks what they find
            against your code, and only comments. A person still approves the merge.
          </p>
          <div className={`${s.actions} ${s.rise}`} style={{ ["--d" as string]: "280ms" }}>
            <Link href={sandbox.showcase.url} className={`${s.pill} ${s.glass}`}>
              See a real review
            </Link>
            <Link href={APP_URL} className={`${s.pill} ${s.lime}`}>
              Install on GitHub
              <span className={s.chip} aria-hidden>
                <ArrowUpRight size={18} strokeWidth={2} />
              </span>
            </Link>
          </div>
        </div>

        <div className={`${s.row} ${s.rise}`} style={{ ["--d" as string]: "420ms" }} aria-label="What PR Guard posts">
          <div className={s.track}>
            <HeroCards d={d} />
            <div aria-hidden style={{ display: "contents" }}>
              <HeroCards d={d} />
            </div>
          </div>
        </div>

        <div className={`${s.proofWrap} ${s.rise}`} style={{ ["--d" as string]: "520ms" }}>
          <p className={s.proofLine}>
            <span className={s.dot} aria-hidden />
            <span>
              <b>{t.reviews}</b> reviews on <b>{t.pullRequestsReviewed}</b> public sandbox pull requests · <b>{t.findings}</b> line comments ·{" "}
              <b>{blockingReviews() + failedChecks()}</b> approvals or blocks
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
