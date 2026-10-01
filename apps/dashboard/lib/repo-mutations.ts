"use client";

import type { RepoDetail, RepoListItem, RepoPatch } from "@contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { keys } from "./queries";

type Snapshot = { repo?: RepoDetail; repos?: RepoListItem[] };

// PATCH /repos/:id, applied optimistically to both the detail and the list cache
// and rolled back if the server says no.
export function usePatchRepo(id: number) {
  const queryClient = useQueryClient();

  return useMutation<RepoDetail, Error, RepoPatch, Snapshot>({
    mutationFn: (patch) => api<RepoDetail>(`/repos/${id}`, { method: "PATCH", body: patch }),
    onMutate: async (patch) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: keys.repo(id) }),
        queryClient.cancelQueries({ queryKey: keys.repos }),
      ]);
      const snapshot: Snapshot = {
        repo: queryClient.getQueryData<RepoDetail>(keys.repo(id)),
        repos: queryClient.getQueryData<RepoListItem[]>(keys.repos),
      };
      if (snapshot.repo) queryClient.setQueryData<RepoDetail>(keys.repo(id), { ...snapshot.repo, ...patch });
      if (snapshot.repos && patch.enabled !== undefined) {
        const enabled = patch.enabled;
        queryClient.setQueryData<RepoListItem[]>(
          keys.repos,
          snapshot.repos.map((r) => (r.id === id ? { ...r, enabled } : r)),
        );
      }
      return snapshot;
    },
    onError: (_error, _patch, snapshot) => {
      if (snapshot?.repo) queryClient.setQueryData(keys.repo(id), snapshot.repo);
      if (snapshot?.repos) queryClient.setQueryData(keys.repos, snapshot.repos);
    },
    onSuccess: (repo) => {
      queryClient.setQueryData(keys.repo(id), repo);
      queryClient.setQueryData<RepoListItem[]>(keys.repos, (list) =>
        list?.map((r) => (r.id === id ? { ...r, enabled: repo.enabled, briefStatus: repo.briefStatus } : r)),
      );
    },
  });
}

export function useRescanRepo(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api<{ ok: true }>(`/repos/${id}/rescan`, { method: "POST" }),
    onSuccess: () => {
      // Flip to "queued" right away so polling starts; the refetch brings the real state.
      queryClient.setQueryData<RepoDetail>(keys.repo(id), (repo) => (repo ? { ...repo, briefStatus: "queued" } : repo));
      void queryClient.invalidateQueries({ queryKey: keys.repo(id) });
      void queryClient.invalidateQueries({ queryKey: keys.repos });
    },
  });
}
