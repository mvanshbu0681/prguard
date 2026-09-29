// /repos/:owner/:name/pulls/:number — a pull request and its Witness review.
// The server resolves what the corpus knows (the PR's real latest run and its
// findings, for an acme repository) and passes the recorded stage timing and
// the finding pool the client simulation borrows from. Next 16: params is a
// Promise. A non-numeric number is a 404.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PullView } from '@/components/routes/repos/PullView';
import { demoReviewId, findFixtureRepo, fixtureContext, fixturePull, fixtureRepoRefs, simulationPool, stageTiming } from '@/components/routes/repos/data.server';
import { contextFor } from '@/components/routes/repos/model';

type Params = Promise<{ owner: string; name: string; number: string }>;

const decode = (v: string) => {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { owner, name, number } = await params;
  return { title: `${decode(owner)}/${decode(name)}#${number}` };
}

export default async function Page({ params }: { params: Params }) {
  const p = await params;
  const number = Number(p.number);
  if (!/^\d+$/.test(p.number) || !Number.isSafeInteger(number) || number < 1) notFound();
  const asked = { owner: decode(p.owner), name: decode(p.name) };
  const known = findFixtureRepo(asked.owner, asked.name);
  const repo = known ?? asked;
  return (
    <PullView
      key={`${repo.owner}/${repo.name}#${number}`}
      repo={repo}
      number={number}
      known={!!known}
      context={known ? fixtureContext(known) : contextFor(repo)}
      fixture={known ? fixturePull(known, number) : null}
      fixtureRefs={fixtureRepoRefs()}
      pool={simulationPool(known)}
      timing={stageTiming()}
      demoReviewId={demoReviewId()}
    />
  );
}
