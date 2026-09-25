"use client";
// OWNER: T2 (wave 1) — t2a.
//
// Rendered by app/layout.tsx around every route: TanStack Query, the nuqs
// adapter for the app router (URL-first filters), shadcn's TooltipProvider
// (src/components/ui/tooltip.tsx expects an ancestor) and the sonner <Toaster />
// that write failures raise into (styled by t1b).
//
// Fixture mode (NEXT_PUBLIC_FIXTURES, default on) is installed here, at module
// scope, before anything renders: the generated client sends through the
// transport, and the transport sends through the fixture resolver. The client
// is born pointing there already (src/api/runtime-config.ts); this line states
// it where the app is assembled.
import { QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";
import { setTransportBase } from "@/api/transport";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FIXTURES } from "@/lib/env";
import { fixtureFetch } from "@/lib/fixture-resolver";
import { installAuditHasher } from "@/lib/audit-hasher";
import { getQueryClient } from "@/lib/query";

if (FIXTURES) {
  setTransportBase(fixtureFetch, "fixture");
  // Fixture-mode suppressions append audit events; t6's hasher chains them with the
  // backend's canonical rules (plan A8) instead of leaving event_hash "pending".
  installAuditHasher();
}

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
