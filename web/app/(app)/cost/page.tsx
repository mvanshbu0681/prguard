// OWNER: t9a (wave 2). Plan A3: `/cost` is not built for the beta.
import type { Metadata } from 'next';
import { BetaNotFound } from '@/components/app-shell';

export const metadata: Metadata = { title: 'Cost & latency' };

export default function Page() {
  return <BetaNotFound route="/cost" />;
}
