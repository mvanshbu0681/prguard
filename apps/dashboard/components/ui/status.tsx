import type { BriefStatus, ReviewStage, ReviewStatus } from "@contracts";
import clsx from "clsx";

// One visual language for every "state" in the app: a 6px dot plus a short label.
export type Tone = "running" | "queued" | "ok" | "error" | "muted";

const dotTone: Record<Tone, string> = {
  running: "bg-accent animate-pulse-dot",
  queued: "border border-dim",
  ok: "bg-ok",
  error: "bg-err",
  muted: "bg-faint",
};

const labelTone: Record<Tone, string> = {
  running: "text-accent-text",
  queued: "text-dim",
  ok: "text-body",
  error: "text-err-text",
  muted: "text-faint",
};

export function Dot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden="true" className={clsx("inline-block size-1.5 shrink-0 rounded-full", dotTone[tone], className)} />;
}

export function StatusLabel({ tone, label, className }: { tone: Tone; label: string; className?: string }) {
  return (
    <span className={clsx("inline-flex min-w-0 items-center gap-2", className)}>
      <Dot tone={tone} />
      <span className={clsx("truncate", labelTone[tone])}>{label}</span>
    </span>
  );
}

export function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className="inline-flex h-5 items-center gap-1.5 rounded-sm border border-line bg-surface-2 px-1.5 text-xs font-medium">
      <Dot tone={tone} />
      <span className={labelTone[tone]}>{label}</span>
    </span>
  );
}

const STAGE_LABEL: Record<ReviewStage, string> = {
  queued: "Queued",
  fetching: "Fetching",
  summarizing: "Summarizing",
  reviewing: "Reviewing",
  publishing: "Publishing",
  done: "Finishing",
};

export function reviewState(review: { status: ReviewStatus; stage: ReviewStage }): { tone: Tone; label: string } {
  switch (review.status) {
    case "queued":
      return { tone: "queued", label: "Queued" };
    case "running":
      return { tone: "running", label: STAGE_LABEL[review.stage] };
    case "completed":
      return { tone: "ok", label: "Completed" };
    case "failed":
      return { tone: "error", label: "Failed" };
    case "cancelled":
      return { tone: "muted", label: "Cancelled" };
    case "skipped":
      return { tone: "muted", label: "Skipped" };
  }
}

export function briefState(status: BriefStatus): { tone: Tone; label: string } {
  switch (status) {
    case "ready":
      return { tone: "ok", label: "Brief ready" };
    case "running":
      return { tone: "running", label: "Scanning" };
    case "queued":
      return { tone: "queued", label: "Queued" };
    case "failed":
      return { tone: "error", label: "Brief failed" };
    case "none":
      return { tone: "muted", label: "No brief" };
  }
}
