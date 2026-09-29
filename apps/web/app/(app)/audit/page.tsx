// /audit — a thin Server Component. No dynamic segment (no `params` to await),
// but the filters and the `?seq=` deep link live in the URL, so the client
// component that reads them needs a <Suspense> boundary. The fallback holds the
// page's rhythm: header, the verification hero, then the log.
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app-shell";
import { Page, Skeleton } from "@/components/dash/kit";
import { AuditPage } from "@/components/routes/audit";

export const metadata: Metadata = { title: "Audit chain" };

function Fallback() {
  return (
    <Page>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-[24rem] max-w-full" />
        <Skeleton className="h-3.5 w-[26rem] max-w-full" />
      </div>
      <Skeleton className="h-[340px] w-full rounded-w-card" />
      <LoadingState rows={8} density="compact" label="Loading the audit chain." />
    </Page>
  );
}

export default function AuditRoute() {
  return (
    <Suspense fallback={<Fallback />}>
      <AuditPage />
    </Suspense>
  );
}
