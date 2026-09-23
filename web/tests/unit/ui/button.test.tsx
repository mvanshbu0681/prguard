// OWNER: T1b (wave 1). Design §5.1, motion §4.1.1 — and the brief's test:
// "Button loading renders no spinner".
import "./dom-polyfills";
import type { FormEvent } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button, LoadingEllipsis, buttonVariants, resolveButtonSize, resolveButtonVariant } from "@/components/ui/button";
import { Toaster, toast } from "@/components/ui/sonner";
import { declValue, parseCss, readWebFile } from "./css-tree";

const CSS = parseCss(readWebFile("src/styles/ui.css"));

/**
 * Anything that would read as a spinner: a rotating class, a lucide loader glyph,
 * sonner's default spinner (sonner-spinner + twelve sonner-loading-bar divs), a
 * ring of circles, a progressbar. (sonner's own `sonner-loader` wrapper is only
 * a slot; what matters is what it holds.)
 */
function spinnerParts(root: ParentNode): Element[] {
  return [...root.querySelectorAll("*")].filter((el) => {
    const cls = el.getAttribute("class") ?? "";
    return (
      /spin|rotate|animate-|lucide-loader|lucide-refresh|lucide-rotate|sonner-spinner|sonner-loading-bar|sonner-loading-wrapper/i.test(cls) ||
      el.tagName.toLowerCase() === "circle" ||
      el.getAttribute("role") === "progressbar"
    );
  });
}

describe("Button loading renders no spinner", () => {
  it("renders the stepped ellipsis — three squares — and nothing that spins", () => {
    render(<Button loading>RUN A REVIEW</Button>);
    const button = screen.getByRole("button", { name: "RUN A REVIEW" });
    expect(spinnerParts(button)).toEqual([]);
    const ellipsis = button.querySelector('[data-slot="button-ellipsis"]');
    expect(ellipsis).not.toBeNull();
    expect(ellipsis).toHaveAttribute("aria-hidden", "true");
    const rects = ellipsis!.querySelectorAll("svg rect");
    expect(rects).toHaveLength(3);
    for (const r of rects) {
      expect(r.getAttribute("width")).toBe("2");
      expect(r.getAttribute("height")).toBe("2");
    }
  });

  it("keeps the label in the box, so the width cannot change", () => {
    render(<Button loading>RUN A REVIEW</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("RUN A REVIEW");
    expect(declValue(CSS, ".ui-btn[data-loading]", "color")).toBe("transparent");
    expect(declValue(CSS, ".ui-btn__ellipsis", "position")).toBe("absolute");
  });

  it("is busy and inert, but stays focusable", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        RUN
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    button.focus();
    expect(button).toHaveFocus();
  });

  it("does not submit its form while loading", async () => {
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" loading>
          SUPPRESS
        </Button>
      </form>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("the toaster's loading toast uses the same ellipsis, not sonner's spinner", async () => {
    render(<Toaster />);
    toast.loading("SUPPRESSING");
    const title = await screen.findByText("SUPPRESSING");
    const card = title.closest("[data-sonner-toast]")!;
    expect(card.querySelector('[data-slot="loading-ellipsis"]')).not.toBeNull();
    expect(spinnerParts(card)).toEqual([]);
  });

  it("LoadingEllipsis alone is a decorative, aria-hidden SVG", () => {
    const { container } = render(<LoadingEllipsis />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("svg")).toHaveAttribute("focusable", "false");
  });
});

describe("Button variants and sizes", () => {
  it("resolves the vendored shadcn names onto the design's variants", () => {
    expect(resolveButtonVariant(undefined)).toBe("primary");
    expect(resolveButtonVariant("default")).toBe("primary");
    expect(resolveButtonVariant("outline")).toBe("ghost");
    expect(resolveButtonVariant("secondary")).toBe("ghost");
    expect(resolveButtonVariant("destructive")).toBe("destructive");
    expect(resolveButtonSize(undefined)).toBe("md");
    expect(resolveButtonSize("default")).toBe("md");
    expect(resolveButtonSize("xs")).toBe("sm");
    expect(resolveButtonSize("icon-lg")).toBe("icon");
  });

  it("hands each variant to its hover-language class", () => {
    expect(buttonVariants({ variant: "primary" })).toBe("ui-btn ui-btn--primary hover-primary");
    expect(buttonVariants({ variant: "ghost", size: "sm" })).toBe("ui-btn ui-btn--ghost ui-btn--sm hover-ghost");
    expect(buttonVariants({ variant: "quiet" })).toBe("ui-btn ui-btn--quiet hover-quiet");
    expect(buttonVariants({ variant: "link" })).toBe("ui-btn ui-btn--link link-draw");
    expect(buttonVariants({ variant: "destructive" })).toBe("ui-btn ui-btn--destructive hover-ghost");
  });

  it("makes a destructive action a ghost with alarm text — never a red fill (R2)", () => {
    render(<Button variant="destructive">REVOKE</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).not.toMatch(/bg-|alarm/);
    expect(declValue(CSS, ".ui-btn--destructive", "border-color")).toBe("var(--rule-2)");
    expect(declValue(CSS, ".ui-btn--destructive", "--ui-btn-fg")).toBe("var(--alarm-text)");
  });

  it("sets the design's geometry: 2px radius, 26/32/40px, 11px mono caps labels", () => {
    expect(declValue(CSS, ".ui-btn", "border-radius")).toBe("var(--radius-data)");
    expect(declValue(CSS, ".ui-btn", "height")).toBe("32px");
    expect(declValue(CSS, ".ui-btn--sm", "height")).toBe("26px");
    expect(declValue(CSS, ".ui-btn--lg", "height")).toBe("40px");
    const btn = CSS.children.flatMap((c) => c.children).find((b) => b.prelude === ".ui-btn");
    expect(btn?.decls.some((d) => d.prop === "@apply type-label")).toBe(true);
    expect(declValue(CSS, ".ui-btn--primary", "background-color")).toBe("var(--signal)");
    expect(declValue(CSS, ".ui-btn--primary", "--ui-btn-fg")).toBe("var(--ink-0)");
  });

  it("disables with the disabled palette and a not-allowed cursor", () => {
    render(<Button disabled>RUN</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(declValue(CSS, '.ui-btn--primary:is(:disabled, [aria-disabled="true"]):not([data-loading])', "background-color")).toBe("var(--ink-5)");
  });

  it("renders its child as the control with asChild, ellipsis included", () => {
    render(
      <Button asChild variant="ghost" loading>
        <a href="#run">OPEN RUN</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "OPEN RUN" });
    expect(link).toHaveClass("ui-btn", "ui-btn--ghost", "hover-ghost");
    expect(link.querySelector('[data-slot="button-ellipsis"]')).not.toBeNull();
  });
});
