import type { Insights } from "@contracts";
import clsx from "clsx";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { compactNumber, duration } from "@/lib/format";
import { ReviewerBreakdown } from "./reviewer-breakdown";
import { SeverityBreakdown } from "./severity-breakdown";
import { VerificationPanel } from "./verification-panel";

function minutes(m: number): string {
  if (m >= 60) return duration(m * 60_000);
  return m < 10 ? `${m.toFixed(1).replace(/\.0$/, "")} min` : `${Math.round(m)} min`;
}

function StatTile({ label, value }: { label: string; value: string | null }) {
  return (
    <Panel className="px-4 py-3.5">
      <div className="text-xs text-dim">{label}</div>
      <div
        className={clsx(
          "mt-1 text-xl font-semibold tracking-[-0.015em] tabular",
          value === null ? "text-faint" : "text-primary",
        )}
      >
        {value ?? "n/a"}
      </div>
    </Panel>
  );
}

export function InsightsReport({ insights, className }: { insights: Insights; className?: string }) {
  return (
    <div className={clsx("space-y-4", className)}>
      <div className="grid grid-cols-3 gap-4">
        <StatTile label="Reviews" value={insights.reviews.toLocaleString("en-US")} />
        <StatTile
          label="Median time to review"
          value={insights.medianMinutes === null ? null : minutes(insights.medianMinutes)}
        />
        <StatTile
          label="Median tokens"
          value={insights.medianTokens === null ? null : compactNumber(Math.round(insights.medianTokens))}
        />
      </div>
      <ReviewerBreakdown reviewers={insights.byReviewer} />
      <div className="grid grid-cols-2 items-start gap-4">
        <SeverityBreakdown counts={insights.bySeverity} />
        <VerificationPanel verification={insights.verification} />
      </div>
    </div>
  );
}

export function InsightsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Panel key={i} className="px-4 py-3.5">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="mt-3 h-5 w-16" />
          </Panel>
        ))}
      </div>
      <Panel>
        <div className="flex min-h-11 items-center border-b border-line px-4">
          <Skeleton className="h-3 w-36" />
        </div>
        {[72, 58, 44, 30].map((w, i) => (
          <div key={i} className="flex h-10 items-center gap-4 border-b border-hair px-4 last:border-b-0">
            <Skeleton className="h-2.5 w-28" />
            <Skeleton className="h-2 rounded-full" style={{ width: `${w}%` }} />
          </div>
        ))}
      </Panel>
      <div className="grid grid-cols-2 items-start gap-4">
        {[0, 1].map((i) => (
          <Panel key={i}>
            <div className="flex min-h-11 items-center border-b border-line px-4">
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="px-4 py-4">
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="mt-3.5 h-2.5 w-2/3" />
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
