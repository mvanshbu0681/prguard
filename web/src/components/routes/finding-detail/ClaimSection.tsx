// OWNER: d3 (wave 3). §01 — CLAIM (dashboard-blueprint §2.7). body_markdown,
// restricted schema; rule_key, category, specialist below it.
//
// RAISED: the blueprint's ASCII sketch also shows an "S4 coordinator decision"
// line ("kept — not a duplicate of 7e3f1a44 (shape_hash differs)"). No field
// in the generated schema (Finding, FindingHistory) carries that sentence —
// it is not `dedup_reason`, not on `history`, not anywhere in
// components.schemas. Rather than inventing a value the API does not send
// (plan hard rule: never hard-code a number/value a fixture or API field
// provides), this section omits it.
import { chipLabel } from "@/components/badges";
import type { Finding } from "@/lib/api-types";
import { ClaimMarkdown } from "./ClaimMarkdown";
import { OrdinaryPanel } from "./OrdinaryPanel";

export function ClaimSection({ finding }: { finding: Finding }) {
  return (
    <OrdinaryPanel index="01" category="Claim" provenance={`GET /v1/findings/${finding.id.slice(0, 8)} → body`}>
      <ClaimMarkdown>{finding.body_markdown}</ClaimMarkdown>
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-rule-hair pt-4 sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <span className="type-label text-text-dim">Rule</span>
          <span className="type-data text-text-body">{finding.rule_key}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="type-label text-text-dim">Category</span>
          <span className="type-data text-text-body">{chipLabel(finding.category)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="type-label text-text-dim">Specialist</span>
          <span className="type-data text-text-body">{finding.specialist ?? "—"}</span>
        </div>
      </dl>
    </OrdinaryPanel>
  );
}
