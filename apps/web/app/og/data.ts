// OWNER: t1a (wave 1).
//
// The story the OG card tells, read from the fixture corpus at build time so the
// card cannot disagree with the hero (plan A10: every surface tells one story).
//   SHAs      public/fixtures/manifest.json → ids.base_sha / ids.head_sha (binding), 7 chars
//   results   reviews/<ids.demo_review_id>.result.json → the finding whose id is
//             ids.proven_finding_id → proof.base.excerpt / proof.head.excerpt,
//             reduced to pytest's summary line ("1 passed in 0.42s")
// Until t2b's generator replaces the stubs, the excerpts are absent and the
// summaries fall back to the canonical hero story (landing blueprint §01).
import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface OgStory {
  baseSha: string;
  headSha: string;
  /** e.g. "1 passed in 0.42s" */
  baseResult: string;
  /** e.g. "1 failed in 0.39s" */
  headResult: string;
  /** Which values came from the corpus rather than the fallback. */
  source: { shas: 'manifest' | 'fallback'; results: 'fixture' | 'fallback' };
}

export const OG_FALLBACK = {
  baseSha: '7c41a09',
  headSha: '9c2d4b1',
  baseResult: '1 passed in 0.42s',
  headResult: '1 failed in 0.39s',
} as const;

const SUMMARY = /(\d+ (?:passed|failed|errors?|skipped|xfailed|xpassed)(?:, \d+ (?:passed|failed|errors?|skipped|xfailed|xpassed|warnings?|deselected))*) in (\d+(?:\.\d+)?)s\b/g;

/** The last pytest summary in a captured excerpt: "1 failed, 2 passed in 0.39s". Null when there is none. */
export function pytestSummary(excerpt: unknown): string | null {
  if (typeof excerpt !== 'string') return null;
  let last: RegExpExecArray | null = null;
  for (const m of excerpt.matchAll(SUMMARY)) last = m;
  return last ? `${last[1]} in ${last[2]}s` : null;
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const short = (sha: unknown) => (typeof sha === 'string' && /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : null);

export function loadOgStory(fixturesDir = path.join(process.cwd(), 'public', 'fixtures')): OgStory {
  const manifest = readJson(path.join(fixturesDir, 'manifest.json'));
  const ids = isRecord(manifest) && isRecord(manifest.ids) ? manifest.ids : {};
  const baseSha = short(ids.base_sha);
  const headSha = short(ids.head_sha);

  let baseResult: string | null = null;
  let headResult: string | null = null;
  if (typeof ids.demo_review_id === 'string' && typeof ids.proven_finding_id === 'string') {
    const result = readJson(path.join(fixturesDir, 'reviews', `${ids.demo_review_id}.result.json`));
    const findings = isRecord(result) && Array.isArray(result.findings) ? result.findings : [];
    const proven = findings.find((f): f is Record<string, unknown> => isRecord(f) && f.id === ids.proven_finding_id);
    const proof = proven && isRecord(proven.proof) ? proven.proof : null;
    baseResult = pytestSummary(proof && isRecord(proof.base) ? proof.base.excerpt : null);
    headResult = pytestSummary(proof && isRecord(proof.head) ? proof.head.excerpt : null);
  }

  return {
    baseSha: baseSha ?? OG_FALLBACK.baseSha,
    headSha: headSha ?? OG_FALLBACK.headSha,
    baseResult: baseResult ?? OG_FALLBACK.baseResult,
    headResult: headResult ?? OG_FALLBACK.headResult,
    source: {
      shas: baseSha && headSha ? 'manifest' : 'fallback',
      results: baseResult && headResult ? 'fixture' : 'fallback',
    },
  };
}
