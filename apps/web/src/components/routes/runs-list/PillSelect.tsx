'use client';
// A native <select> dressed as the kit's pill field: keyboard, screen readers and
// the phone's own picker all come for free. Reads --w-* tokens only.
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import s from './runs-list.module.css';

export interface PillSelectOption {
  value: string;
  label: string;
}

export function PillSelect({
  label,
  value,
  options,
  onChange,
  icon: Glyph,
  className,
}: {
  /** Accessible name. */
  label: string;
  value: string;
  options: PillSelectOption[];
  onChange: (value: string) => void;
  icon?: LucideIcon;
  className?: string;
}) {
  const active = options[0] ? value !== options[0].value : false;
  return (
    <label className={cn(s.pillSelect, active && s.pillSelectActive, className)}>
      {Glyph ? <Glyph size={15} strokeWidth={1.9} aria-hidden /> : null}
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} strokeWidth={2} aria-hidden className={s.pillChevron} />
    </label>
  );
}
