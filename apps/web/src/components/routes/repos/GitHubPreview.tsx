'use client';
// "View on GitHub", simulated: what the pull request looks like on GitHub once
// Witness has reviewed it — the merge box with the witness/merge-gate check
// among the others, the one review Witness posts, and the inline comments it
// placed. Before a review, the check shows as expected and waiting.
import { Check, CircleDashed, ExternalLink, Minus, X } from 'lucide-react';
import { TrackingMark } from '@/components/brand';
import { Avatar, Button, Tag } from '@/components/dash/kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { GithubMark } from './GithubMark';
import { githubPullUrl, groupOf, type AnalysisResult, type PullMeta, type RepoRef } from './model';
import { Code } from './shared';
import s from './repos.module.css';

export function GitHubPreview({
  open,
  onOpenChange,
  repo,
  meta,
  result,
  demo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repo: RepoRef;
  meta: PullMeta;
  /** Null before Witness has reviewed the PR. */
  result: AnalysisResult | null;
  /** The recorded acme organisation: nothing real to link to. */
  demo: boolean;
}) {
  const url = githubPullUrl(repo, meta.number);
  const gate = result?.gate ?? null;
  const posted = result ? result.findings.filter((f) => groupOf(f) === 'proven' || groupOf(f) === 'advisory') : [];
  const checks: { name: string; state: 'ok' | 'bad' | 'neutral' | 'wait'; detail: string; witness?: boolean }[] = [
    {
      name: 'witness/merge-gate',
      witness: true,
      state: gate === 'failure' ? 'bad' : gate === 'success' ? 'ok' : gate === 'neutral' ? 'neutral' : 'wait',
      detail: result ? result.gateReason : 'Expected — waiting for Witness to review this commit',
    },
    { name: 'ci / test', state: 'ok', detail: 'Successful in 2m 41s' },
    { name: 'ci / lint', state: 'ok', detail: 'Successful in 38s' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={s.gh}>
        <div className={s.ghTop}>
          <GithubMark size={18} aria-hidden />
          <span className={s.ghUrl}>{url.replace('https://', '')}</span>
          {demo ? (
            <Tag tone="soft" size="sm">
              Preview
            </Tag>
          ) : null}
        </div>
        <div className={s.ghBody}>
          <DialogTitle className={s.ghTitle}>
            {meta.title} {meta.origin === 'placeholder' ? null : <span className={s.ghNo}>#{meta.number}</span>}
          </DialogTitle>
          <DialogDescription className={s.ghMeta}>
            <span className={s.ghOpen}>{meta.state === 'open' ? 'Open' : 'Merged'}</span>
            {meta.origin === 'placeholder' ? (
              <>Author and branches load from GitHub once it is connected.</>
            ) : (
              <>
                <b>{meta.author}</b> wants to merge into <code>{meta.baseBranch}</code> from <code>{meta.headBranch}</code>
              </>
            )}
          </DialogDescription>

          {result ? (
            <div className={s.ghReview}>
              <div className={s.ghReviewHead}>
                <span className={s.ghBot}>
                  <TrackingMark size={14} />
                </span>
                <b>witness[bot]</b>
                <span className={s.ghMuted}>reviewed · comment</span>
              </div>
              <p className={s.ghReviewText}>
                <b>Gate: {gate === 'failure' ? 'failing' : gate === 'success' ? 'passing' : 'neutral'}</b> — {result.counts.raised} raised, {result.counts.dropped} dropped at the coordinator,{' '}
                {result.counts.refuted} refuted by execution, <b>{result.counts.proven} proven</b>. Witness does not approve pull requests.
              </p>
              {posted.length ? (
                <ul className={s.ghComments}>
                  {posted.slice(0, 4).map((f) => (
                    <li key={f.id}>
                      <span className={s.ghFile}>
                        {f.file.split('/').pop()}
                        {f.line != null ? `:${f.line}` : ''}
                      </span>
                      <span className={s.ghCommentTitle}>
                        <Code text={f.title} />
                      </span>
                      {f.proof === 'proven' ? (
                        <Tag tone="lime" size="sm">
                          proven
                        </Tag>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className={s.ghChecks}>
            <p className={s.ghChecksHead}>
              {gate === 'failure' ? 'Merging is blocked' : gate ? 'All checks have passed' : 'Some checks haven’t completed yet'}
              <span className={s.ghMuted}> · {checks.length} checks</span>
            </p>
            {checks.map((c) => (
              <div key={c.name} className={s.ghCheck} data-state={c.state}>
                <span className={s.ghCheckIcon}>
                  {c.state === 'ok' ? <Check size={12} strokeWidth={3} /> : c.state === 'bad' ? <X size={12} strokeWidth={3} /> : c.state === 'neutral' ? <Minus size={12} strokeWidth={3} /> : <CircleDashed size={13} strokeWidth={2.2} />}
                </span>
                {c.witness ? <Avatar name="witness" size={18} square className={s.ghCheckAvatar} /> : null}
                <span className={s.ghCheckName}>{c.name}</span>
                <span className={s.ghCheckDetail}>{c.detail}</span>
                {c.witness && c.state === 'bad' ? (
                  <Tag tone="danger" size="sm">
                    Required
                  </Tag>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div className={s.ghFoot}>
          <p className={s.ghNote}>{demo ? 'acme is the recorded demo organisation: this is what Witness would post, shown here.' : 'Simulated in this browser: nothing was posted to GitHub.'}</p>
          {!demo ? (
            <Button variant="outline" size="sm" chip={ExternalLink} chipStill href={url} external>
              github.com
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
