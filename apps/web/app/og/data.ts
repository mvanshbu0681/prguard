// OWNER: t1a (wave 1).
//
// The story the OG card tells, read from the sandbox snapshot at build time so
// the card cannot disagree with the hero (every surface tells one story): the
// showcase review PR Guard posted on the public sandbox, as GitHub shows it.
//   src/sandbox/snapshot.json → showcase: repo, pr, priority, risk, severity counts
import { CODE_CHECKS, MODEL_REVIEWERS, sandbox } from '@/sandbox';

export interface OgStory {
  /** "prguard-sandbox/acme-billing#26" */
  pullRequest: string;
  /** "P0 Urgent · High risk" */
  verdict: string;
  findings: number;
  /** "2 critical · 3 high · 3 medium" */
  severities: string;
  modelReviewers: number;
  codeChecks: number;
}

export function loadOgStory(): OgStory {
  const show = sandbox.showcase;
  return {
    pullRequest: `${sandbox.org}/${show.repo}#${show.pr}`,
    verdict: [show.priority?.alt, show.risk?.alt].filter(Boolean).join(' · '),
    findings: show.findings.length,
    severities: show.severityCounts.map((c) => `${c.count} ${c.severity}`).join(' · '),
    modelReviewers: MODEL_REVIEWERS,
    codeChecks: CODE_CHECKS,
  };
}
