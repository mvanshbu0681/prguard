"use client";

// OWNER: T1b (wave 1). Toasts — design §5.14, motion §4.3, dashboard §2.0 / §6.
//
// Toasts report WRITE outcomes only (a suppression recorded, a re-run queued, a
// rollback). A read failure is an inline error inside its frame, never a toast.
//
//   notifyWrite({ tone: "success", title: "SUPPRESSION RECORDED",
//                 method: "POST", path: "/v1/findings/…/suppress", status: 201 })
//
// Card: --ink-2, 1px --rule-2, 2px radius, 12px padding, the inset highlight,
// no shadow, 360px, bottom-right, 16px from the edges, at most 3 visible. The
// tone is a 2px left bar — info --ink-7, success --signal-lo (never green),
// caution --marker, error --alarm — plus the title text, so colour is never
// the only channel. Title: 11px mono caps --text-primary (four words at most).
// Body: the endpoint and the status code in 11px mono, like a provenance line.
// Success and info auto-dismiss after 5000ms (paused while hovered); an error
// stays until dismissed. Announced through sonner's polite live region — not
// role="alert", which is reserved for the merge gate (design §8.4).
import * as React from "react";
import { Toaster as Sonner, toast, type ToasterProps } from "sonner";
import { XIcon } from "lucide-react";
import { LoadingEllipsis } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ToastTone = "info" | "success" | "caution" | "error";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface WriteOutcome {
  tone: ToastTone;
  /** 11px mono caps, four words at most: "SUPPRESSION RECORDED", "RE-RUN QUEUED". */
  title: string;
  method: HttpMethod;
  /** The path that was actually requested. */
  path: string;
  /** The status code it answered with. */
  status: number;
  requestId?: string;
}

/** Auto-dismiss for success and info (design §5.14). WCAG 2.2.2 caps auto-moving content at 5s. */
export const TOAST_DURATION_MS = 5000;

/** "POST /v1/findings/{id}/suppress · 201 · req_8f3a21" — the body of every write toast. */
export function formatEndpoint({ method, path, status, requestId }: Pick<WriteOutcome, "method" | "path" | "status" | "requestId">): string {
  return [`${method} ${path}`, String(status), requestId].filter(Boolean).join(" · ");
}

const SONNER_TYPE = { info: "info", success: "success", caution: "warning", error: "error" } as const;

/** Show the outcome of a write. Errors persist until dismissed; everything else leaves after 5000ms. */
export function notifyWrite(outcome: WriteOutcome): string | number {
  const description = formatEndpoint(outcome);
  const persistent = outcome.tone === "error";
  return toast[SONNER_TYPE[outcome.tone]](outcome.title, {
    description,
    duration: persistent ? Infinity : TOAST_DURATION_MS,
    closeButton: persistent ? true : undefined,
  });
}

const CLASS_NAMES = {
  toast: "ui-toast",
  content: "ui-toast__content",
  title: "ui-toast__title",
  description: "ui-toast__body",
  icon: "ui-toast__icon",
  closeButton: "ui-toast__close",
  actionButton: "ui-btn ui-btn--ghost ui-btn--sm hover-ghost",
  cancelButton: "ui-btn ui-btn--quiet ui-btn--sm hover-quiet",
  success: "ui-toast--success",
  info: "ui-toast--info",
  warning: "ui-toast--caution",
  error: "ui-toast--error",
  loading: "ui-toast--info",
} satisfies NonNullable<ToasterProps["toastOptions"]>["classNames"];

function Toaster({ className, style, toastOptions, ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      expand
      visibleToasts={3}
      gap={8}
      offset={16}
      mobileOffset={16}
      duration={TOAST_DURATION_MS}
      containerAriaLabel="Write outcomes"
      className={cn("ui-toaster", className)}
      style={{ "--width": "360px", ...style } as React.CSSProperties}
      // null suppresses sonner's default glyphs (a checkmark for success, among
      // them); loading gets the static ellipsis instead of a spinner.
      icons={{ success: null, info: null, warning: null, error: null, loading: <LoadingEllipsis />, close: <XIcon strokeWidth={1.5} aria-hidden="true" /> }}
      toastOptions={{ unstyled: true, ...toastOptions, classNames: { ...CLASS_NAMES, ...toastOptions?.classNames } }}
      {...props}
    />
  );
}

export interface ToastCardProps extends Omit<React.ComponentProps<"div">, "title"> {
  tone?: ToastTone;
  title: React.ReactNode;
  /** The endpoint line; formatEndpoint() makes it. */
  body?: React.ReactNode;
  /** A leading glyph — in practice the loading ellipsis, as sonner shows for a loading toast. */
  icon?: React.ReactNode;
  onDismiss?: () => void;
}

/**
 * The same card, outside the toaster: the markup and classes sonner renders for
 * notifyWrite(). For specimens and for docs — a real notification goes through
 * notifyWrite() so it stacks, times out and is announced.
 */
function ToastCard({ tone = "info", title, body, icon, onDismiss, className, ...props }: ToastCardProps) {
  return (
    <div data-slot="toast-card" data-tone={tone} className={cn("ui-toast", `ui-toast--${tone}`, className)} {...props}>
      {icon ? <div className="ui-toast__icon">{icon}</div> : null}
      <div className="ui-toast__content">
        <div className="ui-toast__title">{title}</div>
        {body ? <div className="ui-toast__body">{body}</div> : null}
      </div>
      {onDismiss ? (
        <button type="button" className="ui-toast__close" aria-label="Close toast" onClick={onDismiss}>
          <XIcon strokeWidth={1.5} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export { Toaster, ToastCard, toast };
