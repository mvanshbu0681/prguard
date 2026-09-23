// OWNER: T1a (wave 1). Stub from T0 — replace entirely.
// Contents transcribed from plan §5. The four wave-2 components agree on these
// signatures BEFORE any of them is written; frozen after wave 1 merges (only
// T1a may change it).

import type { SEVERITY_INPUTS, STAGES, StageState } from '@/lib/contracts';

// TODO(T2/T1a): replace with the generated client types once `src/api/**` exists.
// In web/openapi/openapi.json these are components.schemas.FindingProof and
// components.schemas.AuditItem (the element of GET /v1/audit → AuditList; plan §5
// calls it AuditEvent). `unknown` until then so nothing depends on a guessed shape.
export type FindingProof = unknown;
export type AuditEvent = unknown;

export type Density = 'glyph' | 'compact' | 'detail';

export interface ProofBenchProps {
  proof: FindingProof;              // from the generated client
  density: Exclude<Density, 'glyph'>;
  mode?: 'static' | 'replay';       // 'static' renders frame 0 — this is the day-1 deliverable
  onReplayEnd?: () => void;
}

export interface ContributionBarProps {
  score: number;
  inputs: Record<(typeof SEVERITY_INPUTS)[number], number>;
  weights: Record<(typeof SEVERITY_INPUTS)[number], number>;
  density: Density;
}

export interface ChainRailProps {
  events: AuditEvent[];
  verified: boolean;
  brokenAtSeq?: number | null;
  tamperable?: boolean;             // false on marketing until T8 opts in
}

export interface StageRailProps {
  stages: { key: (typeof STAGES)[number]; state: StageState; ms?: number }[];
  orientation: 'horizontal' | 'vertical';
  mode: 'live' | 'replay' | 'static';
}
