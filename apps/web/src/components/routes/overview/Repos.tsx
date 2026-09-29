// Repositories, on the same card /repos uses for the same thing: identity
// (square avatar, owner / name, language), the three numbers that matter
// (open PRs, proven bugs, reviews per week) and the last verdict. The data is
// /repos's own summary (routes/repos/data.server, read-only), so both pages
// print identical numbers. Here the card carries no Witness switch (that is
// /repos's job); it adds a "blocked" tag instead, and repos holding a blocked
// PR sort first.
import { ArrowUpRight } from 'lucide-react';
import { Avatar, Card, GateBadge, Sparkline, Tag } from '@/components/dash/kit';
import { relTime } from '@/components/dash/format';
import type { RepoSummary } from '@/components/routes/repos/model';
import { LangDot } from '@/components/routes/repos/shared';
import s from './overview.module.css';

export function sortRepos(repos: readonly RepoSummary[]): RepoSummary[] {
  return [...repos].sort((a, b) => b.blockedOpen - a.blockedOpen || b.provenBugs - a.provenBugs || a.name.localeCompare(b.name));
}

export function RepoGrid({ repos }: { repos: RepoSummary[] }) {
  return (
    <div className={s.repoGrid}>
      {sortRepos(repos).map((r) => (
        <RepoTile key={`${r.owner}/${r.name}`} r={r} />
      ))}
    </div>
  );
}

function RepoTile({ r }: { r: RepoSummary }) {
  const weekly = r.weekly.length ? r.weekly : null;
  return (
    <Card href={`/repos/${r.owner}/${r.name}`} tone="surface" pad="none" className={s.repo} aria-label={`${r.owner}/${r.name}`}>
      <div className={s.repoTop}>
        <Avatar name={r.name} square size={40} className={s.avatarRing} />
        <div className="min-w-0 flex-1">
          <p className={s.repoOwner}>{r.owner} /</p>
          <p className={s.repoName}>{r.name}</p>
        </div>
      </div>

      <div className={s.repoTags}>
        <LangDot lang={r.language} />
        {r.blockedOpen > 0 ? (
          <Tag tone="danger" size="sm" dot>
            {r.blockedOpen} blocked
          </Tag>
        ) : null}
      </div>

      <div className={s.repoNums}>
        <div>
          <span className={s.repoNum}>{r.openPulls}</span>
          <span className={s.repoNumLabel}>open PRs</span>
        </div>
        <div>
          <span className={s.repoNum}>{r.provenBugs}</span>
          <span className={s.repoNumLabel}>proven bugs</span>
        </div>
        <div className={s.repoSpark}>
          {weekly ? (
            <Sparkline values={weekly} width={92} height={30} color="var(--w-text)" label={`${weekly.reduce((a, b) => a + b, 0)} reviews in six weeks`} />
          ) : (
            <span className={s.repoSparkEmpty} />
          )}
          <span className={s.repoNumLabel}>{weekly ? 'reviews / week' : 'no reviews yet'}</span>
        </div>
      </div>

      <div className={s.repoFoot}>
        <span className="flex min-w-0 items-center gap-2.5">
          <GateBadge conclusion={r.lastGate ?? 'pending'} size="sm" />
          <span className={s.repoWhen}>{r.lastReviewedAt ? `last review ${relTime(r.lastReviewedAt)}` : 'not reviewed yet'}</span>
        </span>
        <span className={s.arrowChip} aria-hidden>
          <ArrowUpRight size={15} strokeWidth={2} />
        </span>
      </div>
    </Card>
  );
}
