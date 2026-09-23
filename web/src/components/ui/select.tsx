"use client";

// OWNER: T1b (wave 1). Design §5.2 (the trigger is an input) + §3.6 level 3
// (the listbox is a popover surface), motion §4.3 (enter scaleY 0.98 → 1 from
// the trigger edge, 180ms --ease-snap; no slide, no blur).
//
// The selected option carries a filled 6px --signal square, not a checkmark.
// `container` portals the listbox into a specific element (e.g. a
// data-surface wrapper) instead of document.body.
import * as React from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" className={className} {...props} />;
}

function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  size = "md",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  /** md = 32px (default), sm = 26px. "default" is the shadcn name for md. */
  size?: "sm" | "md" | "default";
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size === "sm" ? "sm" : "md"}
      className={cn("ui-input ui-select-trigger", className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon strokeWidth={1.5} aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "popper",
  align = "start",
  sideOffset = 4,
  container,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content> & {
  container?: React.ComponentProps<typeof SelectPrimitive.Portal>["container"];
}) {
  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        align={align}
        sideOffset={position === "popper" ? sideOffset : undefined}
        className={cn("ui-pop ui-menu ui-menu--select", className)}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport data-slot="select-viewport" data-position={position}>
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return <SelectPrimitive.Label data-slot="select-label" className={cn("ui-menu-label", className)} {...props} />;
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item data-slot="select-item" className={cn("ui-item ui-item--option", className)} {...props}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="ui-item__mark" aria-hidden="true">
        <SelectPrimitive.ItemIndicator>
          <span className="ui-item__fill" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator data-slot="select-separator" className={cn("ui-menu-separator", className)} {...props} />;
}

function SelectScrollUpButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton data-slot="select-scroll-up-button" className={cn("ui-select-scroll", className)} {...props}>
      <ChevronUpIcon strokeWidth={1.5} aria-hidden="true" />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton data-slot="select-scroll-down-button" className={cn("ui-select-scroll", className)} {...props}>
      <ChevronDownIcon strokeWidth={1.5} aria-hidden="true" />
    </SelectPrimitive.ScrollDownButton>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
