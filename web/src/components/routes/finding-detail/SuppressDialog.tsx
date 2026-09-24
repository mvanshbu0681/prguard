"use client";
// OWNER: d3 (wave 3). The suppress action (dashboard-blueprint §2.7 "Suppress
// action"): a Dialog (or a Sheet under 1024px — design §5.10 permits sheets
// for exactly this form) with scope (line|file|pattern|repo|tenant), a
// REQUIRED non-empty reason, an optional expiry, match_path required for
// scope=pattern. Submits via useSuppressFinding, which is already optimistic
// (the finding flips to suppressed, 0ms + .stamp, before the response) and
// already carries the failure toast with the endpoint + status
// (src/lib/hooks/use-suppressions.ts) — this component only builds the
// request and reports its own validation, never a second toast.
//
// <SuppressFormShell> is keyed by `open` (see below) rather than reset via a
// `useEffect` on open — remounting is the same reset with none of the
// synchronous-setState-in-an-effect cost react-hooks/set-state-in-effect flags.
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSuppressFinding } from "@/lib/hooks";
import { SUPPRESSION_SCOPES, type SuppressionScope } from "@/lib/contracts";
import type { Finding } from "@/lib/api-types";
import { hasSuppressFormErrors, suppressRequestFrom, validateSuppressForm, type SuppressFormValues } from "./format";
import { useNarrowViewport } from "./use-media-query";

/** Attributes writes to the signed-in demo actor (plan-native: this is the exact
 *  "vansh.m" convention the fixture corpus and its own tests already use as
 *  `created_by` / `X-Actor-Id` — derived from the user's own email, never sent
 *  anywhere but this same-origin write). */
function actorIdFromEmail(email: string): string {
  return email.split("@")[0] ?? email;
}

const DEMO_ACTOR_ID = actorIdFromEmail("vansh.m@shavastudios.ai");

const EMPTY_VALUES: SuppressFormValues = { scope: "line", reason: "", expiresAt: "", matchPath: "" };

function SuppressFields({
  finding,
  values,
  setValues,
  submitted,
  fieldIds,
}: {
  finding: Finding;
  values: SuppressFormValues;
  setValues: (values: SuppressFormValues) => void;
  submitted: boolean;
  fieldIds: { scope: string; reason: string; expires: string; matchPath: string };
}) {
  const errors = submitted ? validateSuppressForm(values) : {};
  return (
    <div className="flex flex-col gap-5">
      <p className="type-small text-text-dim">
        Fingerprint{" "}
        <span className="type-data text-text-body">
          {finding.fingerprint ? `${finding.fingerprint.slice(0, 8)}…${finding.fingerprint.slice(-4)}` : finding.id.slice(0, 8)}
        </span>
        . A suppression is an append-only ledger entry, not a delete — it can be revoked from /suppressions, never removed.
      </p>
      <Field label="Scope" controlId={fieldIds.scope} required>
        <ToggleGroup
          id={fieldIds.scope}
          aria-label="Scope"
          type="single"
          value={values.scope}
          onValueChange={(next) => {
            if (next) setValues({ ...values, scope: next as SuppressionScope });
          }}
        >
          {SUPPRESSION_SCOPES.map((scope) => (
            <ToggleGroupItem key={scope} value={scope} aria-label={scope}>
              {scope.toUpperCase()}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      {values.scope === "pattern" ? (
        <Field label="Match path" hint="Required for scope=pattern, e.g. src/api/**." error={errors.matchPath} controlId={fieldIds.matchPath} required>
          <Input mono value={values.matchPath} onChange={(e) => setValues({ ...values, matchPath: e.target.value })} placeholder="src/api/**" />
        </Field>
      ) : null}
      <Field label="Reason" hint="Required. Why this finding should not block or reappear." error={errors.reason} controlId={fieldIds.reason} required>
        <Textarea value={values.reason} onChange={(e) => setValues({ ...values, reason: e.target.value })} rows={3} />
      </Field>
      <Field label="Expires" hint="Optional. Leave empty for no expiry." error={errors.expiresAt} controlId={fieldIds.expires}>
        <Input type="datetime-local" value={values.expiresAt} onChange={(e) => setValues({ ...values, expiresAt: e.target.value })} />
      </Field>
    </div>
  );
}

/** Everything stateful about one open cycle of the form. Keyed by `open` at the
 *  call site, so a fresh instance (fresh useState, fresh useMutation) is what
 *  resets the form on open — no effect, nothing to synchronise. */
function SuppressFormShell({ finding, onOpenChange, variant }: { finding: Finding; onOpenChange: (open: boolean) => void; variant: "dialog" | "sheet" }) {
  const mutation = useSuppressFinding();
  const [values, setValues] = useState<SuppressFormValues>(EMPTY_VALUES);
  const [submitted, setSubmitted] = useState(false);
  const baseId = useId();
  const fieldIds = { scope: `${baseId}-scope`, reason: `${baseId}-reason`, expires: `${baseId}-expires`, matchPath: `${baseId}-match-path` };

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    const errors = validateSuppressForm(values);
    if (hasSuppressFormErrors(errors)) return;
    mutation.mutate({ findingId: finding.id, request: suppressRequestFrom(values), actorId: DEMO_ACTOR_ID }, { onSuccess: () => onOpenChange(false) });
  }

  const title = "Suppress finding";
  const description = finding.title.length > 72 ? `${finding.title.slice(0, 72)}…` : finding.title;
  const fields = <SuppressFields finding={finding} values={values} setValues={setValues} submitted={submitted} fieldIds={fieldIds} />;
  const cancel = (
    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
      CANCEL
    </Button>
  );
  const submit = (
    <Button type="submit" loading={mutation.isPending}>
      SUPPRESS
    </Button>
  );

  if (variant === "sheet") {
    return (
      <form onSubmit={handleSubmit} className="flex h-full flex-col">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <SheetBody>{fields}</SheetBody>
        <SheetFooter>
          {cancel}
          {submit}
        </SheetFooter>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="py-4">{fields}</div>
      <DialogFooter>
        {cancel}
        {submit}
      </DialogFooter>
    </form>
  );
}

export interface SuppressDialogProps {
  finding: Finding;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SuppressDialog({ finding, open, onOpenChange }: SuppressDialogProps) {
  const narrow = useNarrowViewport();
  const shellKey = open ? "open" : "closed";

  if (narrow) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <SuppressFormShell key={shellKey} finding={finding} onOpenChange={onOpenChange} variant="sheet" />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <SuppressFormShell key={shellKey} finding={finding} onOpenChange={onOpenChange} variant="dialog" />
      </DialogContent>
    </Dialog>
  );
}
