"use client";
// /accuracy — Witness grading itself on this deployment's own data. A headline
// written from the counts, the four precision proxies as the landing's bento
// (each with n, a Wilson 95% interval and what it means), then the working
// sections: where findings go and what the gate did, proof week by week,
// calibration and dismissals, and the report's own caveats.
//
// The since/until window lives in the URL (window-filter.ts) and is passed to
// useAccuracy; the response's own `window` says what it actually covers. The
// three chart series are fixture-only (plan A11) and arrive from page.tsx.
import { CalendarRange, Info, RotateCcw, TriangleAlert } from "lucide-react";
import { Button, Card, EmptyState, Page, PageHeader, Rise, Skeleton } from "@/components/dash/kit";
import { CORPUS_NOW, shortDate } from "@/components/dash/format";
import { FIXTURES } from "@/lib/env";
import type { AccuracySeriesExt } from "@/components/charts";
import { useMemo } from "react";
import { useAccuracy } from "@/lib/hooks";
import type { AccuracyReport } from "@/lib/api-types";
import { type AccuracyCorpus, windowedAccuracy } from "./corpus-window";
import { WINDOW_PRESETS, activePreset, duration, headline, proxy } from "./derive";
import { FlowSection } from "./FlowSection";
import { ProxyBento } from "./ProxyBento";
import { SeverityEvidence } from "./SeverityEvidence";
import { WeeklyProof } from "./WeeklyProof";
import { WindowControl } from "./WindowControl";
import { sinceIso, untilIso, useAccuracyWindowFilter } from "./window-filter";
import s from "./accuracy.module.css";

export interface AccuracyRouteProps {
  /** accuracy/series.json (plan A11, fixture-only): server-loaded once in the thin page.tsx, handed down — no live endpoint serves these three charts' shapes yet. */
  series: AccuracySeriesExt;
  /**
   * Fixture mode only: the compact corpus the report is computed from. The
   * fixture resolver serves one all-time report, so a window set here is
   * recomputed client-side from this (corpus-window.ts) instead of being
   * silently ignored. Absent in live mode, where the API applies the window.
   */
  corpus?: AccuracyCorpus | null;
}

/** "Last 7 days", "16 Sep → 23 Sep", or "Every run, first to latest". */
function windowLabel(since: Date | null, until: Date | null, inverted: boolean): string {
  if (inverted || (!since && !until)) return "Every run, first to latest";
  const preset = activePreset(since, until, FIXTURES ? CORPUS_NOW : Date.now());
  const hit = WINDOW_PRESETS.find((p) => p.id === preset);
  if (hit) return `Last ${hit.label}`;
  return `${since ? shortDate(since.toISOString()) : "First run"} → ${until ? shortDate(until.toISOString()) : "now"}`;
}

function WindowLine({ report, label, allTimeCharts }: { report: AccuracyReport; label: string; allTimeCharts: boolean }) {
  const runs = report.runs.total ?? 0;
  return (
    <p className={s.meta}>
      <span>
        <CalendarRange size={14} strokeWidth={1.8} aria-hidden />
        <b>{label}</b>
        {report.window.repository ? <> · {report.window.repository}</> : null}
        <span>
          · <b>{runs}</b> {runs === 1 ? "run" : "runs"} graded
        </span>
      </span>
      <span>
        median review <b>{duration(report.runs.median_duration_seconds)}</b>
      </span>
      {allTimeCharts ? <span className={s.metaAllTime}>Charts below are all-time: the API serves them for the whole corpus only.</span> : null}
      <span className={s.metaSource}>GET /v1/accuracy</span>
    </p>
  );
}

function Caveats({ caveats }: { caveats: string[] }) {
  if (!caveats.length) return null;
  return (
    <Card tone="panel" pad="lg" className={s.note} as="aside" aria-labelledby="acc-caveats">
      <span className={s.noteIcon} aria-hidden>
        <Info size={18} strokeWidth={1.9} />
      </span>
      <div>
        <h2 className={s.noteTitle} id="acc-caveats">
          Before you quote a number
        </h2>
        <ul className={s.noteList}>
          {caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function AccuracySkeleton() {
  return (
    <div className="flex flex-col gap-4" data-loading-state="" aria-busy="true" aria-label="Loading the accuracy self-report">
      <div className={s.skelBento}>
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
      <Skeleton className="h-[320px] rounded-w-card" />
    </div>
  );
}

export function AccuracyRoute({ series, corpus }: AccuracyRouteProps) {
  const [{ since, until }, setWindow] = useAccuracyWindowFilter();
  // An inverted window (From after To) is never applied: WindowControl says why.
  const inverted = since != null && until != null && since.getTime() > until.getTime();
  const sinceArg = inverted ? null : sinceIso(since);
  const untilArg = inverted ? null : untilIso(until);
  const hasWindow = sinceArg != null || untilArg != null;
  const query = useAccuracy({ since: sinceArg, until: untilArg });
  const windowed = useMemo(() => (corpus && hasWindow ? windowedAccuracy(corpus, sinceArg, untilArg) : null), [corpus, hasWindow, sinceArg, untilArg]);

  const pending = !windowed && query.isPending;
  const failed = !windowed && query.isError;
  const report: AccuracyReport | null = windowed ? windowed.report : pending || failed ? null : (query.data ?? null);
  const view = windowed ? windowed.series : series;
  // Live mode with a window: the API recomputes the report, but the three
  // charts are still the all-time series.
  const allTimeCharts = hasWindow && !windowed;
  const head = report ? headline(report) : { title: "Witness grades itself", soft: "on this deployment's own runs." };
  const dismiss = report ? proxy(report.precision_proxies.human_dismissal_rate) : null;
  const label = windowLabel(since, until, inverted);

  return (
    <Page className={s.root}>
      <PageHeader
        eyebrow="Accuracy"
        title={head.title}
        soft={head.soft}
        description="Every rate on this page comes with its sample size and a 95% interval. It is computed from this deployment's own database, not an external benchmark."
        actions={<WindowControl />}
      />

      {pending ? (
        <AccuracySkeleton />
      ) : failed || !report ? (
        <Card tone="surface">
          <EmptyState
            icon={TriangleAlert}
            title="The self-report didn't load"
            body={query.error?.message ?? "GET /v1/accuracy failed."}
            action={
              <Button variant="dark" size="sm" icon={RotateCcw} onClick={() => query.refetch()}>
                Retry
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <WindowLine report={report} label={label} allTimeCharts={allTimeCharts} />
          {(report.runs.total ?? 0) === 0 ? (
            <Card tone="surface">
              <EmptyState
                icon={CalendarRange}
                title="No completed runs in this window"
                body="The self-report has nothing to grade yet. Widen the window or clear it."
                action={
                  since || until ? (
                    <Button variant="dark" size="sm" onClick={() => setWindow({ since: null, until: null })}>
                      Clear window
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <>
              <Rise delay={60}>
                <div className="flex flex-col gap-7">
                  <ProxyBento report={report} />
                </div>
              </Rise>
              <Rise delay={120}>
                <FlowSection report={report} />
              </Rise>
              {view.weekly.length ? (
                <Rise delay={180}>
                  <WeeklyProof weekly={view.weekly} allTime={allTimeCharts} />
                </Rise>
              ) : null}
              {view.calibration.length || view.dismissal_by_category.length ? (
                <Rise delay={240}>
                  <SeverityEvidence series={view} overall={{ k: dismiss?.k ?? 0, n: dismiss?.n ?? 0 }} allTime={allTimeCharts} />
                </Rise>
              ) : null}
            </>
          )}
          <Caveats caveats={report.caveats} />
        </>
      )}
    </Page>
  );
}
