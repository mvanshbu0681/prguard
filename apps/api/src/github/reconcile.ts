import * as installationsRepo from "../db/repos/installations.ts";
import * as repositoriesRepo from "../db/repos/repositories.ts";
import { log } from "../log.ts";
import { githubApp } from "./app.ts";

type GitHubAccount = { login?: string; name?: string | null; type?: string; avatar_url?: string } | null | undefined;

export type GitHubInstallation = {
  id: number;
  account: GitHubAccount;
  repository_selection?: string;
  suspended_at?: string | null;
};

export type GitHubRepo = { id: number; full_name: string; default_branch?: string; private?: boolean };

export function saveInstallation(installation: GitHubInstallation): void {
  installationsRepo.upsert({
    id: installation.id,
    accountLogin: installation.account?.login ?? installation.account?.name ?? "unknown",
    accountType: installation.account?.type ?? "Organization",
    avatarUrl: installation.account?.avatar_url ?? null,
    repositorySelection: installation.repository_selection ?? null,
    suspended: Boolean(installation.suspended_at),
  });
}

export function saveRepos(installationId: number, repos: GitHubRepo[]): void {
  repositoriesRepo.upsertMany(
    installationId,
    repos.map((r) => ({ id: r.id, fullName: r.full_name, defaultBranch: r.default_branch ?? null, private: r.private ?? false })),
  );
}

/** Pulls one installation's repos from GitHub; returns the ids of repos it now has. */
export async function syncInstallation(installationId: number): Promise<number[]> {
  const repos: GitHubRepo[] = [];
  for await (const { repository } of githubApp.eachRepository.iterator({ installationId })) {
    repos.push({
      id: Number(repository.id),
      full_name: repository.full_name,
      default_branch: repository.default_branch,
      private: repository.private,
    });
  }
  saveRepos(installationId, repos);
  const ids = repos.map((r) => r.id);
  repositoriesRepo.markRemovedExcept(installationId, ids);
  return ids;
}

/** Brings every installation and repo in line with GitHub, covering events missed while offline. */
export async function reconcile(): Promise<void> {
  const seen: number[] = [];
  for await (const { installation } of githubApp.eachInstallation.iterator()) {
    saveInstallation(installation as GitHubInstallation);
    seen.push(installation.id);
    const repoIds = await syncInstallation(installation.id);
    log.info({ installation: installation.account?.login, repos: repoIds.length }, "installation synced");
  }
  const gone = installationsRepo.markDeletedExcept(seen);
  for (const id of gone) repositoriesRepo.markRemovedForInstallation(id);
}
