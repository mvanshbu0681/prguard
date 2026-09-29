// Route-level loading for the dashboard: the page frame's rhythm (a header
// block, then rows) so the swap to real content does not jump.
import { LoadingState } from '@/components/app-shell';
import { Page, Skeleton } from '@/components/dash/kit';

export default function Loading() {
  return (
    <Page>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-80 max-w-full" />
        <Skeleton className="h-3.5 w-[26rem] max-w-full" />
      </div>
      <LoadingState rows={6} label="Loading the page." />
    </Page>
  );
}
