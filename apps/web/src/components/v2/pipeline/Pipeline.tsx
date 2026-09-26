// Section 7, rebuilt on the otoma8.com "TESTIMONIALS" composition: a left
// heading with prev/next controls over a full-bleed carousel of 422x480 video
// cards. Here each "video" is one of the nine pipeline stages, a looping UI of
// what that stage did in the demo review; the quote is what it did and the name
// slot is how long it took. Every value is read from the demo corpus.
import type { JSX } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Combine,
  FingerprintPattern,
  FlaskConical,
  FolderTree,
  Gauge,
  MessageSquareText,
  Play,
  ShieldCheck,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { getAuditChain, getDemoProvenFinding, getDemoResult, getDemoRun, getFindings, getManifest } from "@/lib/fixtures";
import type { Stage } from "@/lib/contracts";
import { CarouselButtons } from "../caught/CarouselButtons";
import {
  ContextScene,
  CoordinatorScene,
  DeliveryScene,
  FinaliseScene,
  IdentityScene,
  IngestScene,
  ProofScene,
  SeverityScene,
  SpecialistsScene,
  type SceneData,
} from "./scenes";
import s from "./pipeline.module.css";

const TRACK_ID = "pipeline-track";

const SPECIALISTS = [
  { key: "bugs", initials: "BG", color: "#1f2937" },
  { key: "security", initials: "SC", color: "#475569" },
  { key: "tests", initials: "TS", color: "#334155" },
  { key: "quality", initials: "QA", color: "#57534e" },
];

const RUNGS: [key: "inline_exact" | "inline_nearest" | "file_level" | "summary_only", chip: string, prose: string][] = [
  ["inline_exact", "exact line", "the exact line"],
  ["inline_nearest", "nearest", "the nearest line"],
  ["file_level", "file", "file level"],
  ["summary_only", "summary", "the summary"],
];

type Bg = "sky" | "ink" | "navy";
const LOOK: Record<Stage, { name: string; icon: LucideIcon; bg: Bg; Scene: (p: { d: SceneData }) => JSX.Element }> = {
  ingest: { name: "Ingest", icon: Webhook, bg: "sky", Scene: IngestScene },
  context: { name: "Context", icon: FolderTree, bg: "ink", Scene: ContextScene },
  specialists: { name: "Specialists", icon: Users, bg: "navy", Scene: SpecialistsScene },
  coordinator: { name: "Coordinator", icon: Combine, bg: "sky", Scene: CoordinatorScene },
  severity: { name: "Severity", icon: Gauge, bg: "ink", Scene: SeverityScene },
  identity: { name: "Identity", icon: FingerprintPattern, bg: "navy", Scene: IdentityScene },
  proof: { name: "Proof", icon: FlaskConical, bg: "sky", Scene: ProofScene },
  delivery: { name: "Delivery", icon: MessageSquareText, bg: "ink", Scene: DeliveryScene },
  finalise: { name: "Finalise", icon: ShieldCheck, bg: "navy", Scene: FinaliseScene },
};
const CROPS = ["20% 30%", "70% 60%", "40% 20%"];

const last = (text: string | null | undefined) => (text ?? "").trim().split("\n").pop() ?? "";
const joinAnd = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function Pipeline() {
  const { ids } = getManifest();
  const run = getDemoRun();
  const result = getDemoResult();
  const proven = getDemoProvenFinding();
  const findings = result.findings ?? [];
  const chain = getAuditChain().items.filter((e) => e.review_id === result.review_id);
  const suppressed = getFindings().find((f) => f.review_id === result.review_id && f.status === "suppressed");

  const ctx = result.context;
  const excluded = Object.entries(ctx?.excluded_reasons ?? {});
  const reviewedPaths = [...new Set(findings.map((f) => f.location?.file_path).filter((p): p is string => !!p))];
  const unseen = (ctx?.files_reviewed ?? 0) - reviewedPaths.length;
  const counts = result.counts;
  const proposed = counts?.proposed ?? findings.length;
  const dropped = counts?.dropped ?? 0;
  const ladder = result.delivery?.ladder_breakdown;
  const headLines = (proven.proof?.head?.excerpt ?? "").split("\n");
  const tally = (st: string) => findings.filter((f) => f.proof?.status === st).length;
  const short = (sha: string) => sha.slice(0, 7);

  const d: SceneData = {
    repo: `${result.repository.owner}/${result.repository.name}`,
    pr: result.pull_request.number,
    author: result.pull_request.author ?? "",
    base: short(result.pull_request.base_sha ?? ids.base_sha),
    head: short(result.pull_request.head_sha ?? ids.head_sha),
    files: [
      ...reviewedPaths.map((path) => ({ path, reviewed: true })),
      ...(unseen > 0 ? [{ path: `+${unseen} more`, reviewed: true }] : []),
      ...excluded.map(([path, why]) => ({ path, reviewed: false, note: why })),
    ],
    filesReviewed: ctx?.files_reviewed ?? 0,
    filesExcluded: ctx?.files_excluded ?? 0,
    lanes: SPECIALISTS.map((p) => ({ ...p, count: findings.filter((f) => f.specialist === p.key).length })),
    chips: findings.map((f) => {
      const p = SPECIALISTS.find((x) => x.key === f.specialist) ?? SPECIALISTS[0];
      return { initials: p.initials, color: p.color, dropped: f.status === "dropped" };
    }),
    kept: proposed - dropped,
    proven,
    fingerprint: proven.fingerprint ?? "",
    seenRuns: proven.history?.occurrence_count ?? 0,
    suppressedTitle: (suppressed?.title ?? "").replace(/`/g, ""),
    suppressedScope: suppressed?.suppression?.scope ?? "",
    testFile: (proven.proof?.test_file_path ?? ids.repro_test_path).split("/").pop() ?? "",
    baseLine: last(proven.proof?.base?.excerpt),
    headLine: last(proven.proof?.head?.excerpt),
    errorLine: (headLines.find((l) => l.startsWith("E ")) ?? "").replace(/^E\s+/, "E  "),
    proofTally: { proven: tally("proven"), disproven: tally("disproven"), inconclusive: tally("inconclusive") },
    ladder: RUNGS.map(([k, chip]) => ({ label: chip, count: ladder?.[k] ?? 0 })),
    commentLine: proven.delivery?.delivered_line ?? proven.location?.start_line ?? null,
    gateReason: result.gate?.reason ?? "",
    gateContext: result.gate?.context_name ?? "",
    chain: chain.slice(-3).map((e) => ({ seq: e.seq, type: e.event_type, hash: `${e.event_hash.slice(0, 6)}…${e.event_hash.slice(-2)}` })),
    events: chain.length,
  };

  const band = proven.severity?.band ?? "";
  const rungsUsed = RUNGS.filter(([k]) => (ladder?.[k] ?? 0) > 0).map(([, , prose]) => prose);
  const QUOTES: Record<Stage, string> = {
    ingest: `Resolves PR #${d.pr} on ${d.repo} and fetches the diff between ${d.base} and ${d.head}.`,
    context: `Builds context from ${ctx?.files_changed ?? 0} changed files. ${excluded[0]?.[0] ?? "Nothing"} is left out as a ${excluded[0]?.[1] ?? "file"}.`,
    specialists: `Bugs, security, tests and quality read the diff at the same time and raise ${proposed} findings.`,
    coordinator: `Merges the four passes and drops ${dropped} findings as noise or duplicates. ${d.kept} go on.`,
    severity: `Scores every finding from six stored inputs. The top one lands at ${(proven.severity?.score ?? 0).toFixed(3)}, ${band}.`,
    identity: `Fingerprints each finding and checks the suppression ledger. ${counts?.suppressed ?? 0} matches an existing rule.`,
    proof: `Writes repro tests and runs them at base and head: ${d.proofTally.proven} proven, ${d.proofTally.disproven} refuted, ${d.proofTally.inconclusive} inconclusive.`,
    delivery: `Posts ${result.delivery?.comments_posted ?? 0} comments: on ${joinAnd(rungsUsed)}.`,
    finalise: `Sets the merge gate to ${result.gate?.conclusion === "failure" ? "failing" : "passing"} and seals ${chain.length} events into the audit chain.`,
  };
  const total = run.stages.reduce((sum, st) => sum + st.duration_ms, 0) / 1000;
  const replay = `/runs/${run.review_id}?replay=1`;

  return (
    <section id="pipeline" className={s.section} aria-labelledby="pipeline-title">
      <div className={`${s.inner} ${s.reveal}`}>
        <div className={s.headText}>
          <p className={s.eyebrow}>
            <span aria-hidden>•</span>How it works
          </p>
          <h2 id="pipeline-title" className={s.h2}>
            Nine stages. One comment.
          </h2>
          <p className={s.sub}>
            Follow the demo review of PR #{d.pr} from the webhook to the merge gate: {total.toFixed(1)} seconds, start to finish.
          </p>
        </div>
        <CarouselButtons trackId={TRACK_ID} label="stage" className={s.nav} buttonClassName={s.navBtn} />
      </div>

      <div id={TRACK_ID} className={s.trackRow} role="region" aria-label="Pipeline stages" tabIndex={0}>
        {run.stages.map((st, i) => {
          const look = LOOK[st.key as Stage];
          if (!look) return null;
          const { Scene, icon: Icon } = look;
          return (
            <Link
              key={st.key}
              href={replay}
              className={`${s.card} ${s[look.bg]}`}
              style={{ ["--phase" as string]: `${(i * 1.7) % 8}s` }}
              aria-label={`Stage ${i + 1}, ${look.name}: ${QUOTES[st.key as Stage]} Replay the run.`}
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
                <Play size={20} strokeWidth={2} fill="currentColor" />
              </span>
              <div className={s.caption} aria-hidden>
                <Icon size={22} strokeWidth={1.8} className={s.capIcon} />
                <p className={s.quote}>{QUOTES[st.key as Stage]}</p>
                <p className={s.who}>- {(st.duration_ms / 1000).toFixed(2)}s</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
