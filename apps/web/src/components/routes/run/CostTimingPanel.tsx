'use client';
// Cost & time: what this review cost against the workspace's typical review, how
// long it took against the median, where the tokens went (and how much the cache
// saved), and how much of the pull request it read. Numbers print what the API
// gave; a missing one prints — , never an invented zero.
import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, TriangleAlert } from 'lucide-react';
import { Card, Ring, Tag } from '@/components/dash/kit';
import { usd } from '@/components/dash/format';
import type { ContextInfo, CostInfo, TimingInfo } from '@/lib/api-types';
import { cacheHitShare, formatDurationSeconds, formatPercent, formatTokenCount, NO_VALUE } from './format';
import s from './run.module.css';

/** `+45%` against a reference; null when either side is missing. */
export function relativeDelta(value: number | null | undefined, ref: number | null | undefined): { value: string; direction: 'up' | 'down' | 'flat' } | null {
  if (value == null || ref == null || !Number.isFinite(value) || !(ref > 0)) return null;
  const d = value / ref - 1;
  const pctv = Math.round(d * 100);
  if (pctv === 0) return { value: '0%', direction: 'flat' };
  return { value: `${pctv > 0 ? '+' : ''}${pctv}%`, direction: pctv > 0 ? 'up' : 'down' };
}

/** A quiet comparison: informational, so it never borrows the verdict's red. */
function Versus({ d, children }: { d: NonNullable<ReturnType<typeof relativeDelta>>; children: ReactNode }) {
  const Arrow = d.direction === 'up' ? ArrowUpRight : d.direction === 'down' ? ArrowDownRight : Minus;
  return (
    <p className={s.pairRef}>
      <span className={s.versus}>
        <Arrow size={12} strokeWidth={2.2} aria-hidden />
        {d.value.replace(/^\+/, '')}
      </span>
      <span>{d.direction === 'up' ? 'above' : d.direction === 'down' ? 'below' : 'same as'} {children}</span>
    </p>
  );
}

export interface CostTimingPanelProps {
  cost: CostInfo | null | undefined;
  timing: TimingInfo | null | undefined;
  context: ContextInfo | null | undefined;
  degradations: readonly string[];
  /** The workspace's p50 review cost (GET /v1/cost). */
  costP50?: number | null;
  /** The median wall clock of finished reviews in the list. */
  durationMedian?: number | null;
  className?: string;
}

export function CostTimingPanel({ cost, timing, context, degradations, costP50, durationMedian, className }: CostTimingPanelProps) {
  const hit = cost ? cacheHitShare(cost.cache_read_tokens, cost.input_tokens) : null;
  const costD = relativeDelta(cost?.usd_estimate, costP50);
  const timeD = relativeDelta(timing?.duration_seconds, durationMedian);
  const excluded = Object.entries(context?.excluded_reasons ?? {});
  return (
    <Card tone="surface" pad="lg" className={className} as="section" aria-labelledby="cost-h">
      <h2 id="cost-h" className={s.panelTitle}>
        Cost &amp; time
      </h2>
      <div className={s.pair}>
        <div>
          <p className={s.pairLabel}>Estimated cost</p>
          <p className={s.pairValue}>{cost?.usd_estimate != null ? usd(cost.usd_estimate) : NO_VALUE}</p>
          {costD ? <Versus d={costD}>the {usd(costP50)} typical</Versus> : null}
        </div>
        <div>
          <p className={s.pairLabel}>Wall clock</p>
          <p className={s.pairValue}>{formatDurationSeconds(timing?.duration_seconds)}</p>
          {timeD ? <Versus d={timeD}>the {formatDurationSeconds(durationMedian)} median</Versus> : null}
        </div>
      </div>

      {cost && (cost.input_tokens || cost.output_tokens || cost.cache_read_tokens) ? (
        <div className={s.tokens}>
          <dl className={s.tokenList}>
            <div>
              <dt>Input</dt>
              <dd>{formatTokenCount(cost.input_tokens)}</dd>
            </div>
            <div>
              <dt>Output</dt>
              <dd>{formatTokenCount(cost.output_tokens)}</dd>
            </div>
            <div>
              <dt>Cache read</dt>
              <dd>{formatTokenCount(cost.cache_read_tokens)}</dd>
            </div>
          </dl>
          {hit != null ? (
            <Ring value={hit} size={76} thickness={8} color="var(--w-text)" label={`${formatPercent(hit)} of input served from cache`}>
              <span className={s.ringText}>
                <b>{formatPercent(hit)}</b>
                <small>cached</small>
              </span>
            </Ring>
          ) : null}
        </div>
      ) : (
        <p className={s.panelNote}>No tokens billed for this run.</p>
      )}

      {context ? (
        <p className={s.panelNote}>
          Read <b>{context.files_reviewed ?? NO_VALUE}</b> of {context.files_changed ?? NO_VALUE} changed files
          {excluded.length ? (
            <>
              {' · '}
              {excluded.map(([path, why], i) => (
                <span key={path}>
                  {i ? ', ' : ''}
                  <span className={s.mono}>{path}</span> left out ({why})
                </span>
              ))}
            </>
          ) : null}
          {context.truncated ? ' · context truncated' : ''}
        </p>
      ) : null}

      {degradations.length ? (
        <div className={s.degradations}>
          {degradations.map((d, i) => (
            <Tag key={`${d}-${i}`} tone="warn" size="sm" icon={TriangleAlert}>
              {d.replaceAll('_', ' ')}
            </Tag>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
