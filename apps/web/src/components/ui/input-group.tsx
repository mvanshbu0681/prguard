"use client";

// OWNER: T1b (wave 1). An input with inline addons (a search glyph, a unit, a
// clear button). The group IS the input: --ink-1, 1px --ink-7, 2px radius,
// 32px; the control inside is borderless and the 2px --signal-hi ring is drawn
// on the group when the control has keyboard focus.
import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="input-group" role="group" className={cn("ui-input-group", className)} {...props} />;
}

export type InputGroupAddonAlign = "inline-start" | "inline-end" | "block-start" | "block-end";

function InputGroupAddon({ className, align = "inline-start", ...props }: React.ComponentProps<"div"> & { align?: InputGroupAddonAlign }) {
  return (
    // A click on the addon's padding focuses the control, as a click on an <input> would.
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn("ui-input-group__addon", className)}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        event.currentTarget.parentElement?.querySelector<HTMLElement>("input, textarea")?.focus();
      }}
      {...props}
    />
  );
}

function InputGroupButton({
  className,
  type = "button",
  variant = "quiet",
  size = "icon-sm",
  ...props
}: ButtonProps) {
  return <Button type={type} variant={variant} size={size} className={className} {...props} />;
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="input-group-text" className={cn("ui-input-group__text", className)} {...props} />;
}

function InputGroupInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return <Input data-slot="input-group-control" className={className} {...props} />;
}

function InputGroupTextarea({ className, ...props }: React.ComponentProps<typeof Textarea>) {
  return <Textarea data-slot="input-group-control" className={cn("resize-none", className)} {...props} />;
}

export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupInput, InputGroupTextarea };
