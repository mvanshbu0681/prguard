// OWNER: t9a (wave 2). The dashboard's one loading grammar (dashboard §2.0):
// skeletons at the final dimensions, filled --ink-2, no shimmer, no spinner —
// a spinner appears nowhere in this product. Renders in a Server Component
// (no hooks), so a route's server-rendered shell can show it immediately
// while data streams in. Table bodies use TableSkeletonRows (src/components/ui/table.tsx)
// directly instead: this component is for panel- and page-level loading, not
// inside an already-drawn table.
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Fixed widths so a screenshot is identical on every render (matches ui/table.tsx's own set). */
const SKELETON_WIDTHS = ['72%', '48%', '86%', '36%', '60%', '42%', '78%', '54%'];

export interface LoadingStateProps {
  /** Row count. Design §2.0: tables get 8; a shorter panel passes fewer. */
  rows?: number;
  /** Row height follows the compact-rows preference (32px full, 26px compact). */
  density?: 'full' | 'compact';
  /** Announced once to a screen reader; the skeleton bars themselves are aria-hidden. */
  label?: string;
  className?: string;
}

export function LoadingState({ rows = 8, density = 'full', label = 'Loading.', className }: LoadingStateProps) {
  const height = density === 'compact' ? 26 : 32;
  return (
    <div className={cn('flex flex-col', className)} data-loading-state="" data-density={density}>
      <span className="sr-only" role="status">
        {label}
      </span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className="flex items-center border-b border-rule-hair px-1" style={{ height }}>
          <Skeleton className="h-3.5" style={{ width: SKELETON_WIDTHS[i % SKELETON_WIDTHS.length] }} />
        </div>
      ))}
    </div>
  );
}
