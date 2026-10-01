import type { CallItem, ImpactItem, ReviewDetail, ReviewTrace, TraceStep, TraceStepKey, TriageFileItem } from "@contracts";
import clsx from "clsx";
import type { ReactNode } from "react";
import { Collapsible } from "@/components/ui/collapsible";
import { InlineCode } from "@/components/ui/inline-code";
import { ReviewerIcon, RiskPill } from "@/components/ui/pills";
import { StatusLabel } from "@/components/ui/status";
import { compactNumber, plural, shortDuration } from "@/lib/format";

const STEP_ORDER: readonly TraceStepKey[] = [
  "fetch",
  "triage",
  "impact",
  "review",
  "checks",
  "verify",
  "learnings",
  "fixes",
  "publish",
];

// Reviewer and check ids to their names and badge ids (see components/ui/pills.tsx).
const REVIEWERS: Record<string, { name: string; badge: string }> = {
  general: { name: "Bug", badge: "general" },
  security: { name: "Security", badge: "security" },
  reliability: { name: "Reliability", badge: "reliability" },
  breaking: { name: "Breaking change", badge: "breaking" },
  performance: { name: "Performance", badge: "performance" },
  data: { name: "Data", badge: "data" },
  slop: { name: "AI slop", badge: "slop" },
  rules: { name: "Team rules", badge: "rules" },
  docs: { name: "Docs drift", badge: "docs" },
  tests: { name: "Test gap", badge: "tests" },
  secrets: { name: "Secrets", badge: "security" },
  "supply-chain": { name: "Supply chain", badge: "supply-chain" },
};

function reviewer(id: string): { name: string; badge: string } {
  return REVIEWERS[id] ?? { name: id, badge: id };
}

const FUNNEL = [
  ["raw", "Raw"],
  ["anchored", "Anchored"],
  ["confident", "Confident"],
  ["unique", "Unique"],
  ["fresh", "Fresh"],
  ["suppressed", "Suppressed"],
  ["rejected", "Rejected"],
  ["posted", "Posted"],
] as const satisfies readonly (readonly [keyof NonNullable<ReviewTrace["funnel"]>, string])[];

export function Trace({ review }: { review: Pick<ReviewDetail, "trace" | "triage" | "impact" | "calls"> }) {
  const { trace, triage, impact, calls } = review;
  if (trace.steps.length === 0) return null;

  const funnel = trace.funnel;
  const rejected = trace.rejected ?? [];
  const suppressed = trace.suppressed ?? [];

  return (
    <Collapsible title="Trace">
      <Steps steps={trace.steps} />
      {triage.length > 0 && (
        <Group title="Triage" count={triage.length}>
          <Triage files={triage} />
        </Group>
      )}
      {impact.length > 0 && (
        <Group title="Impact" count={impact.length}>
          <Impact items={impact} />
        </Group>
      )}
      {calls.length > 0 && (
        <Group title="Model calls" count={calls.length}>
          <Calls calls={calls} />
        </Group>
      )}
      {funnel && (
        <Group title="Funnel">
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 text-sm">
            {FUNNEL.map(([key, label]) => (
              <div key={key} className="flex items-baseline gap-1.5">
                <dt className="text-xs text-faint">{label}</dt>
                <dd className="text-body tabular">{funnel[key]}</dd>
              </div>
            ))}
          </dl>
        </Group>
      )}
      {rejected.length > 0 && (
        <Group title="Rejected" count={rejected.length}>
          <Dropped rows={rejected.map((r) => ({ title: r.title, path: r.path, reason: r.reason }))} />
        </Group>
      )}
      {suppressed.length > 0 && (
        <Group title="Suppressed" count={suppressed.length}>
          <Dropped rows={suppressed.map((s) => ({ title: s.title, path: s.path, reason: `Learning #${s.learningId}` }))} />
        </Group>
      )}
    </Collapsible>
  );
}

function Group({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="border-t border-line">
      <h3 className="flex h-9 items-center gap-2 border-b border-hair bg-surface-2/50 px-4 text-xs font-medium text-dim">
        {title}
        {count !== undefined && <span className="font-normal tabular text-faint">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

function stepRank(key: TraceStepKey): number {
  const i = STEP_ORDER.indexOf(key);
  return i === -1 ? STEP_ORDER.length : i;
}

function Steps({ steps }: { steps: TraceStep[] }) {
  const ordered = [...steps].sort((a, b) => stepRank(a.key) - stepRank(b.key));

  return (
    <table className="w-full text-sm">
      <tbody>
        {ordered.map((step, i) => {
          const failed = step.status === "failed";
          const skipped = step.status === "skipped";
          return (
            <tr key={`${step.key}-${i}`} className="border-b border-hair last:border-0">
              <td
                className={clsx(
                  "w-36 whitespace-nowrap px-4 py-2.5 align-top",
                  failed ? "text-err-text" : skipped ? "text-faint" : "text-primary",
                )}
              >
                {step.label}
              </td>
              <td className={clsx("py-2.5 pr-4 align-top", failed ? "text-err-text" : skipped ? "text-faint" : "text-body")}>
                {step.detail && <InlineCode text={step.detail} />}
              </td>
              <td className="w-24 whitespace-nowrap py-2.5 pr-4 text-right align-top tabular">
                {skipped ? <span className="text-faint">Skipped</span> : <span className="text-dim">{shortDuration(step.ms)}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Triage({ files }: { files: TriageFileItem[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {files.map((file) => (
          <tr key={file.path} className="border-b border-hair last:border-0">
            <td className="w-[38%] px-4 py-2.5 align-top font-mono text-xs leading-5 text-primary">
              <span className="break-all">{file.path}</span>
            </td>
            <td className="w-32 py-2.5 pr-4 align-top">
              <RiskPill risk={file.risk} />
            </td>
            <td className="py-2.5 pr-4 align-top">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-body">
                {file.reviewers.map((id) => {
                  const r = reviewer(id);
                  return (
                    <span key={id} className="inline-flex items-center gap-1">
                      <ReviewerIcon badge={r.badge} />
                      {r.name}
                    </span>
                  );
                })}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Impact({ items }: { items: ImpactItem[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {items.map((item) => (
          <tr key={`${item.path}:${item.line}:${item.name}`} className="border-b border-hair last:border-0">
            <td className="w-[38%] px-4 py-2.5 align-top font-mono text-xs leading-5 text-primary">
              <span className="break-all">{item.name}</span>
            </td>
            <td className="py-2.5 pr-4 align-top font-mono text-xs leading-5 text-dim">
              <span className="break-all">
                {item.path}:{item.line}
              </span>
            </td>
            <td className="whitespace-nowrap py-2.5 pr-4 text-right align-top text-xs leading-5 text-dim tabular">
              {plural(item.refs, "reference")} in {plural(item.files, "file")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type CallGroup = { key: string; name: string; badge: string | null; calls: CallItem[] };

// `reviewer:security` and `reviewer:security:final` group under Security; `triage`, `summary`, `verify` by name.
function groupCalls(calls: CallItem[]): CallGroup[] {
  const groups = new Map<string, CallGroup>();
  for (const call of calls) {
    const [head = "", sub] = call.purpose.split(":");
    const reviewerId = head === "reviewer" && sub ? sub : null;
    const key = reviewerId ? `reviewer:${reviewerId}` : head;
    let group = groups.get(key);
    if (!group) {
      const r = reviewerId ? reviewer(reviewerId) : null;
      const name = r ? r.name : head ? `${head.charAt(0).toUpperCase()}${head.slice(1)}` : "Other";
      group = { key, name, badge: r?.badge ?? null, calls: [] };
      groups.set(key, group);
    }
    group.calls.push(call);
  }
  return [...groups.values()];
}

function Calls({ calls }: { calls: CallItem[] }) {
  return (
    <table className="w-full text-sm">
      {groupCalls(calls).map((group) => (
        <tbody key={group.key}>
          <tr>
            <th colSpan={5} scope="colgroup" className="px-4 pb-1.5 pt-2.5 text-left text-xs font-medium text-dim">
              <span className="inline-flex items-center gap-1.5">
                {group.badge && <ReviewerIcon badge={group.badge} />}
                {group.name}
                <span className="font-normal tabular text-faint">{group.calls.length}</span>
              </span>
            </th>
          </tr>
          {group.calls.map((call, i) => (
            <tr key={i} className="border-t border-hair">
              <td className="whitespace-nowrap px-4 py-2.5 align-top font-mono text-xs leading-5 text-body">{call.model}</td>
              <td className="whitespace-nowrap py-2.5 pr-4 align-top text-xs leading-5 text-dim tabular">
                {compactNumber(call.tokensIn)} in <span className="text-faint">·</span> {compactNumber(call.tokensOut)} out
              </td>
              <td className="py-2.5 pr-4 align-top text-xs leading-5">
                <Tools tools={call.tools} />
              </td>
              <td className="w-20 whitespace-nowrap py-2.5 pr-4 text-right align-top text-xs leading-5 text-dim tabular">
                {shortDuration(call.ms)}
              </td>
              <td className="w-20 whitespace-nowrap py-2.5 pr-4 align-top text-xs leading-5">
                {call.ok ? <StatusLabel tone="ok" label="OK" /> : <StatusLabel tone="error" label="Failed" />}
              </td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

function Tools({ tools }: { tools: string[] }) {
  const counts = new Map<string, number>();
  for (const tool of tools) if (tool) counts.set(tool, (counts.get(tool) ?? 0) + 1);
  if (counts.size === 0) return null;

  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body">
      {[...counts].map(([tool, n]) => (
        <span key={tool} className="inline-flex items-center gap-1">
          <InlineCode text={`\`${tool}\``} />
          {n > 1 && <span className="tabular text-faint">{n}</span>}
        </span>
      ))}
    </span>
  );
}

function Dropped({ rows }: { rows: { title: string; path: string; reason: string }[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-hair last:border-0">
            <td className="w-[45%] px-4 py-2.5 align-top">
              <span className="block text-body">
                <InlineCode text={row.title} />
              </span>
              <span className="block break-all font-mono text-xs leading-5 text-dim">{row.path}</span>
            </td>
            <td className="py-2.5 pr-4 align-top text-dim">
              <InlineCode text={row.reason} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
