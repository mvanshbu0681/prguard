"use client";
// OWNER: m6 (wave 3). Section 09's run surface (plan A5, landing blueprint
// §11 folded into §14's close): the PR input, the pre-warmed chips and the
// submit that starts a review — rendered inside an <Exhibit> per §11's own
// composition line ("an evidence frame with registration marks"): the input
// is the instrument that produces a run, not an ordinary form control.
//
// Fixture mode (plan A5, A11): every submission — whatever was typed —
// replays the demo run at `ids.demo_review_id`; `useCreateReview` reflects
// that back as the accepted review's own id, so this component never
// hard-codes the demo id itself. Routing appends `?replay=1` only in fixture
// mode (src/lib/fixture-resolver.ts's page-URL flags), so the live view plays
// the simulated progression from stage 1.
//
// Loading state: <Button loading> — the shared static stepped ellipsis, never
// a spinner (hard rule). Error state: the endpoint, the status and the
// backend's own message, in the same <Field error> slot a bad shape uses, so
// a judge sees one place for "this did not work" either way.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Exhibit } from "@/components/chrome";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FIXTURES } from "@/lib/env";
import { useCreateReview } from "@/lib/hooks";
import type { ApiError } from "@/lib/api-types";
import { validatePrReference } from "./pr-validation";

export interface RunFormProps {
  /** `owner/repo#n` strings for the pre-warmed chips, demo PR first. */
  chips: string[];
  className?: string;
}

function formatApiError(error: ApiError): string {
  return `${error.method} ${error.path} · ${error.status} · ${error.message}`;
}

export function RunForm({ chips, className }: RunFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [shapeError, setShapeError] = useState<string | null>(null);
  const mutation = useCreateReview();

  // Arriving via "#run" (the nav CTA, the hero CTA, the close's own secondary
  // link) should land focus in the input, not just scroll the section into
  // view — the section id is on the outer <section>, this is the one control
  // inside it worth a keyboard user's next keystroke.
  useEffect(() => {
    const focusIfArrivingHere = () => {
      if (window.location.hash === "#run") inputRef.current?.focus();
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

  function onChipClick(chip: string) {
    setValue(chip);
    setShapeError(null);
    inputRef.current?.focus();
  }

  const error = shapeError ?? (mutation.isError ? formatApiError(mutation.error as ApiError) : undefined);

  return (
    <Exhibit
      index="09"
      category="Run a review"
      provenance="POST /v1/reviews → 202 + poll_url"
      density="compact"
      radius="container"
      padded
      className={className}
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
      >
        <Field label="Pull request" hint="owner/repo#42, or a GitHub pull request URL. Read-only — nothing is written to the PR." error={error}>
          <Input
            ref={inputRef}
            mono
            name="pr_url"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (shapeError) setShapeError(null);
            }}
            placeholder="https://github.com/owner/repo/pull/4821"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <span className="type-label text-text-dim">TRY</span>
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onChipClick(chip)}
              className="hover-ghost type-label rounded-[2px] border border-rule-2 px-2.5 py-1 text-text-dim"
            >
              {chip}
            </button>
          ))}
        </div>

        <div className="flex flex-col items-start gap-2">
          <Button type="submit" loading={mutation.isPending}>
            RUN A REVIEW →
          </Button>
          <p className="type-chip text-text-dim">typical run 41–78s · every stage visible as it happens</p>
        </div>
      </form>
    </Exhibit>
  );
}
