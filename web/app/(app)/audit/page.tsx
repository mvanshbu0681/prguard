// OWNER: d4 (wave 3). /audit (dashboard-blueprint §2.9, §3c; plan A8, A9). A thin
// Server Component wrapper: no dynamic segment (no `params` to await), but the
// filters and the `?seq=` deep link live in the URL, so the client component that
// reads them needs a <Suspense> boundary (see src/lib/hooks/url-state.ts).
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app-shell";
import { AuditPage } from "@/components/routes/audit";

export const metadata: Metadata = { title: "Audit chain" };

function Fallback() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
      <p className="type-label text-text-dim">/audit</p>
      <h1 className="mt-2 type-display-h3 text-text-primary">Audit chain</h1>
      <div className="mt-6">
        <LoadingState rows={8} density="compact" label="Loading the audit chain." />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Fallback />}>
      <AuditPage />
    </Suspense>
  );
}
