"use client";

// OWNER: T1b (wave 1). Design §5.10 + brand-gaps §2 ruling 9.
//
// PERMITTED USES ONLY: filter panels, the suppression form below 1024px, and
// settings sub-forms. BANNED for finding detail: the proof terminal needs
// ~940px at 13px mono, and a sheet would truncate the artifact the product
// rests on. Finding detail is a master-detail split plus a full page.
//
// Right side only. 420px (full width on a phone), --ink-1, 1px --rule-2 left
// edge, no radius, no shadow, scrim var(--scrim). Enter: translateX(100% → 0)
// on --ease-instrument in 180ms — the design's 240ms is over the 220ms
// dashboard ceiling (motion §2.2), and sheets are dashboard-only. Exit 160ms
// --ease-exit. Reduced motion: opacity only, 120ms. Focus trapped, Esc
// closes, focus returns to the trigger (Radix Dialog).
import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal(props: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return <SheetPrimitive.Overlay data-slot="sheet-overlay" className={cn("ui-scrim", className)} {...props} />;
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  container,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  /** Right only (design §5.10). The prop exists so shadcn call sites compile. */
  side?: "right";
  showCloseButton?: boolean;
  container?: React.ComponentProps<typeof SheetPrimitive.Portal>["container"];
}) {
  return (
    <SheetPortal container={container}>
      <SheetOverlay />
      <SheetPrimitive.Content data-slot="sheet-content" data-side={side} className={cn("ui-sheet", className)} {...props}>
        {children}
        {showCloseButton ? (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button variant="quiet" size="icon-sm" className="ui-sheet__close" aria-label="Close">
              <XIcon strokeWidth={1.5} aria-hidden="true" />
            </Button>
          </SheetPrimitive.Close>
        ) : null}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("ui-sheet__header", className)} {...props} />;
}

/** The scrolling middle of a sheet. */
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-body" className={cn("ui-sheet__body", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("ui-sheet__footer", className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn("ui-dialog__title", className)} {...props} />;
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={cn("type-small text-text-body", className)} {...props} />;
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetBody, SheetFooter, SheetTitle, SheetDescription };
