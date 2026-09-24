// OWNER: d4 (wave 3). /suppressions (dashboard-blueprint §2.8; plan A3, A8). A thin
// Server Component: the route has no dynamic segment, so there is no `params` to await
// (Next 16 rule), but the page's own filters live in the URL and are read with nuqs'
// useQueryStates, which needs a <Suspense> boundary around anything that calls it
// (src/lib/hooks/url-state.ts) so a statically rendered shell never blocks on
// useSearchParams. The client component does all the work.
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app-shell";
import { SuppressionsPage } from "@/components/routes/suppressions";

export const metadata: Metadata = { title: "Suppressions" };

function Fallback() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
      <p className="type-label text-text-dim">/suppressions</p>
      <h1 className="mt-2 type-display-h3 text-text-primary">Suppression ledger</h1>
      <div className="mt-6">
        <LoadingState rows={8} label="Loading the suppression ledger." />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Fallback />}>
      <SuppressionsPage />
    </Suspense>
  );
}
