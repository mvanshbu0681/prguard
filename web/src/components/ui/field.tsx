"use client";

// OWNER: T1b (wave 1). Design §5.2: the label, the control, the hint and the error.
//
//   <Field label="Reason" hint="Required. At least 8 characters." error={error}>
//     <Textarea value={reason} onChange={…} />
//   </Field>
//
// Label: 11px mono caps --text-dim, 6px above. Hint and error: 11px Inter, 4px
// below. The error is --alarm-text with a 12px glyph (never colour alone) and
// is wired to the control through aria-describedby + aria-invalid. It is NOT a
// role="alert": that role is reserved for the merge gate turning red (design §8.4).
//
// The single child is the control (Input, Textarea, SelectTrigger …). Field
// gives it an id (unless it has one), aria-describedby and aria-invalid.
import * as React from "react";
import { cn } from "@/lib/utils";

type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
  "aria-required"?: boolean | "true" | "false";
  required?: boolean;
};

export interface FieldProps extends Omit<React.ComponentProps<"div">, "children"> {
  label: React.ReactNode;
  hint?: React.ReactNode;
  /** The validation message. Present = invalid. */
  error?: React.ReactNode;
  /** Marks the control aria-required. Say "required" in the hint as well; there is no asterisk. */
  required?: boolean;
  children: React.ReactElement<ControlProps>;
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

function Field({ label, hint, error, required, className, children, ...props }: FieldProps) {
  const generated = React.useId();
  const controlId = children.props.id ?? `field${generated.replace(/:/g, "")}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [children.props["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = React.cloneElement(children, {
    id: controlId,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : children.props["aria-invalid"],
    "aria-required": required ? true : children.props["aria-required"],
  });

  return (
    <div data-slot="field" data-invalid={error ? "" : undefined} className={cn("ui-field", className)} {...props}>
      <label data-slot="field-label" htmlFor={controlId} className="ui-field__label">
        {label}
      </label>
      {control}
      {hint ? (
        <p data-slot="field-hint" id={hintId} className="ui-field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p data-slot="field-error" id={errorId} className="ui-field__error">
          <FieldErrorGlyph />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export { Field };
