// Delivery: how the finding reached the pull request. Witness walks a comment
// ladder (the exact line, the nearest reviewable line, the file, the summary)
// and stops at the first rung GitHub accepts; the card shows which rung fired,
// where it landed against the reported lines, and links the comment itself.
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/dash/kit";
import type { Finding, ReviewResult } from "@/lib/api-types";
import { deliveredWithinRange, deliveryCommentUrl, locationRangeLabel } from "./format";
import s from "./detail.module.css";

const RUNGS = [
  { mode: "inline_exact", label: "Inline, on the reported line" },
  { mode: "inline_nearest", label: "Inline, nearest reviewable line" },
  { mode: "file_level", label: "File-level comment" },
  { mode: "summary_only", label: "In the review summary" },
] as const;

function notDeliveredReason(status: Finding["status"]): string {
  switch (status) {
    case "dropped":
      return "Never posted: the coordinator dropped it as noise or a duplicate.";
    case "disproven":
      return "Never posted: Witness refuted it by execution first.";
    case "suppressed":
      return "Not posted: a suppression on the ledger covers it.";
    case "proposed":
      return "Not posted yet: still waiting on the coordinator.";
    default:
      return "Not delivered to the pull request.";
  }
}

export function DeliveryCard({ finding, review }: { finding: Finding; review: ReviewResult | undefined }) {
  const d = finding.delivery;
  const mode = d?.mode ?? "not_delivered";
  const delivered = mode !== "not_delivered";
  const { start_line, end_line, file_path } = finding.location;
  const within = mode === "inline_exact" || mode === "inline_nearest" ? deliveredWithinRange(d?.delivered_line, start_line, end_line) : null;
  const commentUrl = review && d?.github_comment_id ? deliveryCommentUrl(review.repository.owner, review.repository.name, review.pull_request.number, d.github_comment_id, mode) : null;

  return (
    <Card as="section" tone="surface" pad="lg" className={s.cardBody} aria-labelledby="delivery-title">
      <h2 id="delivery-title" className={s.cardTitle}>
        Delivery
      </h2>
      <ol className={s.ladder} aria-label="Comment ladder">
        {RUNGS.map((r) => (
          <li key={r.mode} className={s.rung} data-on={r.mode === mode ? "" : undefined} aria-current={r.mode === mode ? "step" : undefined}>
            <span className={s.rungDot} aria-hidden />
            {r.label}
            {r.mode === mode && d?.delivered_line != null ? <span className={s.rungHint}>line {d.delivered_line}</span> : null}
          </li>
        ))}
      </ol>
      {delivered ? (
        within === null ? null : (
          <p className={s.muted}>
            {within
              ? `Landed on line ${d?.delivered_line}, inside the reported ${locationRangeLabel(file_path, start_line, end_line).split(":").pop()}.`
              : `Landed on line ${d?.delivered_line}; the issue is at ${locationRangeLabel(file_path, start_line, end_line)}, outside the diff hunk.`}
          </p>
        )
      ) : (
        <p className={s.muted}>{notDeliveredReason(finding.status)}</p>
      )}
      {commentUrl ? (
        <a href={commentUrl} target="_blank" rel="noreferrer noopener" className={s.inlineLink}>
          View the comment on GitHub <ArrowUpRight size={13} strokeWidth={2} aria-hidden />
        </a>
      ) : null}
    </Card>
  );
}
