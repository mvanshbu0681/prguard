// The hero bento: is Witness catching real bugs (the photograph), is the gate
// holding the right PRs (lime), and how fast and how cheap is it (ink).
import Link from 'next/link';
import { ArrowUpRight, FlaskConical } from 'lucide-react';
import { Button, Card, GATE_COLOR, GlassTile, PhotoCard, Tag } from '@/components/dash/kit';
import { usd } from '@/components/dash/format';
import type { OverviewModel, WindowModel } from './model';
import { HeldPips, StageTrack, WeekBars } from './charts';
import { count, stageLabel } from './format';
import s from './overview.module.css';

export function Hero({ model, w }: { model: OverviewModel; w: WindowModel }) {
  return (
    <div className={s.bento}>
      <ProvenPhoto model={model} w={w} />
      <GateCard w={w} />
      <SpeedCard model={model} w={w} />
    </div>
  );
}

function ProvenPhoto({ model, w }: { model: OverviewModel; w: WindowModel }) {
  const { proof } = w;
  return (
    <PhotoCard className={s.photo} position="0% 42%" priority sizes="(max-width: 900px) 100vw, 56vw">
      <div className={s.photoTop}>
        <div className={s.photoLead}>
          <Tag tone="glass" icon={FlaskConical}>
            Proven by execution
          </Tag>
          <p className={s.heroNum}>{proof.proven}</p>
          <p className={s.heroCaption}>{proof.proven === 1 ? 'bug' : 'bugs'}, each shipped with the failing test that proves it.</p>
        </div>
        <GlassTile className={s.weekTile}>
          <p className={s.weekHead}>Proven per week</p>
          <WeekBars weeks={model.weekly} active={w.weeks} />
        </GlassTile>
      </div>

      <div className={s.photoFoot}>
        <GlassTile tone="white" className={s.refuted}>
          <span className={s.refutedNum}>{proof.refuted}</span>
          <div className="min-w-0">
            <p className={s.refutedText}>
              of its own claims refuted by execution before they reached a pull request, out of {count(proof.attempted, 'proof run')}.
            </p>
          </div>
        </GlassTile>
        <Button variant="glass" chip href={`/findings/${model.provenFindingId}`} className={s.photoCta}>
          See a proof
        </Button>
      </div>
    </PhotoCard>
  );
}

function GateCard({ w }: { w: WindowModel }) {
  const g = w.gate;
  return (
    <Card tone="lime" pad="lg" className={s.gate}>
      <div className={s.cardHead}>
        <p className={s.onLimeLabel}>Merge gate</p>
        <Link href="/findings?blocking=true" className={s.inkChip} aria-label="See every blocking finding">
          <ArrowUpRight size={16} strokeWidth={2} aria-hidden />
        </Link>
      </div>

      <div className={s.gateMain}>
        <p className={s.gateNum}>{g.held}</p>
        <p className={s.gateWhat}>
          pull {g.held === 1 ? 'request' : 'requests'} held
          <br />
          by a proven bug
        </p>
      </div>

      {g.held > 0 ? (
        <div className={s.gateSplit}>
          <HeldPips fixed={g.heldFixed} />
          <div className={s.gateKey}>
            <span>
              <i data-k="blocked" style={{ background: GATE_COLOR.failure }} />
              <b>{g.stillBlocked}</b> still blocked
            </span>
            <span>
              <i data-k="fixed" />
              <b>{g.fixed}</b> fixed, then cleared
            </span>
          </div>
        </div>
      ) : (
        <p className={s.gateEmpty}>Nothing held in this window.</p>
      )}

      <p className={s.gateFoot}>
        <span>
          {g.blockingProven}/{g.blockingFindings} blocks proven
        </span>
        <Link href="/audit?event_type=override.break_glass" className={s.gateFootLink}>
          {count(g.overrides, 'break-glass override')}
        </Link>
      </p>
    </Card>
  );
}

function SpeedCard({ model, w }: { model: OverviewModel; w: WindowModel }) {
  const sp = w.speed;
  const total = model.stages.reduce((a, b) => a + b.p50, 0);
  const lead = model.stages.reduce((a, b) => (b.p50 > a.p50 ? b : a), model.stages[0]);
  return (
    <Card tone="ink" pad="lg" className={s.speed}>
      <div className={s.speedPair}>
        <div>
          <p className={s.onInkLabel}>Median review</p>
          <p className={s.speedNum}>
            {sp.medianS == null ? '—' : sp.medianS.toFixed(1)}
            <span>s</span>
          </p>
          <p className={s.onInkSub}>p95 {sp.p95S == null ? '—' : `${sp.p95S.toFixed(1)}s`}</p>
        </div>
        <div>
          <p className={s.onInkLabel}>Per review</p>
          <p className={s.speedNum}>{usd(sp.costP50)}</p>
          <p className={s.onInkSub}>p95 {usd(sp.costP95)}</p>
        </div>
      </div>
      {model.stages.length ? (
        <div className={s.speedTrack}>
          <StageTrack stages={model.stages} />
          <p className={s.onInkSub}>
            <b>{stageLabel(lead.stage)}</b> take {lead.p50.toFixed(1)}s, {Math.round((lead.p50 / total) * 100)}% of a review
          </p>
        </div>
      ) : null}
    </Card>
  );
}
