// /overview rendered from the real corpus with @/lib/hooks mocked: every row,
// card and call to action is a real link to the right place, and the window
// control re-scopes the headline.
import '../../ui/dom-polyfills';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { withNuqsTestingAdapter, type UrlUpdateEvent } from 'nuqs/adapters/testing';
import accuracy from '@fixtures/accuracy/report.json';
import series from '@fixtures/accuracy/series.json';
import audit from '@fixtures/audit/events.json';
import cost from '@fixtures/cost/summary.json';
import findingsFile from '@fixtures/findings/index.json';
import manifest from '@fixtures/manifest.json';
import reviews from '@fixtures/reviews/index.json';
import type { Finding, ReviewListItem } from '@/lib/api-types';
import type { RepoSummary } from '@/components/routes/repos/model';
import { CORPUS_NOW, pct } from '@/components/dash/format';
import { buildOverviewModel } from '@/components/routes/overview/model';

// /repos's summaries come from a server-only loader jsdom can't resolve (model.test.ts checks
// the real ones in node); here each corpus repository gets a minimal summary of the same shape.
const repoSummaries: RepoSummary[] = [...new Map(reviews.items.map((r) => [`${r.repository.owner}/${r.repository.name}`, r.repository])).values()].map(
  (ref, i) => ({
    ...ref,
    kind: 'fixture',
    description: '',
    language: 'python',
    visibility: 'private',
    defaultBranch: 'main',
    reviewedPulls: 3,
    openPulls: 2,
    blockedOpen: i % 2,
    provenBugs: i,
    lastGate: 'success',
    lastReviewedAt: '2026-09-22T12:00:00Z',
    weekly: [1, 2, 1, 3, 2, 1],
    medianSeconds: 28.7,
  }),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/overview',
}));

vi.mock('@/lib/hooks', () => ({
  useReviewList: () => ({ data: { items: reviews.items, page: { has_more: false }, totals: { matched: reviews.items.length } }, isPending: false, isError: false }),
  useAccuracy: () => ({ data: accuracy, isPending: false, isError: false }),
}));

const model = buildOverviewModel({
  now: CORPUS_NOW,
  runs: reviews.items as unknown as ReviewListItem[],
  findings: findingsFile.items as unknown as Finding[],
  weekly: series.weekly,
  stages: cost.per_stage,
  cache: cost.cache_hit,
  overrides: audit.items.filter((e) => e.event_type === 'override.break_glass').map((e) => e.created_at),
  provenFindingId: manifest.ids.proven_finding_id,
});

async function renderRoute(searchParams = '', onUrlUpdate?: (e: UrlUpdateEvent) => void) {
  const { OverviewRoute } = await import('@/components/routes/overview/OverviewRoute');
  return render(<OverviewRoute model={model} repos={repoSummaries} />, { wrapper: withNuqsTestingAdapter({ searchParams, onUrlUpdate }) });
}

describe('OverviewRoute', () => {
  it('headlines the proven count and re-scopes it with the window control, in the URL', async () => {
    const updates: string[] = [];
    await renderRoute('', (e) => updates.push(e.queryString));
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent(`${accuracy.proof.proven} bugs proven since 19 Aug.`);
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(h1).toHaveTextContent(`${model.windows['7d'].proof.proven} bugs proven in the last 7 days.`);
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
    await vi.waitFor(() => expect(updates.at(-1)).toBe('?window=7d'));
    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
    await vi.waitFor(() => expect(updates.at(-1)).toBe(''));
  });

  it('a reload keeps the window: ?window=30d renders the 30-day view', async () => {
    await renderRoute('?window=30d');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`${model.windows['30d'].proof.proven} bugs proven in the last 30 days.`);
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('an unknown window falls back to all time', async () => {
    await renderRoute('?window=90d');
    expect(screen.getByRole('button', { name: 'All time' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('never links to the unbuilt /cost page', async () => {
    const { container } = await renderRoute();
    expect(container.querySelector('a[href^="/cost"]')).toBeNull();
  });

  it('the photograph links to the demo proven finding', async () => {
    await renderRoute();
    expect(screen.getByRole('link', { name: /see a proof/i })).toHaveAttribute('href', `/findings/${manifest.ids.proven_finding_id}`);
  });

  it('every blocked PR is a link to its run, the demo run first', async () => {
    await renderRoute();
    const list = screen.getByRole('heading', { name: 'Needs attention' }).closest('div')!.parentElement!.parentElement!;
    const rows = within(list).getAllByRole('link');
    expect(rows).toHaveLength(model.windows.all.gate.stillBlocked);
    expect(rows[0]).toHaveAttribute('href', `/runs/${manifest.ids.demo_review_id}`);
    for (const r of rows) expect(r.getAttribute('href')).toMatch(/^\/runs\/[0-9a-f-]{36}$/);
  });

  it('repository cards link to /repos/<owner>/<name>', async () => {
    await renderRoute();
    for (const r of repoSummaries) {
      expect(screen.getByRole('link', { name: `${r.owner}/${r.name}` })).toHaveAttribute('href', `/repos/${r.owner}/${r.name}`);
    }
  });

  it('owns the one lime call to action, and links the funnel into /accuracy', async () => {
    await renderRoute();
    expect(screen.getByRole('link', { name: /new review/i })).toHaveAttribute('href', '/repos?new=1');
    expect(screen.getByRole('link', { name: 'Accuracy report' })).toHaveAttribute('href', '/accuracy');
  });

  it('annotates the noise filter with the self-report rates, each with its n', async () => {
    await renderRoute();
    const pp = accuracy.precision_proxies;
    const card = within(screen.getByRole('heading', { name: 'The noise filter' }).closest('[aria-labelledby="ov-noise"]') as HTMLElement);
    expect(card.getByText(`${pct(pp.self_caught_false_positive_rate.value, 1)} of ${pp.self_caught_false_positive_rate.n} proof runs`)).toBeInTheDocument();
    expect(card.getByText(`${accuracy.findings.per_review_published_mean.toFixed(2)} per review`)).toBeInTheDocument();
    expect(card.getByText(`${pct(pp.addressed_rate.value, 1)}`)).toBeInTheDocument();
    expect(card.getByText(new RegExp(`of ${pp.human_dismissal_rate.n} published findings`))).toBeInTheDocument();
    expect(card.getByText(new RegExp(`of ${pp.addressed_rate.n} findings on pull requests reviewed more than once`))).toBeInTheDocument();
  });
});
