'use client';
// The run's header: the landing hero, walked inside. The pull request sits on the
// sky photograph in white, its identity in glass chips; along the bottom, the
// run's artefacts as the hero's product cards — the merge-gate verdict (the one
// loud thing on the page: red when a proven bug holds the merge, lime when it is
// clear), the repro test that proved it, the top severity, and the findings
// funnel. While a run is live the verdict card is a ticking clock instead.
import Link from 'next/link';
import { ArrowUpRight, Check, CircleSlash, CornerDownRight, ExternalLink, FlaskConical, GitCommitHorizontal, Play, RotateCcw, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar, Button, GlassTile, PhotoCard, PROOF_COLOR, PROOF_LABEL, ProofBadge, SeverityScore, type ProofKey } from '@/components/dash/kit';
import { plural, sha } from '@/components/dash/format';
import type { Finding, ResultCounts } from '@/lib/api-types';
import { cn } from '@/lib/utils';
import { proofMix, type ProofTally } from './findings-model';
import s from './run.module.css';

/* ==========================================================================
   The verdict card
   ========================================================================== */

export type Verdict =
  | { kind: 'live'; elapsed: string; stageIndex: number; stageName: string; stageLabel: string; queued: boolean }
  | { kind: 'loading' }
  | { kind: 'blocked'; blocking: number; advisory: number; contextName: string; delivery: string | null; findingHref: string | null }
  | { kind: 'clear'; advisory: number; contextName: string; delivery: string | null }
  | { kind: 'neutral'; reason: string | null; contextName: string }
  | { kind: 'failed'; stageName: string | null; code: string | null; message: string | null }
  | { kind: 'superseded'; byHref: string | null; byId: string | null }
  | { kind: 'cancelled'; message: string | null };

const DELIVERY_LABEL: Record<string, string> = { check_run: 'check run', commit_status: 'commit status', dry_run: 'dry run' };

function Chip({ href, label, tone = 'ink' }: { href: string; label: string; tone?: 'ink' | 'white' }) {
  return (
    <Link href={href} className={cn(s.vChip, tone === 'white' && s.vChipWhite)} aria-label={label} title={label}>
      <ArrowUpRight size={16} strokeWidth={2} />
    </Link>
  );
}

export function VerdictCard({ v }: { v: Verdict }) {
  switch (v.kind) {
    case 'live':
      return (
        <div className={cn(s.verdict, s.vLive)} aria-live="polite">
          <span className={s.vLabel}>
            <span className={s.liveDot} aria-hidden /> {v.queued ? 'Queued' : 'Reviewing'}
          </span>
          <span className={s.vSpacer} />
          <span className={cn(s.vWord, s.vClock)}>{v.elapsed}</span>
          <span className={s.vLine}>
            {v.queued ? 'Waiting for a worker to pick this up.' : `Stage ${v.stageIndex} of 9 · ${v.stageName}`}
          </span>
          {!v.queued ? <span className={s.vSub}>{v.stageLabel}</span> : null}
        </div>
      );
    case 'loading':
      return (
        <div className={cn(s.verdict, s.vLive)}>
          <span className={s.vLabel}>Merge gate</span>
          <span className={s.vSpacer} />
          <span className={cn(s.vWord, s.vClock)}>…</span>
          <span className={s.vLine}>Reading the result</span>
        </div>
      );
    case 'blocked':
      return (
        <div className={cn(s.verdict, s.vBlocked)}>
          <span className={s.vLabel}>Merge gate</span>
          <span className={s.vSpacer} />
          <span className={s.vWord}>Blocked</span>
          <span className={s.vLine}>
            {plural(v.blocking, 'proven bug')} {v.blocking === 1 ? 'blocks' : 'block'} this merge.
          </span>
          <span className={s.vSub}>{v.advisory ? `${v.advisory} more ${v.advisory === 1 ? 'is' : 'are'} advisory.` : 'Nothing else was posted.'}</span>
          <span className={s.vFoot}>
            {v.contextName}
            {v.delivery ? ` · ${DELIVERY_LABEL[v.delivery] ?? v.delivery}` : ''}
          </span>
          {v.findingHref ? <Chip href={v.findingHref} label="Open the blocking finding" /> : null}
        </div>
      );
    case 'clear':
      return (
        <div className={cn(s.verdict, s.vClear)}>
          <span className={s.vLabel}>Merge gate</span>
          <span className={s.vSpacer} />
          <span className={s.vWord}>Clear</span>
          <span className={s.vLine}>No proven bug blocks this merge.</span>
          <span className={s.vSub}>{v.advisory ? `${plural(v.advisory, 'advisory comment')} posted.` : 'Nothing needed a comment.'}</span>
          <span className={s.vFoot}>
            {v.contextName}
            {v.delivery ? ` · ${DELIVERY_LABEL[v.delivery] ?? v.delivery}` : ''}
          </span>
        </div>
      );
    case 'neutral':
      return (
        <GlassTile tone="white" className={cn(s.verdict, s.vPlain)}>
          <span className={s.vLabel}>Merge gate</span>
          <span className={s.vSpacer} />
          <span className={s.vWord}>Neutral</span>
          <span className={s.vLine}>Nothing blocks the merge; nothing was fully verified.</span>
          {v.reason ? <span className={s.vSub}>{v.reason}</span> : null}
          <span className={s.vFoot}>{v.contextName}</span>
        </GlassTile>
      );
    case 'failed':
      return (
        <GlassTile tone="white" className={cn(s.verdict, s.vPlain)}>
          <span className={cn(s.vLabel, s.vLabelWarn)}>
            <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> No verdict
          </span>
          <span className={s.vSpacer} />
          <span className={cn(s.vWord, s.vWordSm)}>Run stopped</span>
          <span className={s.vLine}>{v.stageName ? `At the ${v.stageName.toLowerCase()} stage, before the gate was set.` : 'Before the gate was set.'}</span>
          {v.message ? <span className={s.vSub}>{v.message}</span> : null}
          {v.code ? <span className={s.vFoot}>{v.code}</span> : null}
        </GlassTile>
      );
    case 'superseded':
      return (
        <GlassTile tone="white" className={cn(s.verdict, s.vPlain)}>
          <span className={s.vLabel}>
            <CornerDownRight size={12} strokeWidth={2.2} aria-hidden /> Superseded
          </span>
          <span className={s.vSpacer} />
          <span className={cn(s.vWord, s.vWordSm)}>Replaced</span>
          <span className={s.vLine}>A newer push started a fresh review, so this one stopped.</span>
          {v.byId ? <span className={s.vFoot}>by run {sha(v.byId, 8)}</span> : null}
          {v.byHref ? <Chip href={v.byHref} label="Open the newer run" /> : null}
        </GlassTile>
      );
    case 'cancelled':
      return (
        <GlassTile tone="white" className={cn(s.verdict, s.vPlain)}>
          <span className={s.vLabel}>
            <CircleSlash size={12} strokeWidth={2.2} aria-hidden /> Cancelled
          </span>
          <span className={s.vSpacer} />
          <span className={cn(s.vWord, s.vWordSm)}>No verdict</span>
          <span className={s.vLine}>{v.message ?? 'The run was cancelled before the gate was set.'}</span>
        </GlassTile>
      );
  }
}

/* ==========================================================================
   The artefact cards beside it
   ========================================================================== */

function Card({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <GlassTile tone="white" className={cn(s.art, className)}>
      <span className={s.artLabel}>{label}</span>
      {children}
    </GlassTile>
  );
}

/** The repro test that proved the blocking finding: passed at base, failed at head. */
export function ProofArtefact({ finding, baseSha, headSha }: { finding: Finding; baseSha?: string | null; headSha?: string | null }) {
  const p = finding.proof;
  const baseOk = p?.base?.exit_code === 0;
  const headOk = p?.head?.exit_code === 0;
  return (
    <Card label="Repro test · 2 runs">
      <span className={s.vSpacer} />
      <span className={s.runRow}>
        <span className={s.runSha}>base {sha(baseSha)}</span>
        <span className={cn(s.runMark, baseOk ? s.runOk : s.runBad)} aria-hidden>
          {baseOk ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
        </span>
        <span className={s.runResult}>{baseOk ? 'Passed' : 'Failed'}</span>
      </span>
      <span className={s.runRow}>
        <span className={s.runSha}>head {sha(headSha)}</span>
        <span className={cn(s.runMark, headOk ? s.runOk : s.runBad)} aria-hidden>
          {headOk ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
        </span>
        <span className={cn(s.runResult, !headOk && s.runFail)}>{headOk ? 'Passed' : `Failed · exit ${p?.head?.exit_code ?? '—'}`}</span>
      </span>
      <span className={s.artFoot}>
        <ProofBadge status={p?.status} size="sm" />
        {p?.duration_ms != null ? <span className={s.artMeta}>{(p.duration_ms / 1000).toFixed(2)}s</span> : null}
      </span>
    </Card>
  );
}

function ProofKeyList({ mix, extra }: { mix: { key: ProofKey; n: number }[]; extra?: { label: string; n: number } | null }) {
  return (
    <span className={s.funnelKey}>
      {mix.map((m) => (
        <span key={m.key}>
          <i className={s.keySwatch} style={{ background: PROOF_COLOR[m.key] }} aria-hidden />
          {m.n} {PROOF_LABEL[m.key].toLowerCase()}
        </span>
      ))}
      {extra && extra.n > 0 ? (
        <span>
          <i className={cn(s.keySwatch, s.keyDropped)} aria-hidden />
          {extra.n} {extra.label}
        </span>
      ) : null}
    </span>
  );
}

/** No proven finding: what the proof stage did instead, in the proof colour code. */
export function ProofTallyArtefact({ tally }: { tally: ProofTally }) {
  const mix: { key: ProofKey; n: number }[] = [
    { key: 'proven', n: tally.proven },
    { key: 'disproven', n: tally.refuted },
    ...(tally.inconclusive ? [{ key: 'inconclusive' as const, n: tally.inconclusive }] : []),
  ];
  return (
    <Card label="Proof by execution">
      <span className={s.vSpacer} />
      <span className={s.artBig}>{tally.attempted}</span>
      <span className={s.artText}>{tally.attempted === 1 ? 'repro test run' : 'repro tests run'}</span>
      <ProofKeyList mix={mix} extra={{ label: 'not run', n: tally.unrun }} />
    </Card>
  );
}

export function SeverityArtefact({ finding, of }: { finding: Finding; of: number }) {
  return (
    <Card label="Top severity">
      <span className={s.vSpacer} />
      <SeverityScore score={finding.severity?.score} band={finding.severity?.band} size="lg" />
      <span className={s.artText}>{of > 1 ? `highest of ${of} published` : 'the one finding published'}</span>
    </Card>
  );
}

/**
 * What reached the pull request out of what was raised. The bar is the survivors'
 * proof mix in the product's proof colours; the coordinator's dropped findings
 * trail it as a faint track.
 */
export function FunnelArtefact({ counts, findings }: { counts: ResultCounts | null | undefined; findings: readonly Finding[] }) {
  const raised = counts?.proposed ?? 0;
  const published = counts?.published ?? 0;
  const dropped = counts?.dropped ?? findings.filter((f) => f.status === 'dropped').length;
  const mix = proofMix(findings);
  const total = mix.reduce((a, m) => a + m.n, 0) + dropped || 1;
  return (
    <Card label="Findings">
      <span className={s.vSpacer} />
      <span className={s.artBig}>
        {published}
        <span className={s.artOf}>/ {raised}</span>
      </span>
      <span className={s.artText}>published of {plural(raised, 'raised', 'raised')}</span>
      <span className={s.funnel} aria-hidden>
        {mix.map((m) => (
          <i key={m.key} style={{ flexGrow: m.n / total, background: PROOF_COLOR[m.key] }} />
        ))}
        {dropped ? <i className={s.fDropped} style={{ flexGrow: dropped / total }} /> : null}
      </span>
      <ProofKeyList mix={mix} extra={{ label: 'dropped', n: dropped }} />
    </Card>
  );
}

/** A run that stopped: how far it got. */
export function StagesArtefact({ reached, durationLabel }: { reached: number; durationLabel: string }) {
  return (
    <Card label="Pipeline">
      <span className={s.vSpacer} />
      <span className={s.artBig}>
        {reached}
        <span className={s.artOf}>/ 9</span>
      </span>
      <span className={s.artText}>stages finished before it stopped, after {durationLabel}</span>
      <span className={s.stagePips} aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} className={i < reached ? s.pipOn : undefined} />
        ))}
      </span>
    </Card>
  );
}

/** While live: the proof stage ahead (or under way). */
export function LiveProofArtefact({ stageIndex }: { stageIndex: number }) {
  const running = stageIndex === 7;
  const done = stageIndex > 7;
  return (
    <Card label="Proof by execution">
      <span className={s.vSpacer} />
      <span className={cn(s.artIcon, running && s.artIconLive)} aria-hidden>
        <FlaskConical size={20} strokeWidth={1.7} />
      </span>
      <span className={s.artTitle}>{running ? 'Running repro tests' : done ? 'Proofs recorded' : 'Sandboxed run'}</span>
      <span className={s.artText}>{running ? 'at the base and head commits, now' : done ? 'the verdict lands at delivery' : 'at base and head · stage 7'}</span>
    </Card>
  );
}

/** While live: the counters as they arrive. */
export function LiveCountsArtefact({ counts }: { counts: { proposed?: number; suppressed?: number; published?: number; blocking?: number } | null | undefined }) {
  const rows: [string, number][] = [
    ['proposed', counts?.proposed ?? 0],
    ['suppressed', counts?.suppressed ?? 0],
    ['published', counts?.published ?? 0],
    ['blocking', counts?.blocking ?? 0],
  ];
  return (
    <Card label="Findings so far" className={s.artWide}>
      <span className={s.vSpacer} />
      <span className={s.liveCounts}>
        {rows.map(([label, n]) => (
          <span key={label} className={cn(s.liveCount, n > 0 && s.liveCountOn, label === 'blocking' && n > 0 && s.liveCountDanger)}>
            <b key={`${label}-${n}`}>{n}</b>
            <span>{label}</span>
          </span>
        ))}
      </span>
      <span className={s.artText}>Each lands as its stage finishes; published and blocking at delivery.</span>
    </Card>
  );
}

/* ==========================================================================
   The hero
   ========================================================================== */

/** Page titles end with a period (the product's H1 convention), unless the title already carries its own. */
export function withPeriod(title: string): string {
  const t = title.trimEnd();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

export interface RunHeroProps {
  repoLabel: string | null;
  repoName: string | null;
  prNumber: number | null | undefined;
  prTitle: string | null | undefined;
  prAuthor: string | null | undefined;
  prUrl: string | null | undefined;
  baseSha: string | null | undefined;
  headSha: string | null | undefined;
  triggerLabel: string | null;
  riskLabel: string | null;
  timeLabel: string | null;
  onRerun?: () => void;
  rerunPending?: boolean;
  replayHref?: string | null;
  verdict: Verdict;
  artefacts: ReactNode;
}

export function RunHero({
  repoLabel,
  prNumber,
  prTitle,
  prAuthor,
  prUrl,
  baseSha,
  headSha,
  triggerLabel,
  riskLabel,
  timeLabel,
  onRerun,
  rerunPending = false,
  replayHref,
  verdict,
  artefacts,
}: RunHeroProps) {
  return (
    <PhotoCard as="header" className={s.hero} pad="none" position="50% 30%" priority sizes="(max-width: 900px) 100vw, 80vw">
      <div className={s.heroTop}>
        <div className={s.heroId}>
          <div className={s.heroTags}>
            {repoLabel ? <span className={s.heroTag}>{repoLabel}</span> : null}
            {prNumber != null ? <span className={s.heroTag}>#{prNumber}</span> : null}
            {riskLabel ? <span className={s.heroTag}>{riskLabel}</span> : null}
          </div>
          <h1 className={s.heroTitle}>{withPeriod(prTitle ?? (prNumber != null ? `Pull request #${prNumber}` : 'Review'))}</h1>
          <div className={s.heroMeta}>
            {prAuthor ? (
              <span className={cn(s.metaChip, s.heroAuthor)}>
                <Avatar name={prAuthor} size={20} />
                {prAuthor}
              </span>
            ) : null}
            <span className={cn(s.metaChip, s.heroShas)} title={`base ${baseSha ?? '—'} ← head ${headSha ?? '—'}`}>
              <GitCommitHorizontal size={14} strokeWidth={2} aria-hidden />
              <span className={s.shaMono}>{sha(baseSha)}</span>
              <span aria-label="receives">←</span>
              <span className={s.shaMono}>{sha(headSha)}</span>
            </span>
            {triggerLabel ? <span className={s.metaChip}>{triggerLabel}</span> : null}
            {timeLabel ? <span className={s.metaChip}>{timeLabel}</span> : null}
          </div>
        </div>
        <div className={s.heroActions}>
          {onRerun ? (
            <Button
              variant="glass"
              size="sm"
              icon={RotateCcw}
              onClick={() => {
                if (!rerunPending) onRerun();
              }}
              aria-disabled={rerunPending || undefined}
              aria-busy={rerunPending || undefined}
            >
              Re-run
            </Button>
          ) : null}
          {prUrl ? (
            <Button variant="glass" size="sm" icon={ExternalLink} href={prUrl} external>
              View on GitHub
            </Button>
          ) : null}
          {replayHref ? (
            <Button variant="glass" size="sm" chip={Play} chipStill onClick={() => window.location.assign(replayHref)}>
              Watch replay
            </Button>
          ) : null}
        </div>
      </div>
      <div className={s.heroCards}>
        <VerdictCard v={verdict} />
        {artefacts}
      </div>
    </PhotoCard>
  );
}
