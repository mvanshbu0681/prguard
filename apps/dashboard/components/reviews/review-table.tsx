import type { ReviewListItem } from "@contracts";
import clsx from "clsx";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { PriorityPill, RiskPill } from "@/components/ui/pills";
import { InlineCode } from "@/components/ui/inline-code";
import { Skeleton } from "@/components/ui/skeleton";
import { reviewState, StatusLabel } from "@/components/ui/status";
import { RelativeTime } from "@/components/ui/time";
import { FindingsCell } from "./findings-cell";

export type ReviewTableVariant = "full" | "compact";

const columns: Record<ReviewTableVariant, string> = {
  full: "grid-cols-[124px_minmax(0,1fr)_136px_148px_236px_92px_76px]",
  compact: "grid-cols-[124px_minmax(0,1fr)_136px_148px_236px_76px]",
};

export function ReviewTableHeader({ variant }: { variant: ReviewTableVariant }) {
  return (
    <div
      role="row"
      className={clsx(
        "grid h-9 items-center gap-4 border-b border-line bg-surface-1 px-4 text-xs font-medium text-dim",
        columns[variant],
      )}
    >
      <span role="columnheader">Status</span>
      <span role="columnheader">Pull request</span>
      <span role="columnheader">Priority</span>
      <span role="columnheader">Author</span>
      <span role="columnheader">Findings</span>
      {variant === "full" && <span role="columnheader">Kind</span>}
      <span role="columnheader" className="text-right">
        When
      </span>
    </div>
  );
}

export function ReviewRow({ review, variant = "full" }: { review: ReviewListItem; variant?: ReviewTableVariant }) {
  const state = reviewState(review);

  return (
    <Link
      role="row"
      href={`/reviews/${review.id}`}
      className={clsx(
        "grid h-11 items-center gap-4 border-b border-hair px-4 text-sm transition-colors duration-75 last:border-b-0",
        "hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-offset-[-2px]",
        columns[variant],
      )}
    >
      <span role="cell" className="min-w-0">
        <StatusLabel tone={state.tone} label={state.label} />
      </span>

      <span role="cell" className="min-w-0">
        {variant === "full" && (
          <span className="block truncate text-2xs text-dim">{review.repository.fullName}</span>
        )}
        <span className="block truncate text-primary">
          <span className="tabular text-dim">#{review.pr.number}</span> <InlineCode text={review.pr.title} />
        </span>
      </span>

      <span role="cell" className="flex min-w-0 items-center gap-1">
        {review.priority && <PriorityPill priority={review.priority} compact />}
        {review.risk && <RiskPill risk={review.risk} />}
      </span>

      <span role="cell" className="flex min-w-0 items-center gap-2">
        <Avatar src={review.pr.authorAvatar} name={review.pr.authorLogin} size={18} />
        <span className="truncate text-body">{review.pr.authorLogin}</span>
      </span>

      <span role="cell" className="min-w-0">
        <FindingsCell review={review} />
      </span>

      {variant === "full" && (
        <span role="cell" className="truncate text-dim">
          {review.kind === "full" ? "Full" : "New commits"}
        </span>
      )}

      <span role="cell" className="text-right text-dim tabular">
        <RelativeTime ts={review.createdAt} />
      </span>
    </Link>
  );
}

export function ReviewRowsSkeleton({ rows = 8, variant = "full" }: { rows?: number; variant?: ReviewTableVariant }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={clsx("grid h-11 items-center gap-4 border-b border-hair px-4 last:border-b-0", columns[variant])}
        >
          <span className="flex items-center gap-2">
            <Skeleton className="size-1.5 rounded-full" />
            <Skeleton className="h-2.5 w-16" />
          </span>
          <span className="space-y-1.5">
            {variant === "full" && <Skeleton className="h-2 w-28" />}
            <Skeleton className="h-2.5" style={{ width: `${48 + ((i * 17) % 36)}%` }} />
          </span>
          <Skeleton className="h-2.5 w-20" />
          <span className="flex items-center gap-2">
            <Skeleton className="size-[18px] rounded-full" />
            <Skeleton className="h-2.5 w-16" />
          </span>
          <Skeleton className="h-2.5 w-20" />
          {variant === "full" && <Skeleton className="h-2.5 w-10" />}
          <Skeleton className="ml-auto h-2.5 w-10" />
        </div>
      ))}
    </div>
  );
}

export function ReviewTable({
  reviews,
  variant = "full",
  className,
}: {
  reviews: ReviewListItem[];
  variant?: ReviewTableVariant;
  className?: string;
}) {
  return (
    <div role="table" className={clsx("overflow-hidden rounded-lg border border-line bg-surface-1 shadow-hi", className)}>
      <ReviewTableHeader variant={variant} />
      <div role="rowgroup">
        {reviews.map((review) => (
          <ReviewRow key={review.id} review={review} variant={variant} />
        ))}
      </div>
    </div>
  );
}
