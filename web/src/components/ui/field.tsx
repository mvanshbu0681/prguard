"use client";

// OWNER: T1b (wave 1). Design §5.2: the label, the control, the hint and the error.
//
//   <Field label="Reason" hint="Required. At least 8 characters." error={error} required>
//     <Textarea value={reason} onChange={…} />
//   </Field>
//   <Field label="Scope">
//     <Select …><SelectTrigger><SelectValue /></SelectTrigger>…</Select>
//   </Field>
//
// Label: 11px mono caps --text-dim, 6px above. Hint: 11px Inter --text-body, 4px
// below. The error is --alarm-text with a 12px glyph (never colour alone). It is
// NOT a role="alert": that role is reserved for the merge gate turning red (§8.4).
//
// Wiring goes through context, not through the child's props, so the control may
// sit anywhere inside the Field — a SelectTrigger inside its Select root, an
// input inside an InputGroup. Input, Textarea and SelectTrigger read it
// themselves. A hand-built control calls useFieldControl(props) and spreads the
// result. Give the control its id through `controlId` on the Field, so the label
// and the control agree.
import * as React from "react";
import { cn } from "@/lib/utils";

/** The attributes a Field contributes to its control. */
export interface FieldControlProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  "aria-required"?: React.AriaAttributes["aria-required"];
}

interface FieldContextValue {
  controlId: string;
  hintId?: string;
  errorId?: string;
  invalid: boolean;
  required: boolean;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

/**
 * A control's own props merged with the enclosing <Field>'s wiring: its id (so the
 * label's htmlFor matches), aria-describedby (hint + error), aria-invalid and
 * aria-required. Outside a Field the props come back unchanged.
 */
export function useFieldControl<P extends FieldControlProps>(props: P): P {
  const field = React.useContext(FieldContext);
  if (!field) return props;
  const describedBy = [props["aria-describedby"], field.hintId, field.errorId].filter(Boolean).join(" ") || undefined;
  return {
    ...props,
    id: props.id ?? field.controlId,
    "aria-describedby": describedBy,
    "aria-invalid": field.invalid ? true : props["aria-invalid"],
    "aria-required": field.required ? true : props["aria-required"],
  };
}

export interface FieldProps extends React.ComponentProps<"div"> {
  label: React.ReactNode;
  hint?: React.ReactNode;
  /** The validation message. Present = invalid. */
  error?: React.ReactNode;
  /** Marks the control aria-required. Say "required" in the hint as well; there is no asterisk. */
  required?: boolean;
  /** The control's id. Generated when omitted. */
  controlId?: string;
}

/** The error glyph: a square frame with a bar and a point. 1px strokes, butt caps. */
export function FieldErrorGlyph() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter" aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width="11" height="11" />
      <path d="M6 2.5v4.5" />
      <path d="M6 8.5v1.5" />
    </svg>
  );
}

function Field({ label, hint, error, required = false, controlId, className, children, ...props }: FieldProps) {
  const generated = React.useId();
  const id = controlId ?? `field-${generated.replace(/[^A-Za-z0-9_-]/g, "")}`;
  const hasError = error !== undefined && error !== null && error !== false && error !== "";
  const context = React.useMemo<FieldContextValue>(
    () => ({
      controlId: id,
      hintId: hint ? `${id}-hint` : undefined,
      errorId: hasError ? `${id}-error` : undefined,
      invalid: hasError,
      required,
    }),
    [id, hint, hasError, required],
  );

  return (
    <div data-slot="field" data-invalid={hasError ? "" : undefined} className={cn("ui-field", className)} {...props}>
      <label data-slot="field-label" htmlFor={id} className="ui-field__label">
        {label}
      </label>
      <FieldContext.Provider value={context}>{children}</FieldContext.Provider>
      {hint ? (
        <p data-slot="field-hint" id={context.hintId} className="ui-field__hint">
          {hint}
        </p>
      ) : null}
      {hasError ? (
        <p data-slot="field-error" id={context.errorId} className="ui-field__error">
          <FieldErrorGlyph />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export { Field };
