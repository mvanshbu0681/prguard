'use client';
// One repository in the grid: identity (square avatar, owner/name, language,
// visibility), the Witness switch, three numbers that matter (open PRs, proven
// bugs, reviews per week) and the last verdict. The whole card is the link to
// the repository; the switch sits above that link and never navigates.
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { Avatar, GateBadge, Sparkline, Switch, Tag } from '@/components/dash/kit';
import { relTime } from '@/components/dash/format';
import { cn } from '@/lib/utils';
import { repoHref, type RepoSummary } from './model';
import { LangDot } from './shared';
import s from './repos.module.css';

export function RepoCard({
  repo,
  imported,
  enabled,
  running,
  onToggle,
}: {
  repo: RepoSummary;
  imported: boolean;
  enabled: boolean;
  running: boolean;
  onToggle: (on: boolean) => void;
}) {
  const href = repoHref(repo);
  const weekly = repo.weekly.length ? repo.weekly : null;
  return (
    <article className={cn(s.repoCard, !enabled && s.repoCardOff)}>
      <div className={s.repoTop}>
        <Avatar name={repo.name} size={40} square />
        <div className="min-w-0 flex-1">
          <p className={s.repoOwner}>{repo.owner} /</p>
          <h3 className={s.repoName}>
            <Link href={href} className={s.stretch}>
              {repo.name}
            </Link>
          </h3>
        </div>
        <span className={s.aboveLink}>
          <Switch checked={enabled} onChange={onToggle} label={`Witness on ${repo.owner}/${repo.name}`} />
        </span>
      </div>

      <div className={s.repoTags}>
        <LangDot lang={repo.language} />
        {repo.visibility ? (
          <Tag tone="outline" size="sm">
            {repo.visibility}
          </Tag>
        ) : null}
        {imported ? (
          <Tag tone="dashed" size="sm">
            Imported
          </Tag>
        ) : null}
        {!enabled ? (
          <Tag tone="warn" size="sm">
            Paused
          </Tag>
        ) : null}
      </div>

      <div className={s.repoNums}>
        <div>
          <span className={s.repoNum}>{repo.openPulls}</span>
          <span className={s.repoNumLabel}>open PRs</span>
        </div>
        <div>
          <span className={s.repoNum} data-bad={repo.provenBugs > 0 ? '' : undefined}>
            {repo.provenBugs}
          </span>
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
          {running ? <GateBadge conclusion="running" size="sm" /> : <GateBadge conclusion={repo.lastGate ?? 'pending'} size="sm" />}
          <span className={s.repoWhen}>
            {running ? 'reviewing now' : repo.lastReviewedAt ? `last review ${relTime(repo.lastReviewedAt)}` : repo.kind === 'synthetic' ? 'paste a PR to review it' : `${repo.openPulls} waiting`}
          </span>
        </span>
        <span className={s.repoChip} aria-hidden>
          <ArrowUpRight size={15} strokeWidth={2} />
        </span>
      </div>
    </article>
  );
}
