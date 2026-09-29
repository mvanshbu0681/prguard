"use client";
// A Finding carries only review_id — the repository, PR number and PR title live
// on the review. This joins GET /v1/reviews once (the corpus is ~76 runs, well
// under the 200 page max) and looks each row up by review_id. Rows render their
// own fallback until the lookup resolves.
import { useMemo } from "react";
import { useReviewList } from "@/lib/hooks";
import { buildRepoLookup, type RepoLookupEntry } from "./format";

/** review_id → { label, repository, name, prNumber, prTitle }. Empty while loading or on error. */
export function useRepoLookup(): { lookup: Map<string, RepoLookupEntry>; isLoading: boolean } {
  const query = useReviewList({ limit: 200 });
  const lookup = useMemo(() => buildRepoLookup(query.data?.items ?? []), [query.data]);
  return { lookup, isLoading: query.isPending };
}
