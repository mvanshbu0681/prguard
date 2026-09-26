// OWNER: m3 (wave 3). Section 04 — "What lands in your PR" (brand-gaps §E).
//
// The one section on the dark marketing site rendered in GitHub's own light
// PR chrome: full-bleed #f6f8fa, GitHub's borders (#d0d7de, 6px radius), an
// avatar row, GitHub's monospace. Not an iframe, not a screenshot, no
// GitHub logo or octocat (brief "THE IDEA"). Static — a photograph of a
// thing that already happened, not our dashboard.
//
// Every string inside the card comes from ReviewResult (getDemoResult()) —
// the payload's own markdown, unedited, plus the comment's own path/line for
// the anchor breadcrumb. The only non-payload text is GitHub's UI chrome
// itself (the header row, the "Comment" label, the file breadcrumb glyph),
// which is this section re-drawing GitHub's interface, not a PRGuard claim.
import { File } from "lucide-react";
import { Mark } from "@/components/brand";
import { Icon } from "@/components/icons";
import { GithubMarkdown } from "./GithubMarkdown";
import { formatRelativeTime } from "./relative-time";
import { commentAnchor, titleCaseEvent, type PRGuardReviewComment, type PRGuardReviewPayload } from "./review-payload";

export interface GithubCommentMockProps {
  payload: PRGuardReviewPayload;
  provenComment: PRGuardReviewComment;
  /** ReviewResult.timing.finished_at — drives "reviewed <relative> ago" (never a literal). */
  finishedAt?: string | null;
}

function BotAvatar() {
  return (
    <span className="grid size-5 shrink-0 place-items-center overflow-hidden rounded-full bg-ink-0" aria-hidden="true">
      <Mark size={13} tone="signal" crop="circle" />
    </span>
  );
}

export function GithubCommentMock({ payload, provenComment, finishedAt }: GithubCommentMockProps) {
  const reviewedAgo = finishedAt ? formatRelativeTime(finishedAt) : null;
  const eventLabel = titleCaseEvent(payload.event);

  return (
    <div className="gh-markdown-root overflow-hidden rounded-[6px] border border-[#d0d7de] bg-white text-[#1f2328]">
      {/* Review header row — GitHub's own chrome, not a PRGuard evidence strip: no registration marks here. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d0d7de] bg-[#f6f8fa] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <BotAvatar />
          <span className="truncate text-[14px] font-semibold text-[#1f2328]">prguard[bot]</span>
          <span className="whitespace-nowrap text-[13px] text-[#59636e]">reviewed{reviewedAgo ? ` ${reviewedAgo}` : ""}</span>
        </div>
        <span className="whitespace-nowrap text-[13px] text-[#59636e]">{eventLabel}</span>
      </div>

      {/* File breadcrumb — the inline comment's anchor (brand-gaps §E: "anchored at checkout.py:41"). */}
      <div className="flex items-center gap-2 border-b border-[#d0d7de] px-4 py-2 text-[12px] text-[#59636e]">
        <Icon icon={File} size={14} />
        <span className="truncate font-mono">{commentAnchor(provenComment)}</span>
      </div>

      {/* The inline comment for the finding with proof_status: proven — the payload's own text. */}
      <div className="px-4 py-4">
        <GithubMarkdown text={provenComment.body} />
      </div>
    </div>
  );
}

/** The review summary comment, "beneath" the inline one — a separate card (brand-gaps §E composition). */
export function GithubSummaryMock({ payload }: { payload: PRGuardReviewPayload }) {
  return (
    <div className="mt-4 overflow-hidden rounded-[6px] border border-[#d0d7de] bg-white px-4 py-4 text-[#1f2328]">
      <GithubMarkdown text={payload.body} />
    </div>
  );
}
