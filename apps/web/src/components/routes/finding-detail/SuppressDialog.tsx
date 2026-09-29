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
import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { EyeOff } from "lucide-react";
import { Button, TextField } from "@/components/dash/kit";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useSuppressFinding } from "@/lib/hooks";
import { SUPPRESSION_SCOPES, type SuppressionScope } from "@/lib/contracts";
import type { Finding } from "@/lib/api-types";
import { expiryValue, hasSuppressFormErrors, isoDay, suppressRequestFrom, validateSuppressForm, type ExpiryChoice, type SuppressFormValues } from "./format";
import { useNarrowViewport } from "./use-media-query";
import s from "./detail.module.css";

/** Attributes writes to the signed-in demo actor (plan-native: this is the exact
 *  "vansh.m" convention the fixture corpus and its own tests already use as
 *  `created_by` / `X-Actor-Id` — derived from the user's own email, never sent
 *  anywhere but this same-origin write). */
function actorIdFromEmail(email: string): string {
  return email.split("@")[0] ?? email;
}

const DEMO_ACTOR_ID = actorIdFromEmail("vansh.m@shavastudios.ai");

const EMPTY_VALUES: SuppressFormValues = { scope: "line", reason: "", expiresAt: "", matchPath: "" };

const SCOPE_HINT: Record<SuppressionScope, (f: Finding) => string> = {
  line: (f) => `Only ${f.location.file_path}${f.location.start_line != null ? `:${f.location.start_line}` : ""}.`,
  file: (f) => `Anywhere in ${f.location.file_path}.`,
  pattern: () => "Every file matching a glob you give below.",
  repo: () => "Anywhere in this repository.",
  tenant: () => "Every repository in the organisation.",
};

/** A row of pills with radio semantics: one Tab stop, arrow keys move the choice. */
function PillRadios<T extends string>({ id, label, options, value, onChange }: { id?: string; label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (next: T) => void }) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + step + options.length) % options.length].value;
    onChange(next);
    (event.currentTarget.querySelector(`[data-value="${next}"]`) as HTMLElement | null)?.focus();
  }
  return (
    <div id={id} role="radiogroup" aria-label={label} className={s.scopes} onKeyDown={onKeyDown}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          data-value={o.value}
          className={s.scope}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const SCOPE_OPTIONS = SUPPRESSION_SCOPES.map((scope) => ({ value: scope, label: scope }));

const EXPIRY_OPTIONS: readonly { value: ExpiryChoice; label: string }[] = [
  { value: "never", label: "Never" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "date", label: "Pick a date" },
];

function expiryHint(choice: ExpiryChoice, value: string): string {
  if (choice === "date" && !value) return "Pick the last day it should apply.";
  if (!value) return "Stays until someone revokes it from Suppressions.";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Pick the last day it should apply.";
  return `Lifts on ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).replace("Sept", "Sep")}, and the finding can block again.`;
}

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
  const [expiry, setExpiry] = useState<ExpiryChoice>("never");
  const [pickedDay, setPickedDay] = useState("");
  // The earliest pickable day, fixed when the form opens (the form remounts per open).
  const [tomorrow] = useState(() => isoDay(new Date(Date.now() + 86_400_000)));
  return (
    <div className={s.form}>
      <p className={s.formLead}>
        Fingerprint <code>{finding.fingerprint ? `${finding.fingerprint.slice(0, 8)}…${finding.fingerprint.slice(-4)}` : finding.id.slice(0, 8)}</code>. A suppression is an
        append-only ledger entry, not a delete: it can be revoked from Suppressions, never removed, and it is written to the audit trail.
      </p>
      <Field label="Scope" controlId={fieldIds.scope} required>
        <div>
          <PillRadios id={fieldIds.scope} label="Scope" options={SCOPE_OPTIONS} value={values.scope} onChange={(scope) => setValues({ ...values, scope })} />
          <p className={s.scopeHint}>{SCOPE_HINT[values.scope](finding)}</p>
        </div>
      </Field>
      {values.scope === "pattern" ? (
        <Field label="Match path" hint="Required for a pattern, e.g. src/api/**." error={errors.matchPath} controlId={fieldIds.matchPath} required>
          <Input mono value={values.matchPath} onChange={(e) => setValues({ ...values, matchPath: e.target.value })} placeholder="src/api/**" />
        </Field>
      ) : null}
      <Field label="Reason" hint="Required. Why this finding should not block or come back." error={errors.reason} controlId={fieldIds.reason} required>
        <Textarea value={values.reason} onChange={(e) => setValues({ ...values, reason: e.target.value })} rows={3} />
      </Field>
      <Field label="Expires" error={errors.expiresAt} controlId={fieldIds.expires}>
        <div className="flex flex-col gap-3">
          <PillRadios
            label="Expires"
            options={EXPIRY_OPTIONS}
            value={expiry}
            onChange={(choice) => {
              setExpiry(choice);
              setValues({ ...values, expiresAt: expiryValue(choice, pickedDay) });
            }}
          />
          {expiry === "date" ? (
            <TextField
              id={fieldIds.expires}
              type="date"
              variant="outline"
              aria-label="Expiry date"
              min={tomorrow}
              value={pickedDay}
              wrapperClassName="max-w-[260px]"
              onChange={(e) => {
                setPickedDay(e.target.value);
                setValues({ ...values, expiresAt: expiryValue("date", e.target.value) });
              }}
            />
          ) : null}
          <p className={s.scopeHint}>{expiryHint(expiry, values.expiresAt)}</p>
        </div>
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
      Cancel
    </Button>
  );
  const submit = (
    <Button type="submit" variant="danger" icon={EyeOff} disabled={mutation.isPending} aria-busy={mutation.isPending || undefined}>
      Suppress
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
