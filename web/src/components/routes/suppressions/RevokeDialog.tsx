"use client";
// OWNER: d4 (wave 3). The ledger's one write action (dashboard-blueprint §2.8):
// `DELETE /v1/suppressions/{id}` is wired to useRevokeSuppression, and the confirm
// copy says plainly that revoke never deletes — the row stays on the record with
// `revoked_at` set, struck through, in place. The mutation's own onSettled
// (src/lib/hooks/use-suppressions.ts) invalidates the ledger query, so the row flips
// state in place once the refetch lands; this component only asks, sends, and closes.
import { useId, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRevokeSuppression, type ApiError } from "@/lib/hooks";
import type { SuppressionItem } from "@/lib/api-types";
import { matchLabel, shortSuppressionId } from "./format";

export interface RevokeDialogProps {
  suppression: SuppressionItem;
  className?: string;
}

export function RevokeDialog({ suppression, className }: RevokeDialogProps) {
  const [open, setOpen] = useState(false);
  const revoke = useRevokeSuppression();
  const titleId = useId();

  function onConfirm() {
    revoke.mutate(
      { suppressionId: suppression.suppression_id },
      {
        onSuccess: () => setOpen(false),
        // The failure toast is already raised by the hook (toastWriteFailure); the
        // dialog just stays open so the visitor can read it and try again.
      },
    );
  }

  const error = revoke.error as ApiError | null;

  return (
    <Dialog open={open} onOpenChange={(next) => (!revoke.isPending ? setOpen(next) : null)}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className={className}>
          REVOKE
        </Button>
      </DialogTrigger>
      <DialogContent aria-labelledby={titleId}>
        <DialogHeader>
          <DialogTitle id={titleId}>Revoke suppression {shortSuppressionId(suppression.suppression_id)}</DialogTitle>
          <DialogDescription>
            The ledger is append-only. Revoking does not delete this row — it records a{" "}
            <span className="type-data text-text-body">suppression.revoked</span> event, and the row stays on the record, struck through, from here on.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 type-data text-text-body">
          <dt className="text-text-dim">scope</dt>
          <dd>{suppression.scope}</dd>
          <dt className="text-text-dim">matches</dt>
          <dd className="min-w-0 truncate">{matchLabel(suppression)}</dd>
          <dt className="text-text-dim">reason</dt>
          <dd className="min-w-0 type-small whitespace-normal text-text-body">{suppression.reason}</dd>
        </dl>
        {error ? (
          <p role="alert" className="type-data text-alarm-text">
            {error.statusLabel} · {error.endpoint}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={revoke.isPending}>
            CANCEL
          </Button>
          <Button variant="destructive" onClick={onConfirm} loading={revoke.isPending}>
            REVOKE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
