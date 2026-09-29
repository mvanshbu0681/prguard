// The dashboard's route-group layout. data-surface="app" scopes the dashboard
// overrides. The persisted theme, contrast, density and rail state reach <html>
// before first paint from the root layout's <head> (src/components/dash/prepaint.ts).
// <MotionProvider> is the dashboard's Motion runtime (LazyMotion).
// AppShell owns the rail, the frame, the top bar and every overlay.
import type { ReactNode } from 'react';
import { MotionProvider } from '@/motion/motion';
import { AppShell } from '@/components/app-shell';
import { FIXTURES } from '@/lib/env';
import { getAccuracy, getManifest, getReviewsIndex } from '@/lib/fixtures';

function shellCounts() {
  if (!FIXTURES) return undefined;
  const { counts, ids } = getManifest();
  const byStatus = (counts as unknown as { findings_by_status?: Record<string, number> }).findings_by_status ?? {};
  const runs = [...getReviewsIndex().items].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const top = runs[0];
  // PRs whose latest run is held by the gate right now.
  const latestPerPr = new Map<string, (typeof runs)[number]>();
  for (const r of runs) {
    const key = `${r.repository.owner}/${r.repository.name}#${r.pull_request.number}`;
    if (!latestPerPr.has(key) && r.status === 'succeeded') latestPerPr.set(key, r);
  }
  const blocked = [...latestPerPr.values()].filter((r) => r.gate_conclusion === 'failure').length;
  return {
    latest: top
      ? {
          id: top.review_id,
          repo: top.repository.name,
          number: top.pull_request.number,
          title: top.pull_request.title ?? `Pull request #${top.pull_request.number}`,
          gate: (top.gate_conclusion ?? null) as 'failure' | 'success' | 'neutral' | null,
          when: top.created_at,
        }
      : undefined,
    blocked,
    org: ids.repository.owner,
    repositories: counts.repositories,
    runs: counts.runs,
    findings: byStatus.published,
    suppressions: byStatus.suppressed,
    proven: getAccuracy().proof.proven ?? 0,
  };
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div data-surface="app" className="min-h-dvh">
      <MotionProvider>
        <AppShell counts={shellCounts()}>{children}</AppShell>
      </MotionProvider>
    </div>
  );
}
