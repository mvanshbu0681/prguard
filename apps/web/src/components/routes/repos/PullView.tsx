'use client';
// /repos/:owner/:name/pulls/:number — one pull request, analysed. Three states:
//   idle      not reviewed yet: the sky card with THE lime "Run Witness review"
//   analysing the nine stages live (LiveRun), timed on live/demo-run.json
//   done      the verdict and the findings, grouped by what proof said (ResultView)
// A corpus PR opens on its real latest run; "Re-run" replays the pipeline over
// the same result. Any other PR runs the simulation, whose findings are
// borrowed deterministically (seeded by the PR) from that repository's own
// corpus findings, or, for an imported repository, from the demo corpus as
// labelled examples. A PR Witness knows nothing about shows only its number.
import { FileCode2, GitPullRequest, Play, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Avatar, Button, Eyebrow, GlassTile, Page, PhotoCard, Rise, Skeleton, Tag } from '@/components/dash/kit';
import { relTime } from '@/components/dash/format';
import { useNow } from './clock';
import { GitHubPreview } from './GitHubPreview';
import { GithubMark } from './GithubMark';
import { LiveRun } from './LiveRun';
import {
  buildScript,
  repoHref,
  sameRepo,
  synthesizeResult,
  syntheticPullByNumber,
  type CorpusFinding,
  type FixturePullData,
  type RepoRef,
  type StageTimingInput,
  type SyntheticContext,
} from './model';
import { ResultView } from './ResultView';
import { BranchChip, STAGE_LOOK } from './shared';
import { analysisFor, isEnabled, reposStore, useReposState, workspaceRepos } from './store';
import s from './repos.module.css';

export interface PullViewProps {
  repo: RepoRef;
  number: number;
  /** True for an acme corpus repository; false for one imported by link. */
  known: boolean;
  /** How to simulate here: the repository's demo PRs and which outcomes its findings support. */
  context: SyntheticContext;
  fixture: FixturePullData | null;
  fixtureRefs: RepoRef[];
  /** The findings a simulated review may borrow (this repository's own, for a corpus repository). */
  pool: CorpusFinding[];
  timing: StageTimingInput[];
  /** The one run with a recorded replay. */
  demoReviewId: string;
}

export function PullView({ repo, number, known, context, fixture, fixtureRefs, pool, timing, demoReviewId }: PullViewProps) {
  const state = useReposState();
  const [ghOpen, setGhOpen] = useState(false);
  const meta = useMemo(() => fixture?.meta ?? syntheticPullByNumber(repo, context, number), [fixture, repo, context, number]);
  const result = useMemo(() => fixture?.result ?? synthesizeResult(repo, meta, pool, null, context.caps), [fixture, repo, meta, pool, context]);
  const script = useMemo(() => buildScript(result, meta, repo, timing), [result, meta, repo, timing]);

  const rec = analysisFor(state, repo, number);
  const endsAt = rec ? rec.startedAt + script.totalMs : 0;
  const coarse = useNow(1000);
  const live = rec != null && (coarse === 0 || coarse < endsAt + 1000);
  const fine = useNow(live ? 100 : 60_000);
  const now = Math.max(coarse, fine);

  const phase: 'loading' | 'idle' | 'running' | 'done' =
    state === null || now === 0 ? 'loading' : rec && now < endsAt ? 'running' : fixture?.result || rec ? 'done' : 'idle';
  const simulated = !fixture?.result;
  const shownResult = simulated && rec ? { ...result, durationS: script.totalMs / 1000, createdAt: new Date(endsAt).toISOString() } : result;
  const placeholder = meta.origin === 'placeholder';

  const start = () => {
    const inWorkspace = workspaceRepos(state, fixtureRefs).some((w) => sameRepo(w.ref, repo));
    if (!inWorkspace) reposStore.importRepo(repo);
    reposStore.startAnalysis(repo, number);
  };

  return (
    <Page className={s.pullPage}>
      <Rise as="header" className={s.prHead}>
        <div className={s.prHeadMain}>
          <Eyebrow lime>
            <Link href={repoHref(repo)} className={s.eyebrowLink}>
              {repo.owner}/{repo.name}
            </Link>
            {' · '}Pull request
          </Eyebrow>
          <h1 className={s.prTitle}>
            {meta.title}
            {placeholder ? null : <span className={s.prNo}> #{meta.number}</span>}
          </h1>
          <div className={s.prMeta}>
            <span className={s.prState} data-state={meta.state}>
              <GitPullRequest size={13} strokeWidth={2} aria-hidden />
              {meta.state === 'open' ? 'Open' : 'Merged'}
            </span>
            {meta.origin !== 'corpus' ? (
              <Tag tone="dashed" size="sm" title={placeholder ? 'Witness has not read this pull request' : 'A demo pull request, not in the recorded corpus'}>
                Simulated
              </Tag>
            ) : null}
            {placeholder ? (
              <span className={s.prStat}>Author, branches and diff appear once GitHub is connected.</span>
            ) : (
              <>
                <span className={s.prAuthor}>
                  <Avatar name={meta.author} size={22} />
                  <b>{meta.author}</b> wants to merge
                </span>
                <span className={s.prBranches}>
                  <BranchChip>{meta.headBranch}</BranchChip>
                  <span className={s.pullInto}>→</span>
                  <BranchChip>{meta.baseBranch}</BranchChip>
                </span>
                <span className={s.prStat}>
                  <FileCode2 size={13} strokeWidth={1.9} aria-hidden /> {meta.files} files
                </span>
                <span className={s.pullDiff}>
                  <span data-add="">+{meta.additions}</span> <span data-del="">−{meta.deletions}</span>
                </span>
                <span className={s.prStat}>updated {relTime(meta.updatedAt)}</span>
              </>
            )}
            {state && !isEnabled(state, repo) ? (
              <Tag tone="warn" size="sm">
                Witness paused
              </Tag>
            ) : null}
          </div>
        </div>
        <div className={s.prActions}>
          {phase === 'done' ? (
            <Button variant="outline" icon={RotateCcw} onClick={start}>
              Re-run review
            </Button>
          ) : (
            <Button variant="outline" icon={GithubMark} onClick={() => setGhOpen(true)}>
              View on GitHub
            </Button>
          )}
        </div>
      </Rise>

      {phase === 'loading' ? (
        <Skeleton style={{ height: 380, borderRadius: 20 }} />
      ) : phase === 'idle' ? (
        <IdleCard
          number={meta.number}
          files={placeholder ? null : meta.files}
          totalMs={script.totalMs}
          onStart={start}
          stages={script.stages.map((x) => ({ key: x.key, ms: x.durationMs }))}
        />
      ) : phase === 'running' ? (
        <LiveRun script={script} result={result} meta={meta} elapsed={now - rec!.startedAt} />
      ) : (
        <ResultView
          result={shownResult}
          meta={meta}
          repo={repo}
          script={script}
          history={fixture?.history ?? []}
          simulated={simulated}
          borrowedFrom={known ? 'repo' : 'corpus'}
          replayable={shownResult.reviewId === demoReviewId}
          onGithub={() => setGhOpen(true)}
        />
      )}

      <GitHubPreview open={ghOpen} onOpenChange={setGhOpen} repo={repo} meta={meta} result={phase === 'done' ? shownResult : null} demo={known} />
    </Page>
  );
}

function IdleCard({
  number,
  files,
  totalMs,
  stages,
  onStart,
}: {
  number: number;
  /** Null when the diff is unknown (a placeholder PR). */
  files: number | null;
  totalMs: number;
  stages: { key: keyof typeof STAGE_LOOK; ms: number }[];
  onStart: () => void;
}) {
  return (
    <Rise delay={60}>
      <PhotoCard pad="none" position="6% 30%" priority className={s.idle}>
        <span className={s.heroShade} aria-hidden />
        <div className={s.idleCopy}>
          <Tag tone="glass" size="sm">
            Not reviewed yet
          </Tag>
          <h2 className={s.idleTitle}>
            Run Witness on #{number}.<span className={s.heroSoft}> About {Math.round(totalMs / 1000)} seconds.</span>
          </h2>
          <p className={s.heroSub}>
            Four specialists read the {files != null ? `${files}-file ` : ''}diff. Each claim gets a repro test at base and head, and only a proven bug can hold the merge.
          </p>
          <div className={s.heroActions}>
            <Button variant="primary" size="lg" chip={Play} chipStill onClick={onStart}>
              Run Witness review
            </Button>
          </div>
        </div>
        <GlassTile tone="navy" className={s.idleStages} aria-hidden>
          <p className={s.idleStagesHead}>
            Nine stages <span className={s.noCaps}>~{(totalMs / 1000).toFixed(1)}s</span>
          </p>
          <ol>
            {stages.map((st, i) => {
              const L = STAGE_LOOK[st.key];
              return (
                <li key={st.key}>
                  <span className={s.idleStageIcon}>
                    <L.icon size={13} strokeWidth={2} />
                  </span>
                  <span className={s.idleStageName}>
                    {String(i + 1).padStart(2, '0')} {L.name}
                  </span>
                  <span className={s.idleStageMs}>{(st.ms / 1000).toFixed(st.ms < 1000 ? 2 : 1)}s</span>
                </li>
              );
            })}
          </ol>
          <p className={s.idleNote}>Every stage is written to the audit chain.</p>
        </GlassTile>
      </PhotoCard>
    </Rise>
  );
}
