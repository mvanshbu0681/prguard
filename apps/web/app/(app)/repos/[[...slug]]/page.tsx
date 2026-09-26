// OWNER: t9a (wave 2). Plan A3: `/repos` and everything under it (`/repos/:owner/:name`,
// `.../pulls`, `.../pulls/:number`) are not built for the beta. An optional
// catch-all covers the bare `/repos` and every path beneath it with one file.
// Next 16: `params` is a Promise and must be awaited.
import type { Metadata } from 'next';
import { BetaNotFound } from '@/components/app-shell';

export const metadata: Metadata = { title: 'Repositories' };

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const route = `/repos${slug && slug.length > 0 ? `/${slug.join('/')}` : ''}`;
  return <BetaNotFound route={route} />;
}
