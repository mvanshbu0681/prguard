"use client";

// OWNER: T1b (wave 1). A segmented control built from Toggles. spacing={0}
// (the default) joins the segments: one shared 1px border between neighbours,
// square inner corners, 2px outer corners. spacing={n} separates them by n×4px.
// type="single" gives each item role="radio"; type="multiple" gives aria-pressed.
import * as React from "react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { toggleVariants, type ToggleSize, type ToggleVariant } from "@/components/ui/toggle";

type GroupContext = { variant?: ToggleVariant | null; size?: ToggleSize | "default" | null };

const ToggleGroupContext = React.createContext<GroupContext>({ variant: "outline", size: "md" });

function ToggleGroup({
  className,
  variant = "outline",
  size = "md",
  spacing = 0,
  orientation = "horizontal",
  style,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  GroupContext & {
    /** Gap between items in 4px steps. 0 = joined segments. */
    spacing?: number;
    orientation?: "horizontal" | "vertical";
  }) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant ?? undefined}
      data-size={size ?? undefined}
      data-spacing={spacing}
      data-orientation={orientation}
      orientation={orientation}
      style={{ "--ui-gap": spacing, ...style } as React.CSSProperties}
      className={cn("ui-toggle-group", className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>{children}</ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & GroupContext) {
  const context = React.useContext(ToggleGroupContext);
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={toggleVariants({ variant: variant ?? context.variant, size: size ?? context.size, className })}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };
