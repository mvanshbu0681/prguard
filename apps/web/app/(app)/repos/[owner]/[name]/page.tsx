// /repos/:owner/:name — a repository and its pull requests. A corpus
// repository gets its real reviews from the server; any other (imported by a
// pasted link) is synthesised in the client view. Next 16: params is a Promise.
import type { Metadata } from 'next';
import { RepoView } from '@/components/routes/repos/RepoView';
import { findFixtureRepo, fixtureContext, fixturePulls, fixtureRepoRefs, fixtureRepoSummary, stageTiming } from '@/components/routes/repos/data.server';

type Params = Promise<{ owner: string; name: string }>;

const decode = (v: string) => {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { owner, name } = await params;
  return { title: `${decode(owner)}/${decode(name)}` };
}

export default async function Page({ params }: { params: Params }) {
  const p = await params;
  const asked = { owner: decode(p.owner), name: decode(p.name) };
  const known = findFixtureRepo(asked.owner, asked.name);
  const repo = known ?? asked;
  return (
    <RepoView
      key={`${repo.owner}/${repo.name}`}
      repo={repo}
      fixture={known ? { summary: fixtureRepoSummary(known), rows: fixturePulls(known), context: fixtureContext(known) } : null}
      fixtureRefs={fixtureRepoRefs()}
      timing={stageTiming()}
    />
  );
}
