import type { FindingStatus as Status, Priority, RiskLevel } from "@contracts";
import clsx from "clsx";
import {
  Activity,
  Bug,
  ChevronDown,
  ChevronsUp,
  Database,
  Equal,
  FileText,
  FlaskConical,
  Gauge,
  ListChecks,
  Package,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Unplug,
  Zap,
  type LucideIcon,
} from "lucide-react";

// Same icons and hues as the badge images PR Guard posts on GitHub (scripts/badges/catalog.ts).
const REVIEWER: Record<string, { icon: LucideIcon; color: string }> = {
  general: { icon: Bug, color: "text-rev-general" },
  security: { icon: ShieldAlert, color: "text-rev-security" },
  reliability: { icon: Activity, color: "text-rev-reliability" },
  breaking: { icon: Unplug, color: "text-rev-breaking" },
  performance: { icon: Gauge, color: "text-rev-performance" },
  data: { icon: Database, color: "text-rev-data" },
  slop: { icon: Sparkles, color: "text-rev-slop" },
  rules: { icon: ListChecks, color: "text-rev-rules" },
  "supply-chain": { icon: Package, color: "text-rev-supply-chain" },
  docs: { icon: FileText, color: "text-rev-docs" },
  tests: { icon: FlaskConical, color: "text-rev-tests" },
};

export function ReviewerIcon({ badge, className }: { badge: string; className?: string }) {
  const r = REVIEWER[badge] ?? { icon: Bug, color: "text-dim" };
  const Icon = r.icon;
  return <Icon aria-hidden="true" className={clsx("size-3 shrink-0", r.color, className)} />;
}

export function ReviewerPill({ badge, name }: { badge: string; name: string }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border border-line bg-surface-2 px-1.5 text-xs text-body">
      <ReviewerIcon badge={badge} />
      {name}
    </span>
  );
}

const PRIORITY: Record<Priority, { label: string; icon: LucideIcon; tint: string }> = {
  p0: { label: "Urgent", icon: Zap, tint: "bg-prio-p0/12 text-prio-p0" },
  p1: { label: "High priority", icon: ChevronsUp, tint: "bg-prio-p1/12 text-prio-p1" },
  p2: { label: "Normal", icon: Equal, tint: "bg-prio-p2/12 text-prio-p2" },
  p3: { label: "Low priority", icon: ChevronDown, tint: "bg-prio-p3/12 text-prio-p3" },
};

export const PRIORITY_LABEL: Record<Priority, string> = { p0: "Urgent", p1: "High priority", p2: "Normal", p3: "Low priority" };

/** `P1 High priority`, or just `P1` when compact. */
export function PriorityPill({ priority, compact }: { priority: Priority; compact?: boolean }) {
  const p = PRIORITY[priority];
  const Icon = p.icon;
  return (
    <span className={clsx("inline-flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 text-xs font-medium tabular", p.tint)}>
      <Icon aria-hidden="true" className="size-3" />
      <span className="font-semibold">{priority.toUpperCase()}</span>
      {!compact && <span>{p.label}</span>}
    </span>
  );
}

const RISK: Record<RiskLevel, { label: string; icon: LucideIcon; tint: string }> = {
  low: { label: "Low risk", icon: ShieldCheck, tint: "bg-risk-low/12 text-risk-low" },
  medium: { label: "Medium risk", icon: Shield, tint: "bg-risk-medium/12 text-risk-medium" },
  high: { label: "High risk", icon: ShieldAlert, tint: "bg-risk-high/12 text-risk-high" },
};

export function RiskPill({ risk }: { risk: RiskLevel }) {
  const r = RISK[risk];
  const Icon = r.icon;
  return (
    <span className={clsx("inline-flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 text-xs font-medium", r.tint)}>
      <Icon aria-hidden="true" className="size-3" />
      {r.label}
    </span>
  );
}

const STATUS: Record<Status, { label: string; tint: string }> = {
  open: { label: "Open", tint: "border-line-2 text-dim" },
  fixed: { label: "Fixed", tint: "border-ok/40 text-ok-text" },
  dismissed: { label: "Dismissed", tint: "border-line-2 text-faint" },
};

export function FindingStatusPill({ status }: { status: Status }) {
  const s = STATUS[status];
  return <span className={clsx("inline-flex h-5 shrink-0 items-center rounded-sm border px-1.5 text-2xs", s.tint)}>{s.label}</span>;
}
