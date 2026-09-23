// OWNER: T1b (wave 1). Design §5.1, motion §4.1.1–4.1.2 and §7 class C.
//
//   <Button>RUN A REVIEW →</Button>                     primary: solid --signal, --ink-0 label
//   <Button variant="ghost">DOCS</Button>                1px --rule-2
//   <Button variant="quiet" size="sm">CLEAR</Button>     no border, --text-dim → --text-body
//   <Button variant="link">ALL SIX METRICS →</Button>    --signal-text, 1px rule drawn on hover
//   <Button variant="destructive">REVOKE</Button>        a ghost with --alarm-text. Never a red fill.
//   <Button loading>RUN</Button>                         stepped ellipsis, width held, aria-busy
//
// Labels are 11px Google Sans Code 500 caps +0.12em (type-label): write them in
// caps, and keep them to four words. Hover, press and focus come from the shared
// hover language in src/styles/ui.css (hover-primary / hover-ghost / hover-quiet /
// link-draw), so a Button and a hand-built control can never drift apart.
import * as React from "react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

/** The five button variants the design ships. */
export type ButtonVariant = "primary" | "ghost" | "quiet" | "link" | "destructive";
/** The vendored-shadcn names, kept so generated call sites still compile. */
export type ButtonVariantAlias = "default" | "outline" | "secondary";
export type ButtonSize = "sm" | "md" | "lg" | "icon-sm" | "icon";
export type ButtonSizeAlias = "default" | "xs" | "icon-xs" | "icon-lg";

const VARIANT_ALIAS: Record<ButtonVariantAlias, ButtonVariant> = {
  default: "primary",
  outline: "ghost",
  secondary: "ghost",
};
const SIZE_ALIAS: Record<ButtonSizeAlias, ButtonSize> = {
  default: "md",
  xs: "sm",
  "icon-xs": "icon-sm",
  "icon-lg": "icon",
};

/** Variant → the hover-language class that owns its hover, press and timing. */
const HOVER_CLASS: Record<ButtonVariant, string> = {
  primary: "hover-primary",
  ghost: "hover-ghost",
  quiet: "hover-quiet",
  link: "link-draw",
  destructive: "hover-ghost",
};

export function resolveButtonVariant(variant: ButtonVariant | ButtonVariantAlias | null | undefined): ButtonVariant {
  if (!variant) return "primary";
  return (VARIANT_ALIAS as Record<string, ButtonVariant>)[variant] ?? (variant as ButtonVariant);
}

export function resolveButtonSize(size: ButtonSize | ButtonSizeAlias | null | undefined): ButtonSize {
  if (!size) return "md";
  return (SIZE_ALIAS as Record<string, ButtonSize>)[size] ?? (size as ButtonSize);
}

export interface ButtonVariantProps {
  variant?: ButtonVariant | ButtonVariantAlias | null;
  size?: ButtonSize | ButtonSizeAlias | null;
  className?: string;
}

/** Class names for a button-styled element that is not a <Button> (e.g. a Next <Link>). */
export function buttonVariants({ variant, size, className }: ButtonVariantProps = {}): string {
  const v = resolveButtonVariant(variant);
  const s = resolveButtonSize(size);
  return cn("ui-btn", `ui-btn--${v}`, s !== "md" && `ui-btn--${s}`, HOVER_CLASS[v], className);
}

/**
 * The loading glyph: three 2px squares that type themselves out on the
 * heartbeat period ("." → ".." → "…"), and stand still at "…" under reduced
 * motion. Drawn in SVG: Google Sans Code has no ⋯. Never a spinner.
 */
export function LoadingEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span data-slot="loading-ellipsis" className={cn("ui-ellipsis", className)} aria-hidden="true" {...props}>
      <svg viewBox="0 0 14 2" width="14" height="2" focusable="false">
        <rect x="0" y="0" width="2" height="2" fill="currentColor" />
        <rect x="6" y="0" width="2" height="2" fill="currentColor" />
        <rect x="12" y="0" width="2" height="2" fill="currentColor" />
      </svg>
    </span>
  );
}

export interface ButtonProps extends React.ComponentProps<"button">, Omit<ButtonVariantProps, "className"> {
  /** Render the child element (a link, a Next <Link>) with the button's styling and behaviour. */
  asChild?: boolean;
  /** An in-flight request: the label keeps its width, a stepped ellipsis replaces it, clicks are ignored. */
  loading?: boolean;
}

function Button({ className, variant, size, asChild = false, loading = false, children, onClick, ...props }: ButtonProps) {
  const v = resolveButtonVariant(variant);
  const s = resolveButtonSize(size);
  const Comp = asChild ? Slot.Root : "button";
  const inert = loading || props["aria-disabled"] === true || props["aria-disabled"] === "true";

  // aria-disabled (not `disabled`) while loading, so focus stays on the control
  // the user just pressed. The click — including a form's implicit submit — is
  // swallowed here instead.
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (inert) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <Comp
      {...props}
      data-slot="button"
      data-variant={v}
      data-size={s}
      data-loading={loading ? "" : undefined}
      aria-busy={loading || undefined}
      aria-disabled={loading ? true : props["aria-disabled"]}
      className={buttonVariants({ variant: v, size: s, className })}
      onClick={handleClick}
    >
      {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : children}
      {loading ? <LoadingEllipsis data-slot="button-ellipsis" className="ui-btn__ellipsis" /> : null}
    </Comp>
  );
}

export { Button };
