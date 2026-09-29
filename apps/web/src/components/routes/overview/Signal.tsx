'use client';
// "How clean is the signal", as one composed card: the noise filter (every
// claim raised → the few that can block) is the chart, annotated in place with
// the rates that explain each step; a rail beside it holds what reviewers did
// with what reached them (the self-report's two human rates, each with its n)
// and the way into /accuracy, which owns the week-by-week proof chart.
import { Button, Card, Skeleton, Tag } from '@/components/dash/kit';
import { pct, shortDate } from '@/components/dash/format';
import { useAccuracy } from '@/lib/hooks';
import type { AccuracyReport } from '@/lib/api-types';
import type { WindowModel } from './model';
import { NoiseFunnel } from './charts';
import s from './overview.module.css';

export function FunnelCard({ w, caption }: { w: WindowModel; caption: string }) {
  const f = w.funnel;
  return (
    <Card tone="surface" pad="none" className={s.funnelCard} aria-labelledby="ov-noise">
      <div className={s.cardTop}>
        <div className="min-w-0">
          <h2 className={s.cardTitle} id="ov-noise">
            The noise filter
          </h2>
          <p className={s.cardDesc}>
            Of {f.raised} claims raised, {f.published} reached a pull request and {f.proven} of those were proven.
          </p>
        </div>
        <Tag tone="outline" size="sm">
          {caption}
        </Tag>
      </div>
      <div className={s.funnelLayout}>
        <div className={s.funnelBody}>
          {f.raised === 0 ? (
            <p className={s.muted}>No findings in this window.</p>
          ) : (
            <NoiseFunnel f={f} notes={{ perReview: w.perReview.mean, attempted: w.proof.attempted }} />
          )}
        </div>
        <ReviewerRail />
      </div>
    </Card>
  );
}

function ReviewerRail() {
  const query = useAccuracy();
  const report = query.data;
  return (
    <aside className={s.rail} aria-label="What reviewers did with it">
      <div>
        <h3 className={s.railTitle}>What reviewers did with it</h3>
        <p className={s.railDesc}>{report ? reportScope(report) : 'From the accuracy self-report.'}</p>
      </div>
      {query.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton style={{ width: 96, height: 30 }} />
          <Skeleton style={{ width: '80%', height: 12 }} />
          <Skeleton style={{ width: 96, height: 30, marginTop: 12 }} />
          <Skeleton style={{ width: '70%', height: 12 }} />
        </div>
      ) : query.isError || !report ? (
        <p className={s.muted}>The accuracy self-report didn’t load.</p>
      ) : (
        <RailRates report={report} />
      )}
      <div className={s.railFoot}>
        <p className={s.railDesc}>Proof by week and calibration live in the report.</p>
        <Button variant="outline" size="sm" href="/accuracy">
          Accuracy report
        </Button>
      </div>
    </aside>
  );
}

function RailRates({ report }: { report: AccuracyReport }) {
  const addressed = report.precision_proxies.addressed_rate;
  const dismissed = report.precision_proxies.human_dismissal_rate;
  const of = (m: { value?: number | null; n?: number | null }) => Math.round((m.value ?? 0) * (m.n ?? 0));
  return (
    <div className={s.railRates}>
      <div className={s.rate}>
        <div className={s.rateHead}>
          <p className={s.rateNum}>{pct(addressed.value, 1)}</p>
          <span className={s.rateMeter} aria-hidden>
            <i style={{ width: `${(addressed.value ?? 0) * 100}%` }} />
          </span>
        </div>
        <p className={s.rateWhat}>fixed on a later push</p>
        <p className={s.rateN}>
          {of(addressed)} of {addressed.n} findings on pull requests reviewed more than once.
        </p>
      </div>
      <div className={s.rate}>
        <div className={s.rateHead}>
          <p className={s.rateNum}>{pct(dismissed.value, 1)}</p>
          <PipRow value={dismissed.value ?? 0} />
        </div>
        <p className={s.rateWhat}>dismissed by a reviewer</p>
        <p className={s.rateN}>
          {of(dismissed)} of {dismissed.n} published findings.
        </p>
      </div>
    </div>
  );
}

function reportScope(report: AccuracyReport): string {
  const since = report.window?.since;
  return since ? `Since ${shortDate(since)}, from the accuracy self-report.` : 'Every review so far, from the accuracy self-report.';
}

/** `value` as filled pips out of 20: a rate read as "3 in 20". */
function PipRow({ value, of = 20 }: { value: number; of?: number }) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * of);
  return (
    <span className={s.pipRow} aria-hidden>
      {Array.from({ length: of }, (_, i) => (
        <i key={i} data-on={i < filled ? '' : undefined} />
      ))}
    </span>
  );
}
