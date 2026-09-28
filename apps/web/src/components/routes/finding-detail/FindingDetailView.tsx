"use client";
// OWNER: d3 (wave 3). /findings/[id] — the finding detail, as evidence
// (dashboard-blueprint §2.7). One scroll, sticky section headers in fixed
// order, no tabs. Composes wave-1/wave-2 chrome, badges and evidence
// components with client data from @/lib/hooks; this file owns only
// orchestration (which query, which section, the suppress dialog's open
// state, the two bare-key bindings) — every section's own markup lives in its
// own file.
import { useState } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/app-shell";
import { GraphPaper } from "@/components/chrome";
import { Lockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { useFinding, useReviewResult } from "@/lib/hooks";
import { useKeyBinding } from "@/motion/keys";
import { AuditSection } from "./AuditSection";
import { BackLink } from "./BackLink";
import { ClaimSection } from "./ClaimSection";
import { DeliverySection } from "./DeliverySection";
import { downloadFindingEvidence } from "./export-evidence";
import { FindingDetailSkeleton } from "./FindingDetailSkeleton";
import { IdentitySection } from "./IdentitySection";
import { LocationSection } from "./LocationSection";
import { PageHeader } from "./PageHeader";
import { ProofSection } from "./ProofSection";
import { SeveritySection } from "./SeveritySection";
import { StickyMiniHeader } from "./StickyMiniHeader";
import { SuppressDialog } from "./SuppressDialog";

function NotFoundFrame({ id }: { id: string }) {
  return (
    <div className="relative isolate flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <GraphPaper aria-hidden="true" className="absolute inset-0" />
      <div className="relative z-10 flex flex-col items-center gap-6">
        <p className="type-label text-text-dim">/ 404 — NO SUCH FINDING</p>
        <Lockup variant="C" />
        <p className="max-w-(--measure-body) type-body text-text-body">
          No finding matches <span className="type-data text-text-primary">{id.slice(0, 8)}</span>. It may have been part of a run that was never
          persisted, or the id is wrong.
        </p>
        <Button asChild variant="ghost">
          <Link href="/findings">← BACK TO FINDINGS</Link>
        </Button>
      </div>
    </div>
  );
}

export function FindingDetailView({ id }: { id: string }) {
  const findingQuery = useFinding(id);
  const finding = findingQuery.data;
  const reviewQuery = useReviewResult(finding?.review_id, { enabled: Boolean(finding?.review_id) });
  const [suppressOpen, setSuppressOpen] = useState(false);

  useKeyBinding("s", () => setSuppressOpen(true), Boolean(finding) && finding?.status !== "suppressed");
  useKeyBinding(
    "e",
    () => {
      if (finding) downloadFindingEvidence(finding);
    },
    Boolean(finding),
  );

  if (findingQuery.isPending) {
    return (
      <div className="mx-auto max-w-[940px] px-4 py-8 md:px-8">
        <FindingDetailSkeleton />
      </div>
    );
  }

  if (findingQuery.isError) {
    if (findingQuery.error.status === 404) {
      return <NotFoundFrame id={id} />;
    }
    return (
      <div className="mx-auto max-w-[940px] px-4 py-8 md:px-8">
        <BackLink />
        <div className="mt-6">
          <ErrorState error={findingQuery.error} onRetry={() => findingQuery.refetch()} />
        </div>
      </div>
    );
  }

  if (!finding) return null; // Unreachable: isPending/isError above cover every other TanStack Query state.

  const review = reviewQuery.data;
  const reviewShort = finding.review_id.slice(0, 7);

  return (
    <div className="mx-auto max-w-[940px] px-4 md:px-8">
      <StickyMiniHeader finding={finding} onSuppress={() => setSuppressOpen(true)} onExport={() => downloadFindingEvidence(finding)} suppressed={finding.status === "suppressed"} />
      <div className="flex flex-col gap-6 pb-16 pt-6">
        <PageHeader finding={finding} />
        <ClaimSection finding={finding} />
        <LocationSection finding={finding} />
        <SeveritySection finding={finding} />
        <ProofSection finding={finding} baseSha={review?.pull_request.base_sha ?? null} headSha={review?.pull_request.head_sha ?? null} reviewShort={reviewShort} />
        <DeliverySection finding={finding} repository={review?.repository ?? null} prNumber={review?.pull_request.number ?? null} />
        <IdentitySection finding={finding} onSuppress={() => setSuppressOpen(true)} />
        <AuditSection finding={finding} />
      </div>
      <SuppressDialog finding={finding} open={suppressOpen} onOpenChange={setSuppressOpen} />
    </div>
  );
}
