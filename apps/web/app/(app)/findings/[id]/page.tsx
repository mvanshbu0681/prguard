// /findings/[id] — the evidence page. Next 16: `params` is a Promise; this stays a
// thin Server Component that awaits it and hands the id to the client view,
// which owns every data hook. With the fixture corpus on, the tab title is the
// finding's own claim (read server-side from the same corpus the API serves).
import type { Metadata } from "next";
import { FindingDetailView } from "@/components/routes/finding-detail";
import { FIXTURES } from "@/lib/env";
import { getFinding } from "@/lib/fixtures";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const finding = FIXTURES ? getFinding(id) : null;
  if (!FIXTURES) return { title: "Finding" };
  return { title: finding ? finding.title.replace(/`/g, "") : "Finding not found" };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <FindingDetailView id={id} />;
}
