// OWNER: t9a (wave 2). Plan A3: `/runs` (the list) is not built for the beta —
// only `/runs/:id` is (another track owns that dynamic route; this file is the
// bare `/runs`, listed as a known-but-unbuilt path).
import type { Metadata } from 'next';
import { BetaNotFound } from '@/components/app-shell';

export const metadata: Metadata = { title: 'Runs' };

export default function Page() {
  return <BetaNotFound route="/runs" />;
}
