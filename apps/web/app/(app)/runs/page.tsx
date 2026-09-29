// /runs — the review history. A thin server page: the list itself is read live on
// the client (useReviewList). The only server-side input is the demo run's id, so
// "Watch a live review" can replay it (the fixture resolver's ?replay=1 flag).
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RunsListView } from '@/components/routes/runs-list/RunsListView';
import { FIXTURES } from '@/lib/env';
import { getManifest } from '@/lib/fixtures';

export const metadata: Metadata = { title: 'Reviews' };

export default function Page() {
  const replayHref = FIXTURES ? `/runs/${getManifest().ids.demo_review_id}?replay=1` : undefined;
  return (
    <Suspense fallback={null}>
      <RunsListView replayHref={replayHref} />
    </Suspense>
  );
}
