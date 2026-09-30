"use client";

import clsx from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { hasRepos, useMe } from "@/components/me-provider";
import { ReviewRowsSkeleton, ReviewTable, ReviewTableHeader } from "@/components/reviews/review-table";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Dot } from "@/components/ui/status";
import { isActive, useRepos, useReviews, type ReviewFilter, type ReviewFilters } from "@/lib/queries";

type StatusOption = ReviewFilter | "all";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
] as const satisfies readonly { value: StatusOption; label: string }[];

function parseStatus(value: string | null): ReviewFilter | null {
  return value === "active" || value === "completed" || value === "failed" ? value : null;
}

function parseRepo(value: string | null): number | null {
  const n = Number(value);
  return value && Number.isInteger(n) && n > 0 ? n : null;
}

export default function ReviewsPage() {
  return (
    <>
      <PageHeader title="Reviews" />
      <Suspense fallback={<TableFrame loading />}>
        <Reviews />
      </Suspense>
    </>
  );
}

function Reviews() {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const filters: ReviewFilters = { repo: parseRepo(params.get("repo")), status: parseStatus(params.get("status")) };
  const filtered = filters.repo !== null || filters.status !== null;

  const repos = useRepos();
  const reviews = useReviews(filters);

  function update(next: Partial<ReviewFilters>) {
    const merged = { ...filters, ...next };
    const sp = new URLSearchParams();
    if (merged.repo !== null) sp.set("repo", String(merged.repo));
    if (merged.status) sp.set("status", merged.status);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const activeCount = reviews.data?.filter((r) => isActive(r.status)).length ?? 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          aria-label="Repository"
          className="w-60"
          value={filters.repo === null ? "" : String(filters.repo)}
          onChange={(e) => update({ repo: parseRepo(e.target.value) })}
        >
          <option value="">All repositories</option>
          {repos.data?.map((repo) => (
            <option key={repo.id} value={repo.id}>
              {repo.fullName}
            </option>
          ))}
        </Select>
        <Segmented
          label="Status"
          options={STATUS_OPTIONS}
          value={filters.status ?? "all"}
          onChange={(value) => update({ status: value === "all" ? null : value })}
        />
        {activeCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-2 text-xs text-dim">
            <Dot tone="running" />
            {activeCount} in progress
          </span>
        )}
      </div>

      {reviews.isPending ? (
        <TableFrame loading />
      ) : reviews.isError && !reviews.data ? (
        <TableFrame>
          <ErrorState message="Couldn't load reviews." onRetry={() => void reviews.refetch()} />
        </TableFrame>
      ) : reviews.data.length === 0 ? (
        <TableFrame>
          {filtered ? (
            <EmptyState
              title="No matching reviews."
              action={
                <button type="button" onClick={() => update({ repo: null, status: null })} className={buttonClass({ size: "sm" })}>
                  Clear filters
                </button>
              }
            />
          ) : (
            <EmptyState
              title="No reviews yet."
              action={
                !hasRepos(me) && (
                  <a href={me.installUrl} target="_blank" rel="noreferrer" className={buttonClass({ variant: "primary", size: "sm" })}>
                    Connect repositories
                  </a>
                )
              }
            />
          )}
        </TableFrame>
      ) : (
        <ReviewTable
          reviews={reviews.data}
          className={clsx("transition-opacity duration-150", reviews.isPlaceholderData && "opacity-60")}
        />
      )}
    </>
  );
}

function TableFrame({ children, loading }: { children?: ReactNode; loading?: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface-1 shadow-hi">
      {loading ? (
        <>
          <ReviewTableHeader variant="full" />
          <ReviewRowsSkeleton />
        </>
      ) : (
        children
      )}
    </div>
  );
}
