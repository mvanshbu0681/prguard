// OWNER: d5 (wave 3). /overview (plan A3) — a thin Server Component: the one
// fixture-only prop <OverviewRoute> needs (accuracy/series.json → weekly, plan
// A11 — no live endpoint serves it) is read here with the server-only fixture
// loader and handed down; every other query is client-side (@/lib/hooks).
import type { Metadata } from "next";
import { OverviewRoute } from "@/components/routes/overview";
import { asAccuracySeriesExt } from "@/components/charts";
import { getAccuracySeries } from "@/lib/fixtures";

export const metadata: Metadata = { title: "Overview" };

export default function Page() {
  const series = asAccuracySeriesExt(getAccuracySeries());
  return <OverviewRoute weekly={series.weekly} />;
}
