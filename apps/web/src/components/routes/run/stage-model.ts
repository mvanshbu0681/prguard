// The nine-stage rail's model: which state each stage is in, how long it took (or
// typically takes), how wide it draws, and how far a live stage has got. Pure, so
// the rail's arithmetic is testable without a DOM.
import type { LucideIcon } from 'lucide-react';
import { Combine, FingerprintPattern, FlaskConical, FolderTree, Gauge, MessageSquareText, ShieldCheck, Users, Webhook } from 'lucide-react';
import { STAGES, type Stage, type StageState } from '@/lib/contracts';

export interface StageMeta {
  name: string;
  icon: LucideIcon;
  /** What the stage does, in the present tense — the live caption when the API sends no label. */
  doing: string;
}

/** Same names and glyphs as the landing's pipeline section (src/components/v2/pipeline). */
export const STAGE_META: Record<Stage, StageMeta> = {
  ingest: { name: 'Ingest', icon: Webhook, doing: 'Resolving the pull request and fetching the diff' },
  context: { name: 'Context', icon: FolderTree, doing: 'Building review context from the changed files' },
  specialists: { name: 'Specialists', icon: Users, doing: 'Bugs, security, tests and quality read the diff in parallel' },
  coordinator: { name: 'Coordinator', icon: Combine, doing: 'Merging the four passes and dropping noise' },
  severity: { name: 'Severity', icon: Gauge, doing: 'Scoring every finding from its stored inputs' },
  identity: { name: 'Identity', icon: FingerprintPattern, doing: 'Fingerprinting findings and checking the suppression ledger' },
  proof: { name: 'Proof', icon: FlaskConical, doing: 'Running repro tests at the base and head commits' },
  delivery: { name: 'Delivery', icon: MessageSquareText, doing: 'Posting comments and setting the merge gate' },
  finalise: { name: 'Finalise', icon: ShieldCheck, doing: 'Recomputing counters and sealing the audit chain' },
};

/** The four specialist passes, drawn as parallel lanes inside the specialists stage. */
export const SPECIALIST_LANES = [
  { key: 'bugs', initials: 'BG', name: 'Bugs' },
  { key: 'security', initials: 'SC', name: 'Security' },
  { key: 'tests', initials: 'TS', name: 'Tests' },
  { key: 'quality', initials: 'QA', name: 'Quality' },
] as const;

export type DurationKind = 'recorded' | 'typical';

export interface StageView {
  key: Stage;
  /** 1-based. */
  index: number;
  meta: StageMeta;
  state: StageState;
  /** Milliseconds this stage took (recorded) or typically takes (the workspace p50). */
  ms: number | null;
  kind: DurationKind | null;
  /** Flex weight for the rail: the stage's share of the run's time. */
  weight: number;
}

export function stageViews(
  states: readonly { key: Stage; state: StageState }[],
  recordedMs?: Partial<Record<Stage, number>> | null,
  typicalMs?: Partial<Record<Stage, number>> | null,
): StageView[] {
  const byKey = new Map(states.map((s) => [s.key, s.state]));
  return STAGES.map((key, i) => {
    const rec = recordedMs?.[key];
    const typ = typicalMs?.[key];
    const ms = rec != null && Number.isFinite(rec) ? rec : typ != null && Number.isFinite(typ) ? typ : null;
    return {
      key,
      index: i + 1,
      meta: STAGE_META[key],
      state: byKey.get(key) ?? 'pending',
      ms,
      kind: rec != null ? 'recorded' : typ != null ? 'typical' : null,
      weight: ms != null && ms > 0 ? ms : 1,
    };
  });
}

/** `1.84s`, `90ms`, `14.3s` — the rail's own compact duration. */
export function stageDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(2)}s` : `${s.toFixed(1)}s`;
}

/**
 * How far the running stage has got, 0–1: the seconds it has been running over the
 * seconds it is expected to take. Capped short of 1 so a slow stage never reads as
 * done before the API says so.
 */
export function stageProgress(elapsedInStageS: number | null, expectedMs: number | null | undefined): number {
  if (elapsedInStageS == null || expectedMs == null || !(expectedMs > 0)) return 0;
  return Math.max(0, Math.min(0.94, (elapsedInStageS * 1000) / expectedMs));
}

/** Σ of every stage's time, or null when nothing is known. */
export function totalMs(views: readonly StageView[]): number | null {
  const known = views.filter((v) => v.ms != null);
  return known.length ? known.reduce((a, v) => a + (v.ms ?? 0), 0) : null;
}
