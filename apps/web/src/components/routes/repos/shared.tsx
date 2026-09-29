// Small pieces every Repositories view shares: the nine stages' look (the
// landing pipeline's names and icons), backtick-aware text, the language dot,
// the PR's branch chips and the finding card.
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight, Check, Combine, FingerprintPattern, FlaskConical, FolderTree, Gauge, MessageSquareText, ShieldCheck, Users, Webhook, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { bandColor, ProofBadge, SeverityScore, Tag } from '@/components/dash/kit';
import { humanize } from '@/components/dash/format';
import type { Stage } from '@/lib/contracts';
import { cn } from '@/lib/utils';
import { LANGS, type DisplayFinding, type LangKey } from './model';
import s from './repos.module.css';

export const STAGE_LOOK: Record<Stage, { name: string; icon: LucideIcon }> = {
  ingest: { name: 'Ingest', icon: Webhook },
  context: { name: 'Context', icon: FolderTree },
  specialists: { name: 'Specialists', icon: Users },
  coordinator: { name: 'Coordinator', icon: Combine },
  severity: { name: 'Severity', icon: Gauge },
  identity: { name: 'Identity', icon: FingerprintPattern },
  proof: { name: 'Proof', icon: FlaskConical },
  delivery: { name: 'Delivery', icon: MessageSquareText },
  finalise: { name: 'Finalise', icon: ShieldCheck },
};

/** The four specialists, as the landing draws them. */
export const SPECIALISTS: Record<string, { initials: string; color: string }> = {
  bugs: { initials: 'BG', color: '#1f2937' },
  correctness: { initials: 'BG', color: '#1f2937' },
  security: { initials: 'SC', color: '#475569' },
  tests: { initials: 'TS', color: '#334155' },
  test_integrity: { initials: 'TS', color: '#334155' },
  quality: { initials: 'QA', color: '#57534e' },
};

export function SpecialistChip({ specialist, className }: { specialist: string; className?: string }) {
  const p = SPECIALISTS[specialist] ?? SPECIALISTS.quality!;
  return (
    <span className={cn(s.specChip, className)} style={{ background: p.color }} title={humanize(specialist)} aria-hidden>
      {p.initials}
    </span>
  );
}

/** Renders `code` spans in finding titles and bodies. */
export function Code({ text }: { text: string }): ReactNode {
  const parts = text.split('`');
  return parts.map((part, i) => (i % 2 === 1 ? <code key={i} className={s.inlineCode}>{part}</code> : <span key={i}>{part}</span>));
}

/** The repository's language; renders nothing when Witness cannot know it. */
export function LangDot({ lang, className }: { lang: LangKey | null; className?: string }) {
  if (!lang) return null;
  const l = LANGS[lang];
  if (!l) return null;
  return (
    <span className={cn(s.lang, className)}>
      <i style={{ background: l.color }} aria-hidden />
      {l.label}
    </span>
  );
}

export function BranchChip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className={s.branch} title={title}>
      {children}
    </span>
  );
}

const short = (sha: string) => sha.slice(0, 7);

type CellState = 'ok' | 'bad' | 'warn';

/** An inconclusive repro can pass or fail on either side; read its own output. */
function outcomeOf(line: string | null, fallback: CellState): CellState {
  if (!line) return fallback;
  if (/\b(failed|error)\b/i.test(line)) return 'warn';
  if (/\bpassed\b/i.test(line)) return 'ok';
  return fallback;
}

function ProofCell({ label, out, state }: { label: string; out: string; state: CellState }) {
  return (
    <span className={s.proofCell} data-ok={state === 'ok' ? '' : undefined} data-bad={state === 'bad' ? '' : undefined} data-warn={state === 'warn' ? '' : undefined}>
      <span className={s.proofIcon}>{state === 'ok' ? <Check size={11} strokeWidth={3} aria-hidden /> : <X size={11} strokeWidth={3} aria-hidden />}</span>
      <span className={s.proofSha}>{label}</span>
      <span className={s.proofOut} title={out}>
        {out}
      </span>
    </span>
  );
}

/**
 * One finding: proof and specialist, computed severity, the claim, where it
 * is, and — for anything executed — what the repro did at base and head.
 */
export function FindingCard({
  f,
  baseSha,
  headSha,
  quiet,
  onOpen,
}: {
  f: DisplayFinding;
  baseSha: string;
  headSha: string;
  quiet?: boolean;
  /** A simulated finding has no page: this opens its evidence in place. */
  onOpen?: (f: DisplayFinding) => void;
}) {
  const executed = f.proof === 'proven' || f.proof === 'disproven' || f.proof === 'inconclusive';
  return (
    <article className={cn(s.fcard, quiet && s.fcardQuiet)} data-proof={f.proof}>
      {f.proof === 'proven' ? <span className={s.fcardRail} style={{ background: bandColor(f.band ?? 'critical') }} aria-hidden /> : null}
      <div className={s.fcardTop}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {f.status === 'suppressed' ? (
            <Tag tone="dashed" size="sm">
              Suppressed
            </Tag>
          ) : (
            <ProofBadge status={f.proof} size="sm" />
          )}
          <span className={s.fcardSpec}>
            <SpecialistChip specialist={f.specialist} />
            {humanize(f.specialist)}
          </span>
        </div>
        {f.score != null ? <SeverityScore score={f.score} band={f.band} showBand={!quiet} /> : null}
      </div>
      <h3 className={s.fcardTitle}>
        <Code text={f.title} />
      </h3>
      {f.file ? (
        <p className={s.fcardLoc}>
          {f.file}
          {f.line != null ? `:${f.line}` : ''}
        </p>
      ) : null}
      {f.body && !quiet ? (
        <p className={s.fcardBody}>
          <Code text={f.body} />
        </p>
      ) : null}
      {executed ? (
        <div className={s.proofStrip}>
          <ProofCell label={baseSha ? `base ${short(baseSha)}` : 'base'} out={f.baseLine ?? 'passed'} state={f.proof === 'inconclusive' ? outcomeOf(f.baseLine, 'warn') : 'ok'} />
          <ProofCell
            label={headSha ? `head ${short(headSha)}` : 'head'}
            out={f.headLine ?? (f.proof === 'disproven' ? 'passed' : 'failed')}
            state={f.proof === 'proven' ? 'bad' : f.proof === 'disproven' ? 'ok' : outcomeOf(f.headLine, 'warn')}
          />
        </div>
      ) : null}
      {f.fixture ? (
        <Link href={`/findings/${f.id}`} className={s.fcardLink}>
          Open finding
          <ArrowUpRight size={13} strokeWidth={2} aria-hidden />
        </Link>
      ) : onOpen ? (
        <button type="button" className={s.fcardLink} onClick={() => onOpen(f)} aria-haspopup="dialog">
          Open evidence
          <ArrowUpRight size={13} strokeWidth={2} aria-hidden />
        </button>
      ) : null}
    </article>
  );
}
