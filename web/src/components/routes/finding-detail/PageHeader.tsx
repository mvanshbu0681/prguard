// OWNER: d3 (wave 3). /findings/[id]'s page header (dashboard-blueprint §2.7
// "Header"): title, StatusBadge, ProofChip, a BLOCKED GateChip when blocking,
// severity score + band, category, specialist, rule_key, created.
import { GateChip, ProofChip, SeverityMeter, StatusBadge } from "@/components/badges";
import { chipLabel } from "@/components/badges";
import type { Finding } from "@/lib/api-types";
import { BackLink } from "./BackLink";
import { TitleWithCode } from "./TitleWithCode";

function formatAbsoluteUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

const META_LABEL = "type-label text-text-dim";
const META_VALUE = "type-data break-words text-text-body";

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className={META_LABEL}>{label}</span>
      <span className={META_VALUE}>{children}</span>
    </div>
  );
}

export function PageHeader({ finding }: { finding: Finding }) {
  return (
    <header className="flex flex-col gap-5 pb-6">
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="type-display-h3 max-w-(--measure-body) text-text-primary">
          <TitleWithCode title={finding.title} />
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={finding.status} />
          {finding.proof ? <ProofChip status={finding.proof.status} /> : null}
          {finding.blocking ? <GateChip conclusion="failure" /> : null}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={META_LABEL}>Severity</span>
          {finding.severity ? (
            <SeverityMeter score={finding.severity.score} band={finding.severity.band} density="inline" />
          ) : (
            <span className={META_VALUE}>not scored</span>
          )}
        </div>
        <MetaItem label="Category">{chipLabel(finding.category)}</MetaItem>
        <MetaItem label="Specialist">{finding.specialist ?? "—"}</MetaItem>
        <MetaItem label="Rule">{finding.rule_key}</MetaItem>
        <MetaItem label="Created">
          <time dateTime={finding.created_at}>{formatAbsoluteUtc(finding.created_at)}</time>
        </MetaItem>
        <MetaItem label="Finding id">{finding.id.slice(0, 8)}</MetaItem>
      </dl>
    </header>
  );
}
