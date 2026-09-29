'use client';
// The review, live: the elapsed clock and a nine-segment progress rail up top;
// the stage list (done, running, waiting) on the left; on the right, the run's
// log as a terminal and the claims as they arrive — raised by a specialist,
// kept or dropped by the coordinator, then settled by proof. Every cue is a
// time on the script (model.buildScript), so this is a pure function of
// `elapsed`: a reload mid-run resumes exactly where it was.
import { Check, Hourglass } from 'lucide-react';
import { Card, Dot, Eyebrow, ProofBadge, Tag } from '@/components/dash/kit';
import { cn } from '@/lib/utils';
import { stageAt, type AnalysisResult, type PullMeta, type RunScript } from './model';
import { Code, SpecialistChip, STAGE_LOOK } from './shared';
import s from './repos.module.css';

const clock = (ms: number) => {
  const t = Math.max(0, ms) / 1000;
  const m = Math.floor(t / 60);
  return `${String(m).padStart(2, '0')}:${(t - m * 60).toFixed(1).padStart(4, '0')}`;
};

export function LiveRun({ script, result, meta, elapsed }: { script: RunScript; result: AnalysisResult; meta: PullMeta; elapsed: number }) {
  const { index, stage } = stageAt(script.stages, elapsed);
  const look = STAGE_LOOK[stage.key];
  const lines = script.lines.filter((l) => l.atMs <= elapsed);
  const byId = new Map(result.findings.map((f) => [f.id, f]));
  const cues = script.claims.filter((c) => c.claimedAt <= elapsed);
  const settled = elapsed >= (script.claims[0]?.settledAt ?? Infinity);
  const visible = cues.filter((c) => {
    const f = byId.get(c.id)!;
    return !(settled && (f.status === 'dropped' || f.status === 'proposed'));
  });
  const droppedCount = settled ? result.findings.filter((f) => f.status === 'dropped' || f.status === 'proposed').length : 0;
  const remaining = Math.max(0, script.totalMs - elapsed);

  return (
    <div className="flex flex-col gap-4" aria-live="polite" aria-busy="true">
      <Card tone="surface" pad="lg" className={s.runHead}>
        <div className={s.runHeadRow}>
          <div className="min-w-0">
            <Eyebrow dot={false}>
              <Dot pulse color="var(--w-blue)" /> Witness is reviewing #{meta.number}
            </Eyebrow>
            <p className={s.runStage}>
              {look.name}
              <span className={s.runStageSoft}> · {stage.label}</span>
            </p>
          </div>
          <div className={s.runTimer}>
            <span className={s.runTimerNum}>{(elapsed / 1000).toFixed(1)}</span>
            <span className={s.runTimerUnit}>s</span>
            <span className={s.runTimerLeft}>about {Math.ceil(remaining / 1000)}s left</span>
          </div>
        </div>
        <div className={s.rail} role="progressbar" aria-label="Review progress" aria-valuemin={0} aria-valuemax={9} aria-valuenow={index + 1}>
          {script.stages.map((st, i) => {
            const frac = i < index ? 1 : i > index ? 0 : Math.min(1, (elapsed - st.startMs) / st.durationMs);
            return (
              <span key={st.key} className={s.railSeg} data-state={i < index ? 'done' : i === index ? 'active' : 'todo'} title={STAGE_LOOK[st.key].name}>
                <i style={{ transform: `scaleX(${frac})` }} />
              </span>
            );
          })}
        </div>
        <p className={s.railCaption}>
          Stage {index + 1} of 9{meta.origin === 'placeholder' ? ' · simulated' : ` · ${meta.files} files · +${meta.additions} −${meta.deletions}`}
        </p>
      </Card>

      <div className={s.runGrid}>
        <Card tone="surface" pad="sm" className={s.stageList}>
          {script.stages.map((st, i) => {
            const L = STAGE_LOOK[st.key];
            const state = i < index ? 'done' : i === index ? 'active' : 'todo';
            const t = state === 'done' ? st.durationMs : state === 'active' ? elapsed - st.startMs : null;
            return (
              <div key={st.key} className={s.stageRow} data-state={state}>
                <span className={s.stageIcon}>
                  {state === 'done' ? <Check size={14} strokeWidth={2.6} aria-hidden /> : <L.icon size={15} strokeWidth={1.9} aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={s.stageName}>{L.name}</span>
                  <span className={s.stageLabel}>{st.label}</span>
                </span>
                <span className={s.stageTime}>{t == null ? '' : `${(t / 1000).toFixed(t < 1000 ? 2 : 1)}s`}</span>
              </div>
            );
          })}
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <div className={s.term} role="log" aria-label="Review log">
            <div className={s.termHead}>
              <span className={s.termDots} aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <span>witness · review log</span>
              <span className={s.termLive}>
                <Dot pulse color="#cbf857" /> live
              </span>
            </div>
            <div className={s.termBody}>
              <div className={s.termLines}>
                {lines.map((l, i) => (
                  <p key={`${l.atMs}-${i}`} className={s.termLine} data-tone={l.tone}>
                    <span className={s.termTime}>{clock(l.atMs)}</span>
                    <span className={s.termStage}>{STAGE_LOOK[l.stage].name.toLowerCase()}</span>
                    <span className={s.termText}>{l.text}</span>
                  </p>
                ))}
                <p className={cn(s.termLine, s.termCursor)} aria-hidden>
                  <span className={s.termTime}>{clock(elapsed)}</span>
                  <span className={s.caret} />
                </p>
              </div>
            </div>
          </div>

          <Card tone="panel" pad="md" className={s.claims}>
            <div className={s.claimsHead}>
              <p className={s.claimsTitle}>Claims</p>
              <p className={s.claimsMeta}>
                {cues.length} raised
                {droppedCount ? ` · ${droppedCount} dropped as noise` : ''}
              </p>
            </div>
            {visible.length === 0 ? (
              <p className={s.claimsEmpty}>{elapsed < (script.stages[2]?.startMs ?? 0) ? 'Specialists start once the context is built.' : 'Listening to the specialists…'}</p>
            ) : (
              <ul className={s.claimList}>
                {visible.map((c) => {
                  const f = byId.get(c.id)!;
                  const dropping = !settled && elapsed >= c.settledAt - 900 && (f.status === 'dropped' || f.status === 'proposed');
                  const verdict = elapsed >= c.verdictAt;
                  return (
                    <li key={c.id} className={s.claimRow} data-dropping={dropping ? '' : undefined}>
                      <SpecialistChip specialist={f.specialist} />
                      <span className={s.claimTitle}>
                        <Code text={f.title} />
                      </span>
                      <span className={s.claimState}>
                        {!settled ? (
                          <Tag tone="soft" size="sm">
                            Claimed
                          </Tag>
                        ) : !verdict ? (
                          <Tag tone="dashed" size="sm" icon={Hourglass}>
                            {['proven', 'disproven', 'inconclusive'].includes(f.proof) ? 'Proving' : 'Scoring'}
                          </Tag>
                        ) : f.status === 'suppressed' ? (
                          <Tag tone="dashed" size="sm">
                            Suppressed
                          </Tag>
                        ) : ['proven', 'disproven', 'inconclusive'].includes(f.proof) ? (
                          <ProofBadge status={f.proof} size="sm" />
                        ) : (
                          <Tag tone="outline" size="sm">
                            Advisory
                          </Tag>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
