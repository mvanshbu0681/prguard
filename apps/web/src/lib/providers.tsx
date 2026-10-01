"use client";
// OWNER: T2 (wave 1) — t2a.
//
// Rendered by app/layout.tsx around every route: TanStack Query, the nuqs
// adapter for the app router (URL-first filters), shadcn's TooltipProvider
// (src/components/ui/tooltip.tsx expects an ancestor) and the sonner <Toaster />
// that write failures raise into (styled by t1b).
import { QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getQueryClient } from "@/lib/query";

export function Providers({ children }: { children: ReactNode }) {
  // Not useState: a browser-wide singleton survives a suspending first render
  // (TanStack's app-router pattern); the server gets a fresh client per request.
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </NuqsAdapter>
    </QueryClientProvider>
  );
}
