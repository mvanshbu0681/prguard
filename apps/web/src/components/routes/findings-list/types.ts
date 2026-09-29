// /findings view state. Everything a reader can change on the page lives in the
// URL (nuqs), so a filtered, sorted, grouped inbox is a link you can paste:
//   /findings?severity_min=high&proof_status=proven&blocking=true&group=pr
//
// The server filters keep the API's own parameter names (spec §6.5, as
// src/lib/hooks/url-state.ts does). Four more keys are lenses applied in the
// browser over the loaded rows, because the API has no parameter for them:
// q (search), specialist, sort and group.
import type { Nullable } from "nuqs";
import type { ProofStatus, SeverityBand } from "@/lib/contracts";

/** The status segments, in display order. `all` is the absence of a status filter at the API. */
export const STATUS_VIEWS = ["published", "disproven", "suppressed", "dropped", "proposed", "all"] as const;
export type StatusView = (typeof STATUS_VIEWS)[number];

export const SORTS = ["newest", "severity", "recurring", "oldest"] as const;
export type FindingsSort = (typeof SORTS)[number];

export const GROUPS = ["none", "pr", "file"] as const;
export type FindingsGroup = (typeof GROUPS)[number];

/** The four specialists that propose findings (Finding.specialist). */
export const SPECIALISTS = ["bugs", "security", "tests", "quality"] as const;
export type Specialist = (typeof SPECIALISTS)[number];

export interface FindingsView {
  /** Defaults to `published`: the inbox opens on what actually reached your pull requests. */
  status: StatusView;
  severity_min: SeverityBand | null;
  proof_status: ProofStatus[];
  blocking: boolean | null;
  repository: string | null;
  pr_number: number | null;
  review_id: string | null;
  fingerprint: string | null;
  q: string | null;
  specialist: Specialist | null;
  sort: FindingsSort;
  group: FindingsGroup;
}

/** What setView(...) accepts: any subset, `null` resets a key to its default (and drops it from the URL). */
export type FindingsViewPatch = Partial<Nullable<FindingsView>>;
export type SetFindingsView = (patch: FindingsViewPatch | null) => unknown;
