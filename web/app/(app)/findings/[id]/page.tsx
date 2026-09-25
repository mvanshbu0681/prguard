// OWNER: d3 (wave 3). /findings/[id] — the finding detail (dashboard-blueprint
// §2.7, "the most important screen"). Next 16: `params` is a Promise; this
// stays a thin Server Component that awaits it and hands the id to the client
// view, which owns every data hook (useFinding et al. read the URL/query
// client-side, so the actual fetching, states and interactivity live in
// src/components/routes/finding-detail/FindingDetailView.tsx).
import type { Metadata } from "next";
import { FindingDetailView } from "@/components/routes/finding-detail";

export const metadata: Metadata = { title: "Finding" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FindingDetailView id={id} />;
}
