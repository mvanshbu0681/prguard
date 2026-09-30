"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api";

let browserClient: QueryClient | undefined;

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        refetchOnWindowFocus: true,
        // Live states (running reviews, scanning briefs) must settle even in a tab that isn't focused.
        refetchIntervalInBackground: true,
        // Client errors (404, 403) won't fix themselves; retry only transient failures.
        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
  });
}

function getClient(): QueryClient {
  if (typeof window === "undefined") return makeClient();
  browserClient ??= makeClient();
  return browserClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getClient()}>{children}</QueryClientProvider>;
}
