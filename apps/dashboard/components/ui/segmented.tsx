"use client";

import clsx from "clsx";

type Option<T extends string> = { value: T; label: string };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex h-8 items-center gap-0.5 rounded-md border border-line-2 bg-surface-1 p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={clsx(
              "h-full rounded-[4px] px-2.5 text-sm transition-colors duration-100",
              active ? "bg-surface-4 text-primary shadow-hi-strong" : "text-dim hover:text-primary",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
