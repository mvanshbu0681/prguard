'use client';
// An empty result, on the landing system: a lime icon disc, one sentence that
// names the filter or condition that produced it (never a bare "No data"), and
// pill actions. Routes with their own illustrated empty state use the kit's
// <EmptyState> directly; this one keeps the older message/actions API.
import { SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/dash/kit';
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
    <div className={cn('flex flex-col items-center gap-4 rounded-w-card bg-w-surface px-6 py-12 text-center', className)} data-empty-state="">
      <span className="grid size-12 place-items-center rounded-w-pill bg-w-lime text-w-on-lime" aria-hidden>
        <SearchX size={20} strokeWidth={1.9} />
      </span>
      <p className="max-w-[52ch] text-[15px] leading-relaxed text-w-text-2">{message}</p>
      {actions.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {actions.map((action) => (
            <Button key={action.label} variant="outline" size="sm" href={action.href} onClick={action.onClick}>
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
