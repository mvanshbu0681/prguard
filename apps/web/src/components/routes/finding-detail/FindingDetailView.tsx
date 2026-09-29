"use client";
// /findings/[id] — the evidence page. The header says what was claimed and
// where; the main column carries the claim, proof by execution (the hero) and
// the location; the rail carries the severity arithmetic, identity & history,
// delivery and the audit trail. `s` opens the suppress dialog, `e` exports the
// finding's JSON exactly as the API returned it.
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ErrorState } from "@/components/app-shell";
import { Button, Page, PageHeader, Rise } from "@/components/dash/kit";
import { useFinding, useReviewResult } from "@/lib/hooks";
import { useKeyBinding } from "@/motion/keys";
import { AuditCard } from "./AuditCard";
import { ClaimCard } from "./ClaimCard";
import { DeliveryCard } from "./DeliveryCard";
import { DetailHeader } from "./DetailHeader";
import { downloadFindingEvidence } from "./export-evidence";
import { runOutcome } from "./format";
import { FindingDetailSkeleton } from "./FindingDetailSkeleton";
import { IdentityCard } from "./IdentityCard";
import { LocationCard } from "./LocationCard";
import { ProofCard } from "./ProofCard";
import { SeverityCard } from "./SeverityCard";
import { StateNotice } from "./StateNotice";
import { SuppressDialog } from "./SuppressDialog";
import s from "./detail.module.css";

export function FindingDetailView({ id }: { id: string }) {
  const findingQuery = useFinding(id);
  const finding = findingQuery.data;
  const reviewQuery = useReviewResult(finding?.review_id, { enabled: Boolean(finding?.review_id) });
  const review = reviewQuery.data;
  const [suppressOpen, setSuppressOpen] = useState(false);

  useKeyBinding("s", () => setSuppressOpen(true), Boolean(finding) && finding?.status !== "suppressed");
  useKeyBinding("e", () => finding && downloadFindingEvidence(finding), Boolean(finding));

  if (findingQuery.isPending) {
    return (
      <Page>
        <FindingDetailSkeleton />
      </Page>
    );
  }

  if (findingQuery.isError) {
    return (
      <Page>
        {findingQuery.error.status === 404 ? (
          <PageHeader
            eyebrow="Findings"
            title="No finding with that id."
            description={
              <>
                Nothing in the corpus matches <span className="font-w-mono text-w-text">{id.slice(0, 8)}</span>. It may belong to a run that was never persisted, or the link is
                wrong.
              </>
            }
            actions={
              <Button variant="dark" size="md" href="/findings" icon={ArrowLeft}>
                All findings
              </Button>
            }
          />
        ) : (
          <ErrorState error={findingQuery.error} onRetry={() => findingQuery.refetch()} />
        )}
      </Page>
    );
  }

  if (!finding) return null; // isPending / isError above cover every other query state.
  const executed = Boolean(finding.proof?.test_code) || runOutcome(finding.proof?.base).kind !== "not_run" || runOutcome(finding.proof?.head).kind !== "not_run";

  return (
    <Page className="gap-8">
      <DetailHeader finding={finding} review={review} onSuppress={() => setSuppressOpen(true)} onExport={() => downloadFindingEvidence(finding)} />
      <div className={s.layout}>
        <div className={s.mainCol}>
          <Rise delay={60}>
            <StateNotice finding={finding} />
          </Rise>
          <Rise delay={60}>
            <ClaimCard finding={finding} />
          </Rise>
          <Rise delay={120}>
            <ProofCard finding={finding} review={review} />
          </Rise>
          <Rise delay={180}>
            <LocationCard finding={finding} review={review} />
          </Rise>
          {/* A proof that never ran is a short card: keep the columns balanced by moving the history cards across. */}
          {executed ? null : (
            <>
              <Rise delay={240}>
                <DeliveryCard finding={finding} review={review} />
              </Rise>
              <Rise delay={300}>
                <AuditCard finding={finding} />
              </Rise>
            </>
          )}
        </div>
        <div className={s.railCol}>
          <Rise delay={120}>
            <SeverityCard finding={finding} />
          </Rise>
          <Rise delay={180}>
            <IdentityCard finding={finding} />
          </Rise>
          {executed ? (
            <>
              <Rise delay={240}>
                <DeliveryCard finding={finding} review={review} />
              </Rise>
              <Rise delay={300}>
                <AuditCard finding={finding} />
              </Rise>
            </>
          ) : null}
        </div>
      </div>
      <SuppressDialog finding={finding} open={suppressOpen} onOpenChange={setSuppressOpen} />
    </Page>
  );
}
