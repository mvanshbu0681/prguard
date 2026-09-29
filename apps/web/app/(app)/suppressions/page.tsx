// /suppressions — a thin Server Component. The route has no dynamic segment (no
// `params` to await), but the page's filters live in the URL and are read with
// nuqs, which needs a <Suspense> boundary around anything that calls it so a
// statically rendered shell never blocks on useSearchParams. The client
// component does all the work; the fallback holds the page's rhythm.
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app-shell";
import { Page, Skeleton } from "@/components/dash/kit";
import { SuppressionsPage } from "@/components/routes/suppressions";

export const metadata: Metadata = { title: "Suppressions" };

function Fallback() {
  return (
    <Page>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-[30rem] max-w-full" />
        <Skeleton className="h-3.5 w-[26rem] max-w-full" />
      </div>
      <Skeleton className="h-[360px] w-full rounded-w-card" />
      <LoadingState rows={5} label="Loading the suppression ledger." />
    </Page>
  );
}

export default function SuppressionsRoute() {
  return (
    <Suspense fallback={<Fallback />}>
      <SuppressionsPage />
    </Suspense>
  );
}
