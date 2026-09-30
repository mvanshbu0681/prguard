"use client";

import type { RepoListItem } from "@contracts";
import { Lock } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { briefState, Dot, reviewState, StatusLabel } from "@/components/ui/status";
import { Switch } from "@/components/ui/switch";
import { RelativeTime } from "@/components/ui/time";
import { usePatchRepo } from "@/lib/repo-mutations";

const grid = "grid grid-cols-[minmax(0,1fr)_160px_140px_64px] items-center gap-4 px-4";

export function RepoTable({ repos }: { repos: RepoListItem[] }) {
  return (
    <div role="table" className="overflow-hidden rounded-lg border border-line bg-surface-1 shadow-hi">
      <RepoTableHeader />
      <div role="rowgroup">
        {repos.map((repo) => (
          <RepoRow key={repo.id} repo={repo} />
        ))}
      </div>
    </div>
  );
}

export function RepoTableHeader() {
  return (
    <div role="row" className={`${grid} h-9 border-b border-line text-xs font-medium text-dim`}>
      <span role="columnheader">Repository</span>
      <span role="columnheader">Brief</span>
      <span role="columnheader">Last review</span>
      <span role="columnheader" className="text-right">
        Enabled
      </span>
    </div>
  );
}

function RepoRow({ repo }: { repo: RepoListItem }) {
  const patch = usePatchRepo(repo.id);
  const brief = briefState(repo.briefStatus);
  const slash = repo.fullName.indexOf("/");
  const owner = slash > 0 ? repo.fullName.slice(0, slash + 1) : "";
  const name = slash > 0 ? repo.fullName.slice(slash + 1) : repo.fullName;

  return (
    <div
      role="row"
      className={`${grid} relative h-11 border-b border-hair text-sm transition-colors duration-75 last:border-b-0 hover:bg-surface-2`}
    >
      <span role="cell" className="flex min-w-0 items-center gap-2">
        {/* Stretched link: the whole row navigates; the controls below sit above it. */}
        <Link
          href={`/repos/${repo.id}`}
          className="min-w-0 truncate after:absolute after:inset-0 after:content-[''] focus-visible:outline-offset-[-2px]"
        >
          <span className="text-dim">{owner}</span>
          <span className={repo.enabled ? "font-medium text-primary" : "font-medium text-dim"}>{name}</span>
        </Link>
        {repo.private && <Lock className="size-3 shrink-0 text-faint" aria-label="Private" />}
      </span>

      <span role="cell" className="min-w-0">
        <StatusLabel tone={brief.tone} label={brief.label} />
      </span>

      <span role="cell" className="min-w-0">
        {repo.lastReview ? (
          <Link
            href={`/reviews/${repo.lastReview.id}`}
            className="relative z-10 inline-flex items-center gap-2 rounded-sm text-dim transition-colors hover:text-primary"
          >
            <Dot tone={reviewState({ status: repo.lastReview.status, stage: "queued" }).tone} />
            <RelativeTime ts={repo.lastReview.createdAt} className="tabular" />
          </Link>
        ) : (
          <span className="text-faint">—</span>
        )}
      </span>

      <span role="cell" className="relative z-10 flex justify-end">
        <Switch
          checked={repo.enabled}
          onChange={(enabled) => patch.mutate({ enabled })}
          label={`Enable reviews for ${repo.fullName}`}
          disabled={!repo.canEdit}
        />
      </span>
    </div>
  );
}

export function RepoRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`${grid} h-11 border-b border-hair last:border-b-0`}>
          <Skeleton className="h-2.5" style={{ width: `${30 + ((i * 13) % 25)}%` }} />
          <span className="flex items-center gap-2">
            <Skeleton className="size-1.5 rounded-full" />
            <Skeleton className="h-2.5 w-16" />
          </span>
          <Skeleton className="h-2.5 w-14" />
          <Skeleton className="ml-auto h-4 w-7 rounded-full" />
        </div>
      ))}
    </div>
  );
}
