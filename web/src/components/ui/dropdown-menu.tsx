"use client";

// OWNER: T1b (wave 1). Design §3.6 level 3 (--ink-3 fill, --rule-2 hairline,
// inset highlight, no shadow), motion §4.3 (scaleY 0.98 → 1 from the trigger
// edge, 180ms --ease-snap; exit 160ms --ease-exit).
//
// Items are 32px, 13px Inter. The highlighted item (pointer or keyboard) steps
// one rung: ink-3 → ink-4. Shortcut hints are 11px mono. A destructive item is
// --alarm-text on the same fill — never a red fill. Selection marks are
// squares: a checkbox item shows a box that fills, a radio item a filled square.
// `container` portals the menu into a specific element instead of document.body.
import * as React from "react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function DropdownMenu(props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal(props: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuTrigger(props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  className,
  align = "start",
  sideOffset = 4,
  container,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content> & {
  container?: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>["container"];
}) {
  return (
    <DropdownMenuPrimitive.Portal container={container}>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn("ui-pop ui-menu", className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuGroup(props: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset ? "" : undefined}
      data-variant={variant}
      className={cn("ui-item", className)}
      {...props}
    />
  );
}

// Indicator items are always inset — the box sits in the inset — so `inset` only sets the attribute.
function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset ? "" : undefined}
      className={cn("ui-item ui-item--indicator", className)}
      checked={checked}
      {...props}
    >
      <span className="ui-item__box" aria-hidden="true">
        <DropdownMenuPrimitive.ItemIndicator>
          <span className="ui-item__fill" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup(props: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset ? "" : undefined}
      className={cn("ui-item ui-item--indicator", className)}
      {...props}
    >
      <span className="ui-item__mark" aria-hidden="true">
        <DropdownMenuPrimitive.ItemIndicator>
          <span className="ui-item__fill" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset ? "" : undefined}
      className={cn("ui-menu-label", className)}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn("ui-menu-separator", className)} {...props} />;
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="dropdown-menu-shortcut" className={cn("ui-shortcut", className)} {...props} />;
}

function DropdownMenuSub(props: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset ? "" : undefined}
      className={cn("ui-item data-[state=open]:bg-(--ui-hover-row)", className)}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ui-item__trail" strokeWidth={1.5} aria-hidden="true" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return <DropdownMenuPrimitive.SubContent data-slot="dropdown-menu-sub-content" className={cn("ui-pop ui-menu", className)} {...props} />;
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
