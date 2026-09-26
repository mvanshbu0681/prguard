// OWNER: t9a (wave 2). Plan A3: every `/settings/*` path except the static
// sibling `/settings/policy` is not built for the beta. Next resolves the
// static segment first, so `/settings/policy` never reaches this catch-all —
// it wins, exactly as the brief specifies. Next 16: `params` is a Promise.
import type { Metadata } from 'next';
import { BetaNotFound } from '@/components/app-shell';

export const metadata: Metadata = { title: 'Settings' };

export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <BetaNotFound route={`/settings/${slug.join('/')}`} />;
}
