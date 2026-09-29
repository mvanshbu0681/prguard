"use client";
// The /findings view state, URL-first (nuqs). The server keys are the same
// parameters src/lib/hooks/url-state.ts's findingFilterParsers reads, with one
// deliberate difference: `status` defaults to `published` (the sidebar's count,
// what reached a pull request) and `status=all` asks for every status. The
// lens keys (q, specialist, sort, group) never reach the API.
import { parseAsBoolean, parseAsInteger, parseAsNativeArrayOf, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useCallback } from "react";
import { PROOF_STATUSES, SEVERITY_BANDS } from "@/lib/contracts";
import type { FindingFilters } from "@/lib/hooks";
import { GROUPS, SORTS, SPECIALISTS, STATUS_VIEWS, type FindingsView, type FindingsViewPatch } from "./types";

export const findingsViewParsers = {
  status: parseAsStringLiteral(STATUS_VIEWS).withDefault("published"),
  severity_min: parseAsStringLiteral(SEVERITY_BANDS),
  proof_status: parseAsNativeArrayOf(parseAsStringLiteral(PROOF_STATUSES)),
  blocking: parseAsBoolean,
  repository: parseAsString,
  pr_number: parseAsInteger,
  review_id: parseAsString,
  fingerprint: parseAsString,
  q: parseAsString,
  specialist: parseAsStringLiteral(SPECIALISTS),
  sort: parseAsStringLiteral(SORTS).withDefault("newest"),
  group: parseAsStringLiteral(GROUPS).withDefault("none"),
};

/** [view, setView] for /findings. `setView(null)` clears every filter and lens (status back to Published). */
export function useFindingsView(): [FindingsView, (patch: FindingsViewPatch | null) => void] {
  const [view, set] = useQueryStates(findingsViewParsers, { history: "replace", clearOnDefault: true });
  const setView = useCallback(
    (patch: FindingsViewPatch | null) => {
      void set(patch);
    },
    [set],
  );
  return [view as FindingsView, setView];
}

/** Rows per API page. Small enough that "load as you scroll" is real, large enough that a PR's findings arrive together. */
export const PAGE_LIMIT = 50;

/** The API filters for a view: every server key, `status=all` → no status. */
export function serverFilters(view: FindingsView, overrides: Partial<FindingFilters> = {}): FindingFilters {
  return {
    status: view.status === "all" ? null : view.status,
    severity_min: view.severity_min,
    proof_status: view.proof_status.length ? view.proof_status : null,
    blocking: view.blocking,
    repository: view.repository,
    pr_number: view.pr_number,
    review_id: view.review_id,
    fingerprint: view.fingerprint,
    ...overrides,
  };
}

/** True when a lens needs every matching row in the browser (search, specialist, a re-sort or a grouping). */
export function lensActive(view: FindingsView): boolean {
  return Boolean(view.q?.trim()) || view.specialist !== null || view.sort !== "newest" || view.group !== "none";
}
