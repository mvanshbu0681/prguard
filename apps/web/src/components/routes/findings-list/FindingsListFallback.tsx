// What /findings paints before the URL state is readable on the client (the
// route's Suspense fallback): the page's own frame at its real proportions.
import { Card, Page, Skeleton } from "@/components/dash/kit";
import { FindingRowSkeleton } from "./FindingsList";
import s from "./findings.module.css";

export function FindingsListFallback() {
  return (
    <Page className="gap-7">
      <div className="flex flex-col gap-3" aria-hidden>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-[min(560px,100%)]" />
      </div>
      <div className={s.summary} aria-hidden>
        {[0, 1, 2].map((i) => (
          <Card key={i} tone="surface" pad="lg" className={s.sumCard}>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-[14px] w-full rounded-w-pill" />
          </Card>
        ))}
      </div>
      <div className={s.list} aria-busy="true" aria-label="Loading findings">
        {Array.from({ length: 6 }, (_, i) => (
          <FindingRowSkeleton key={i} />
        ))}
      </div>
    </Page>
  );
}
