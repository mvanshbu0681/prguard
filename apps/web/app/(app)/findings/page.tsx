// /findings — the triage inbox. A thin server shell: every filter lives in the
// URL (nuqs), read client-side by FindingsListRoute through useSearchParams,
// hence the Suspense boundary here rather than marking the page "use client".
import type { Metadata } from "next";
import { Suspense } from "react";
import { FindingsListFallback, FindingsListRoute } from "@/components/routes/findings-list";

export const metadata: Metadata = { title: "Findings" };

export default function FindingsPage() {
  return (
    <Suspense fallback={<FindingsListFallback />}>
      <FindingsListRoute />
    </Suspense>
  );
}
