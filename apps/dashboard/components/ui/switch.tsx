"use client";

import clsx from "clsx";

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
};

export function Switch({ checked, onChange, label, disabled, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={clsx(
        "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "bg-accent" : "bg-surface-4 shadow-[inset_0_0_0_1px_var(--color-line-2)] hover:bg-surface-3",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          "absolute left-0.5 size-3 rounded-full transition-[transform,background-color] duration-150",
          checked ? "translate-x-3 bg-surface-0" : "translate-x-0 bg-dim",
        )}
      />
    </button>
  );
}
