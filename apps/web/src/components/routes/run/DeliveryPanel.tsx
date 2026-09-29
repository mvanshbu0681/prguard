'use client';
// What Witness wrote to GitHub for this run: the inline comments (and which rung
// of the comment ladder each landed on), the summary review, and the merge-gate
// check. The accounting line is computed, not asserted: published findings must
// equal comments delivered, and if they ever disagree it says so in red.
import { Check, FileText, MessageSquareText, ShieldCheck, Square, TriangleAlert } from 'lucide-react';
import { Button, Card, Tag } from '@/components/dash/kit';
import type { DeliveryInfo, Finding, GateInfo } from '@/lib/api-types';
import { DELIVERY_MODES, type DeliveryMode } from '@/lib/contracts';
import { cn } from '@/lib/utils';
import { ladderTotal, ladderUnaccounted } from './format';
import s from './run.module.css';

const RUNG_LABEL: Record<Exclude<DeliveryMode, 'not_delivered'>, string> = {
  inline_exact: 'exact line',
  inline_nearest: 'nearest line',
  file_level: 'file level',
  summary_only: 'summary only',
};
const RUNGS = DELIVERY_MODES.filter((m): m is Exclude<DeliveryMode, 'not_delivered'> => m !== 'not_delivered');

const GATE_VIA: Record<string, string> = { check_run: 'check run', commit_status: 'commit status', dry_run: 'dry run (not written)' };
const CONCLUSION: Record<string, string> = { failure: 'failure', success: 'success', neutral: 'neutral' };

export interface DeliveryPanelProps {
  delivery: DeliveryInfo | null | undefined;
  gate: GateInfo | null | undefined;
  published: number | null | undefined;
  /** The run's findings, for the list of where each comment landed. */
  findings?: readonly Finding[];
  /** Opens what was posted, verbatim. */
  onShowPayload?: () => void;
  className?: string;
}

export function DeliveryPanel({ delivery, gate, published, findings = [], onShowPayload, className }: DeliveryPanelProps) {
  const ladder = delivery?.ladder_breakdown;
  const delivered = ladderTotal(ladder);
  const unaccounted = ladderUnaccounted(published, ladder);
  const accounted = unaccounted === 0;
  const rungs = RUNGS.filter((r) => (ladder?.[r] ?? 0) > 0);
  const comments = findings.filter((f) => f.status === 'published' && f.delivery && f.delivery.mode !== 'not_delivered');

  if (!delivery && !gate) {
    return (
      <Card tone="surface" pad="lg" className={className} as="section" aria-labelledby="delivery-h">
        <h2 id="delivery-h" className={s.panelTitle}>
          Posted to GitHub
        </h2>
        <p className={s.panelNote}>Nothing. The run ended before the delivery stage, so the pull request was left untouched.</p>
      </Card>
    );
  }

  return (
    <Card tone="surface" pad="lg" className={className} as="section" aria-labelledby="delivery-h">
      <div className={s.panelHead}>
        <h2 id="delivery-h" className={s.panelTitle}>
          Posted to GitHub
        </h2>
        {delivery ? (
          <Tag size="sm" tone={delivery.status === 'posted' ? 'ok' : delivery.status === 'degraded' ? 'warn' : 'dashed'}>
            {delivery.status === 'dry_run' ? 'Dry run' : delivery.status}
          </Tag>
        ) : null}
      </div>

      <ul className={s.dlv}>
        <li>
          <span className={s.dlvIcon} aria-hidden>
            <MessageSquareText size={15} strokeWidth={1.9} />
          </span>
          <span className={s.dlvBody}>
            <span className={s.dlvTitle}>
              {delivered} inline {delivered === 1 ? 'comment' : 'comments'}
            </span>
            <span className={s.dlvSub}>{rungs.length ? rungs.map((r) => `${ladder?.[r]} ${RUNG_LABEL[r]}`).join(' · ') : 'none needed'}</span>
          </span>
        </li>
        <li>
          <span className={s.dlvIcon} aria-hidden>
            <FileText size={15} strokeWidth={1.9} />
          </span>
          <span className={s.dlvBody}>
            <span className={s.dlvTitle}>Summary review</span>
            <span className={s.dlvSub}>
              event {delivery?.event ?? 'COMMENT'} · Witness never approves a pull request
            </span>
          </span>
        </li>
        {gate ? (
          <li>
            <span className={cn(s.dlvIcon, gate.conclusion === 'failure' && s.dlvIconDanger)} aria-hidden>
              {gate.conclusion === 'failure' ? <Square size={13} strokeWidth={2.2} /> : <ShieldCheck size={15} strokeWidth={1.9} />}
            </span>
            <span className={s.dlvBody}>
              <span className={s.dlvTitle}>
                <span className={s.mono}>{gate.context_name ?? 'witness/merge-gate'}</span> → {CONCLUSION[gate.conclusion] ?? gate.conclusion}
              </span>
              <span className={s.dlvSub}>
                {gate.delivery ? `as a ${GATE_VIA[gate.delivery] ?? gate.delivery}` : 'gate'}
                {gate.reason ? ` · ${gate.reason}` : ''}
              </span>
            </span>
          </li>
        ) : null}
      </ul>

      {comments.length ? (
        <ol className={s.landed} aria-label="Where each comment landed">
          {comments.map((f) => (
            <li key={f.id}>
              <span className={s.mono}>
                {f.location.file_path.split('/').pop()}
                {f.delivery?.delivered_line ? `:${f.delivery.delivered_line}` : ''}
              </span>
              <span className={s.landedMode}>{f.delivery ? RUNG_LABEL[f.delivery.mode as keyof typeof RUNG_LABEL] ?? '' : ''}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <p className={cn(s.accounting, !accounted && s.accountingBad)}>
        {accounted ? <Check size={13} strokeWidth={2.4} aria-hidden /> : <TriangleAlert size={13} strokeWidth={2.2} aria-hidden />}
        {published ?? 0} published · {delivered} delivered · {accounted ? '0 silently dropped' : `${Math.abs(unaccounted)} unaccounted`}
      </p>

      {onShowPayload ? (
        <Button variant="outline" size="sm" className={s.panelBtn} onClick={onShowPayload}>
          What was posted
        </Button>
      ) : null}
    </Card>
  );
}
