"use client";

// The run form, restyled for the photo band: a glass input pill with the lime
// "Run a review" button inside it, and the pre-warmed PR chips below. Same
// behaviour as the old closing section's form: validate the reference, POST
// the review, then open the run (its replay when serving fixtures).
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { FIXTURES } from "@/lib/env";
import { useCreateReview } from "@/lib/hooks";
import type { ApiError } from "@/lib/api-types";
import { validatePrReference } from "@/components/sections/close/pr-validation";
import s from "./cta.module.css";

const formatApiError = (error: ApiError) => `${error.method} ${error.path} · ${error.status} · ${error.message}`;

export function CtaForm({ chips }: { chips: string[] }) {
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [shapeError, setShapeError] = useState<string | null>(null);
  const mutation = useCreateReview();

  // Arriving from the hero's "Run a review" (#run) puts the cursor in the field.
  useEffect(() => {
    const focusIfArrivingHere = () => {
      if (window.location.hash === "#run") inputRef.current?.focus({ preventScroll: true });
    };
    focusIfArrivingHere();
    window.addEventListener("hashchange", focusIfArrivingHere);
    return () => window.removeEventListener("hashchange", focusIfArrivingHere);
  }, []);

  function submit(candidate: string) {
    const result = validatePrReference(candidate);
    if (!result.ok) {
      setShapeError(result.message);
      inputRef.current?.focus();
      return;
    }
    setShapeError(null);
    mutation.mutate(
      { pr_url: result.value },
      {
        onSuccess: (accepted) => {
          const path = `/runs/${accepted.review_id}`;
          router.push(FIXTURES ? `${path}?replay=1` : path);
        },
      },
    );
  }

  const error = shapeError ?? (mutation.isError ? formatApiError(mutation.error as ApiError) : null);
  const pending = mutation.isPending;

  return (
    <form
      className={s.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit(value);
      }}
    >
      <label htmlFor={inputId} className={s.srOnly}>
        Pull request
      </label>
      <div className={s.field}>
        <input
          id={inputId}
          ref={inputRef}
          name="pr_url"
          className={s.input}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (shapeError) setShapeError(null);
          }}
          placeholder="github.com/owner/repo/pull/4821"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <button type="submit" className={s.go} disabled={pending}>
          {pending ? "Starting" : "Run a review"}
          <span className={s.goChip} aria-hidden>
            {pending ? <LoaderCircle size={18} strokeWidth={2} className={s.spin} /> : <ArrowUpRight size={18} strokeWidth={2} />}
          </span>
        </button>
      </div>
      {error ? (
        <p id={errorId} className={s.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={s.tryRow}>
        <span className={s.tryLabel}>Try</span>
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            className={s.try}
            onClick={() => {
              setValue(chip);
              setShapeError(null);
              inputRef.current?.focus();
            }}
          >
            {chip}
          </button>
        ))}
      </div>
    </form>
  );
}
