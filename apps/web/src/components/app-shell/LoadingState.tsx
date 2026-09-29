// Loading, as the shape of what is coming: rounded rows of fixed-width bars
// (fixed so a screenshot is identical on every render), announced once to a
// screen reader.
import { Skeleton } from '@/components/dash/kit';
import { cn } from '@/lib/utils';

const SKELETON_WIDTHS = ['72%', '48%', '86%', '36%', '60%', '42%', '78%', '54%'];

export interface LoadingStateProps {
  /** Row count. */
  rows?: number;
  /** Row height follows the compact-rows preference. */
  density?: 'full' | 'compact';
  /** Announced once to a screen reader; the skeleton bars themselves are aria-hidden. */
  label?: string;
  className?: string;
}

export function LoadingState({ rows = 8, density = 'full', label = 'Loading.', className }: LoadingStateProps) {
  const height = density === 'compact' ? 44 : 60;
  return (
    <div className={cn('flex flex-col gap-2', className)} data-loading-state="" data-density={density}>
      <span className="sr-only" role="status">
        {label}
      </span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className="flex items-center gap-4 rounded-w-tile bg-w-surface px-4" style={{ height }}>
          <Skeleton className="size-8 rounded-w-pill" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3" style={{ width: SKELETON_WIDTHS[i % SKELETON_WIDTHS.length] }} />
            {density === 'full' ? <Skeleton className="h-2.5" style={{ width: '24%' }} /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
