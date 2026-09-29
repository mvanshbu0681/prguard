'use client';
// A simulated finding's evidence, in place: a simulated review has no finding
// pages, so this sheet carries the same structure as /findings/:id — the
// claim, proof by execution (base vs head, the repro test), where it is, and
// the computed severity — marked "Simulated for this PR" at the top, with the
// provenance of the borrowed evidence said plainly.
import { Check, CircleDashed, X } from 'lucide-react';
import { Meter, ProofBadge, SeverityScore, Tag } from '@/components/dash/kit';
import { humanize } from '@/components/dash/format';
import { SEVERITY_INPUTS } from '@/lib/contracts';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { slugOf, type DisplayFinding, type PullMeta, type RepoRef } from './model';
import { Code, SpecialistChip } from './shared';
import s from './repos.module.css';

const INPUT_LABEL: Record<string, string> = {
  path_sensitivity: 'Path sensitivity',
  reachability: 'Reachability',
  blast_radius: 'Blast radius',
  coverage_gap: 'Coverage gap',
  proof_confidence: 'Proof confidence',
  churn: 'Churn',
};

export function EvidenceSheet({
  finding,
  meta,
  repo,
  borrowedFrom,
  onClose,
}: {
  finding: DisplayFinding | null;
  meta: PullMeta;
  repo: RepoRef;
  borrowedFrom: 'repo' | 'corpus';
  onClose: () => void;
}) {
  return (
    <Sheet open={finding != null} onOpenChange={(o) => (o ? null : onClose())}>
      <SheetContent className={s.ev}>{finding ? <Evidence f={finding} meta={meta} repo={repo} borrowedFrom={borrowedFrom} /> : null}</SheetContent>
    </Sheet>
  );
}

function Run({ side, sha, line, excerpt, state }: { side: 'base' | 'head'; sha: string; line: string | null; excerpt: string | null; state: 'ok' | 'bad' | 'warn' | 'none' }) {
  return (
    <div className={s.evRun} data-state={state}>
      <p className={s.evRunHead}>
        <span className={s.evRunIcon}>
          {state === 'ok' ? <Check size={11} strokeWidth={3} aria-hidden /> : state === 'none' ? <CircleDashed size={11} strokeWidth={2.4} aria-hidden /> : <X size={11} strokeWidth={3} aria-hidden />}
        </span>
        <b>{side}</b>
        {sha ? <span className={s.evSha}>{sha.slice(0, 7)}</span> : null}
        <span className={s.evRunLine}>{line ?? (state === 'none' ? 'not run' : '')}</span>
      </p>
      {excerpt ? <pre className={s.evPre}>{excerpt}</pre> : null}
    </div>
  );
}

function Evidence({ f, meta, repo, borrowedFrom }: { f: DisplayFinding; meta: PullMeta; repo: RepoRef; borrowedFrom: 'repo' | 'corpus' }) {
  const e = f.evidence;
  const executed = f.proof === 'proven' || f.proof === 'disproven' || f.proof === 'inconclusive';
  const failed = (line: string | null) => !!line && /\b(failed|error)\b/i.test(line);
  const baseState = !executed ? 'none' : f.proof === 'inconclusive' && failed(f.baseLine) ? 'warn' : 'ok';
  const headState = !executed ? 'none' : f.proof === 'proven' ? 'bad' : f.proof === 'disproven' ? 'ok' : failed(f.headLine) ? 'warn' : 'ok';
  const inputs = e?.inputs ?? null;
  const weights = e?.weights ?? null;

  return (
    <div className={s.evBody}>
      <div className={s.evHead}>
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="dashed" size="sm">
            Simulated for this PR
          </Tag>
          <ProofBadge status={f.proof} size="sm" />
          <span className={s.fcardSpec}>
            <SpecialistChip specialist={f.specialist} />
            {humanize(f.specialist)}
          </span>
        </div>
        <SheetTitle className={s.evTitle}>
          <Code text={f.title} />
        </SheetTitle>
        <SheetDescription className={s.evProv}>
          {borrowedFrom === 'repo'
            ? `Evidence replayed from a recorded review of ${slugOf(repo)}, shown against #${meta.number}.`
            : `An example from the acme demo corpus: Witness cannot read ${slugOf(repo)} in this demo.`}
        </SheetDescription>
      </div>

      <section className={s.evSection} aria-labelledby="ev-claim">
        <h3 id="ev-claim" className={s.evH}>
          Claim
        </h3>
        <p className={s.evText}>
          <Code text={f.body} />
        </p>
      </section>

      <section className={s.evSection} aria-labelledby="ev-proof">
        <h3 id="ev-proof" className={s.evH}>
          Proof by execution
        </h3>
        {executed ? (
          <>
            <div className={s.evRuns}>
              <Run side="base" sha={meta.baseSha} line={f.baseLine} excerpt={e?.baseExcerpt ?? null} state={baseState} />
              <Run side="head" sha={meta.headSha} line={f.headLine} excerpt={e?.headExcerpt ?? null} state={headState} />
            </div>
            {e?.testExcerpt ? (
              <div className={s.evTest}>
                <p className={s.evTestHead}>
                  <span>{f.testFile ?? 'repro test'}</span>
                  {e.command ? <code>{e.command}</code> : null}
                </p>
                <pre className={s.evCode}>{e.testExcerpt}</pre>
              </div>
            ) : null}
          </>
        ) : (
          <p className={s.evMuted}>
            {f.proof === 'not_applicable' ? 'Not executable by nature (maintainability, style): posted as advice, never blocking.' : 'No repro was attempted for this claim: it is posted as advice and cannot block the merge.'}
          </p>
        )}
      </section>

      <section className={s.evSection} aria-labelledby="ev-loc">
        <h3 id="ev-loc" className={s.evH}>
          Location
        </h3>
        <p className={s.evLoc}>
          {f.file || 'unknown file'}
          {f.line != null ? `:${f.line}` : ''}
        </p>
      </section>

      <section className={s.evSection} aria-labelledby="ev-sev">
        <h3 id="ev-sev" className={s.evH}>
          Severity
        </h3>
        {f.score != null ? <SeverityScore score={f.score} band={f.band} size="lg" /> : <p className={s.evMuted}>Not scored: dropped before scoring.</p>}
        {inputs ? (
          <div className={s.evInputs}>
            {SEVERITY_INPUTS.map((k) => (
              <div key={k} className={s.evInput}>
                <span className={s.evInputName}>{INPUT_LABEL[k] ?? k}</span>
                <Meter value={inputs[k] ?? 0} color="var(--w-text)" label={`${INPUT_LABEL[k] ?? k} ${(inputs[k] ?? 0).toFixed(2)}`} />
                <span className={s.evInputVal}>
                  {(inputs[k] ?? 0).toFixed(2)}
                  {weights?.[k] != null ? <small> × {weights[k]!.toFixed(2)}</small> : null}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {e?.explanation ? <p className={s.evMuted}>{e.explanation}</p> : null}
      </section>
    </div>
  );
}
