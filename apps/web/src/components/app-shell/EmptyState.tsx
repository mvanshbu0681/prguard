'use client';
// OWNER: t9a (wave 2). The dashboard's one empty-state grammar (dashboard §2.0):
// never "No data available" — the message names the filter that produced the
// empty result, and offers the next action. Wave 3's screens supply both; this
// component only lays them out identically everywhere.
//
//   <EmptyState
//     message="No findings above medium in this run. 4 were dropped at S4 as speculative."
//     actions={[{ label: 'Show dropped', onClick: showDropped }, { label: 'Clear filters', href: '/findings' }]}
//   />
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

export interface EmptyStateProps {
  /** Names the filter or condition that produced the empty result. Never a bare "No data". */
  message: ReactNode;
  actions?: EmptyStateAction[];
  className?: string;
}

export function EmptyState({ message, actions = [], className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-start gap-4 py-12', className)} data-empty-state="">
      <p className="type-body max-w-(--measure-body) text-text-body">{message}</p>
      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) =>
            action.href ? (
              <Button key={action.label} asChild variant="ghost">
                <Link href={action.href}>{action.label}</Link>
              </Button>
            ) : (
              <Button key={action.label} variant="ghost" onClick={action.onClick}>
                {action.label}
              </Button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
