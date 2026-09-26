// OWNER: d2 (wave 3). Shared types for /findings, derived from the frozen URL
// state t2a already built for this exact route (src/lib/hooks/url-state.ts's
// findingFilterParsers) rather than hand-duplicated, so this file cannot drift
// from what useFindingFilters() actually returns.
import type { Nullable, SetValues, Values } from "nuqs";
import type { findingFilterParsers } from "@/lib/hooks/url-state";

/** [review_id, repository, pr_number, fingerprint, status, severity_min, blocking, proof_status] — every §6.5 filter except limit/cursor, exactly as the URL holds it (null = absent; proof_status defaults to `[]`, nuqs's own array-parser default). */
export type FindingUrlFilters = Values<typeof findingFilterParsers>;

/** setFilters from useFindingFilters(). */
export type SetFindingUrlFilters = SetValues<typeof findingFilterParsers>;

/** What setFilters(...) actually accepts: every field individually nullable, whatever its resting type (nuqs's `null` means "reset to default/absent"). */
export type FindingFilterPatch = Partial<Nullable<FindingUrlFilters>>;
