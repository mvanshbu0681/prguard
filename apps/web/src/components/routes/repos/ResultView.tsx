'use client';
// The review, done: which bugs are real and which are not. The verdict first
// (blocked: an ink card; clear: the grass photograph; neutral: a grey card),
// then one instrument that accounts for every claim raised, then the findings
// in the three groups that matter — proven (blocks the merge), advisory
// (posted as comments), refuted by execution (never shown on the PR) — and,
// folded away, what the coordinator dropped. The pipeline strip closes it.
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Button, Card, GateBadge, GlassTile, PhotoCard, PROOF_COLOR, Rise, StackBar, Tag } from '@/components/dash/kit';
import { relTime, seconds } from '@/components/dash/format';
import { cn } from '@/lib/utils';
import { GithubMark } from './GithubMark';
import { EvidenceSheet } from './EvidenceSheet';
import { bySeverity, groupOf, slugOf, type AnalysisResult, type DisplayFinding, type PullMeta, type RepoRef, type RunHistoryItem, type RunScript } from './model';
import { Code, FindingCard, SpecialistChip, STAGE_LOOK } from './shared';
import s from './repos.module.css';

export interface ResultViewProps {
  result: AnalysisResult;
  meta: PullMeta;
  script: RunScript;
  history: RunHistoryItem[];
  repo: RepoRef;
  /** True when this result came from a review simulated in this browser. */
  simulated: boolean;
  /** Where a simulated review's findings come from: this repository's own reviews, or the demo corpus (an imported repository). */
  borrowedFrom: 'repo' | 'corpus';
  /** True only for the run with a recorded replay. */
  replayable: boolean;
  onGithub: () => void;
}

function Group({ id, title, soft, count, children, empty }: { id: string; title: string; soft: string; count: number; children?: ReactNode; empty?: ReactNode }) {
  return (
    <section aria-labelledby={id} className={s.group}>
      <div className={s.groupHead}>
        <h2 id={id} className={s.groupTitle}>
          {title}
          <span className={s.groupSoft}> — {soft}</span>
        </h2>
        <span className={s.groupCount}>{count}</span>
      </div>
      {count ? children : empty}
    </section>
  );
}

export function ResultView({ result, meta, repo, script, history, simulated, borrowedFrom, replayable, onGithub }: ResultViewProps) {
  const [open, setOpen] = useState<DisplayFinding | null>(null);
  const onOpen = simulated ? (f: DisplayFinding) => setOpen(f) : undefined;
  const groups = { proven: [] as DisplayFinding[], advisory: [] as DisplayFinding[], refuted: [] as DisplayFinding[], suppressed: [] as DisplayFinding[], dropped: [] as DisplayFinding[] };
  for (const f of result.findings) groups[groupOf(f)].push(f);
  for (const k of Object.keys(groups) as (keyof typeof groups)[]) groups[k].sort(bySeverity);
  const c = result.counts;
  const runHref = result.reviewId ? `/runs/${result.reviewId}` : null;
  const duration = result.durationS || script.totalMs / 1000;

  const primary = runHref ? (
    <Button variant="primary" size="lg" chip href={runHref}>
      Open full run
    </Button>
  ) : (
    <Button variant="primary" size="lg" chip={GithubMark} chipStill onClick={onGithub}>
      View on GitHub
    </Button>
  );
  const secondary = (onPhoto: boolean) =>
    runHref ? (
      <Button variant={onPhoto ? 'glass' : result.gate === 'failure' ? 'secondary' : 'outline'} size="lg" icon={GithubMark} onClick={onGithub} className={result.gate === 'failure' ? s.onInkBtn : undefined}>
        View on GitHub
      </Button>
    ) : null;

  const reason = (
    <p className={s.verdictReason}>
      <span className={s.verdictCheck}>witness/merge-gate</span> {result.gateReason}
    </p>
  );

  return (
    <div className="flex flex-col gap-8">
      {simulated ? (
        <Rise>
          <p className={s.simNote} role="note">
            <Tag tone="dashed" size="sm">
              Simulated
            </Tag>
            <span>
              {borrowedFrom === 'repo'
                ? `This review ran in your browser. Its findings are real ones from ${slugOf(repo)}’s recorded reviews, replayed for this pull request.`
                : `Witness cannot read ${slugOf(repo)} in this demo. These findings are examples from the acme demo corpus, to show what a review of this pull request returns.`}
            </span>
          </p>
        </Rise>
      ) : null}
      <Rise>
        {result.gate === 'failure' ? (
          <Card tone="ink" pad="none" className={s.verdict} data-gate="failure">
            <div className={s.verdictCopy}>
              <GateBadge conclusion="failure" size="lg" />
              <h2 className={s.verdictTitle}>
                Merge blocked.
                <span className={s.verdictSoft}> {c.blocking === 1 ? 'One bug is proven.' : `${c.blocking} bugs are proven.`}</span>
              </h2>
              {reason}
              <div className={s.verdictActions}>
                {primary}
                {secondary(false)}
              </div>
            </div>
            <div className={s.verdictProof}>
              {groups.proven.slice(0, 2).map((f) => (
                <div key={f.id} className={s.verdictTile}>
                  <p className={s.verdictTileTitle}>
                    <Code text={f.title} />
                  </p>
                  <p className={s.verdictTileLoc}>
                    {f.file}
                    {f.line != null ? `:${f.line}` : ''}
                  </p>
                  <div className={s.verdictRuns}>
                    <span data-ok="">
                      {meta.baseSha ? `base ${meta.baseSha.slice(0, 7)}` : 'base'} · {f.baseLine ?? 'passed'}
                    </span>
                    <span data-bad="">
                      {meta.headSha ? `head ${meta.headSha.slice(0, 7)}` : 'head'} · {f.headLine ?? 'failed'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : result.gate === 'success' ? (
          <PhotoCard src="/marketing/cta-grass.jpg" position="50% 45%" pad="none" className={s.verdict} data-gate="success">
            <span className={s.verdictShade} aria-hidden />
            <div className={s.verdictCopy}>
              <GateBadge conclusion="success" size="lg" className={s.onPhotoBadge} />
              <h2 className={cn(s.verdictTitle, s.onPhoto)}>
                Clear to merge.
                <span className={s.verdictSoftPhoto}> Nothing was proven.</span>
              </h2>
              <p className={cn(s.verdictReason, s.onPhotoText)}>
                <span className={s.verdictCheck}>witness/merge-gate</span> {result.gateReason}
              </p>
              <div className={s.verdictActions}>
                {primary}
                {secondary(true)}
              </div>
            </div>
            <div className={s.verdictProof}>
              <GlassTile tone="white" className={s.verdictGlass}>
                <span className={s.verdictGlassNum}>{c.raised}</span>
                <span className={s.verdictGlassLabel}>claims raised, every one settled</span>
              </GlassTile>
            </div>
          </PhotoCard>
        ) : (
          <Card tone="panel" pad="none" className={s.verdict} data-gate="neutral">
            <div className={s.verdictCopy}>
              <GateBadge conclusion="neutral" size="lg" />
              <h2 className={s.verdictTitle}>
                Nothing blocks.
                <span className={s.verdictSoftMuted}> {c.inconclusive ? 'One claim did not settle.' : 'Only advisory findings.'}</span>
              </h2>
              {reason}
              <div className={s.verdictActions}>
                {primary}
                {secondary(false)}
              </div>
            </div>
          </Card>
        )}
      </Rise>

      <Rise delay={70}>
        <Card tone="surface" pad="lg" className={s.ledger}>
          <div className={s.ledgerHead}>
            <p className={s.ledgerTitle}>
              <b>{c.raised}</b> claims raised
              <span className={s.ledgerSoft}>
                {' '}
                ·{' '}
                {c.blocking === 0 ? (
                  'nothing blocks the merge'
                ) : (
                  <span className={s.ledgerBlocks}>
                    {c.blocking} {c.blocking === 1 ? 'blocks' : 'block'} the merge
                  </span>
                )}{' '}
                · reviewed in {seconds(duration)}
              </span>
            </p>
          </div>
          <StackBar
            size="lg"
            legend={false}
            label={`${c.proven} proven, ${c.refuted} refuted, ${c.advisory} advisory, ${c.dropped + c.suppressed} dropped as noise`}
            segments={[
              { value: c.proven, color: PROOF_COLOR.proven, label: 'proven' },
              { value: c.refuted, color: PROOF_COLOR.disproven, label: 'refuted' },
              { value: c.advisory, color: ADVISORY_COLOR, label: 'advisory' },
              { value: c.dropped + c.suppressed, color: DROPPED_COLOR, label: 'dropped' },
            ]}
          />
          <div className={s.ledgerCells}>
            <LedgerCell
              swatch={PROOF_COLOR.proven}
              value={c.proven}
              label="Proven bugs"
              hint={c.proven > c.blocking ? `${c.blocking} ${c.blocking === 1 ? 'blocks' : 'block'}; ${c.proven - c.blocking} below the gate threshold` : 'Fail at head, pass at base'}
            />
            <LedgerCell swatch={PROOF_COLOR.disproven} value={c.refuted} label="Refuted claims" hint="Witness disproved its own claim" />
            <LedgerCell swatch={ADVISORY_COLOR} value={c.advisory} label="Advisory" hint="Posted as comments, never blocks" />
            <LedgerCell swatch={DROPPED_COLOR} value={c.dropped + c.suppressed} label="Dropped as noise" hint={c.suppressed ? `${c.suppressed} by a suppression rule` : 'Noise and duplicates'} />
          </div>
        </Card>
      </Rise>

      <Rise delay={130} className="flex flex-col gap-8">
        <Group
          id="g-proven"
          title="Proven"
          soft="blocks the merge"
          count={groups.proven.length}
          empty={<p className={s.groupEmpty}>No claim was proven. Nothing on this pull request holds the merge.</p>}
        >
          <div className={s.findGrid} data-single={groups.proven.length === 1 ? '' : undefined}>
            {groups.proven.map((f) => (
              <FindingCard key={f.id} f={f} baseSha={meta.baseSha} headSha={meta.headSha} onOpen={onOpen} />
            ))}
          </div>
        </Group>
        {groups.advisory.length ? (
          <Group id="g-advisory" title="Advisory" soft="posted as comments" count={groups.advisory.length}>
            <div className={s.findGrid}>
              {groups.advisory.map((f) => (
                <FindingCard key={f.id} f={f} baseSha={meta.baseSha} headSha={meta.headSha} onOpen={onOpen} />
              ))}
            </div>
          </Group>
        ) : null}
        {groups.refuted.length ? (
          <Group id="g-refuted" title="Refuted by execution" soft="never shown on the PR" count={groups.refuted.length}>
            <div className={s.findGrid}>
              {groups.refuted.map((f) => (
                <FindingCard key={f.id} f={f} baseSha={meta.baseSha} headSha={meta.headSha} quiet onOpen={onOpen} />
              ))}
            </div>
          </Group>
        ) : null}
        {groups.dropped.length + groups.suppressed.length ? (
          <details className={s.dropped}>
            <summary className={s.droppedSummary}>
              <span>
                <b>{groups.dropped.length + groups.suppressed.length}</b> dropped before anyone saw them
                <span className={s.ledgerSoft}> · noise, duplicates{groups.suppressed.length ? ', suppression rules' : ''}</span>
              </span>
              <ChevronDown size={16} strokeWidth={2} className={s.droppedChevron} aria-hidden />
            </summary>
            <ul className={s.droppedList}>
              {[...groups.suppressed, ...groups.dropped].map((f) => (
                <li key={f.id} className={s.droppedRow}>
                  <SpecialistChip specialist={f.specialist} />
                  <span className={s.droppedTitle}>
                    <Code text={f.title} />
                  </span>
                  <span className={s.droppedLoc}>{f.file.split('/').pop()}</span>
                  <Tag tone={f.status === 'suppressed' ? 'dashed' : 'soft'} size="sm">
                    {f.status === 'suppressed' ? 'Suppressed' : 'Dropped'}
                  </Tag>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Rise>

      <Rise delay={180}>
        <Card tone="surface" pad="lg" className={s.strip}>
          <div className={s.stripHead}>
            <p className={s.ledgerTitle}>
              Pipeline
              <span className={s.ledgerSoft}> · nine stages · {seconds(script.totalMs / 1000)} in this view{simulated ? ', simulated here' : ''}</span>
            </p>
            {history.length > 1 ? (
              <p className={s.stripHistory}>
                {history.length} runs on this PR ·{' '}
                {history.slice(1, 3).map((h, i) => (
                  <span key={h.reviewId}>
                    {i ? ', ' : ''}
                    <Link href={`/runs/${h.reviewId}`} className={s.inlineLink}>
                      {h.status === 'succeeded' ? (h.gate === 'failure' ? 'blocked' : h.gate === 'success' ? 'clear' : 'neutral') : h.status} {relTime(h.at)}
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
          </div>
          <ol className={s.stripStages}>
            {script.stages.map((st) => {
              const L = STAGE_LOOK[st.key];
              return (
                <li key={st.key} className={s.stripStage}>
                  <span className={s.stripIcon}>
                    <L.icon size={14} strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className={s.stripName}>{L.name}</span>
                  <span className={s.stripTime}>{(st.durationMs / 1000).toFixed(st.durationMs < 1000 ? 2 : 1)}s</span>
                </li>
              );
            })}
          </ol>
          {runHref ? (
            <Link href={replayable ? `${runHref}?replay=1` : runHref} className={s.stripLink}>
              {replayable ? 'Replay the recorded run' : 'Open the full run'} <ArrowUpRight size={13} strokeWidth={2} aria-hidden />
            </Link>
          ) : null}
        </Card>
      </Rise>

      <EvidenceSheet finding={open} meta={meta} repo={repo} borrowedFrom={borrowedFrom} onClose={() => setOpen(null)} />
    </div>
  );
}

/** Posted but unproven, and dropped before anyone saw them: the product-wide greys for "not attempted" / "not applicable". */
const ADVISORY_COLOR = PROOF_COLOR.not_attempted;
const DROPPED_COLOR = PROOF_COLOR.not_applicable;

function LedgerCell({ swatch, value, label, hint }: { swatch: string; value: number; label: string; hint: string }) {
  return (
    <div className={s.ledgerCell}>
      <span className={s.ledgerLabel}>
        <i style={{ background: swatch }} aria-hidden />
        {label}
      </span>
      <span className={s.ledgerNum}>{value}</span>
      <span className={s.ledgerHint}>{hint}</span>
    </div>
  );
}
