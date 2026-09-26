// OWNER: d3 (wave 3). §05 — DELIVERY (dashboard-blueprint §2.7): which
// comment-ladder rung fired for this finding, and whether it landed on the
// exact reported line, plus a link to the posted GitHub comment.
//
// RAISED: the blueprint's footer sketch reads
// `GET /v1/reviews/4e8b1d0/result → delivery.by_finding['a91f3c2e']`, but
// `delivery.by_finding` is not a field the generated schema has (ReviewResult
// → DeliveryInfo carries only aggregate `ladder_breakdown`, no per-finding
// map). The per-finding rung IS served, directly, as `Finding.delivery`
// (FindingDelivery: mode, delivered_line, github_comment_id) from
// GET /v1/findings/{id} — this section reads that field and prints the real
// endpoint it came from instead of the blueprint's non-existent one.
import { DeliveryModeChip } from "@/components/badges";
import type { Finding } from "@/lib/api-types";
import { deliveredExactLine, githubCommentUrl, locationRangeLabel } from "./format";
import { OrdinaryPanel } from "./OrdinaryPanel";

const META_LABEL = "type-label text-text-dim";
const META_VALUE = "type-data break-words text-text-body";

export interface DeliverySectionProps {
  finding: Finding;
  repository?: { owner: string; name: string } | null;
  prNumber?: number | null;
}

export function DeliverySection({ finding, repository, prNumber }: DeliverySectionProps) {
  const delivery = finding.delivery;
  // Only inline_exact/inline_nearest carry a line-level claim; file_level and
  // summary_only can still have SOME delivered_line value in the fixture data,
  // but comparing it to the reported line would assert a precision the rung
  // itself does not claim.
  const isLineRung = delivery?.mode === "inline_exact" || delivery?.mode === "inline_nearest";
  const exact = isLineRung ? deliveredExactLine(delivery?.delivered_line, finding.location.start_line) : null;
  const commentUrl = delivery?.github_comment_id && repository && prNumber ? githubCommentUrl(repository.owner, repository.name, prNumber, delivery.github_comment_id) : null;

  return (
    <OrdinaryPanel index="05" category="Delivery" provenance={`GET /v1/findings/${finding.id.slice(0, 8)} → delivery`}>
      {delivery ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <DeliveryModeChip mode={delivery.mode} />
            {exact !== null ? (
              <span className="type-data text-text-dim">
                {exact ? "the exact reported line" : `line ${delivery.delivered_line} — reported at ${locationRangeLabel(finding.location.file_path, finding.location.start_line)}`}
              </span>
            ) : null}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className={META_LABEL}>Delivered line</span>
              <span className={META_VALUE}>{delivery.delivered_line ?? "—"}</span>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className={META_LABEL}>GitHub comment</span>
              <span className={META_VALUE}>
                {commentUrl ? (
                  <a className="link-prose" href={commentUrl} target="_blank" rel="noreferrer noopener">
                    #{delivery.github_comment_id} ↗
                  </a>
                ) : delivery.github_comment_id ? (
                  `#${delivery.github_comment_id}`
                ) : (
                  "—"
                )}
              </span>
            </div>
          </dl>
        </div>
      ) : (
        <p className="type-body text-text-body">Not delivered to the pull request.</p>
      )}
    </OrdinaryPanel>
  );
}
