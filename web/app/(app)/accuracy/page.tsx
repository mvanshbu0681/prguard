// OWNER: d5 (wave 3). /accuracy (plan A3, D3) — a thin Server Component: the
// three fixture-only chart series (plan A11) are read once here with the
// server-only fixture loader and handed down; useAccuracy() itself is
// client-side and reads the URL window filter, so the client route is
// wrapped in <Suspense> (it calls useSearchParams by way of nuqs).
import { Suspense } from "react";
import type { Metadata } from "next";
import { LoadingState } from "@/components/app-shell";
import { asAccuracySeriesExt } from "@/components/charts";
import { AccuracyRoute } from "@/components/routes/accuracy";
import { getAccuracySeries } from "@/lib/fixtures";

export const metadata: Metadata = { title: "Accuracy" };

export default function Page() {
  const series = asAccuracySeriesExt(getAccuracySeries());
  return (
    <Suspense fallback={<LoadingState rows={6} className="mx-auto max-w-[1280px] px-4 py-8 md:px-8" />}>
      <AccuracyRoute series={series} />
    </Suspense>
  );
}
