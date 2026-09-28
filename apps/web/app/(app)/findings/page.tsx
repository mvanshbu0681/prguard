// OWNER: d2 (wave 3). /findings — the cross-repo findings list (plan A3;
// dashboard-blueprint §2.6). The route itself is a thin server shell: every
// filter lives in the URL via nuqs (src/lib/hooks/url-state.ts), read by
// FindingsListRoute's client-side useFindingFilters(), which needs
// useSearchParams — hence the Suspense boundary here rather than marking this
// whole file "use client" (Next 16 still requires it for a statically
// analysable route; see that hook's own file header).
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app-shell";
import { FindingsListRoute } from "@/components/routes/findings-list";

export const metadata: Metadata = { title: "Findings" };

export default function FindingsPage() {
  return (
    <Suspense fallback={<LoadingState rows={8} label="Loading findings." className="px-4 py-4 md:px-6" />}>
      <FindingsListRoute />
    </Suspense>
  );
}
