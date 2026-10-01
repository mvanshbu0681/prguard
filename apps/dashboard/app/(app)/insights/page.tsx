"use client";

import clsx from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { InsightsReport, InsightsSkeleton } from "@/components/insights/insights-report";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { INSIGHTS_DAYS, useInsights, useRepos } from "@/lib/queries";

function parseRepo(value: string | null): number | null {
  const n = Number(value);
  return value && Number.isInteger(n) && n > 0 ? n : null;
}

export default function InsightsPage() {
  return (
    <>
      <PageHeader title="Insights" />
      <Suspense fallback={<InsightsSkeleton />}>
        <InsightsView />
      </Suspense>
    </>
  );
}

function InsightsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const repo = parseRepo(params.get("repo"));

  const repos = useRepos();
  const insights = useInsights(repo);
  const days = insights.data?.days ?? INSIGHTS_DAYS;

  function setRepo(next: number | null) {
    router.replace(next === null ? pathname : `${pathname}?repo=${next}`, { scroll: false });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          aria-label="Repository"
          className="w-60"
          value={repo === null ? "" : String(repo)}
          onChange={(e) => setRepo(parseRepo(e.target.value))}
        >
          <option value="">All repositories</option>
          {repos.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.fullName}
            </option>
          ))}
        </Select>
        <span className="text-xs text-dim">Last {days} days</span>
      </div>

      {insights.isPending ? (
        <InsightsSkeleton />
      ) : insights.isError && !insights.data ? (
        <Panel>
          <ErrorState message="Couldn't load insights." onRetry={() => void insights.refetch()} />
        </Panel>
      ) : insights.data.reviews === 0 ? (
        <Panel className={clsx("transition-opacity duration-150", insights.isPlaceholderData && "opacity-60")}>
          <EmptyState title={`No reviews in the last ${days} days.`} />
        </Panel>
      ) : (
        <InsightsReport
          insights={insights.data}
          className={clsx("transition-opacity duration-150", insights.isPlaceholderData && "opacity-60")}
        />
      )}
    </>
  );
}
