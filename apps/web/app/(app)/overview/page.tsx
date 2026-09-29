// /overview — a thin Server Component. The fixture-only shapes the page needs
// (weekly proof composition, per-stage latency, the cache series, every
// finding for the noise filter) have no live endpoint, so they are read here
// with the server-only loaders and folded into one serialisable view model
// (src/components/routes/overview/model.ts). The repository cards read
// /repos's own summaries (routes/repos/data.server, read-only) so both pages
// print the same numbers. The live run list and the accuracy self-report stay
// client-side, through @/lib/hooks.
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { OverviewRoute } from '@/components/routes/overview';
import { buildOverviewModel } from '@/components/routes/overview/model';
import { fixtureRepoSummaries } from '@/components/routes/repos/data.server';
import { CORPUS_NOW } from '@/components/dash/format';
import { getAccuracySeries, getAuditChain, getCostSummary, getFindings, getManifest, getReviewsIndex } from '@/lib/fixtures';

export const metadata: Metadata = { title: 'Overview' };

export default async function Page() {
  // The time window is in the URL (?window=7d|30d, read by nuqs in the client
  // route): render per request so a reload paints the chosen window server-side
  // instead of bailing the whole page out to the client.
  await connection();
  const cost = getCostSummary();
  const model = buildOverviewModel({
    now: CORPUS_NOW,
    runs: getReviewsIndex().items,
    findings: getFindings(),
    weekly: getAccuracySeries().weekly,
    stages: cost.per_stage,
    cache: cost.cache_hit,
    overrides: getAuditChain()
      .items.filter((e) => e.event_type === 'override.break_glass')
      .map((e) => e.created_at),
    provenFindingId: getManifest().ids.proven_finding_id,
  });
  return <OverviewRoute model={model} repos={fixtureRepoSummaries()} />;
}
