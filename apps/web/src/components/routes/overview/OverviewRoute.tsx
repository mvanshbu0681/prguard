'use client';
// /overview answers four questions at a glance, top to bottom:
//   1. Is Witness catching real bugs?          → the photograph
//   2. Is the merge gate holding the right PRs? → the lime card
//   3. What needs me right now?                → Needs attention + activity
//   4. What does it cost, how fast is it?      → the ink card, Spend & speed
// then the evidence behind "is it noisy?" (the noise filter, the page's
// signature chart) and the repositories. The window control re-scopes every
// dated number (and lives in the URL, ?window=7d|30d); needs attention,
// activity, the reviewer rates and the
// repository cards are "now" / all time by nature and say so. Deeper
// analytics (proof by week, calibration) belong to /accuracy.
import { Plus } from 'lucide-react';
import { Button, Page, PageHeader, Rise, SectionHeader, Segmented } from '@/components/dash/kit';
import type { RepoSummary } from '@/components/routes/repos/model';
import type { OverviewModel, WindowKey } from './model';
import { Hero } from './Hero';
import { AttentionSection } from './Attention';
import { FunnelCard } from './Signal';
import { RepoGrid } from './Repos';
import { SpendGrid } from './Spend';
import { windowCaption, windowPhrase } from './format';
import { useOverviewWindow } from './url-state';
import s from './overview.module.css';

export interface OverviewRouteProps {
  model: OverviewModel;
  /** /repos's own per-repository summaries, so both pages print the same numbers. */
  repos: RepoSummary[];
}

const WINDOW_OPTIONS: { value: WindowKey; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
];

export function OverviewRoute({ model, repos }: OverviewRouteProps) {
  const [win, setWin] = useOverviewWindow();
  const w = model.windows[win];
  const caption = windowCaption(win, model.firstRunAt);
  const proven = w.proof.proven;

  return (
    <Page className={s.root}>
      <PageHeader
        eyebrow="Overview"
        title={`${proven} ${proven === 1 ? 'bug' : 'bugs'} proven`}
        soft={`${windowPhrase(win, model.firstRunAt)}.`}
        description="Each one reproduced by a test that fails at the pull request’s head and passes at its base. Only a proven bug can block a merge."
        actions={
          <>
            <Segmented label="Time window" options={WINDOW_OPTIONS} value={win} onChange={setWin} />
            <Button variant="primary" chip={Plus} chipStill href="/repos?new=1">
              New review
            </Button>
          </>
        }
      />

      <Rise delay={60}>
        <Hero model={model} w={w} />
      </Rise>

      <Rise delay={120}>
        <AttentionSection topFindings={model.topFindings} />
      </Rise>

      <Rise delay={180}>
        <FunnelCard w={w} caption={caption} />
      </Rise>

      <section className={s.section} aria-labelledby="ov-repos">
        <SectionHeader
          id="ov-repos"
          title="Repositories"
          description={`${repos.length} in this workspace. The ones holding a blocked pull request come first.`}
          actions={
            <Button variant="outline" size="sm" href="/repos">
              All repositories
            </Button>
          }
        />
        <RepoGrid repos={repos} />
      </section>

      <section className={s.section} aria-labelledby="ov-spend">
        <SectionHeader
          id="ov-spend"
          title="Spend & speed"
          description="What a review costs and where its half-minute goes."
        />
        <SpendGrid model={model} w={w} caption={caption} />
      </section>
    </Page>
  );
}
