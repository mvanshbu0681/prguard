'use client';
// /repos — "connect GitHub → pick a repo". Three states from the viewer's demo
// store: nothing yet (the sky hero, ConnectLanding), connected (the account's
// repositories), or only repositories imported by link (the same grid, with a
// nudge to connect). The composer at the top takes any GitHub link; the
// sidebar's "New review" (/repos?new=1) puts the cursor in it.
//
// URL affordances for demos and screenshots: ?demo=connected connects the acme
// workspace, ?demo=reset clears this browser's demo state.
import { ArrowUpRight, LogOut, Search, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Dot,
  EmptyState,
  Eyebrow,
  GateBadge,
  IconButton,
  PageHeader,
  Page,
  Rise,
  Segmented,
  SectionHeader,
  Skeleton,
  TextField,
} from '@/components/dash/kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { relTime } from '@/components/dash/format';
import { useNow } from './clock';
import { ConnectDialog } from './ConnectDialog';
import { ConnectLanding } from './ConnectLanding';
import { GithubMark } from './GithubMark';
import { pullHref, slugOf, type LangKey, type PullRow, type RepoRef, type RepoSummary, type StageTimingInput, type SyntheticContext } from './model';
import { baseRows, baseSummary, overlayRows, summaryFromRows } from './overlay';
import { PasteBar } from './PasteBar';
import { RepoCard } from './RepoCard';
import { isEnabled, reposStore, useReposState, workspaceRepos, type WorkspaceRepo } from './store';
import s from './repos.module.css';

export interface ReposViewProps {
  fixtureRefs: RepoRef[];
  summaries: RepoSummary[];
  /** Lower-case slug → the corpus repository's PR rows. */
  rowsBySlug: Record<string, PullRow[]>;
  /** Lower-case slug → how to synthesise a PR in that corpus repository. */
  contextsBySlug: Record<string, SyntheticContext>;
  timing: StageTimingInput[];
  totals: {
    proven: number;
    reviews: number;
    repositories: number;
    org: string;
  };
}

type Filter = 'all' | 'enabled' | 'attention';

interface Item {
  w: WorkspaceRepo;
  summary: RepoSummary;
  rows: PullRow[];
  enabled: boolean;
  running: boolean;
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
const countWord = (n: number) => WORDS[n] ?? String(n);

export function ReposView({ fixtureRefs, summaries, rowsBySlug, contextsBySlug, timing, totals }: ReposViewProps) {
  const router = useRouter();
  const params = useSearchParams();
  const state = useReposState();
  const now = useNow(1000);
  const [dialog, setDialog] = useState<{
    open: boolean;
    account: string | null;
    manage: boolean;
  }>({ open: false, account: null, manage: false });
  const [confirmOff, setConfirmOff] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const demo = params.get('demo');
  const wantsNew = params.get('new') === '1';
  useEffect(() => {
    if (demo === 'connected') reposStore.connectDemo();
    if (demo === 'reset') reposStore.reset();
    if (demo) router.replace('/repos', { scroll: false });
  }, [demo, router]);
  useEffect(() => {
    // The field has taken focus (a child effect runs first); drop the flag so the next click refocuses.
    if (wantsNew) router.replace('/repos', { scroll: false });
  }, [wantsNew, router]);

  const languages = useMemo(() => Object.fromEntries(summaries.map((r) => [slugOf(r).toLowerCase(), r.language])) as Record<string, LangKey>, [summaries]);
  const workspace = useMemo(() => workspaceRepos(state, fixtureRefs), [state, fixtureRefs]);
  const workspaceRefs = useMemo(() => workspace.map((w) => w.ref), [workspace]);

  const items: Item[] = useMemo(
    () =>
      workspace.map((w) => {
        const slug = slugOf(w.ref).toLowerCase();
        const fixture = summaries.find((r) => slugOf(r).toLowerCase() === slug);
        const analyses = state?.analyses ?? {};
        const ctx = contextsBySlug[slug];
        const rows = overlayRows(w.ref, baseRows(w.ref, rowsBySlug[slug], analyses, ctx), analyses, now, timing, ctx);
        return {
          w,
          summary: summaryFromRows(baseSummary(w.ref, fixture), rows),
          rows,
          enabled: isEnabled(state, w.ref),
          running: rows.some((r) => r.review?.status === 'running'),
        };
      }),
    [workspace, summaries, rowsBySlug, contextsBySlug, state, now, timing],
  );

  const openConnect = (account?: string | null) => setDialog({ open: true, account: account ?? null, manage: false });

  if (state === null) return <ReposSkeleton />;

  const connection = state.connection;
  const landing = !connection && state.imported.length === 0;
  const dialogs = (
    <>
      <ConnectDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        fixtureRefs={fixtureRefs}
        languages={languages}
        initialAccount={dialog.account}
        current={dialog.manage ? connection : null}
      />
      <Dialog open={confirmOff} onOpenChange={setConfirmOff}>
        <DialogContent className={s.confirm}>
          <DialogTitle className={s.dlgTitle}>Disconnect {connection?.account}?</DialogTitle>
          <DialogDescription className={s.dlgDesc}>
            Witness stops reviewing new pull requests there. Reviews already posted stay on GitHub, and imported repositories stay here.
          </DialogDescription>
          <div className={s.confirmFoot}>
            <Button variant="ghost" onClick={() => setConfirmOff(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                reposStore.disconnect();
                setConfirmOff(false);
              }}
            >
              Disconnect
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  // One tree for both states, so an open dialog survives the switch from the hero to the grid.
  if (landing) {
    return (
      <Page>
        <ConnectLanding
          totals={totals}
          workspace={workspaceRefs}
          onConnect={(owner) => openConnect(owner)}
          onDemo={() => reposStore.connectDemo()}
          focusKey={wantsNew ? 1 : 0}
        />
        {dialogs}
      </Page>
    );
  }

  const q = query.trim().toLowerCase();
  const attention = (i: Item) => i.summary.blockedOpen > 0;
  const shown = items
    .filter((i) => (filter === 'enabled' ? i.enabled : filter === 'attention' ? attention(i) : true))
    .filter((i) => !q || slugOf(i.w.ref).toLowerCase().includes(q) || (i.summary.description ?? '').toLowerCase().includes(q));
  const blocked = items
    .flatMap((i) => i.rows.filter((r) => r.state === 'open' && r.review?.gate === 'failure').map((r) => ({ ref: i.w.ref, row: r })))
    .sort((a, b) => Date.parse(b.row.review!.at) - Date.parse(a.row.review!.at));
  const openCount = items.reduce((n, i) => n + i.summary.openPulls, 0);
  const latest = items
    .flatMap((i) => i.rows.filter((r) => r.review).map((r) => ({ ref: i.w.ref, row: r })))
    .sort((a, b) => Date.parse(b.row.review!.at) - Date.parse(a.row.review!.at))
    .slice(0, 3);
  const title = items.length ? `${countWord(items.length)} ${items.length === 1 ? 'repository' : 'repositories'},` : 'No repositories yet.';
  const firstOpen = items.find((i) => i.summary.kind === 'fixture' && i.rows[0] && !i.rows[0].review);
  const tryChips = ['acme/checkout-service#4821', ...(firstOpen ? [`${slugOf(firstOpen.w.ref)}#${firstOpen.rows[0]!.number}`] : []), 'vercel/next.js'];

  return (
    <Page>
      <>
        <PageHeader
          eyebrow={connection ? `Repositories · ${connection.account}` : 'Repositories · imported'}
          title={title}
          soft={!items.length ? undefined : connection ? 'watched on every push.' : 'imported by link.'}
          actions={
            connection ? (
              <>
                <button type="button" className={s.accountPill} onClick={() => setDialog({ open: true, account: null, manage: true })} title="Manage repository access">
                  <Avatar name={connection.account} size={26} square={connection.kind === 'org'} />
                  <span className={s.accountName}>{connection.account}</span>
                  <span className={s.accountState}>
                    <Dot pulse color="var(--w-ok)" /> Connected
                  </span>
                </button>
                <IconButton icon={LogOut} label="Disconnect GitHub" variant="outline" onClick={() => setConfirmOff(true)} />
              </>
            ) : null
          }
        />

        {!connection ? (
          <Rise delay={40}>
            <Card tone="panel" pad="md" className={s.nudge}>
              <span className={s.nudgeIcon}>
                <GithubMark size={18} />
              </span>
              <p className={s.nudgeText}>
                <b>These repositories came from pasted links.</b> Connect GitHub to see every repository in your organisation and let Witness post its merge-gate check.
              </p>
              <Button variant="dark" icon={GithubMark} onClick={() => openConnect()}>
                Connect GitHub
              </Button>
            </Card>
          </Rise>
        ) : null}

        <Rise delay={60} className={s.top}>
          <Card tone="surface" pad="lg" className={s.composer} id="new-review">
            <Eyebrow>New review</Eyebrow>
            <h2 className={s.composerTitle}>
              Paste a pull request.
              <span className={s.composerSoft}> Witness proves the rest.</span>
            </h2>
            <PasteBar variant="panel" workspace={workspaceRefs} onConnect={(owner) => openConnect(owner)} focusKey={wantsNew ? 1 : 0} chips={tryChips} />
            {latest.length ? (
              <div className={s.latest}>
                <p className={s.latestLabel}>Latest reviews</p>
                <div className={s.latestRow}>
                  {latest.map(({ ref, row }) => (
                    <Link key={`${slugOf(ref)}#${row.number}`} href={pullHref(ref, row.number)} className={s.latestTile}>
                      <span className={s.latestTop}>
                        <span className={s.latestNo}>#{row.number}</span>
                        <GateBadge conclusion={row.review!.status === 'running' ? 'running' : row.review!.gate} size="sm" />
                      </span>
                      <span className={s.latestTitle}>{row.title}</span>
                      <span className={s.latestMeta}>
                        {ref.name} · {row.review!.status === 'running' ? 'now' : relTime(row.review!.at)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>

          <Card tone="ink" pad="lg" className={s.needs}>
            <p className={s.needsEyebrow}>
              <ShieldCheck size={14} strokeWidth={2} aria-hidden /> Needs you
            </p>
            <div className={s.needsHead}>
              <span className={s.needsNum}>{blocked.length}</span>
              <span className={s.needsLabel}>
                {blocked.length === 1 ? 'pull request' : 'pull requests'} held by a proven bug
                <span className={s.needsSub}>of {openCount} open</span>
              </span>
            </div>
            {blocked.length ? (
              <ul className={s.needsList}>
                {blocked.slice(0, 3).map(({ ref, row }) => (
                  <li key={`${slugOf(ref)}#${row.number}`}>
                    <Link href={pullHref(ref, row.number)} className={s.needsRow}>
                      <span className={s.needsNo}>#{row.number}</span>
                      <span className="min-w-0 flex-1">
                        <span className={s.needsTitle}>{row.title}</span>
                        <span className={s.needsMeta}>
                          {ref.name} · {row.review!.proven} proven · {relTime(row.review!.at)}
                        </span>
                      </span>
                      <ArrowUpRight size={15} strokeWidth={2} className={s.needsArrow} aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.needsEmpty}>Nothing is blocked. Every open pull request is clear or waiting for its first review.</p>
            )}
          </Card>
        </Rise>

        <Rise delay={120} as="section" className="flex flex-col gap-4">
          <SectionHeader
            title="Repositories"
            description={`${items.filter((i) => i.enabled).length} with Witness on · ${openCount} open pull requests`}
            actions={
              <>
                <Segmented<Filter>
                  label="Filter repositories"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: 'All', count: items.length },
                    {
                      value: 'enabled',
                      label: 'Enabled',
                      count: items.filter((i) => i.enabled).length,
                    },
                    {
                      value: 'attention',
                      label: 'Needs attention',
                      count: items.filter(attention).length,
                    },
                  ]}
                />
                <TextField
                  size="sm"
                  icon={Search}
                  placeholder="Search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search repositories"
                  wrapperClassName={s.search}
                />
              </>
            }
          />
          {shown.length ? (
            <div className={s.grid}>
              {shown.map((i) => (
                <RepoCard
                  key={slugOf(i.w.ref)}
                  repo={i.summary}
                  imported={i.w.source === 'imported'}
                  enabled={i.enabled}
                  running={i.running}
                  onToggle={(on) => reposStore.setEnabled(i.w.ref, on)}
                />
              ))}
            </div>
          ) : (
            <Card tone="surface" pad="none">
              <EmptyState
                icon={Search}
                title={filter === 'attention' ? 'Nothing needs you' : 'No repository matches'}
                body={filter === 'attention' ? 'No open pull request is held by a proven bug.' : 'Try another name, or paste its GitHub link above to import it.'}
              />
            </Card>
          )}
        </Rise>
      </>
      {dialogs}
    </Page>
  );
}

function ReposSkeleton() {
  return (
    <Page>
      <div className="flex flex-col gap-3">
        <Skeleton style={{ width: 160, height: 14 }} />
        <Skeleton style={{ width: 'min(520px, 80%)', height: 34, borderRadius: 10 }} />
      </div>
      <div className={s.top}>
        <Skeleton style={{ height: 240, borderRadius: 20 }} />
        <Skeleton style={{ height: 240, borderRadius: 20 }} />
      </div>
      <div className={s.grid}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} style={{ height: 236, borderRadius: 20 }} />
        ))}
      </div>
    </Page>
  );
}
