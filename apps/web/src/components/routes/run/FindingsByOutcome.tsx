'use client';
// The run's findings, grouped by what happened to them. The finding that blocks
// the merge gets the landing's "caught, then proven" card — the claim, the
// computed severity and the two test runs that prove it. Advisory, suppressed
// and refuted findings are compact cards; the coordinator's dropped noise waits
// behind a disclosure. Every finding opens /findings/<id>.
import Link from 'next/link';
import { ArrowUpRight, Check, ChevronDown, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ProofBadge, SeverityRail, SeverityScore } from '@/components/dash/kit';
import { humanize, sha } from '@/components/dash/format';
import type { Finding } from '@/lib/api-types';
import { cn } from '@/lib/utils';
import { groupFindings, locationLabel, tickParts, type OutcomeGroup } from './findings-model';
import s from './run.module.css';

const MODE_LABEL: Record<string, string> = {
  inline_exact: 'on the exact line',
  inline_nearest: 'on the nearest line',
  file_level: 'at file level',
  summary_only: 'in the summary',
};

function Title({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {tickParts(text).map((p, i) => (p.code ? <code key={i}>{p.text}</code> : <span key={i}>{p.text}</span>))}
    </span>
  );
}

function Featured({ f, baseSha, headSha }: { f: Finding; baseSha?: string | null; headSha?: string | null }) {
  const p = f.proof;
  const baseOk = p?.base?.exit_code === 0;
  const headOk = p?.head?.exit_code === 0;
  const where = f.delivery?.mode ? MODE_LABEL[f.delivery.mode] : null;
  return (
    <Link href={`/findings/${f.id}`} className={s.featured}>
      <span className={s.featHead}>
        <Title text={f.title} className={s.featTitle} />
        <span className={s.featMeta}>
          {humanize(f.specialist)} · <span className={s.mono}>{locationLabel(f)}</span>
        </span>
      </span>
      <span className={s.featInset}>
        <span className={s.featSev}>
          <SeverityScore score={f.severity?.score} band={f.severity?.band} size="lg" />
          <span className={s.featSevNote}>computed severity</span>
        </span>
        <span className={s.featProof}>
          <span className={s.proofChips}>
            <span className={cn(s.proofChip, baseOk ? s.proofOk : s.proofBad)}>
              {baseOk ? <Check size={12} strokeWidth={2.6} aria-hidden /> : <X size={12} strokeWidth={2.6} aria-hidden />}
              base {sha(baseSha)} {baseOk ? 'passed' : 'failed'}
            </span>
            <span className={cn(s.proofChip, headOk ? s.proofOk : s.proofBad)}>
              {headOk ? <Check size={12} strokeWidth={2.6} aria-hidden /> : <X size={12} strokeWidth={2.6} aria-hidden />}
              head {sha(headSha)} {headOk ? 'passed' : 'failed'}
            </span>
          </span>
          {p?.test_file_path ? <span className={s.featTest}>{p.test_file_path}</span> : null}
        </span>
      </span>
      <span className={s.featFoot}>
        <span>{where ? `Commented ${where}${f.delivery?.delivered_line ? ` ${f.delivery.delivered_line}` : ''}` : 'Posted to the pull request'}</span>
        <span className={s.goChip} aria-hidden>
          <ArrowUpRight size={16} strokeWidth={2} />
        </span>
      </span>
    </Link>
  );
}

function FindingCard({ f, group }: { f: Finding; group: OutcomeGroup['key'] }) {
  const quiet = group === 'refuted' || group === 'suppressed';
  return (
    <Link href={`/findings/${f.id}`} className={cn(s.fCard, quiet && s.fCardQuiet)}>
      <SeverityRail band={f.severity?.band} className={s.fRail} />
      <span className={s.fMain}>
        <Title text={f.title} className={s.fTitle} />
        <span className={s.fMeta}>
          <span>{humanize(f.specialist)}</span>
          <span className={s.mono}>{locationLabel(f)}</span>
          {group === 'suppressed' && f.suppression?.scope ? <span>{f.suppression.scope} rule</span> : null}
          {group === 'advisory' && f.delivery?.mode && MODE_LABEL[f.delivery.mode] ? <span>{MODE_LABEL[f.delivery.mode]}</span> : null}
        </span>
      </span>
      <span className={s.fSide}>
        <ProofBadge status={f.proof?.status} size="sm" />
        {f.severity ? <SeverityScore score={f.severity.score} band={f.severity.band} showBand={false} /> : null}
        <span className={s.goSmall} aria-hidden>
          <ArrowUpRight size={14} strokeWidth={2} />
        </span>
      </span>
    </Link>
  );
}

function DroppedRow({ f }: { f: Finding }) {
  return (
    <Link href={`/findings/${f.id}`} className={s.dRow}>
      <Title text={f.title} className={s.dTitle} />
      <span className={s.dMeta}>
        {humanize(f.specialist)} · <span className={s.mono}>{f.location.file_path.split('/').pop()}</span>
      </span>
    </Link>
  );
}

function Group({ g, baseSha, headSha }: { g: OutcomeGroup; baseSha?: string | null; headSha?: string | null }) {
  const [open, setOpen] = useState(!g.collapsed);
  const id = `findings-${g.key}`;
  return (
    <section className={s.group} data-group={g.key} aria-labelledby={`${id}-h`}>
      <div className={s.gHead}>
        {g.collapsed ? (
          <h3 className={s.gTitle} id={`${id}-h`}>
            <button type="button" className={s.gToggle} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
              {g.title}
              <span className={s.gCount}>{g.findings.length}</span>
              <ChevronDown size={16} strokeWidth={2} className={cn(s.gChevron, open && s.gChevronOpen)} aria-hidden />
            </button>
          </h3>
        ) : (
          <>
            <h3 className={s.gTitle} id={`${id}-h`}>
              {g.title}
            </h3>
            <span className={cn(s.gCount, g.key === 'blocking' && s.gCountDanger)}>{g.findings.length}</span>
          </>
        )}
      </div>
      <p className={s.gNote}>{g.note}</p>
      <div id={id} className={g.key === 'dropped' ? s.dList : s.fList} hidden={!open}>
        {g.findings.map((f) =>
          g.key === 'blocking' ? (
            <Featured key={f.id} f={f} baseSha={baseSha} headSha={headSha} />
          ) : g.key === 'dropped' ? (
            <DroppedRow key={f.id} f={f} />
          ) : (
            <FindingCard key={f.id} f={f} group={g.key} />
          ),
        )}
      </div>
    </section>
  );
}

export function FindingsByOutcome({
  findings,
  baseSha,
  headSha,
  gateClear,
}: {
  findings: readonly Finding[];
  baseSha?: string | null;
  headSha?: string | null;
  gateClear?: boolean;
}) {
  const groups = groupFindings(findings);
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        className={s.findEmpty}
        title="Nothing to report"
        body={gateClear ? 'Every stage ran and no finding survived the coordinator. The merge gate is clear.' : 'This run produced no findings.'}
      />
    );
  }
  return (
    <div className={s.groups}>
      {groups.map((g) => (
        <Group key={g.key} g={g} baseSha={baseSha} headSha={headSha} />
      ))}
    </div>
  );
}

