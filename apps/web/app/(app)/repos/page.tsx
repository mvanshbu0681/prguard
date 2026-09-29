// /repos — connect GitHub, pick a repository, paste any link. The page is a
// thin server shell: it builds the corpus view models (@/lib/fixtures is
// server-only) and hands them to the client view, which folds in this
// browser's demo state (connected account, imported repositories, reviews run
// here). useSearchParams (?new=1, ?demo=…) needs the Suspense boundary.
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReposView } from '@/components/routes/repos/ReposView';
import { corpusTotals, fixtureContext, fixturePulls, fixtureRepoRefs, fixtureRepoSummaries, stageTiming } from '@/components/routes/repos/data.server';
import type { PullRow, SyntheticContext } from '@/components/routes/repos/model';

export const metadata: Metadata = { title: 'Repositories' };

export default function Page() {
  const refs = fixtureRepoRefs();
  const slug = (r: { owner: string; name: string }) => `${r.owner}/${r.name}`.toLowerCase();
  const rowsBySlug: Record<string, PullRow[]> = Object.fromEntries(refs.map((r) => [slug(r), fixturePulls(r)]));
  const contextsBySlug: Record<string, SyntheticContext> = Object.fromEntries(refs.map((r) => [slug(r), fixtureContext(r)]));
  return (
    <Suspense fallback={null}>
      <ReposView fixtureRefs={refs} summaries={fixtureRepoSummaries()} rowsBySlug={rowsBySlug} contextsBySlug={contextsBySlug} timing={stageTiming()} totals={corpusTotals()} />
    </Suspense>
  );
}
