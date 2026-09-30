"use client";

import type { RepoListItem } from "@contracts";
import { Plus } from "lucide-react";
import { useMe } from "@/components/me-provider";
import { RepoRowsSkeleton, RepoTable, RepoTableHeader } from "@/components/repo/repo-table";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { plural } from "@/lib/format";
import { useRepos } from "@/lib/queries";

type Group = { installationId: number; accountLogin: string; avatarUrl: string | null; repos: RepoListItem[] };

function groupByInstallation(repos: RepoListItem[], avatars: Map<number, string | null>): Group[] {
  const groups = new Map<number, Group>();
  for (const repo of repos) {
    let group = groups.get(repo.installationId);
    if (!group) {
      group = {
        installationId: repo.installationId,
        accountLogin: repo.accountLogin,
        avatarUrl: avatars.get(repo.installationId) ?? null,
        repos: [],
      };
      groups.set(repo.installationId, group);
    }
    group.repos.push(repo);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, repos: g.repos.sort((a, b) => a.fullName.localeCompare(b.fullName)) }))
    .sort((a, b) => a.accountLogin.localeCompare(b.accountLogin));
}

export default function ReposPage() {
  const me = useMe();
  const repos = useRepos();
  const avatars = new Map(me.installations.map((i) => [i.id, i.avatarUrl]));

  const addButton = (
    <ButtonLink href={me.installUrl} variant="primary">
      <Plus aria-hidden="true" />
      Add repositories
    </ButtonLink>
  );

  return (
    <>
      <PageHeader title="Repositories" actions={addButton} />

      {repos.isPending ? (
        <div>
          <div className="mb-2.5 flex h-5 items-center gap-2">
            <Skeleton className="size-5 rounded-[4px]" />
            <Skeleton className="h-2.5 w-28" />
          </div>
          <div className="overflow-hidden rounded-lg border border-line bg-surface-1 shadow-hi">
            <RepoTableHeader />
            <RepoRowsSkeleton />
          </div>
        </div>
      ) : repos.isError ? (
        <div className="rounded-lg border border-line bg-surface-1 shadow-hi">
          <ErrorState message="Couldn't load repositories." onRetry={() => void repos.refetch()} />
        </div>
      ) : repos.data.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface-1 shadow-hi">
          <EmptyState
            title="No repositories connected."
            action={
              <ButtonLink href={me.installUrl} variant="secondary" size="sm">
                <Plus aria-hidden="true" />
                Add repositories
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <div className="space-y-8">
          {groupByInstallation(repos.data, avatars).map((group) => (
            <section key={group.installationId} aria-label={group.accountLogin}>
              <div className="mb-2.5 flex items-center gap-2">
                <Avatar src={group.avatarUrl} name={group.accountLogin} size={20} square />
                <h2 className="text-sm font-semibold text-primary">{group.accountLogin}</h2>
                <span className="text-xs text-faint tabular">{plural(group.repos.length, "repository", "repositories")}</span>
              </div>
              <RepoTable repos={group.repos} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
