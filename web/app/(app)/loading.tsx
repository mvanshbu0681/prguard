// OWNER: t9a (wave 2). The (app) group's shared navigation boundary (dashboard
// §2.0): a static skeleton, no shimmer, no spinner — a spinner appears nowhere
// in this product. This fires only for the segment Next is still loading; the
// shell around it (Sidebar, TopBar) stays mounted from app/(app)/layout.tsx,
// so this file owns only the page-shaped placeholder, not the chrome.
import { LoadingState } from '@/components/app-shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="px-4 py-8 md:px-8">
      <Skeleton className="h-3 w-40" />
      <div className="mt-6">
        <LoadingState rows={8} />
      </div>
    </div>
  );
}
