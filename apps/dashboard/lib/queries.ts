"use client";

import type { BriefStatus, RepoDetail, RepoListItem, ReviewDetail, ReviewListItem, ReviewStatus } from "@contracts";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export const keys = {
  me: ["me"] as const,
  repos: ["repos"] as const,
  repo: (id: number) => ["repo", id] as const,
  reviews: (filters: ReviewFilters) => ["reviews", filters] as const,
  allReviews: ["reviews"] as const,
  review: (id: number) => ["review", id] as const,
};

export type ReviewFilter = "active" | "completed" | "failed";
export type ReviewFilters = { repo: number | null; status: ReviewFilter | null };

export function isActive(status: ReviewStatus | undefined): boolean {
  return status === "queued" || status === "running";
}

export function isBriefBusy(status: BriefStatus | undefined): boolean {
  return status === "queued" || status === "running";
}

export function useReviews(filters: ReviewFilters) {
  return useQuery({
    queryKey: keys.reviews(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.repo !== null) params.set("repo", String(filters.repo));
      if (filters.status) params.set("status", filters.status);
      params.set("limit", "50");
      return api<ReviewListItem[]>(`/reviews?${params}`);
    },
    refetchInterval: (query) => (query.state.data?.some((r) => isActive(r.status)) ? 3000 : 15000),
    placeholderData: (previous) => previous,
  });
}

export function useReview(id: number) {
  return useQuery({
    queryKey: keys.review(id),
    queryFn: () => api<ReviewDetail>(`/reviews/${id}`),
    refetchInterval: (query) => (isActive(query.state.data?.status) ? 2000 : false),
    enabled: Number.isFinite(id),
  });
}

export function useRepos() {
  return useQuery({
    queryKey: keys.repos,
    queryFn: () => api<RepoListItem[]>("/repos"),
    refetchInterval: (query) =>
      query.state.data?.some((r) => isBriefBusy(r.briefStatus) || isActive(r.lastReview?.status)) ? 5000 : 30000,
  });
}

export function useRepo(id: number) {
  return useQuery({
    queryKey: keys.repo(id),
    queryFn: () => api<RepoDetail>(`/repos/${id}`),
    refetchInterval: (query) => {
      const repo = query.state.data;
      if (!repo) return false;
      if (isBriefBusy(repo.briefStatus)) return 3000;
      if (repo.recentReviews.some((r) => isActive(r.status))) return 5000;
      return false;
    },
    enabled: Number.isFinite(id),
  });
}
