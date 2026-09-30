"use client";

import type { RepoDetail } from "@contracts";
import { ArrowLeft, ArrowUpRight, GitBranch, Lock } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { GitHubIcon } from "@/components/brand";
import { BriefPanel } from "@/components/repo/brief-panel";
import { ReviewersPanel } from "@/components/repo/reviewers-panel";
import { RulesPanel } from "@/components/repo/rules-panel";
import { ReviewTable } from "@/components/reviews/review-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState, InlineError } from "@/components/ui/error-state";
import { Panel } from "@/components/ui/panel";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { isNotFound } from "@/lib/api";
import { useRepo } from "@/lib/queries";
import { usePatchRepo } from "@/lib/repo-mutations";

export default function RepoPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const repo = useRepo(id);

  return (
    <div>
      <Link
        href="/repos"
        className="-ml-1 mb-5 inline-flex items-center gap-1 rounded-sm px-1 text-sm text-dim transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Repositories
      </Link>

      {repo.isPending ? (
        <RepoSkeleton />
      ) : repo.isError ? (
        <Panel>
          {isNotFound(repo.error) ? (
            <EmptyState title="Repository not found." />
          ) : (
            <ErrorState message="Couldn't load repository." onRetry={() => void repo.refetch()} />
          )}
        </Panel>
      ) : (
        <Repo repo={repo.data} />
      )}
    </div>
  );
}

function Repo({ repo }: { repo: RepoDetail }) {
  const patch = usePatchRepo(repo.id);
  const slash = repo.fullName.indexOf("/");
  const owner = slash > 0 ? repo.fullName.slice(0, slash) : "";
  const name = slash > 0 ? repo.fullName.slice(slash + 1) : repo.fullName;

  return (
    <>
      <header className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 truncate text-xl font-semibold tracking-[-0.015em] text-primary">
            {owner && <span className="font-normal text-dim">{owner} /</span>}
            {name}
            {repo.private && <Lock className="size-3.5 shrink-0 text-faint" aria-label="Private" />}
          </h1>
          <div className="mt-2 flex items-center gap-4 text-sm text-dim">
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="size-3.5" aria-hidden="true" />
              <span className="font-mono text-xs text-body">{repo.defaultBranch}</span>
            </span>
            <a
              href={repo.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-primary"
            >
              <GitHubIcon size={13} />
              GitHub
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <label className="flex h-8 cursor-pointer items-center gap-3 rounded-md border border-line-2 bg-surface-1 pl-3 pr-2.5 text-sm text-body shadow-hi">
            Enabled
            <Switch checked={repo.enabled} onChange={(enabled) => patch.mutate({ enabled })} label="Enabled" disabled={!repo.canEdit} />
          </label>
          {patch.isError && <InlineError message="Couldn't update." />}
        </div>
      </header>

      <div className="mt-7 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <BriefPanel repo={repo} />
        <div className="space-y-4">
          <RulesPanel key={`rules-${repo.id}`} repo={repo} />
          <ReviewersPanel repo={repo} />
        </div>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-primary">Recent reviews</h2>
        {repo.recentReviews.length > 0 ? (
          <ReviewTable reviews={repo.recentReviews} variant="compact" />
        ) : (
          <Panel>
            <EmptyState title="No reviews yet." className="py-10" />
          </Panel>
        )}
      </section>
    </>
  );
}

function RepoSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="h-5 w-72" />
      <Skeleton className="mt-3.5 h-3 w-40" />
      <div className="mt-7 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="p-5">
          <Skeleton className="mb-6 h-3 w-24" />
          <SkeletonText lines={8} />
        </Panel>
        <div className="space-y-4">
          <Panel className="p-4">
            <Skeleton className="mb-4 h-3 w-16" />
            <Skeleton className="h-28 w-full" />
          </Panel>
          <Panel className="p-4">
            <Skeleton className="mb-4 h-3 w-20" />
            <SkeletonText lines={3} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
