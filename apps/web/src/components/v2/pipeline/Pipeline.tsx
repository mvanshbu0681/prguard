// Section 7, rebuilt on the otoma8.com "TESTIMONIALS" composition: a left
// heading with prev/next controls over a full-bleed carousel of 422x480 video
// cards. Here each "video" is one of the nine steps every PR Guard review
// records in its trace, a looping UI of that step; the quote is what it does
// and the name slot is a fact about it. Six steps show the measured review of
// acme-billing#3; checks, learnings and fixes show the sandbox pull requests
// they ran on, and each card names its pull request.
import type { JSX } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  FileSearch,
  FolderTree,
  GitPullRequest,
  GraduationCap,
  MessageSquareText,
  Play,
  ScanSearch,
  ShieldCheck,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import {
  BOT,
  DEFAULTS,
  REVIEWERS,
  TRACE_STEPS,
  WALKTHROUGH_LOG,
  avatarColor,
  blockingReviews,
  initialsOf,
  prLabel,
  sandbox,
  type TraceStep,
} from "@/sandbox";
import { CarouselButtons } from "../caught/CarouselButtons";
import {
  ChecksScene,
  FetchScene,
  FixesScene,
  ImpactScene,
  LearningsScene,
  PublishScene,
  ReviewScene,
  TriageScene,
  VerifyScene,
  type SceneData,
} from "./scenes";
import s from "./pipeline.module.css";

const TRACK_ID = "pipeline-track";

type Bg = "sky" | "ink" | "navy";
const LOOK: Record<TraceStep, { name: string; icon: LucideIcon; bg: Bg; Scene: (p: { d: SceneData }) => JSX.Element }> = {
  fetch: { name: "Fetch", icon: Webhook, bg: "sky", Scene: FetchScene },
  triage: { name: "Triage", icon: FolderTree, bg: "ink", Scene: TriageScene },
  impact: { name: "Impact", icon: FileSearch, bg: "navy", Scene: ImpactScene },
  review: { name: "Review", icon: Users, bg: "sky", Scene: ReviewScene },
  checks: { name: "Checks", icon: ShieldCheck, bg: "ink", Scene: ChecksScene },
  verify: { name: "Verify", icon: ScanSearch, bg: "navy", Scene: VerifyScene },
  learnings: { name: "Learnings", icon: GraduationCap, bg: "sky", Scene: LearningsScene },
  fixes: { name: "Fixes", icon: GitPullRequest, bg: "ink", Scene: FixesScene },
  publish: { name: "Publish", icon: MessageSquareText, bg: "navy", Scene: PublishScene },
};
const CROPS = ["20% 30%", "70% 60%", "40% 20%"];
const short = (sha: string) => sha.slice(0, 7);

export function Pipeline() {
  const w = sandbox.walkthrough;
  const log = WALKTHROUGH_LOG;
  const ignore = sandbox.commands.asked.find((a) => a.command.startsWith("@prguard ignore"));
  const comment = w.findings.find((f) => f.verified && f.severity === "critical") ?? w.findings[0];
  const lanes = Object.entries(w.reviewerCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, initials: initialsOf(name), color: avatarColor(name), count }));

  const d: SceneData = {
    repo: `${sandbox.org}/${w.repo}`,
    pr: w.pr,
    author: w.author,
    base: short(w.baseSha),
    head: short(w.headSha),
    files: w.files.map(({ path, additions }) => ({ path, additions })),
    reviewersRun: log.reviewersRun,
    reviewersTotal: REVIEWERS.length,
    parallelism: DEFAULTS.reviewParallelism,
    lanes,
    raw: log.raw,
    posted: log.posted,
    verified: log.verified,
    rejected: log.rejected,
    verifyFrom: DEFAULTS.verifyFrom,
    comment,
    bot: BOT,
    learning: { text: ignore?.command.replace(/^@prguard ignore\s*/, "") ?? "", pr: prLabel(sandbox.commands.repo, sandbox.commands.pr) },
    learningsInPrompt: DEFAULTS.learningsInPrompt,
    fixed: { title: sandbox.fixed.checkTitle ?? "", pr: prLabel(sandbox.fixed.repo, sandbox.fixed.pr) },
    checkConclusion: w.check?.conclusion ?? "neutral",
    approvals: blockingReviews(),
    checks: sandbox.checkExamples.map((c) => ({ check: c.check, title: (c.title ?? "").replace(/`/g, ""), pr: prLabel(c.repo, c.pr) })),
  };

  const here = prLabel(w.repo, w.pr);
  const QUOTES: Record<TraceStep, string> = {
    fetch: `Takes PR #${w.pr} on ${d.repo} from the webhook and fetches the diff between ${d.base} and ${d.head}.`,
    triage: `One fast call rates the risk of each of the ${w.files.length} changed files and picks the reviewers worth running on it.`,
    impact: "Finds the symbols the change touches in the head snapshot and every other place that uses them, so reviewers see the callers.",
    review: `${log.reviewersRun} of the ${REVIEWERS.length} reviewers read their files, ${DEFAULTS.reviewParallelism} at a time, and raise ${log.raw} raw findings.`,
    checks: "Secrets and Supply chain run as plain code beside the models. Shown: a committed key and a malware package they caught.",
    verify: `A model re-reads the code for each finding of ${DEFAULTS.verifyFrom} severity and up: ${log.verified} confirmed, ${log.rejected} rejected and dropped.`,
    learnings: "The repository's learnings go into every prompt, and a finding a learning covers is not posted again.",
    fixes: "On a later push, findings whose code changed are checked again and marked fixed on the pull request.",
    publish: `Posts one review with ${log.posted} line comments and a ${d.checkConclusion} check. It never approves or requests changes.`,
  };
  // Each card opens the pull request its scene comes from.
  const firstCheck = sandbox.checkExamples[0];
  const HREF: Record<TraceStep, { url: string; label: string }> = {
    fetch: { url: w.url, label: here },
    triage: { url: w.url, label: here },
    impact: { url: w.url, label: here },
    review: { url: w.url, label: here },
    checks: { url: firstCheck?.url ?? w.url, label: firstCheck ? prLabel(firstCheck.repo, firstCheck.pr) : here },
    verify: { url: w.url, label: here },
    learnings: { url: ignore?.url ?? sandbox.commands.url, label: d.learning.pr },
    fixes: { url: sandbox.fixed.url, label: d.fixed.pr },
    publish: { url: w.url, label: here },
  };
  const WHO: Record<TraceStep, string> = {
    fetch: here,
    triage: `${log.triageMs} ms on ${here}`,
    impact: "regex symbols, repo-wide scan",
    review: `${log.reviewersRun} of ${REVIEWERS.length} ran on ${here}`,
    checks: d.checks.map((c) => c.pr).join(" · "),
    verify: `${log.posted} of ${log.raw} posted on ${here}`,
    learnings: d.learning.pr,
    fixes: d.fixed.pr,
    publish: `${log.seconds} s for the whole review`,
  };

  return (
    <section id="pipeline" className={s.section} aria-labelledby="pipeline-title">
      <div className={`${s.inner} ${s.reveal}`}>
        <div className={s.headText}>
          <p className={s.eyebrow}>
            <span aria-hidden>•</span>How it works
          </p>
          <h2 id="pipeline-title" className={s.h2}>
            Nine steps. One review.
          </h2>
          <p className={s.sub}>
            Every review records these steps in its trace. On {here}, {log.files} files took {log.seconds} seconds, {log.calls} model calls and{" "}
            {Math.round(log.tokens / 1000)}K tokens, from the webhook to the posted review.
          </p>
        </div>
        {/* buttonClassName is left to its default so both carousels share the
        exact same arrow-button class from caught.module.css. */}
        <CarouselButtons trackId={TRACK_ID} label="step" className={s.nav} />
      </div>

      <div id={TRACK_ID} className={s.trackRow} role="region" aria-label="Review steps" tabIndex={0}>
        {TRACE_STEPS.map((step, i) => {
          const look = LOOK[step];
          const { Scene, icon: Icon } = look;
          return (
            <Link
              key={step}
              href={HREF[step].url}
              className={`${s.card} ${s[look.bg]}`}
              style={{ ["--phase" as string]: `${(i * 1.7) % 8}s` }}
              aria-label={`Step ${i + 1}, ${look.name}: ${QUOTES[step]} Open ${HREF[step].label} on GitHub.`}
            >
              {look.bg === "sky" ? (
                <Image
                  src="/marketing/hero-sky.jpg"
                  alt=""
                  fill
                  sizes="422px"
                  className={s.photo}
                  style={{ transformOrigin: CROPS[Math.floor(i / 3) % CROPS.length] }}
                />
              ) : null}
              <span className={s.shade} aria-hidden />
              <div className={s.scene} aria-hidden>
                <Scene d={d} />
              </div>
              <span className={s.stageLabel} aria-hidden>
                {String(i + 1).padStart(2, "0")} · {look.name}
              </span>
              <span className={s.play} aria-hidden>
                <Play size={16} strokeWidth={2} fill="currentColor" />
              </span>
              <div className={s.caption} aria-hidden>
                <Icon size={22} strokeWidth={1.8} className={s.capIcon} />
                <p className={s.quote}>{QUOTES[step]}</p>
                <p className={s.who}>{WHO[step]}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
