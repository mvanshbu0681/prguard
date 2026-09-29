'use client';
// A dashboard path that does not exist: the landing's sky, a glass card, one
// way back. Renders inside the shell, so the rail stays usable.
import { usePathname } from 'next/navigation';
import { Button, GlassTile, PhotoCard } from '@/components/dash/kit';

export default function NotFound() {
  const pathname = usePathname();
  return (
    <div className="mx-auto flex w-full max-w-[1320px] px-4 py-8 md:px-9">
      <PhotoCard className="flex min-h-[520px] w-full flex-col items-center justify-center gap-6 text-center" position="50% 70%" priority>
        <p className="font-w-mono text-[12px] tracking-[0.14em] text-white/80 uppercase">404 · no such page</p>
        <h1 className="font-w-display text-[44px] leading-[1.05] font-semibold tracking-[-1.2px] text-white max-sm:text-[30px]">
          Nothing to witness here
        </h1>
        <GlassTile tone="navy" className="px-4 py-2 font-w-mono text-[12.5px]">
          GET {pathname} · 404
        </GlassTile>
        <Button variant="primary" chip href="/overview" size="lg">
          Back to overview
        </Button>
      </PhotoCard>
    </div>
  );
}
