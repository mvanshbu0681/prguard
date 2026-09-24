"use client";
// OWNER: d2 (wave 3). A finding (web/src/api/types.gen.ts's Finding) carries
// only `review_id` — repository and PR number live on the review, not the
// finding (confirmed against the fixture corpus: web/public/fixtures/findings/index.json
// has no `repository` field). The "repository#PR" column therefore joins
// against GET /v1/reviews (useReviewList, plan A11) once, keyed by review_id.
//
// This is deliberately its own small query rather than a prop threaded down
// from a server component: the list is client-filtered/paginated already, and
// two independent TanStack Query caches (findings, reviews) compose without
// either owning the other's loading state — a row renders its id-prefix
// fallback until the lookup resolves, same as any other progressive cell.
import { useMemo } from "react";
import { useReviewList } from "@/lib/hooks";
import { buildRepoLookup, type RepoLookupEntry } from "./format";

/** review_id -> { label: "owner/name#42", repository: "owner/name" }. Empty map while loading or on error — callers fall back to the finding's own id. */
export function useRepoLookup(): { lookup: Map<string, RepoLookupEntry>; isLoading: boolean } {
  // 200 = ListReviewsQuery's max (plan A11 / src/api/ext.ts): the fixture
  // corpus is ~76 runs across ~6 repos (README), well under it, so one page
  // covers every review a finding could reference.
  const query = useReviewList({ limit: 200 });
  const lookup = useMemo(() => buildRepoLookup(query.data?.items ?? []), [query.data]);
  return { lookup, isLoading: query.isPending };
}
