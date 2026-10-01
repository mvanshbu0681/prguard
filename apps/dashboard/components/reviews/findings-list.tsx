import type { FindingItem } from "@contracts";
import { Collapsible } from "@/components/ui/collapsible";
import { SEVERITIES, SEVERITY_LABEL, SeverityDot } from "@/components/ui/severity";
import { FindingCard } from "./finding-card";

// Open findings first; fixed and dismissed ones keep their order after them.
function openFirst(findings: FindingItem[]): FindingItem[] {
  return [...findings.filter((f) => f.status === "open"), ...findings.filter((f) => f.status !== "open")];
}

export function FindingsList({ findings }: { findings: FindingItem[] }) {
  const visible = findings.filter((f) => f.placement !== "hidden");
  const hidden = openFirst(findings.filter((f) => f.placement === "hidden"));

  return (
    <div className="space-y-6">
      {SEVERITIES.map((severity) => {
        const group = openFirst(visible.filter((f) => f.severity === severity));
        if (group.length === 0) return null;
        return (
          <div key={severity}>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-dim">
              <SeverityDot severity={severity} />
              {SEVERITY_LABEL[severity]}
              <span className="tabular text-faint">{group.length}</span>
            </div>
            <div className="space-y-2">
              {group.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </div>
          </div>
        );
      })}

      {hidden.length > 0 && (
        <Collapsible variant="inline" title="Hidden nits" count={hidden.length}>
          <div className="space-y-2">
            {hidden.map((finding) => (
              <FindingCard key={finding.id} finding={finding} />
            ))}
          </div>
        </Collapsible>
      )}
    </div>
  );
}
