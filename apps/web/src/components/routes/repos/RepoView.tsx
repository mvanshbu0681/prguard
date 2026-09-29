'use client';
// /repos/:owner/:name — one repository. Identity and the Witness switch up
// top, one instrument card with the four numbers (reviewed, gate outcomes,
// proven bugs, median review time), then the pull requests as composed rows:
// a reviewed PR shows its verdict and opens its run, an unreviewed one offers
// "Analyze", which starts the simulated review and opens its PR page.
import { ArrowUpRight, ExternalLink, GitBranch, GitMerge, GitPullRequest, Play, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Divider,
  EmptyState,
  Eyebrow,
  GATE_COLOR,
  GateBadge,
  Meter,
  MiniBars,
  Page,
  PROOF_COLOR,
  Rise,
  Segmented,
  SectionHeader,
  Skeleton,
  Sparkline,
  StackBar,
  Stat,
  Switch,
  Tag,
  TextField,
} from '@/components/dash/kit';
import { plural, relTime, seconds } from '@/components/dash/format';
import { cn } from '@/lib/utils';
import { useNow } from './clock';
import { GithubMark } from './GithubMark';
import { githubRepoUrl, pullHref, sameRepo, slugOf, type PullRow, type RepoRef, type RepoSummary, type StageTimingInput, type SyntheticContext } from './model';
import { baseRows, baseSummary, overlayRows, summaryFromRows } from './overlay';
import { PasteBar } from './PasteBar';
import { BranchChip, LangDot } from './shared';
import { isEnabled, reposStore, useReposState, workspaceRepos } from './store';
import s from './repos.module.css';

export interface RepoViewProps {
  repo: RepoRef;
  fixture: { summary: RepoSummary; rows: PullRow[]; context: SyntheticContext } | null;
  fixtureRefs: RepoRef[];
  timing: StageTimingInput[];
}

type Tab = 'open' | 'reviewed' | 'all';

export function RepoView({ repo, fixture, fixtureRefs, timing }: RepoViewProps) {
  const router = useRouter();
  const state = useReposState();
  const now = useNow(1000);
  const [tab, setTab] = useState<Tab>('open');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const analyses = state?.analyses ?? {};
    return overlayRows(repo, baseRows(repo, fixture?.rows, analyses, fixture?.context), analyses, now, timing, fixture?.context);
  }, [repo, fixture, state, now, timing]);
  const summary = useMemo(() => summaryFromRows(baseSummary(repo, fixture?.summary), rows), [repo, fixture, rows]);

  if (state === null) return <RepoSkeleton />;

  const inWorkspace = workspaceRepos(state, fixtureRefs).find((w) => sameRepo(w.ref, repo));
  const enabled = isEnabled(state, repo);
  const reviewed = rows.filter((r) => r.review && r.review.status !== 'running');
  const gates = { failure: 0, neutral: 0, success: 0 };
  for (const r of reviewed) if (r.review?.gate) gates[r.review.gate]++;
  const durations = reviewed.map((r) => r.review?.durationS ?? 0).filter((d) => d > 0);
  const med = durations.length ? [...durations].sort((a, b) => a - b)[Math.floor(durations.length / 2)]! : null;
  const published = reviewed.reduce((n, r) => n + (r.review?.published ?? 0), 0);
  const trend = [...reviewed]
    .sort((a, b) => Date.parse(a.review!.at) - Date.parse(b.review!.at))
    .map((r) => r.review?.durationS ?? 0)
    .filter((d) => d > 0)
    .slice(-12);

  const q = query.trim().toLowerCase();
  const list = rows
    .filter((r) => (tab === 'open' ? r.state === 'open' : tab === 'reviewed' ? !!r.review : true))
    .filter((r) => !q || r.title.toLowerCase().includes(q) || String(r.number).includes(q) || r.author.toLowerCase().includes(q));

  const analyze = (n: number) => {
    if (!inWorkspace) reposStore.importRepo(repo);
    reposStore.startAnalysis(repo, n);
    router.push(pullHref(repo, n));
  };

  return (
    <Page>
      <header className={s.repoHead}>
        <Rise className={s.repoIdentity}>
          <Avatar name={repo.name} size={56} square />
          <div className="min-w-0">
            <Eyebrow lime>
              <Link href="/repos" className={s.eyebrowLink}>
                Repositories
              </Link>{' '}
              · {repo.owner}
            </Eyebrow>
            <h1 className={s.repoTitle}>{repo.name}</h1>
            <p className={s.repoDesc}>
              {summary.description ?? 'Imported from a pasted link. Witness has not read this repository, so it knows only the pull requests you paste.'}
            </p>
            <div className={s.repoMeta}>
              <LangDot lang={summary.language} />
              {summary.visibility ? (
                <Tag tone="outline" size="sm">
                  {summary.visibility}
                </Tag>
              ) : null}
              {summary.defaultBranch ? (
                <BranchChip title="Default branch">
                  <GitBranch size={12} strokeWidth={2} aria-hidden /> {summary.defaultBranch}
                </BranchChip>
              ) : null}
              {inWorkspace?.source === 'imported' ? (
                <Tag tone="dashed" size="sm">
                  Imported
                </Tag>
              ) : null}
            </div>
          </div>
        </Rise>
        <Rise delay={60} className={s.repoActions}>
          {inWorkspace ? (
            <label className={s.switchLabel}>
              <Switch checked={enabled} onChange={(on) => reposStore.setEnabled(repo, on)} label={`Witness on ${slugOf(repo)}`} />
              <span>{enabled ? 'Witness on' : 'Paused'}</span>
            </label>
          ) : (
            <Button variant="dark" icon={Plus} onClick={() => reposStore.importRepo(repo)}>
              Add to workspace
            </Button>
          )}
          <Button variant="outline" icon={GithubMark} chip={ExternalLink} chipStill href={githubRepoUrl(repo)} external>
            GitHub
          </Button>
        </Rise>
      </header>

      {!enabled && inWorkspace ? (
        <Card tone="panel" pad="md" className={s.nudge}>
          <p className={s.nudgeText}>
            <b>Witness is paused here.</b> New pushes are not reviewed automatically; you can still analyze any pull request by hand.
          </p>
        </Card>
      ) : null}

      {fixture || reviewed.length ? (
        <Rise delay={80}>
          <Card tone="surface" pad="none" className={s.instrument}>
            <div className={s.instCell}>
              <Stat label="Pull requests reviewed" value={reviewed.length} size="md" hint={`${summary.openPulls} open now`} />
              {summary.weekly.length ? <MiniBars values={summary.weekly} width={120} height={34} label="Reviews per week, six weeks" /> : null}
            </div>
            <div className={s.instCell}>
              <Stat label="Merge gate" value={gates.failure} unit="blocked" size="md" />
              <StackBar
                label={`${gates.failure} blocked, ${gates.neutral} neutral, ${gates.success} clear`}
                segments={[
                  { value: gates.failure, color: GATE_COLOR.failure, label: 'blocked' },
                  { value: gates.neutral, color: GATE_COLOR.neutral, label: 'neutral' },
                  { value: gates.success, color: GATE_COLOR.success, label: 'clear' },
                ]}
              />
            </div>
            <div className={s.instCell}>
              <Stat label="Proven bugs" value={summary.provenBugs} size="md" hint={published ? `of ${plural(published, 'posted finding')}` : 'None proven yet'} />
              {published ? <Meter value={Math.min(1, summary.provenBugs / published)} color={PROOF_COLOR.proven} label="Proven share of posted findings" /> : null}
            </div>
            <div className={s.instCell}>
              <Stat
                label="Median review"
                value={med != null ? seconds(med).replace(/s$/, '') : '—'}
                unit={med != null && med < 90 ? 's' : undefined}
                size="md"
                hint="Webhook to merge gate"
              />
              {trend.length > 2 ? <Sparkline values={trend} width={120} height={30} color="var(--w-text)" label="Review time, oldest to newest" /> : null}
            </div>
          </Card>
        </Rise>
      ) : null}

      <Rise delay={140} as="section" className="flex flex-col gap-4">
        <SectionHeader
          title="Pull requests"
          description={`${plural(rows.filter((r) => r.state === 'open').length, 'open pull request')} · ${reviewed.length} reviewed`}
          actions={
            <>
              <Segmented<Tab>
                label="Pull requests"
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'open', label: 'Open', count: rows.filter((r) => r.state === 'open').length },
                  { value: 'reviewed', label: 'Reviewed', count: rows.filter((r) => r.review).length },
                  { value: 'all', label: 'All', count: rows.length },
                ]}
              />
              <TextField
                size="sm"
                icon={Search}
                placeholder="Title, #, author"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search pull requests"
                wrapperClassName={s.search}
              />
            </>
          }
        />
        <Card tone="panel" pad="none" className={s.pulls}>
          {list.length ? (
            list.map((r, i) => (
              <div key={r.number}>
                {i > 0 ? <Divider className={s.pullDivider} /> : null}
                <PullRowView repo={repo} row={r} onAnalyze={() => analyze(r.number)} />
              </div>
            ))
          ) : fixture || rows.length ? (
            <EmptyState
              icon={GitPullRequest}
              title="No pull requests here"
              body={tab === 'open' ? 'Every open pull request has been merged.' : 'Nothing matches that search.'}
            />
          ) : (
            <EmptyState
              icon={GitPullRequest}
              title={`Paste a pull request from ${slugOf(repo)}.`}
              body="Witness has not read this repository, so it lists only the pull requests you bring. Paste one to analyze it."
              action={
                <PasteBar
                  variant="panel"
                  workspace={workspaceRepos(state, fixtureRefs).map((w) => w.ref)}
                  onConnect={() => router.push('/repos')}
                  placeholder={`github.com/${repo.owner}/${repo.name}/pull/1`}
                  className={s.emptyPaste}
                />
              }
            />
          )}
        </Card>
      </Rise>
    </Page>
  );
}

function PullRowView({ repo, row, onAnalyze }: { repo: RepoRef; row: PullRow; onAnalyze: () => void }) {
  const r = row.review;
  const StateIcon = row.state === 'open' ? GitPullRequest : GitMerge;
  return (
    <div className={s.pullRow}>
      <span className={s.pullState} data-state={row.state} title={row.state === 'open' ? 'Open' : 'Merged'}>
        <StateIcon size={16} strokeWidth={1.9} aria-hidden />
      </span>
      <div className={s.pullMain}>
        <p className={s.pullLine1}>
          <Link href={pullHref(repo, row.number)} className={cn(s.pullTitle, s.stretch)}>
            {row.title}
          </Link>
          {row.origin === 'placeholder' ? null : <span className={s.pullNo}>#{row.number}</span>}
          {row.origin !== 'corpus' ? (
            <Tag tone="dashed" size="sm" className={s.pullSim}>
              Simulated
            </Tag>
          ) : null}
        </p>
        {row.origin === 'placeholder' ? (
          <p className={s.pullLine2}>Pasted by link · author, branches and diff appear once GitHub is connected</p>
        ) : (
          <p className={s.pullLine2}>
            <Avatar name={row.author} size={18} />
            <span className={s.pullAuthor}>{row.author}</span>
            <BranchChip title={`${row.headBranch} into ${row.baseBranch}`}>{row.headBranch}</BranchChip>
            <span className={s.pullInto} aria-label="into">
              →
            </span>
            <BranchChip>{row.baseBranch}</BranchChip>
            <span className={s.pullWhen}>
              {row.state === 'merged' ? 'merged' : 'updated'} {relTime(row.updatedAt)}
            </span>
            <span className={s.pullDiff}>
              <span data-add="">+{row.additions}</span> <span data-del="">−{row.deletions}</span>
            </span>
          </p>
        )}
      </div>
      <div className={s.pullStatus}>
        {r ? (
          r.status === 'running' ? (
            <>
              <GateBadge conclusion="running" size="sm" />
              <span className={s.pullCounts}>reviewing now</span>
            </>
          ) : r.status !== 'succeeded' ? (
            <>
              <Tag tone="warn" size="sm">
                Review {r.status}
              </Tag>
              <span className={s.pullCounts}>{relTime(r.at)}</span>
            </>
          ) : (
            <>
              <GateBadge conclusion={r.gate} size="sm" />
              <span className={s.pullCounts}>
                {plural(r.published, 'finding')}
                {r.proven ? <b> · {r.proven} proven</b> : null}
              </span>
            </>
          )
        ) : (
          <>
            <GateBadge conclusion="pending" size="sm" />
            {row.origin === 'placeholder' ? null : <span className={s.pullCounts}>{row.files} files</span>}
          </>
        )}
      </div>
      <div className={s.pullAction}>
        {!r || (r.status !== 'succeeded' && r.status !== 'running') ? (
          <Button size="sm" variant="dark" icon={Play} onClick={onAnalyze}>
            Analyze
          </Button>
        ) : r.reviewId && r.status === 'succeeded' ? (
          <Button size="sm" variant="outline" chip={ArrowUpRight} href={`/runs/${r.reviewId}`}>
            Run
          </Button>
        ) : (
          <Button size="sm" variant="outline" chip={ArrowUpRight} href={pullHref(repo, row.number)}>
            Result
          </Button>
        )}
      </div>
    </div>
  );
}

function RepoSkeleton() {
  return (
    <Page>
      <div className="flex items-center gap-4">
        <Skeleton style={{ width: 56, height: 56, borderRadius: 17 }} />
        <div className="flex flex-col gap-2">
          <Skeleton style={{ width: 140, height: 12 }} />
          <Skeleton style={{ width: 280, height: 30, borderRadius: 10 }} />
        </div>
      </div>
      <Skeleton style={{ height: 128, borderRadius: 20 }} />
      <Skeleton style={{ height: 420, borderRadius: 20 }} />
    </Page>
  );
}
