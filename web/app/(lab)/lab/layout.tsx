// OWNER: T0 (wave 0). FROZEN once T0 merges.
//
// /lab/* is where each track develops its components in isolation: add your own
// app/(lab)/lab/<track>/page.tsx (never edit another track's). It is served by
// `next dev` and by builds made with NEXT_PUBLIC_LAB=1; every other production
// build 404s it. Lab pages set no surface: wrap content in data-surface="app" or
// data-surface="marketing" to see that surface's tokens.
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export default function LabLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_LAB !== "1") notFound();
  return (
    <main id="main" className="min-h-dvh">
      {children}
    </main>
  );
}
