// Spend & speed: what a review costs, where its time goes, and how much of
// the model input the prompt cache served.
import { Card, Sparkline, Tag } from '@/components/dash/kit';
import { pct, usd } from '@/components/dash/format';
import type { OverviewModel, WindowModel } from './model';
import { CostHistogram, StageRows } from './charts';
import s from './overview.module.css';

export function SpendGrid({ model, w, caption }: { model: OverviewModel; w: WindowModel; caption: string }) {
  const sp = w.speed;
  const c = w.cache;
  return (
    <div className={s.spendGrid}>
      <Card tone="surface" pad="none" className={s.costCard}>
        <div className={s.cardTop}>
          <div className="min-w-0">
            <h3 className={s.cardTitle}>Cost per review</h3>
            <p className={s.cardDesc}>Model spend of each completed review.</p>
          </div>
          <Tag tone="outline" size="sm">
            {caption}
          </Tag>
        </div>
        <div className={s.costBody}>
          <div className={s.costNums}>
            <div>
              <p className={s.bigNum}>{usd(sp.costP50)}</p>
              <p className={s.numLabel}>median, of {sp.costN} completed</p>
            </div>
            <div>
              <p className={s.midNum}>{usd(sp.costP95)}</p>
              <p className={s.numLabel}>p95</p>
            </div>
            <div>
              <p className={s.midNum}>{usd(sp.spend)}</p>
              <p className={s.numLabel}>across {sp.reviews} reviews</p>
            </div>
          </div>
          {sp.costN ? <CostHistogram bins={sp.costHist} p50={sp.costP50} p95={sp.costP95} /> : <p className={s.muted}>No completed reviews in this window.</p>}
        </div>
      </Card>

      <Card tone="surface" pad="none" className={s.stageCard}>
        <div className={s.cardTop}>
          <div className="min-w-0">
            <h3 className={s.cardTitle}>Where the time goes</h3>
            <p className={s.cardDesc}>Each of the nine stages, median and p95.</p>
          </div>
        </div>
        <div className={s.stageBody}>
          <div className={s.stageKey} aria-hidden>
            <span>
              <i data-k="p50" />
              p50
            </span>
            <span>
              <i data-k="p95" />
              p95
            </span>
          </div>
          <StageRows stages={model.stages} />
        </div>
      </Card>

      <Card tone="surface" pad="none" className={s.cacheCard}>
        <div className={s.cardTop}>
          <div className="min-w-0">
            <h3 className={s.cardTitle}>Prompt cache</h3>
            <p className={s.cardDesc}>Input tokens served from cache.</p>
          </div>
        </div>
        <div className={s.cacheBody}>
          <p className={s.bigNum}>{pct(c.ratio)}</p>
          <p className={s.numLabel}>
            of {compactTokens(c.tokens)} input tokens, over {c.days} {c.days === 1 ? 'day' : 'days'}
          </p>
          {c.daily.length > 1 ? (
            <div className={s.cacheTrend}>
              <Sparkline
                values={c.daily}
                width={240}
                height={96}
                domain={[0, 1]}
                color="var(--w-chart-3)"
                className={s.cacheSpark}
                label="Daily cache-hit ratio"
              />
              <p className={s.cacheRange}>
                <span>Daily</span>
                <span>
                  {pct(Math.min(...c.daily))}–{pct(Math.max(...c.daily))}
                </span>
              </p>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function compactTokens(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}
