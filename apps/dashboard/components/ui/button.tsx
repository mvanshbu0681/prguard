import clsx from "clsx";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

type Style = { variant?: ButtonVariant; size?: ButtonSize; className?: string };

const base =
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium " +
  "transition-[background-color,border-color,color] duration-100 " +
  "disabled:pointer-events-none aria-disabled:pointer-events-none " +
  "[&_svg]:shrink-0";

const sizes: Record<ButtonSize, string> = {
  sm: "h-7 text-xs [&_svg]:size-3.5",
  md: "h-8 text-sm [&_svg]:size-3.5",
  lg: "h-9 text-sm [&_svg]:size-4",
};

// Ghost buttons sit tighter: they have no border to breathe inside.
const padding: Record<ButtonSize, [solid: string, ghost: string]> = {
  sm: ["px-2.5", "px-2"],
  md: ["px-3", "px-2"],
  lg: ["px-4", "px-3"],
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-surface-0 shadow-hi-accent hover:bg-accent-hover active:bg-accent " +
    "disabled:bg-surface-3 disabled:text-faint disabled:shadow-hi aria-disabled:opacity-40",
  secondary:
    "border border-line-2 bg-surface-2 text-primary shadow-hi hover:border-line-3 hover:bg-surface-3 active:bg-surface-4 " +
    "disabled:opacity-40 aria-disabled:opacity-40",
  ghost: "text-dim hover:bg-surface-2 hover:text-primary active:bg-surface-3 disabled:opacity-40 aria-disabled:opacity-40",
};

export function buttonClass({ variant = "secondary", size = "md", className }: Style = {}): string {
  return clsx(base, sizes[size], padding[size][variant === "ghost" ? 1 : 0], variants[variant], className);
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & Style) {
  return <button type={type} className={buttonClass({ variant, size, className })} {...props} />;
}

// External link styled as a button; always opens in a new tab.
export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & Style) {
  return (
    <a target="_blank" rel="noreferrer" className={buttonClass({ variant, size, className })} {...props} />
  );
}
