// A run's findings, grouped by what happened to them — the order a reviewer reads
// them in: what blocks the merge, what reached the PR as advice, what a rule hid,
// what Witness refuted itself, what the coordinator dropped, and (for a run that
// stopped early) what never got that far. Pure; no React.
import { PROOF_ENCODING, type ProofKey } from '@/components/dash/kit';
import type { Finding } from '@/lib/api-types';

export type OutcomeGroupKey = 'blocking' | 'advisory' | 'suppressed' | 'refuted' | 'dropped' | 'undelivered';

export interface OutcomeGroup {
  key: OutcomeGroupKey;
  title: string;
  /** One line on what the group means. */
  note: string;
  findings: Finding[];
  /** Collapsed until asked for. */
  collapsed: boolean;
}

const META: Record<OutcomeGroupKey, { title: string; note: string; collapsed: boolean }> = {
  blocking: {
    title: 'Proven — blocks the merge',
    note: 'A repro test passes at the base commit and fails at the head. Only these can hold the merge gate.',
    collapsed: false,
  },
  advisory: { title: 'Advisory', note: 'Posted to the pull request as comments. They inform the review; they never block it.', collapsed: false },
  suppressed: { title: 'Suppressed by a rule', note: 'Matched an existing suppression, so Witness kept it off the pull request.', collapsed: false },
  refuted: { title: 'Refuted by Witness', note: 'Witness ran its own repro, the claim did not hold, and it never reached the PR.', collapsed: false },
  dropped: { title: 'Dropped as noise', note: 'Speculation, nitpicks and duplicates the coordinator removed before scoring.', collapsed: true },
  undelivered: { title: 'Never delivered', note: 'The run stopped before these reached the delivery stage.', collapsed: false },
};

const ORDER: OutcomeGroupKey[] = ['blocking', 'advisory', 'suppressed', 'refuted', 'dropped', 'undelivered'];

export function outcomeKey(f: Finding): OutcomeGroupKey {
  if (f.status === 'published') return f.blocking ? 'blocking' : 'advisory';
  if (f.status === 'suppressed') return 'suppressed';
  if (f.status === 'disproven') return 'refuted';
  if (f.status === 'dropped') return 'dropped';
  return 'undelivered';
}

/** Highest computed severity first; unscored findings last, then by title. */
export function bySeverity(a: Finding, b: Finding): number {
  const sa = a.severity?.score ?? -1;
  const sb = b.severity?.score ?? -1;
  if (sa !== sb) return sb - sa;
  return a.title.localeCompare(b.title);
}

export function groupFindings(findings: readonly Finding[]): OutcomeGroup[] {
  const buckets = new Map<OutcomeGroupKey, Finding[]>();
  for (const f of findings) {
    const k = outcomeKey(f);
    const list = buckets.get(k);
    if (list) list.push(f);
    else buckets.set(k, [f]);
  }
  return ORDER.filter((k) => buckets.has(k)).map((k) => ({ key: k, ...META[k], findings: buckets.get(k)!.sort(bySeverity) }));
}

/** `app/billing/charge.py:41` */
export function locationLabel(f: Finding): string {
  const line = f.location.start_line ?? f.location.end_line;
  return line != null ? `${f.location.file_path}:${line}` : f.location.file_path;
}

/** Split a finding title on its backtick spans, so code renders as code without any HTML injection. */
export function tickParts(text: string): { code: boolean; text: string }[] {
  const out: { code: boolean; text: string }[] = [];
  const re = /`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ code: false, text: text.slice(last, m.index) });
    out.push({ code: true, text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ code: false, text: text.slice(last) });
  return out;
}

export interface ProofTally {
  proven: number;
  refuted: number;
  inconclusive: number;
  /** Proofs that did not run: not attempted, not applicable, or no environment. */
  unrun: number;
  attempted: number;
}

/** What the proof stage did across the findings that reached it (dropped findings never do). */
export function proofTally(findings: readonly Finding[]): ProofTally {
  const t: ProofTally = { proven: 0, refuted: 0, inconclusive: 0, unrun: 0, attempted: 0 };
  for (const f of findings) {
    if (f.status === 'dropped') continue;
    const st = f.proof?.status;
    if (st === 'proven') t.proven++;
    else if (st === 'disproven') t.refuted++;
    else if (st === 'inconclusive') t.inconclusive++;
    else t.unrun++;
  }
  t.attempted = t.proven + t.refuted + t.inconclusive;
  return t;
}

/**
 * The proof mix of the findings that survived the coordinator (dropped ones never
 * reach the proof stage), in the product's proof encoding order — the segments
 * of every proof bar and legend on the run page.
 */
export function proofMix(findings: readonly Finding[]): { key: ProofKey; n: number }[] {
  const counts = new Map<ProofKey, number>();
  for (const f of findings) {
    if (f.status === 'dropped') continue;
    const k = (f.proof?.status ?? 'not_attempted') as ProofKey;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return PROOF_ENCODING.filter((p) => counts.has(p.key)).map((p) => ({ key: p.key, n: counts.get(p.key)! }));
}
