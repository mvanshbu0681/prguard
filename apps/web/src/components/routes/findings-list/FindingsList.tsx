"use client";
// The inbox itself: one composed row per finding (severity rail, the claim as a
// title, where it lives, who raised it, then proof and the computed score) on a
// grey tray, optionally grouped by pull request or by file. A roving-tabindex
// grid: j / k move, Enter or o opens (useListKeys), and the next API page loads
// as the end of the list scrolls into view.
import Link from "next/link";
import { EyeOff, FileCode, GitPullRequest, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useListKeys } from "@/components/app-shell";
import { ProofBadge, SeverityScore, Skeleton, Tag, bandColor } from "@/components/dash/kit";
import { humanize, relTime } from "@/components/dash/format";
import { TitleWithCode } from "@/components/routes/finding-detail/TitleWithCode";
import type { Finding } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { middleTruncateLocation, type FindingGroup, type RepoLookupEntry } from "./format";
import s from "./findings.module.css";

export function findingHref(finding: Pick<Finding, "id">): string {
  return `/findings/${finding.id}`;
}

function StateTag({ status }: { status: Finding["status"] }) {
  switch (status) {
    case "suppressed":
      return (
        <Tag tone="dashed" icon={EyeOff}>
          Suppressed
        </Tag>
      );
    case "dropped":
      return <Tag tone="dashed">Dropped</Tag>;
    case "proposed":
      return <Tag tone="soft">Proposed</Tag>;
    default:
      return null;
  }
}

export interface FindingRowProps {
  finding: Finding;
  repo: RepoLookupEntry | undefined;
  index: number;
  /** Print the status as a tag and quiet rows that never reached a PR (the All segment). */
  showState: boolean;
  /** The row sits under a PR group header: don't repeat the PR in its meta line. */
  inPrGroup?: boolean;
  rowProps: { tabIndex: 0 | -1; "aria-selected": boolean; "data-active"?: string };
  onFocusRow: (index: number) => void;
}

export function FindingRow({ finding, repo, index, showState, inPrGroup = false, rowProps, onFocusRow }: FindingRowProps) {
  const band = finding.severity?.band ?? null;
  const refuted = finding.proof?.status === "disproven" || finding.status === "disproven";
  const muted = showState && (finding.status === "suppressed" || finding.status === "dropped" || finding.status === "disproven");
  const { file_path, start_line } = finding.location;
  const proofStatus = finding.proof?.status ?? "not_attempted";
  // "Not applicable" is the default for a quality finding: printing it on every such row is noise.
  const proof = proofStatus === "not_applicable" ? null : <ProofBadge status={proofStatus} />;
  const sev = finding.severity;
  const tags =
    finding.blocking || (showState && finding.status !== "published" && finding.status !== "disproven") ? (
      <>
        {finding.blocking ? (
          <Tag tone="danger" icon={Square}>
            Blocks merge
          </Tag>
        ) : null}
        {showState ? <StateTag status={finding.status} /> : null}
      </>
    ) : null;

  return (
    <div
      role="row"
      className={s.row}
      data-row-index={index}
      data-muted={muted ? "" : undefined}
      data-refuted={refuted ? "" : undefined}
      data-slot="finding-row"
      {...rowProps}
      onFocus={() => onFocusRow(index)}
    >
      <span className={s.rail} style={{ background: band ? bandColor(band) : "var(--w-faint)" }} aria-hidden />
      <div role="gridcell" className={s.main}>
        <p className={s.title}>
          <Link href={findingHref(finding)} className={s.titleLink} tabIndex={-1} onClick={() => onFocusRow(index)}>
            <span className={s.titleText}>
              <TitleWithCode title={finding.title} />
            </span>
          </Link>
        </p>
        <p className={s.meta}>
          {tags ? <span className={s.metaTags}>{tags}</span> : null}
          {proof ? <span className={s.metaProof}>{proof}</span> : null}
          {repo && !inPrGroup ? (
            <span className={s.metaStrong}>
              {repo.name} #{repo.prNumber}
            </span>
          ) : null}
          <span className={s.metaMono} title={start_line != null ? `${file_path}:${start_line}` : file_path}>
            {middleTruncateLocation(file_path, start_line, 42)}
          </span>
          {finding.specialist ? <span>{humanize(finding.specialist)}</span> : null}
          {(finding.history?.occurrence_count ?? 1) > 1 ? (
            <span className={s.metaRecur} title="Same fingerprint, seen in earlier runs">
              <RotateCcw size={12} strokeWidth={2} aria-hidden />
              {finding.history?.occurrence_count} runs
            </span>
          ) : null}
          <time dateTime={finding.created_at}>{relTime(finding.created_at)}</time>
        </p>
      </div>
      <div role="gridcell" className={s.side}>
        <span className={s.tags}>{tags}</span>
        <span className={s.proofCell}>{proof}</span>
        <span className={s.scoreCell} title={sev ? `${sev.band} severity` : undefined}>
          {sev ? (
            <>
              <SeverityScore score={sev.score} band={sev.band} showBand={false} className={s.scoreFull} />
              <span className={s.scoreNum}>{sev.score.toFixed(2)}</span>
              <span className="sr-only">{sev.band} severity</span>
            </>
          ) : (
            <span className={s.unscored}>Unscored</span>
          )}
        </span>
      </div>
    </div>
  );
}

export function FindingRowSkeleton() {
  return (
    <div className={s.row} aria-hidden style={{ cursor: "default" }}>
      <Skeleton className="h-full w-1" style={{ minHeight: 40 }} />
      <div className="flex min-w-0 flex-col gap-2.5">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
      </div>
      <Skeleton className="hidden h-6 w-60 rounded-w-pill md:block" />
    </div>
  );
}

export interface FindingsListProps {
  /** Ungrouped rows, or null when `groups` is given. */
  rows: Finding[];
  groups: FindingGroup[] | null;
  lookup: Map<string, RepoLookupEntry>;
  showState: boolean;
  onOpen: (finding: Finding) => void;
  /** Called when the end of the list nears the viewport (load the next page). */
  onReachEnd?: () => void;
  footer?: ReactNode;
  className?: string;
}

export function FindingsList({ rows, groups, lookup, showState, onOpen, onReachEnd, footer, className }: FindingsListProps) {
  const flat = groups ? groups.flatMap((g) => g.rows) : rows;
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { activeIndex, setActiveIndex, gridProps, rowProps } = useListKeys({
    count: flat.length,
    onOpen: (i) => {
      const f = flat[i];
      if (f) onOpen(f);
    },
  });

  // j / k move real focus with the roving index, so the ring follows the reader.
  useEffect(() => {
    const root = listRef.current;
    if (!root || !root.contains(document.activeElement)) return;
    const el = root.querySelector<HTMLElement>(`[data-row-index="${activeIndex}"]`);
    if (el && el !== document.activeElement) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  // Load as you scroll: watch a sentinel under the list, inside <main>'s own scroller.
  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !onReachEnd || typeof IntersectionObserver === "undefined") return;
    const root = document.getElementById("main");
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onReachEnd(), { root, rootMargin: "0px 0px 720px 0px" });
    io.observe(target);
    return () => io.disconnect();
  }, [onReachEnd, flat.length]);

  let offset = 0;
  const renderRows = (list: Finding[], inPrGroup = false) =>
    list.map((finding) => {
      const index = offset++;
      return (
        <FindingRow
          key={finding.id}
          finding={finding}
          repo={lookup.get(finding.review_id)}
          index={index}
          showState={showState}
          inPrGroup={inPrGroup}
          rowProps={rowProps(index)}
          onFocusRow={setActiveIndex}
        />
      );
    });

  return (
    <div className={className}>
      <div ref={listRef} {...gridProps} aria-label="Findings" aria-rowcount={flat.length} className={s.list} data-slot="findings-list">
        {groups
          ? groups.map((group) => (
              <div key={group.key} role="rowgroup" aria-label={`${group.label}${group.detail ? `, ${group.detail}` : ""}`} className={s.group}>
                <div className={s.groupHead} aria-hidden>
                  {group.kind === "pr" ? <GitPullRequest size={15} strokeWidth={1.9} className={s.groupIcon} /> : <FileCode size={15} strokeWidth={1.9} className={s.groupIcon} />}
                  <p className={cn(s.groupLabel, group.kind === "file" && s.groupLabelMono)}>{group.label}</p>
                  {group.detail ? <span className={s.groupDetail}>{group.detail}</span> : null}
                  <span className={s.groupCount}>
                    {group.rows.length} {group.rows.length === 1 ? "finding" : "findings"}
                  </span>
                </div>
                {renderRows(group.rows, group.kind === "pr")}
              </div>
            ))
          : renderRows(rows)}
      </div>
      <div ref={sentinelRef} className={s.sentinel} aria-hidden />
      {footer}
    </div>
  );
}
