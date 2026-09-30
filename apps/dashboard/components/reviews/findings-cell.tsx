import type { ReviewListItem } from "@contracts";
import { Check } from "lucide-react";
import { SEVERITIES, SeverityPill } from "@/components/ui/severity";

const MAX_PILLS = 3;

export function FindingsCell({ review }: { review: Pick<ReviewListItem, "counts" | "status" | "reviewed"> }) {
  const present = SEVERITIES.filter((s) => review.counts[s] > 0);

  if (present.length > 0) {
    const shown = present.slice(0, MAX_PILLS);
    const rest = present.slice(MAX_PILLS).reduce((n, s) => n + review.counts[s], 0);
    return (
      <span className="flex min-w-0 items-center gap-1">
        {shown.map((s) => (
          <SeverityPill key={s} severity={s} count={review.counts[s]} />
        ))}
        {rest > 0 && <span className="pl-0.5 text-xs text-faint tabular">+{rest}</span>}
      </span>
    );
  }

  if (review.status === "completed" && !review.reviewed) return <span className="text-dim">Summary</span>;

  if (review.status === "completed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-dim">
        <Check className="size-3.5 text-ok" aria-hidden="true" />
        Clean
      </span>
    );
  }

  return <span className="text-faint">—</span>;
}
