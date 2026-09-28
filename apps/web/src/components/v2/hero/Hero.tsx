// Witness v2 hero, rebuilt on the otoma8.com system: a photographic frame with
// the nav inside it, a centred Plus Jakarta headline, the lime pill with its
// arrow chip, and a drifting row of real product cards. Server component: every
// number on it comes from the demo corpus.
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { TrackingMark } from "@/components/brand/TrackingMark";
import { SEVERITY_INPUTS } from "@/lib/contracts";
import { getAccuracy, getAccuracySeries, getAuditChain, getDemoProvenFinding, getDemoResult, getManifest } from "@/lib/fixtures";
import { v2FontVariables } from "../fonts";
import { HeroCards, type HeroCardData } from "./cards";
import s from "./hero.module.css";

const lastLine = (text: string | null | undefined) => (text ?? "").trim().split("\n").pop() ?? "";
const tidy = (line: string) => line.replace(/ in /, " · ");

function heroData(): HeroCardData {
  const { ids } = getManifest();
  const finding = getDemoProvenFinding();
  const proof = finding.proof;
  const severity = finding.severity;
  const accuracy = getAccuracy();
  const series = getAccuracySeries();
  const result = getDemoResult();
  const chain = getAuditChain().items;

  const inputs = (severity?.inputs ?? {}) as Record<string, number>;
  const weights = (severity?.weights ?? {}) as Record<string, number>;
  const contributions = SEVERITY_INPUTS.map((k) => (inputs[k] ?? 0) * (weights[k] ?? 0));

  const weeklyProvenShare = series.weekly.map((w) => {
    const attempted = w.proven + w.disproven + w.inconclusive + (w.skipped_no_env ?? 0);
    return attempted ? w.proven / attempted : 0;
  });

  const at = chain.findIndex((e) => e.seq === ids.tamper_demo_seq);
  const window = chain.slice(Math.max(0, at - 2), Math.max(0, at - 2) + 3);

  const counts = result.counts ?? {};
  return {
    baseSha: ids.base_sha.slice(0, 7),
    headSha: ids.head_sha.slice(0, 7),
    baseResult: tidy(lastLine(proof?.base?.excerpt)),
    headResult: tidy(lastLine(proof?.head?.excerpt)),
    score: (severity?.score ?? 0).toFixed(3),
    band: severity?.band ?? "",
    contributions,
    proven: accuracy.proof.proven ?? 0,
    disproven: accuracy.proof.disproven ?? 0,
    inconclusive: accuracy.proof.inconclusive ?? 0,
    attempted: accuracy.proof.attempted ?? 0,
    selfCaught: (accuracy.precision_proxies.self_caught_false_positive_rate.value ?? 0).toFixed(3),
    weeklyProvenShare,
    findingTitle: finding.title,
    blocking: (counts as { blocking?: number }).blocking ?? 0,
    advisory: Math.max(0, ((counts as { published?: number }).published ?? 0) - ((counts as { blocking?: number }).blocking ?? 0)),
    chain: window.map((e) => ({ seq: e.seq, hash: `${e.event_hash.slice(0, 6)}…${e.event_hash.slice(-4)}` })),
  };
}

const NAV = [
  { href: "#proof", label: "Product" },
  { href: "#pipeline", label: "How it works" },
  { href: "/accuracy", label: "Accuracy" },
  { href: "/overview", label: "Dashboard" },
];

export function Hero() {
  const d = heroData();
  const demoRun = getManifest().ids.demo_review_id;

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
          <Link href="/" className={s.logo} aria-label="Witness home">
            <TrackingMark size={30} className={s.logoMark} />
            Witness
          </Link>
          <nav className={s.links} aria-label="Primary">
            {NAV.map((n) => (
              <Link key={n.label} href={n.href} className={s.link}>
                {n.label}
              </Link>
            ))}
          </nav>
          <Link href="/overview" className={`${s.pill} ${s.navCta}`}>
            <span className={s.navCtaFull}>Open dashboard</span>
            <span className={s.navCtaShort}>Dashboard</span>
          </Link>
        </header>

        <div className={s.content}>
          <h1 id="hero-title" className={`${s.h1} ${s.rise}`} style={{ ["--d" as string]: "80ms" }}>
            AI code review that
            <span className={s.soft}>proves every claim</span>
          </h1>
          <p className={`${s.sub} ${s.rise}`} style={{ ["--d" as string]: "180ms" }}>
            Witness writes a repro test, runs it at your base and head commit, and lets only a proven bug block the merge.
          </p>
          <div className={`${s.actions} ${s.rise}`} style={{ ["--d" as string]: "280ms" }}>
            <Link href={`/runs/${demoRun}?replay=1`} className={`${s.pill} ${s.glass}`}>
              Watch a live review
            </Link>
            <Link href="#run" className={`${s.pill} ${s.lime}`}>
              Run a review
              <span className={s.chip} aria-hidden>
                <ArrowUpRight size={18} strokeWidth={2} />
              </span>
            </Link>
          </div>
        </div>

        <div className={`${s.row} ${s.rise}`} style={{ ["--d" as string]: "420ms" }} aria-label="What Witness produces">
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
              <b>{d.proven}</b> bugs proven by execution · <b>{d.disproven}</b> of its own claims refuted before they reached a PR
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
