"use client";

// OWNER: T1b (wave 1). The ⌘K palette — design §5.13, motion §4.3, dashboard §1.4.
//
// Container: 560px, --ink-1 at 92% behind blur(16px) saturate(1.4) — one of the
// two backdrop-filter surfaces in the product (the other is the sticky app
// header) — 1px --rule-2, 6px radius, 18vh from the top, no shadow. Enter:
// opacity + scale(0.985 → 1) in 180ms --ease-snap. Input: 48px, 15px Inter, a
// --rule-1 bottom rule. Groups: 11px mono caps. Items: 36px, 13px Inter, a 14px
// icon, a mono shortcut hint on the right; the selected item is --ink-3 with a
// 2px --signal left bar. The list's height follows --cmdk-list-height (the one
// bounded layout animation, capped at 8 visible rows).
//
// Nested pages (the suppress flow: reason → scope → expiry → confirm) are the
// consumer's: keep a page stack in state and render a different <CommandList>.
import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Dialog as DialogPrimitive } from "radix-ui";
import { SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRestoreFocus } from "./restore-focus";

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive data-slot="command" className={cn("ui-command", className)} {...props} />;
}

function CommandDialog({
  title = "Command palette",
  description = "Type a page, a finding id or an action.",
  children,
  className,
  container,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root> & {
  title?: string;
  description?: string;
  className?: string;
  container?: React.ComponentProps<typeof DialogPrimitive.Portal>["container"];
}) {
  const focus = useRestoreFocus();
  return (
    <DialogPrimitive.Root data-slot="command-dialog" {...props}>
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Overlay data-slot="command-dialog-overlay" className="ui-scrim" />
        <DialogPrimitive.Content data-slot="command-dialog-content" className={cn("ui-palette", className)} {...focus}>
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div data-slot="command-input-row" className="ui-command__input-row">
      <SearchIcon strokeWidth={1.5} aria-hidden="true" />
      <CommandPrimitive.Input data-slot="command-input" className={cn("ui-command__input", className)} {...props} />
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List data-slot="command-list" className={cn("ui-command__list", className)} {...props} />;
}

function CommandEmpty({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty data-slot="command-empty" className={cn("ui-command__empty", className)} {...props} />;
}

function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return <CommandPrimitive.Group data-slot="command-group" className={cn("ui-command__group", className)} {...props} />;
}

function CommandSeparator({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return <CommandPrimitive.Separator data-slot="command-separator" className={cn("ui-command__separator", className)} {...props} />;
}

function CommandItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item> & {
  /** Marks the current choice (a scope, an expiry) with a 6px --signal square. Never a checkmark. */
  checked?: boolean;
}) {
  return (
    <CommandPrimitive.Item data-slot="command-item" data-checked={checked ? "true" : undefined} className={cn("ui-command__item", className)} {...props}>
      {children}
      {checked ? <span className="ui-command__item-mark" aria-hidden="true" /> : null}
    </CommandPrimitive.Item>
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="command-shortcut" className={cn("ui-shortcut", className)} {...props} />;
}

export { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut, CommandSeparator };
