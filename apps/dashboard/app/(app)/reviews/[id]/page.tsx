"use client";

import type { ReviewDetail } from "@contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Check, CircleAlert, Info, RotateCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Fragment, useEffect, type ReactNode } from "react";
import { FindingsList } from "@/components/reviews/findings-list";
import { ReviewProgress } from "@/components/reviews/review-progress";
import { Trace } from "@/components/reviews/trace";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState, InlineError } from "@/components/ui/error-state";
import { InlineCode } from "@/components/ui/inline-code";
import { Markdown } from "@/components/ui/markdown";
import { Panel } from "@/components/ui/panel";
import { PriorityPill, RiskPill } from "@/components/ui/pills";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { reviewState, StatusBadge } from "@/components/ui/status";
import { RelativeTime } from "@/components/ui/time";
import { api, isNotFound } from "@/lib/api";
import { compactNumber, duration, plural, shortSha } from "@/lib/format";
import { isActive, keys, useReview } from "@/lib/queries";

export default function ReviewPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const review = useReview(id);

  return (
    <div className="max-w-[920px]">
      <Link
        href="/reviews"
        className="-ml-1 mb-5 inline-flex items-center gap-1 rounded-sm px-1 text-sm text-dim transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Reviews
      </Link>

      {review.isPending ? (
        <ReviewSkeleton />
      ) : review.isError ? (
        <Panel>
          {isNotFound(review.error) ? (
            <EmptyState title="Review not found." />
          ) : (
            <ErrorState message="Couldn't load review." onRetry={() => void review.refetch()} />
          )}
        </Panel>
      ) : (
        <Review review={review.data} />
      )}
    </div>
  );
}

function Review({ review }: { review: ReviewDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const state = reviewState(review);
  const active = isActive(review.status);

  const rerun = useMutation({
    mutationFn: () => api<{ id: number }>(`/reviews/${review.id}/rerun`, { method: "POST" }),
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: keys.allReviews });
      router.push(`/reviews/${id}`);
    },
  });

  const tokens = review.usage.tokensIn + review.usage.tokensOut;
  const finished = review.finishedAt !== null && review.startedAt !== null;
  const findingCount = review.findings.length;
  const since = review.since;
  const sinceParts = since
    ? ([
        [since.fixed, "fixed"],
        [since.new, "new"],
        [since.open, "open"],
      ] as const)
        .filter(([n]) => n > 0)
        .map(([n, label]) => `${n} ${label}`)
    : [];
  const showTrace = review.trace.steps.length > 0;
  const riskWhy = review.riskReasons.join(", ");
  const why = [review.priorityReason, riskWhy && `${riskWhy.charAt(0).toUpperCase()}${riskWhy.slice(1)}.`].filter(Boolean).join(" ");

  // Links from GitHub land on `#f-<fingerprint>`; the card exists only once the findings render.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#f-")) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [findingCount]);

  return (
    <article>
      <header>
        <h1 className="text-xl font-semibold tracking-[-0.015em] text-primary">
          <span className="font-normal text-dim tabular">#{review.pr.number}</span> <InlineCode text={review.pr.title} />
        </h1>
        <div className="mt-2 flex items-center justify-between gap-6">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-dim">
            <Link href={`/repos/${review.repository.id}`} className="text-body transition-colors hover:text-primary">
              {review.repository.fullName}
            </Link>
            <Sep />
            <span className="inline-flex items-center gap-1.5">
              <Avatar src={review.pr.authorAvatar} name={review.pr.authorLogin} size={16} />
              <span className="text-body">{review.pr.authorLogin}</span>
            </span>
            <Sep />
            <StatusBadge tone={state.tone} label={state.label} />
            {review.priority && <PriorityPill priority={review.priority} />}
            {review.risk && <RiskPill risk={review.risk} />}
          </div>

          <div className="-my-1 flex shrink-0 items-center gap-1">
            <ButtonLink href={review.pr.url} variant="ghost">
              Open pull request
              <ArrowUpRight aria-hidden="true" />
            </ButtonLink>
            {review.githubReviewUrl && (
              <ButtonLink href={review.githubReviewUrl} variant="ghost">
                View on GitHub
                <ArrowUpRight aria-hidden="true" />
              </ButtonLink>
            )}
            <Button className="ml-1" onClick={() => rerun.mutate()} disabled={active || rerun.isPending}>
              <RotateCw aria-hidden="true" />
              Re-run
            </Button>
          </div>
        </div>
      </header>

      {why && (
        <p className="mt-2 text-sm text-dim">
          <InlineCode text={why} />
        </p>
      )}

      {rerun.isError && (
        <div className="mt-2 flex justify-end">
          <InlineError message={rerun.error.message || "Couldn't start a new review."} />
        </div>
      )}

      <dl className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-line py-2.5 text-sm">
        <Meta label="Commit">
          <span className="font-mono text-xs text-primary">{shortSha(review.headSha)}</span>
        </Meta>
        <Meta label="Kind">{review.kind === "full" ? "Full review" : "New commits"}</Meta>
        <Meta label="Started">
          <RelativeTime ts={review.createdAt} />
        </Meta>
        {finished && <Meta label="Duration">{duration(review.finishedAt! - review.startedAt!)}</Meta>}
        {review.filesReviewed > 0 && <Meta label="Files">{plural(review.filesReviewed, "file")}</Meta>}
        {review.usage.calls > 0 && (
          <Meta label="Usage">
            {compactNumber(tokens)} tokens <span className="text-faint">·</span> {plural(review.usage.calls, "call")}
          </Meta>
        )}
        {sinceParts.length > 0 && (
          <Meta label="Since last">
            {sinceParts.map((part, i) => (
              <Fragment key={part}>
                {i > 0 && <span className="text-faint"> · </span>}
                {part}
              </Fragment>
            ))}
          </Meta>
        )}
      </dl>

      <div className="mt-6 space-y-8">
        {active && (
          <div className="rounded-lg border border-line bg-surface-1 px-4 pb-3.5 pt-4 shadow-hi">
            <ReviewProgress status={review.status} stage={review.stage} />
          </div>
        )}

        {review.status === "failed" && (
          <p className="flex items-center gap-2 text-sm text-err-text" role="alert">
            <CircleAlert className="size-3.5 shrink-0 text-err" aria-hidden="true" />
            {review.error ?? "Review failed."}
          </p>
        )}

        {review.partial && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm text-warn">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
              Partially reviewed.
            </p>
            {review.notReviewed.length > 0 && (
              <Collapsible variant="inline" title="Not reviewed" count={review.notReviewed.length} className="pl-5.5">
                <ul className="space-y-1 font-mono text-xs text-dim">
                  {review.notReviewed.map((path) => (
                    <li key={path} className="truncate">
                      {path}
                    </li>
                  ))}
                </ul>
              </Collapsible>
            )}
          </div>
        )}

        {(review.summary || active) && (
          <Section title="Summary">
            <Panel className="px-5 py-4">
              {review.summary ? (
                <Markdown>{review.summary}</Markdown>
              ) : (
                <SkeletonText lines={4} className="py-1" />
              )}
            </Panel>
          </Section>
        )}

        {review.note && !review.partial && review.status === "completed" && (
          <p className="flex items-center gap-2 text-sm text-dim">
            <Info className="size-3.5 shrink-0" aria-hidden="true" />
            {review.note}
          </p>
        )}

        {(review.findings.length > 0 || (review.status === "completed" && review.reviewed)) && (
          <Section title="Findings" count={review.findings.length || undefined}>
            {review.findings.length > 0 ? (
              <FindingsList findings={review.findings} />
            ) : (
              <Panel className="flex items-center gap-2 px-4 py-3.5 text-sm text-body">
                <Check className="size-3.5 text-ok" aria-hidden="true" />
                No issues found.
              </Panel>
            )}
          </Section>
        )}

        {(review.walkthrough.length > 0 || review.filesSkipped.length > 0 || showTrace) && (
          <div className="space-y-2">
            {review.walkthrough.length > 0 && (
              <Collapsible title="Walkthrough" count={review.walkthrough.length}>
                <table className="w-full text-sm">
                  <tbody>
                    {review.walkthrough.map((row) => (
                      <tr key={row.path} className="border-b border-hair last:border-0">
                        <td className="w-[38%] px-4 py-2.5 align-top font-mono text-xs leading-5 text-primary">
                          <span className="break-all">{row.path}</span>
                        </td>
                        <td className="py-2.5 pr-4 align-top text-body">
                          <InlineCode text={row.change} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Collapsible>
            )}
            {review.filesSkipped.length > 0 && (
              <Collapsible title="Skipped files" count={review.filesSkipped.length}>
                <ul>
                  {review.filesSkipped.map((file) => (
                    <li
                      key={file.path}
                      className="flex items-baseline gap-3 border-b border-hair px-4 py-2 text-sm last:border-0"
                    >
                      <span className="min-w-0 truncate font-mono text-xs text-body">{file.path}</span>
                      <span className="shrink-0 text-faint">—</span>
                      <span className="shrink-0 text-dim">{file.reason}</span>
                    </li>
                  ))}
                </ul>
              </Collapsible>
            )}
            {showTrace && <Trace review={review} />}
          </div>
        )}
      </div>
    </article>
  );
}

function Sep() {
  return (
    <span aria-hidden="true" className="text-faint">
      ·
    </span>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="text-body tabular">{children}</dd>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3.5 flex items-center gap-2 text-sm font-semibold text-primary">
        {title}
        {count !== undefined && <span className="font-normal text-faint tabular">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

function ReviewSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="h-5 w-[42%]" />
      <div className="mt-3.5 flex items-center gap-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="mt-5 flex gap-6 border-y border-line py-3.5">
        {[88, 96, 72, 80, 120].map((w, i) => (
          <Skeleton key={i} className="h-3" style={{ width: w }} />
        ))}
      </div>
      <Skeleton className="mb-3 mt-8 h-3 w-20" />
      <Panel className="px-5 py-5">
        <SkeletonText lines={5} />
      </Panel>
    </div>
  );
}
