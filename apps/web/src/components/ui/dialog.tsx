"use client";

// OWNER: T1b (wave 1). Design §5.11 + brand-gaps §2 ruling 6.
//
// Panel: --ink-1, 1px --rule-2, 4px radius, the inset highlight — the overlay
// rung of the elevation model with NO drop shadow. 560px max, 24px padding.
// Scrim: var(--scrim). Enter: opacity + scale(0.98 → 1), 180ms --ease-snap;
// exit 160ms --ease-exit. Under reduced motion: opacity only, 120ms.
// Header 18px display, body 15px Inter, footer right-aligned with an 8px gap
// and the primary action last. Radix supplies the focus trap, Esc, focus
// return and role="dialog" + aria-modal + aria-labelledby — every dialog needs
// a <DialogTitle>. `container` portals into a specific element.
import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRestoreFocus } from "./restore-focus";

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay data-slot="dialog-overlay" className={cn("ui-scrim", className)} {...props} />;
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  container,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  container?: React.ComponentProps<typeof DialogPrimitive.Portal>["container"];
}) {
  const focus = useRestoreFocus(onOpenAutoFocus, onCloseAutoFocus);
  return (
    <DialogPortal container={container}>
      <DialogOverlay />
      <DialogPrimitive.Content data-slot="dialog-content" className={cn("ui-dialog", className)} {...props} {...focus}>
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button variant="quiet" size="icon-sm" className="ui-dialog__close" aria-label="Close">
              <XIcon strokeWidth={1.5} aria-hidden="true" />
            </Button>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("ui-dialog__header", className)} {...props} />;
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & { showCloseButton?: boolean }) {
  return (
    <div data-slot="dialog-footer" className={cn("ui-dialog__footer", className)} {...props}>
      {showCloseButton ? (
        <DialogPrimitive.Close asChild>
          <Button variant="ghost">CLOSE</Button>
        </DialogPrimitive.Close>
      ) : null}
      {children}
    </div>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("ui-dialog__title", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn("ui-dialog__description", className)} {...props} />;
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger };
