import type { ReviewStage, ReviewStatus } from "@contracts";
import clsx from "clsx";
import { Check } from "lucide-react";

const STEPS = [
  { stage: "fetching", label: "Fetching" },
  { stage: "summarizing", label: "Summarizing" },
  { stage: "reviewing", label: "Reviewing" },
  { stage: "publishing", label: "Publishing" },
] as const satisfies readonly { stage: ReviewStage; label: string }[];

function currentIndex(status: ReviewStatus, stage: ReviewStage): number {
  if (status === "queued" || stage === "queued") return -1;
  if (stage === "done") return STEPS.length;
  return STEPS.findIndex((s) => s.stage === stage);
}

export function ReviewProgress({ status, stage }: { status: ReviewStatus; stage: ReviewStage }) {
  const current = currentIndex(status, stage);

  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Review progress">
      {STEPS.map((step, i) => {
        const state = i < current ? "done" : i === current ? "current" : "pending";
        return (
          <li key={step.stage} aria-current={state === "current" ? "step" : undefined}>
            <div className="relative h-0.5 overflow-hidden rounded-full bg-line">
              {state === "done" && <div className="absolute inset-0 bg-accent/55" />}
              {state === "current" && (
                <>
                  <div className="absolute inset-0 bg-accent/20" />
                  <div className="absolute inset-y-0 left-0 w-2/5 animate-progress bg-accent" />
                </>
              )}
            </div>
            <div
              className={clsx(
                "mt-2.5 flex items-center gap-1.5 text-xs",
                state === "done" && "text-dim",
                state === "current" && "font-medium text-accent-text",
                state === "pending" && "text-faint",
              )}
            >
              {state === "done" ? (
                <Check className="size-3 text-accent" aria-hidden="true" />
              ) : (
                <span className="tabular text-2xs text-faint">{i + 1}</span>
              )}
              {step.label}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
