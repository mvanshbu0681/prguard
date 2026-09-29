"use client";
// The finding's header, on the product's PageHeader pattern: who raised it as
// the eyebrow, the claim as the H1, the three actions on the right; then its
// proof and gate badges and where it lives (repository and PR, file:lines,
// each a link). The breadcrumb is the way back; the severity lives in the rail.
import Link from "next/link";
import { Download, ExternalLink, EyeOff, FileCode, GitPullRequest, Square } from "lucide-react";
import { Button, PageHeader, ProofBadge, Tag } from "@/components/dash/kit";
import { humanize, relTime } from "@/components/dash/format";
import type { Finding, ReviewResult } from "@/lib/api-types";
import { deliveryCommentUrl, githubBlobUrl, locationRangeLabel } from "./format";
import { TitleWithCode } from "./TitleWithCode";
import s from "./detail.module.css";

function StatusTag({ status }: { status: Finding["status"] }) {
  switch (status) {
    case "suppressed":
      return (
        <Tag tone="dashed" size="lg" icon={EyeOff}>
          Suppressed
        </Tag>
      );
    case "dropped":
      return (
        <Tag tone="dashed" size="lg">
          Dropped by the coordinator
        </Tag>
      );
    case "proposed":
      return (
        <Tag tone="soft" size="lg">
          Proposed
        </Tag>
      );
    case "disproven":
      return (
        <Tag tone="soft" size="lg">
          Never posted
        </Tag>
      );
    default:
      return null;
  }
}

/** Where "Open on GitHub" goes: the posted comment when there is one, else the pull request. */
export function githubHref(finding: Finding, review: ReviewResult | undefined): string | null {
  if (!review) return null;
  const { owner, name } = review.repository;
  const pr = review.pull_request;
  const commentId = finding.delivery?.github_comment_id;
  if (commentId) return deliveryCommentUrl(owner, name, pr.number, commentId, finding.delivery?.mode);
  return pr.url ?? `https://github.com/${owner}/${name}/pull/${pr.number}`;
}

/** "Bugs · Correctness"; once when the specialist and the category are the same word ("Security"). */
export function eyebrowFor(finding: Pick<Finding, "specialist" | "category">): string {
  const who = humanize(finding.specialist);
  const what = humanize(finding.category);
  return !finding.specialist || who.toLowerCase() === what.toLowerCase() ? what : `${who} · ${what}`;
}

export interface DetailHeaderProps {
  finding: Finding;
  review: ReviewResult | undefined;
  onSuppress: () => void;
  onExport: () => void;
}

export function DetailHeader({ finding, review, onSuppress, onExport }: DetailHeaderProps) {
  const { location } = finding;
  const refuted = finding.proof?.status === "disproven";
  const gh = githubHref(finding, review);
  const headSha = review?.pull_request.head_sha;
  const where = locationRangeLabel(location.file_path, location.start_line, location.end_line);
  const fileHref = review && headSha ? githubBlobUrl(review.repository.owner, review.repository.name, headSha, location.file_path, location.start_line, location.end_line) : null;
  const suppressed = finding.status === "suppressed";

  const actions = (
    <>
      {gh ? (
        <Button variant="outline" size="sm" icon={ExternalLink} href={gh} external>
          Open on GitHub
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" icon={Download} onClick={onExport} title="Export evidence (E)">
        Export evidence
      </Button>
      {suppressed ? null : (
        <Button variant="danger" size="sm" icon={EyeOff} onClick={onSuppress} title="Suppress (S)">
          Suppress
        </Button>
      )}
    </>
  );

  return (
    <div className={s.top}>
      <PageHeader
        className={s.detailHead}
        eyebrow={eyebrowFor(finding)}
        title={
          <span className={s.titleText} data-refuted={refuted ? "" : undefined}>
            <TitleWithCode title={finding.title} codeClassName={s.h1Code} />
          </span>
        }
        actions={actions}
      />
      <div className={s.headSub}>
        <div className={s.badges}>
          <ProofBadge status={finding.proof?.status ?? "not_attempted"} size="lg" />
          {finding.blocking ? (
            <Tag tone="danger" size="lg" icon={Square}>
              Blocks the merge
            </Tag>
          ) : null}
          <StatusTag status={finding.status} />
        </div>
        <div className={s.metaRow}>
          {review ? (
            <span className={s.metaItem}>
              <GitPullRequest size={15} strokeWidth={1.9} aria-hidden />
              <Link href={`/runs/${finding.review_id}`} className={s.metaLink}>
                {review.repository.name} #{review.pull_request.number}
              </Link>
              {review.pull_request.title ? <span className={s.metaMuted}>{review.pull_request.title}</span> : null}
            </span>
          ) : null}
          <span className={s.metaItem}>
            <FileCode size={15} strokeWidth={1.9} aria-hidden />
            {fileHref ? (
              <a href={fileHref} target="_blank" rel="noreferrer noopener" className={`${s.metaLink} ${s.metaMono}`}>
                {where}
              </a>
            ) : (
              <span className={s.metaMono}>{where}</span>
            )}
            <time dateTime={finding.created_at} className={s.metaTime}>
              {relTime(finding.created_at)}
            </time>
          </span>
        </div>
      </div>
    </div>
  );
}
