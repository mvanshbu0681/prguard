// OWNER: t2a (wave 1).
//
// The URL is the source of truth for every list filter (dashboard §6), so a
// judge can be dropped straight into
//   /findings?severity_min=high&proof_status=proven&blocking=true
// The parameter names are the API's own, so a filtered view's URL reads like the
// request it makes. proof_status repeats (`&proof_status=proven&proof_status=disproven`),
// matching what the client sends. The hooks need the NuqsAdapter that
// src/lib/providers.tsx renders; on a statically rendered page wrap the
// component that calls them in <Suspense> (they read useSearchParams).
import {
  createSerializer,
  parseAsBoolean,
  parseAsInteger,
  parseAsNativeArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { ACTOR_TYPES, FINDING_STATUSES, PROOF_STATUSES, SEVERITY_BANDS, SUPPRESSION_SCOPES } from "@/lib/contracts";

/** /findings — every §6.5 filter except limit and cursor. */
export const findingFilterParsers = {
  review_id: parseAsString,
  repository: parseAsString,
  pr_number: parseAsInteger,
  fingerprint: parseAsString,
  status: parseAsStringLiteral(FINDING_STATUSES),
  severity_min: parseAsStringLiteral(SEVERITY_BANDS),
  blocking: parseAsBoolean,
  proof_status: parseAsNativeArrayOf(parseAsStringLiteral(PROOF_STATUSES)),
};

/** /suppressions — §6.7. `active` defaults to true, like the API, and is dropped from the URL at its default. */
export const suppressionFilterParsers = {
  repository: parseAsString,
  scope: parseAsStringLiteral(SUPPRESSION_SCOPES),
  active: parseAsBoolean.withDefault(true),
  fingerprint: parseAsString,
};

/** /audit — §6.8. `since` is an ISO 8601 string, passed through untouched. */
export const auditFilterParsers = {
  review_id: parseAsString,
  finding_id: parseAsString,
  event_type: parseAsString,
  actor_type: parseAsStringLiteral(ACTOR_TYPES),
  since: parseAsString,
};

/** [filters, setFilters] for /findings; pass `filters` straight to useFindings(). */
export function useFindingFilters() {
  return useQueryStates(findingFilterParsers, { history: "replace" });
}

export function useSuppressionFilters() {
  return useQueryStates(suppressionFilterParsers, { history: "replace" });
}

export function useAuditFilters() {
  return useQueryStates(auditFilterParsers, { history: "replace" });
}

/** Deep links: findingsHref("/findings", { severity_min: "high", proof_status: ["proven"], blocking: true }). */
export const findingsHref = createSerializer(findingFilterParsers);
export const suppressionsHref = createSerializer(suppressionFilterParsers);
export const auditHref = createSerializer(auditFilterParsers);
