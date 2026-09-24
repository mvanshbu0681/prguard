"use client";
// OWNER: d5 (wave 3). /overview band 3 — the three headline accuracy metrics
// (brief: execution_verified_precision, self_caught_false_positive_rate,
// human_dismissal_rate), each linking to /accuracy for the full six-metric
// self-report. `<MetricCard>` has no `href` of its own (it is an ordinary
// panel wave-2 built for the /accuracy grid, not a link) — this route wraps
// each card in a real `<Link>` rather than adding an unrequested prop to a
// frozen wave-2 file (plan §8: extend locally, don't edit the source), and
// the wrap keeps the card's own focus/hover surface as the link's.
import Link from "next/link";
import { EmptyState, ErrorState, LoadingState } from "@/components/app-shell";
import { MetricCard } from "@/components/charts";
import { useAccuracy } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const HEADLINE_KEYS = ["execution_verified_precision", "self_caught_false_positive_rate", "human_dismissal_rate"] as const;

export function HeadlineMetrics({ className }: { className?: string }) {
  const query = useAccuracy();

  if (query.isPending) {
    return <LoadingState rows={3} label="Loading the accuracy self-report." className={className} />;
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} className={className} />;
  }
  const report = query.data;
  const hasAnyValue = HEADLINE_KEYS.some((key) => report.precision_proxies[key].value != null);
  if (!hasAnyValue) {
    return (
      <EmptyState
        message="The accuracy self-report has no runs to score yet. Every metric needs at least one completed proof attempt."
        actions={[{ label: "Read the full report", href: "/accuracy" }]}
        className={className}
      />
    );
  }

  return (
    <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-3", className)}>
      {HEADLINE_KEYS.map((key, i) => (
        <Link
          key={key}
          href="/accuracy"
          className="rounded-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-hi"
          aria-label={`${key.replaceAll("_", " ")} — read the full accuracy report`}
        >
          <MetricCard
            index={String(i + 1).padStart(2, "0")}
            name={key}
            metric={report.precision_proxies[key]}
            provenance={`GET /v1/accuracy → precision_proxies.${key}`}
          />
        </Link>
      ))}
    </div>
  );
}
