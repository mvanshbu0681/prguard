'use client';
// The run's identity card: ids you can copy, the commits, how it was triggered
// and scored, when it ran, and its place in the pull request's history — the run
// it replaced or was replaced by, and the other runs on the same PR.
import Link from 'next/link';
import { Check, Copy, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { Card, GATE_COLOR, IconButton } from '@/components/dash/kit';
import { dateTime, relTime, sha } from '@/components/dash/format';
import type { ReviewListItem } from '@/lib/api-types';
import { cn } from '@/lib/utils';
import s from './run.module.css';

function CopyValue({ value, display, label }: { value: string; display: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className={s.copyVal}>
      <span className={s.mono} title={value}>
        {display}
      </span>
      <IconButton
        icon={copied ? Check : Copy}
        size="sm"
        label={copied ? 'Copied' : `Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            // Clipboard unavailable: the full value is still in the title tooltip.
          }
        }}
      />
    </span>
  );
}



function siblingOutcome(r: ReviewListItem, superseded: ReadonlySet<string>): string {
  if (superseded.has(r.review_id)) return 'superseded';
  if (r.status !== 'succeeded') return r.status;
  return r.gate_conclusion === 'failure' ? 'blocked' : r.gate_conclusion === 'success' ? 'clear' : 'neutral';
}

export interface RunMetaPanelProps {
  reviewId: string;
  headSha?: string | null;
  baseSha?: string | null;
  riskTier?: string | null;
  trigger?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  /** Other runs on the same pull request, oldest first. */
  siblings: ReviewListItem[];
  supersededBy?: ReviewListItem | null;
  supersedes?: ReviewListItem | null;
  /** Runs on this PR that a newer push replaced. */
  supersededIds?: ReadonlySet<string>;
  auditHref?: string | null;
  /** Laid out across the main column (two columns of facts) rather than in the side rail. */
  wide?: boolean;
  className?: string;
}

const TIER: Record<string, string> = { full: 'Full review', standard: 'Standard', trivial: 'Trivial' };
const TRIGGER: Record<string, string> = { webhook: 'GitHub webhook', rerun: 'Re-run', api: 'API' };

export function RunMetaPanel({
  reviewId,
  headSha,
  baseSha,
  riskTier,
  trigger,
  startedAt,
  finishedAt,
  siblings,
  supersededBy,
  supersedes,
  supersededIds = new Set(),
  auditHref,
  wide,
  className,
}: RunMetaPanelProps) {
  return (
    <Card tone="surface" pad="lg" className={cn(wide && s.metaCardWide, className)} as="section" aria-labelledby="meta-h">
      <h2 id="meta-h" className={s.panelTitle}>
        Run details
      </h2>
      <div className={s.metaGrid}>
        <dl className={s.meta}>
          <div>
            <dt>Run</dt>
            <dd>
              <CopyValue value={reviewId} display={`${reviewId.slice(0, 8)}…${reviewId.slice(-4)}`} label="run id" />
            </dd>
          </div>
          {headSha ? (
            <div>
              <dt>Head</dt>
              <dd>
                <CopyValue value={headSha} display={sha(headSha, 10)} label="head SHA" />
              </dd>
            </div>
          ) : null}
          {baseSha ? (
            <div>
              <dt>Base</dt>
              <dd>
                <CopyValue value={baseSha} display={sha(baseSha, 10)} label="base SHA" />
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Risk tier</dt>
            <dd>{riskTier ? (TIER[riskTier] ?? riskTier) : '—'}</dd>
          </div>
          <div>
            <dt>Trigger</dt>
            <dd>{trigger ? (TRIGGER[trigger] ?? trigger) : '—'}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{dateTime(startedAt)}</dd>
          </div>
          <div>
            <dt>Finished</dt>
            <dd>{finishedAt ? dateTime(finishedAt) : 'in progress'}</dd>
          </div>
          {supersedes ? (
            <div>
              <dt>Replaced</dt>
              <dd>
                <Link href={`/runs/${supersedes.review_id}`} className={s.metaLink}>
                  run {sha(supersedes.review_id, 8)}
                </Link>
              </dd>
            </div>
          ) : null}
          {supersededBy ? (
            <div>
              <dt>Replaced by</dt>
              <dd>
                <Link href={`/runs/${supersededBy.review_id}`} className={s.metaLink}>
                  run {sha(supersededBy.review_id, 8)}
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>

        <div className={s.metaSide}>
          {siblings.length ? (
            <div className={s.siblings}>
              <p className={s.pairLabel}>Other runs on this pull request</p>
              <ol>
                {siblings.map((r) => (
                  <li key={r.review_id}>
                    <Link href={`/runs/${r.review_id}`} className={s.sibling}>
                      <i
                        className={cn(s.sibDot, !r.gate_conclusion && s.sibDotHollow)}
                        style={r.gate_conclusion ? { background: GATE_COLOR[r.gate_conclusion] } : undefined}
                        aria-hidden
                      />
                      <span className={s.mono}>{sha(r.review_id, 8)}</span>
                      <span className={s.sibWhat}>{siblingOutcome(r, supersededIds)}</span>
                      <span className={s.sibWhen}>{relTime(r.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {auditHref ? (
            <Link href={auditHref} className={s.auditLink}>
              <ScrollText size={14} strokeWidth={1.9} aria-hidden />
              Audit trail for this run
            </Link>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
