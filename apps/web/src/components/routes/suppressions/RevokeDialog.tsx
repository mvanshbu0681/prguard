"use client";
// The ledger's one write action: `DELETE /v1/suppressions/{id}` through
// useRevokeSuppression. The confirm copy says plainly what revoking does and does
// not do — the row is never deleted; it stays on the record, struck through, and a
// `suppression.revoked` event joins the audit chain. The mutation's own onSettled
// invalidates the ledger, so the row flips state in place once the refetch lands;
// this component only asks, sends, and closes.
import { Undo2 } from "lucide-react";
import { useId, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, Button } from "@/components/dash/kit";
import { relTime } from "@/components/dash/format";
import { useRevokeSuppression, type ApiError } from "@/lib/hooks";
import type { SuppressionItem } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { shortSuppressionId } from "./format";
import type { LedgerFinding } from "./ledger-model";
import { RichText } from "./RichText";
import { ScopeTarget } from "./ScopeTarget";
import s from "./suppressions.module.css";

export interface RevokeDialogProps {
  suppression: SuppressionItem;
  /** The finding it silenced, when the ledger could join it. */
  finding?: LedgerFinding | null;
  className?: string;
}

export function RevokeDialog({ suppression, finding = null, className }: RevokeDialogProps) {
  const [open, setOpen] = useState(false);
  const revoke = useRevokeSuppression();
  const titleId = useId();

  function onConfirm() {
    revoke.mutate(
      { suppressionId: suppression.suppression_id },
      {
        onSuccess: () => setOpen(false),
        // The failure toast is raised by the hook (toastWriteFailure); the dialog
        // stays open so the visitor can read the error and try again.
      },
    );
  }

  const error = revoke.error as ApiError | null;
  const silenced = suppression.suppressed_count ?? 0;

  return (
    <Dialog open={open} onOpenChange={(next) => (!revoke.isPending ? setOpen(next) : null)}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          icon={Undo2}
          className={cn(s.revokeBtn, className)}
          aria-label={`Revoke suppression ${shortSuppressionId(suppression.suppression_id)}`}
        >
          Revoke
        </Button>
      </DialogTrigger>
      <DialogContent aria-labelledby={titleId} className={s.dialog}>
        <DialogHeader>
          <DialogTitle id={titleId}>Revoke this suppression?</DialogTitle>
          <DialogDescription>
            Revoking does not delete this row. It stays in the ledger, struck through, and a{" "}
            <code className={s.inlineCode}>suppression.revoked</code> event joins the audit chain. From the next review, the{" "}
            {silenced === 1 ? "finding it silenced is" : `${silenced.toLocaleString("en-US")} findings it silenced are`} raised again.
          </DialogDescription>
        </DialogHeader>

        <div className={s.dialogCard}>
          <ScopeTarget item={suppression} fingerprint={finding?.fingerprint ?? null} />
          {finding ? (
            <p className={s.dialogTitle}>
              <RichText text={finding.title} />
            </p>
          ) : null}
          <blockquote className={s.reason}>{suppression.reason}</blockquote>
          <p className={s.dialogMeta}>
            <Avatar name={suppression.created_by ?? "system"} size={20} />
            <span className={s.metaStrong}>{suppression.created_by ?? "system"}</span>
            <span aria-hidden>·</span>
            <span>suppressed {relTime(suppression.created_at)}</span>
            <span aria-hidden>·</span>
            <span className={s.mono}>{shortSuppressionId(suppression.suppression_id)}</span>
          </p>
        </div>

        {error ? (
          <p role="alert" className={s.dialogError}>
            {error.statusLabel} · {error.endpoint}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={revoke.isPending}>
            Keep it
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={revoke.isPending} aria-busy={revoke.isPending || undefined}>
            {revoke.isPending ? "Revoking…" : "Revoke"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
