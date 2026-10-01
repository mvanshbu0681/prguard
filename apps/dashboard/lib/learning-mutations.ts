"use client";

import type { Learning, LearningCreate, LearningPatch } from "@contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { keys } from "./queries";

type Snapshot = { learnings?: Learning[] };

// POST /repos/:id/learnings
export function useAddLearning(repo: number) {
  const queryClient = useQueryClient();
  const key = keys.learnings(repo);

  return useMutation<Learning, Error, LearningCreate>({
    mutationFn: (body) => api<Learning>(`/repos/${repo}/learnings`, { method: "POST", body }),
    onSuccess: (learning) => {
      queryClient.setQueryData<Learning[]>(key, (list) => [...(list ?? []).filter((l) => l.id !== learning.id), learning]);
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

// PATCH /repos/:id/learnings/:lid, applied optimistically and rolled back if the server says no.
export function usePatchLearning(repo: number) {
  const queryClient = useQueryClient();
  const key = keys.learnings(repo);

  return useMutation<Learning, Error, { id: number; patch: LearningPatch }, Snapshot>({
    mutationFn: ({ id, patch }) => api<Learning>(`/repos/${repo}/learnings/${id}`, { method: "PATCH", body: patch }),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const learnings = queryClient.getQueryData<Learning[]>(key);
      if (learnings) queryClient.setQueryData<Learning[]>(key, learnings.map((l) => (l.id === id ? { ...l, ...patch } : l)));
      return { learnings };
    },
    onError: (_error, _vars, snapshot) => {
      if (snapshot?.learnings) queryClient.setQueryData(key, snapshot.learnings);
    },
    onSuccess: (learning) => {
      queryClient.setQueryData<Learning[]>(key, (list) => list?.map((l) => (l.id === learning.id ? learning : l)));
    },
  });
}

// DELETE /repos/:id/learnings/:lid, removed from the list right away.
export function useDeleteLearning(repo: number) {
  const queryClient = useQueryClient();
  const key = keys.learnings(repo);

  return useMutation<{ ok: true }, Error, number, Snapshot>({
    mutationFn: (id) => api<{ ok: true }>(`/repos/${repo}/learnings/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const learnings = queryClient.getQueryData<Learning[]>(key);
      if (learnings) queryClient.setQueryData<Learning[]>(key, learnings.filter((l) => l.id !== id));
      return { learnings };
    },
    onError: (_error, _id, snapshot) => {
      if (snapshot?.learnings) queryClient.setQueryData(key, snapshot.learnings);
    },
  });
}
