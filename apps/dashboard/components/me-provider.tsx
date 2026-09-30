"use client";

import type { Me } from "@contracts";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import { api } from "@/lib/api";
import { keys } from "@/lib/queries";

const MeContext = createContext<Me | null>(null);

export function MeProvider({ me, children }: { me: Me; children: ReactNode }) {
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

// The signed-in user. Seeded by the server layout, kept fresh (and editable) through the query cache.
export function useMe(): Me {
  const initial = useContext(MeContext);
  if (!initial) throw new Error("useMe must be used inside <MeProvider>.");
  const { data } = useQuery({
    queryKey: keys.me,
    queryFn: () => api<Me>("/me"),
    initialData: initial,
    staleTime: 60_000,
  });
  return data;
}

export function hasRepos(me: Me): boolean {
  return me.installations.some((i) => i.repoCount > 0);
}
