"use client";
// OWNER: d5 (wave 3). /accuracy — the full self-report (dashboard blueprint
// §2.10, plan §13 A6/D3, brief): the six metrics with always-visible
// definitions/n/Wilson intervals (MetricGrid), then the three /accuracy
// charts, each with its own provenance and ext note. A since/until window
// filter lives in the URL and is passed to useAccuracy — the response's own
// `window` field states what it actually covers (src/lib/hooks/use-accuracy.ts:
// "repository / since / until cannot be recomputed from one stored report").
// Nothing here counts up: every number renders once, from the query result.
import { EmptyState, ErrorState, LoadingState } from "@/components/app-shell";
import { CalibrationChart, DismissalByCategoryChart, MetricGrid, ProofCompositionChart, type AccuracySeriesExt } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAccuracy } from "@/lib/hooks";
import { formatCaptured } from "@/components/chrome";
import { sinceIso, toDateInputValue, untilIso, useAccuracyWindowFilter } from "./window-filter";

export interface AccuracyRouteProps {
  /** accuracy/series.json (plan A11, fixture-only): server-loaded once in the thin page.tsx, handed down — no live endpoint serves these three charts' shapes yet. */
  series: AccuracySeriesExt;
}

export function AccuracyRoute({ series }: AccuracyRouteProps) {
  const [{ since, until }, setWindow] = useAccuracyWindowFilter();
  const query = useAccuracy({ since: sinceIso(since), until: untilIso(until) });

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-4 py-8 md:px-8">
      <header className="flex flex-col gap-2">
        <p className="type-label text-text-dim">/ accuracy</p>
        <h1 className="type-display-h3 text-text-primary">The accuracy self-report</h1>
        <p className="type-small text-text-body">
          Every metric the system publishes about itself, with its definition, its <code className="type-chip">n</code> and a Wilson 95% interval —
          always visible, never a tooltip.
        </p>
      </header>

      <form
        className="flex flex-wrap items-end gap-4"
        onSubmit={(event) => event.preventDefault()}
        aria-label="Accuracy report window"
      >
        <Field label="Since" hint="UTC calendar date.">
          <Input
            type="date"
            mono
            value={toDateInputValue(since)}
            onChange={(event) => setWindow({ since: event.target.value ? new Date(`${event.target.value}T00:00:00.000Z`) : null })}
          />
        </Field>
        <Field label="Until" hint="UTC calendar date.">
          <Input
            type="date"
            mono
            value={toDateInputValue(until)}
            onChange={(event) => setWindow({ until: event.target.value ? new Date(`${event.target.value}T00:00:00.000Z`) : null })}
          />
        </Field>
        {since || until ? (
          <Button type="button" variant="quiet" size="sm" onClick={() => setWindow({ since: null, until: null })}>
            CLEAR
          </Button>
        ) : null}
      </form>

      {query.isPending ? (
        <LoadingState rows={6} label="Loading the accuracy self-report." />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <p className="type-chip tabular text-text-dim">
            {`GET /v1/accuracy → window: ${query.data.window.since ? formatCaptured(query.data.window.since) : "the full corpus"} … ${
              query.data.window.until ? formatCaptured(query.data.window.until) : "now"
            }`}
          </p>

          <MetricGrid report={query.data} />

          {query.data.runs.total === 0 ? (
            <EmptyState message="No completed runs in this window. The self-report has nothing to score yet." />
          ) : null}

          <ProofCompositionChart weekly={series.weekly} />
          <DismissalByCategoryChart categories={series.dismissal_by_category} />
          <CalibrationChart calibration={series.calibration} />
        </>
      )}
    </div>
  );
}
