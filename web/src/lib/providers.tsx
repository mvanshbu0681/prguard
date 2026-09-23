// OWNER: T2 (wave 1). Stub from T0 — replace entirely.
// Rendered by app/layout.tsx around every route. T2 replaces this passthrough
// with the client providers (TanStack Query, the nuqs adapter, and shadcn's
// TooltipProvider, which src/components/ui/tooltip.tsx expects an ancestor to render).
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
