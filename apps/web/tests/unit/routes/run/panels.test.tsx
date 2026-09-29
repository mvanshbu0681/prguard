// The run page's components: the delivery accounting is computed and fails
// visibly; the verdict says what holds the merge; Re-run stays focusable (never a
// native `disabled`) while the rerun is in flight; the cost panel compares against
// the workspace without inventing numbers.
import '../../ui/dom-polyfills';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { relativeDelta } from '@/components/routes/run/CostTimingPanel';
import { DeliveryPanel } from '@/components/routes/run/DeliveryPanel';
import { RunHero, VerdictCard, withPeriod } from '@/components/routes/run/RunHero';
import type { DeliveryInfo, GateInfo } from '@/lib/api-types';

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img alt="" src={String(props.src)} />,
}));

const delivery: DeliveryInfo = {
  status: 'posted',
  event: 'COMMENT',
  comments_posted: 3,
  ladder_breakdown: { inline_exact: 1, inline_nearest: 1, file_level: 1, summary_only: 0 },
};
const gate: GateInfo = { conclusion: 'failure', delivery: 'commit_status', context_name: 'witness/merge-gate', reason: '1 blocking finding' };

describe('DeliveryPanel', () => {
  it('accounts for every published finding: 3 published · 3 delivered · 0 silently dropped', () => {
    render(<DeliveryPanel delivery={delivery} gate={gate} published={3} />);
    expect(screen.getByText(/3 published · 3 delivered · 0 silently dropped/)).toBeInTheDocument();
    expect(screen.getByText('3 inline comments')).toBeInTheDocument();
    expect(screen.getByText(/1 exact line · 1 nearest line · 1 file level/)).toBeInTheDocument();
    expect(screen.getByText(/as a commit status/)).toBeInTheDocument();
  });

  it('says so when the ladder and the published count disagree', () => {
    render(<DeliveryPanel delivery={{ ...delivery, ladder_breakdown: { inline_exact: 1 } }} gate={gate} published={3} />);
    expect(screen.getByText(/2 unaccounted/)).toBeInTheDocument();
    expect(screen.queryByText(/silently dropped/)).not.toBeInTheDocument();
  });

  it('reads "Nothing" for a run that never reached delivery', () => {
    render(<DeliveryPanel delivery={null} gate={null} published={0} />);
    expect(screen.getByText(/pull request was left untouched/)).toBeInTheDocument();
  });
});

describe('VerdictCard', () => {
  it('blocked: the proven count, the advisory remainder and a link to the blocking finding', () => {
    render(<VerdictCard v={{ kind: 'blocked', blocking: 1, advisory: 2, contextName: 'witness/merge-gate', delivery: 'commit_status', findingHref: '/findings/a91f' }} />);
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getByText('1 proven bug blocks this merge.')).toBeInTheDocument();
    expect(screen.getByText('2 more are advisory.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the blocking finding' })).toHaveAttribute('href', '/findings/a91f');
  });

  it('clear and live read as themselves', () => {
    const { rerender } = render(<VerdictCard v={{ kind: 'clear', advisory: 2, contextName: 'witness/merge-gate', delivery: 'check_run' }} />);
    expect(screen.getByText('Clear')).toBeInTheDocument();
    expect(screen.getByText('No proven bug blocks this merge.')).toBeInTheDocument();
    rerender(<VerdictCard v={{ kind: 'live', elapsed: '12s', stageIndex: 3, stageName: 'Specialists', stageLabel: 'Running 4 specialist passes', queued: false }} />);
    expect(screen.getByText('12s')).toBeInTheDocument();
    expect(screen.getByText('Stage 3 of 9 · Specialists')).toBeInTheDocument();
  });
});

function Hero({ pending, onRerun = () => {} }: { pending: boolean; onRerun?: () => void }) {
  return (
    <RunHero
      repoLabel="acme/checkout-service"
      repoName="checkout-service"
      prNumber={4821}
      prTitle="Resolve account currency at charge time"
      prAuthor="mhollis"
      prUrl="https://github.com/acme/checkout-service/pull/4821"
      baseSha="7c41a09e3b5d2f8a1c6e4b9d7f0a2c5e8b3d6f19"
      headSha="9c2d4b1f6a8e3c5d7b9f1a2e4c6d8b0f3a5c7e92"
      triggerLabel="Webhook"
      riskLabel="Full review"
      timeLabel="Finished 13m ago · 41.2s"
      onRerun={onRerun}
      rerunPending={pending}
      replayHref="/runs/x?replay=1"
      verdict={{ kind: 'loading' }}
      artefacts={null}
    />
  );
}

describe('RunHero', () => {
  it('names the pull request and links it on GitHub', () => {
    render(<Hero pending={false} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Resolve account currency at charge time.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View on GitHub/i })).toHaveAttribute('href', 'https://github.com/acme/checkout-service/pull/4821');
    expect(screen.getByText('7c41a09')).toBeInTheDocument();
    expect(screen.getByText('9c2d4b1')).toBeInTheDocument();
  });

  it('keeps Re-run in the tab order while pending — aria-disabled + aria-busy, never `disabled` — and ignores clicks', async () => {
    const user = userEvent.setup();
    const onRerun = vi.fn();
    const { rerender } = render(<Hero pending={false} onRerun={onRerun} />);
    const btn = screen.getByRole('button', { name: /Re-run/i });
    await user.click(btn);
    expect(onRerun).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(btn);

    rerender(<Hero pending onRerun={onRerun} />);
    expect(btn.isConnected).toBe(true);
    expect(btn).not.toHaveAttribute('disabled');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(document.activeElement).toBe(btn);
    await user.click(btn);
    expect(onRerun).toHaveBeenCalledTimes(1);
  });
});

describe('relativeDelta', () => {
  it('compares against the workspace reference, and prints nothing without one', () => {
    expect(relativeDelta(1.4496, 0.9982)).toEqual({ value: '+45%', direction: 'up' });
    expect(relativeDelta(20.6, 28.9)).toEqual({ value: '-29%', direction: 'down' });
    expect(relativeDelta(1, 1)).toEqual({ value: '0%', direction: 'flat' });
    expect(relativeDelta(null, 1)).toBeNull();
    expect(relativeDelta(1, 0)).toBeNull();
  });
});

describe('withPeriod', () => {
  it('ends a page title with a period, once', () => {
    expect(withPeriod('Analytics consent banner')).toBe('Analytics consent banner.');
    expect(withPeriod('Already done.')).toBe('Already done.');
    expect(withPeriod('Is this a question?')).toBe('Is this a question?');
  });
});

describe('RunNotFound', () => {
  it('answers a 404 with an h1, the id and the way back — never a Retry', async () => {
    const { RunNotFound } = await import('@/components/routes/run/RunView');
    render(<RunNotFound id="does-not-exist" />);
    expect(screen.getByRole('heading', { level: 1, name: 'No review with that id.' })).toBeInTheDocument();
    expect(screen.getByText('does-not-exist')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /All reviews/i })).toHaveAttribute('href', '/runs');
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });
});
