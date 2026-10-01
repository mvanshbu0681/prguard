import type { QueueItem } from "@contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { InlineCode } from "@/components/ui/inline-code";
import { RiskPill } from "@/components/ui/pills";
import { SEVERITIES, SeverityPill } from "@/components/ui/severity";
import { Skeleton } from "@/components/ui/skeleton";
import { reviewState, StatusLabel } from "@/components/ui/status";
import { RelativeTime } from "@/components/ui/time";
import { isActive } from "@/lib/queries";

const card =
  "block rounded-md border border-line bg-surface-2 px-3 py-2.5 shadow-hi transition-colors duration-75 " +
  "hover:border-line-2 hover:bg-surface-3 focus-visible:outline-offset-[-2px]";

export function QueueCard({ item }: { item: QueueItem }) {
  const review = item.latestReview;
  const running = review && isActive(review.status) ? reviewState({ status: review.status, stage: "reviewing" }) : null;
  const present = SEVERITIES.filter((s) => item.open[s] > 0);
  const tags = item.risk !== null || present.length > 0 || item.fixed > 0;

  const content: ReactNode = (
    <>
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate text-2xs text-dim">{item.repository.fullName}</span>
        {running && <StatusLabel tone={running.tone} label={running.label} className="ml-auto shrink-0 text-2xs" />}
      </div>
      <div className="mt-0.5 line-clamp-2 break-words text-sm text-primary">
        <span className="tabular text-dim">#{item.pr.number}</span> <InlineCode text={item.pr.title} />
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <Avatar src={item.pr.authorAvatar} name={item.pr.authorLogin} size={16} />
        <span className="min-w-0 truncate text-body">{item.pr.authorLogin}</span>
        <RelativeTime ts={item.pr.createdAt} className="ml-auto shrink-0 text-dim tabular" />
      </div>
      {tags && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {item.risk && <RiskPill risk={item.risk} />}
          {present.map((s) => (
            <SeverityPill key={s} severity={s} count={item.open[s]} />
          ))}
          {item.fixed > 0 && <span className="px-1 text-xs text-ok-text tabular">{item.fixed} fixed</span>}
        </div>
      )}
    </>
  );

  if (review) {
    return (
      <Link href={`/reviews/${review.id}`} className={card}>
        {content}
      </Link>
    );
  }
  return (
    <a href={item.pr.url} target="_blank" rel="noreferrer" className={card}>
      {content}
    </a>
  );
}

export function QueueCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div className="rounded-md border border-line bg-surface-2 px-3 py-2.5" aria-hidden="true">
      <Skeleton className="h-2 w-24" />
      <Skeleton className="mt-2.5 h-2.5" style={{ width: `${62 + ((index * 17) % 30)}%` }} />
      <div className="mt-3 flex items-center gap-1.5">
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="ml-auto h-2.5 w-10" />
      </div>
      <div className="mt-3 flex items-center gap-1">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  );
}
