// The evidence page while GET /v1/findings/{id} is in flight: the same frame
// (header, main column, rail) at its real proportions, so nothing jumps.
import { Card, Skeleton } from "@/components/dash/kit";
import s from "./detail.module.css";

export function FindingDetailSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading finding">
      <div className="flex flex-col gap-4" aria-hidden>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-[min(640px,100%)]" />
        <Skeleton className="h-9 w-[min(420px,80%)]" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-24 rounded-w-pill" />
          <Skeleton className="h-7 w-36 rounded-w-pill" />
        </div>
      </div>
      <div className={s.layout} aria-hidden>
        <div className={s.mainCol}>
          <Card tone="panel" pad="lg" className="flex flex-col gap-3">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </Card>
          <Card tone="surface" pad="lg" className="flex flex-col gap-4">
            <Skeleton className="h-7 w-2/3" />
            <div className="grid grid-cols-2 gap-9">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
            <Skeleton className="h-56 w-full" />
          </Card>
        </div>
        <div className={s.railCol}>
          <Card tone="surface" pad="lg" className="flex flex-col gap-3">
            <Skeleton className="h-12 w-32" />
            <Skeleton className="h-3 w-full rounded-w-pill" />
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </Card>
          <Card tone="surface" pad="lg" className="flex flex-col gap-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-10 w-full rounded-w-pill" />
          </Card>
        </div>
      </div>
    </div>
  );
}
