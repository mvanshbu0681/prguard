// OWNER: t2a (wave 1). /lab/t2a — the data layer, exercised through the hooks
// the product uses. ?corpus=sample swaps the on-disk corpus (stubs until t2b's
// generator runs) for the typed sample in src/lib/fixture-sample.ts.
import type { Metadata } from "next";
import { DataLab } from "./data-lab";

export const metadata: Metadata = { title: "Data layer (lab)" };

export default async function DataLabPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const corpus = params.corpus === "sample" ? "sample" : "disk";
  return <DataLab key={corpus} corpus={corpus} />;
}
