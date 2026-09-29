// OWNER: d5 (wave 3). /accuracy (plan A3, D3) — a thin Server Component: the
// three fixture-only chart series (plan A11) are read once here with the
// server-only fixture loader and handed down; useAccuracy() itself is
// client-side and reads the URL window filter, so the client route is
// wrapped in <Suspense> (it calls useSearchParams by way of nuqs).
//
// Fixture mode also hands down the compact corpus (runs, findings, the ids of
// published and break-glass audit events): the fixture resolver serves one
// all-time report, so the route recomputes any since/until window from it
// (src/components/routes/accuracy/corpus-window.ts) rather than ignoring it.
import { Suspense } from "react";
import type { Metadata } from "next";
import { Page } from "@/components/dash/kit";
import { asAccuracySeriesExt } from "@/components/charts";
import { AccuracyRoute, AccuracySkeleton, corpusFromFixtures } from "@/components/routes/accuracy";
import { FIXTURES } from "@/lib/env";
import { getAccuracy, getAccuracySeries, getAuditChain, getFindings, getReviewsIndex } from "@/lib/fixtures";

export const metadata: Metadata = { title: "Accuracy" };

export default function AccuracyPage() {
  const series = asAccuracySeriesExt(getAccuracySeries());
  const corpus = FIXTURES
    ? corpusFromFixtures({ reviews: getReviewsIndex().items, findings: getFindings(), audit: getAuditChain().items, report: getAccuracy() })
    : null;
  return (
    <Suspense
      fallback={
        <Page>
          <AccuracySkeleton />
        </Page>
      }
    >
      <AccuracyRoute series={series} corpus={corpus} />
    </Suspense>
  );
}
