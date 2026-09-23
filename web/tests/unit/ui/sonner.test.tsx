// OWNER: T1b (wave 1). Toasts — design §5.14, dashboard §2.0 / §6: write outcomes
// only; the body carries the endpoint and the status code; an error persists; the
// tone is a 2px bar plus the title (never colour alone, never green, no checkmark).
import "./dom-polyfills";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TOAST_DURATION_MS, ToastCard, Toaster, formatEndpoint, notifyWrite, toast } from "@/components/ui/sonner";
import { declValue, parseCss, readWebFile } from "./css-tree";

const CSS = parseCss(readWebFile("src/styles/ui.css"));

afterEach(() => {
  vi.restoreAllMocks();
  toast.dismiss();
});

describe("formatEndpoint", () => {
  it("prints the method, the path and the status, like a provenance line", () => {
    expect(formatEndpoint({ method: "POST", path: "/v1/findings/a91f3c2e/suppress", status: 201 })).toBe("POST /v1/findings/a91f3c2e/suppress · 201");
  });

  it("appends the request id when there is one", () => {
    expect(formatEndpoint({ method: "POST", path: "/v1/findings/a91f3c2e/suppress", status: 422, requestId: "req_8f3a21" })).toBe(
      "POST /v1/findings/a91f3c2e/suppress · 422 · req_8f3a21",
    );
  });
});

describe("notifyWrite", () => {
  const outcome = { title: "SUPPRESSION RECORDED", method: "POST" as const, path: "/v1/findings/a/suppress", status: 201 };

  it("auto-dismisses success after 5000ms (the WCAG 2.2.2 ceiling)", () => {
    const spy = vi.spyOn(toast, "success");
    notifyWrite({ ...outcome, tone: "success" });
    expect(TOAST_DURATION_MS).toBe(5000);
    expect(spy).toHaveBeenCalledWith("SUPPRESSION RECORDED", { description: "POST /v1/findings/a/suppress · 201", duration: 5000, closeButton: undefined });
  });

  it("keeps an error until it is dismissed, with a close button", () => {
    const spy = vi.spyOn(toast, "error");
    notifyWrite({ ...outcome, tone: "error", title: "SUPPRESS REJECTED", status: 422 });
    expect(spy).toHaveBeenCalledWith("SUPPRESS REJECTED", { description: "POST /v1/findings/a/suppress · 422", duration: Infinity, closeButton: true });
  });

  it("routes caution to sonner's warning and info to info", () => {
    const warning = vi.spyOn(toast, "warning");
    const info = vi.spyOn(toast, "info");
    notifyWrite({ ...outcome, tone: "caution", title: "SUPPRESSION REVOKED" });
    notifyWrite({ ...outcome, tone: "info", title: "RE-RUN REQUESTED" });
    expect(warning).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledOnce();
  });
});

describe("the rendered toast", () => {
  it("renders our card — tone class, mono caps title, endpoint body — with no glyph for success", async () => {
    render(<Toaster />);
    act(() => {
      notifyWrite({ tone: "success", title: "SUPPRESSION RECORDED", method: "POST", path: "/v1/findings/a/suppress", status: 201 });
    });
    const title = await screen.findByText("SUPPRESSION RECORDED");
    const card = title.closest("[data-sonner-toast]")!;
    expect(card).toHaveClass("ui-toast", "ui-toast--success");
    expect(title).toHaveClass("ui-toast__title");
    expect(screen.getByText("POST /v1/findings/a/suppress · 201")).toHaveClass("ui-toast__body");
    // sonner's default success glyph is a checkmark: the icon slot must be empty.
    expect(card.querySelector("[data-icon]")).toBeNull();
    expect(card.querySelector("svg")).toBeNull();
  });

  it("lives in a polite region — never role=alert, which the merge gate owns", async () => {
    render(<Toaster />);
    act(() => {
      notifyWrite({ tone: "error", title: "SUPPRESS REJECTED", method: "POST", path: "/v1/findings/a/suppress", status: 422 });
    });
    const title = await screen.findByText("SUPPRESS REJECTED");
    expect(title.closest('[role="alert"]')).toBeNull();
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("ToastCard renders the same card outside the toaster", () => {
    render(<ToastCard tone="caution" title="SUPPRESSION REVOKED" body="DELETE /v1/suppressions/{suppression_id} · 200" onDismiss={() => undefined} />);
    const card = screen.getByText("SUPPRESSION REVOKED").closest('[data-slot="toast-card"]')!;
    expect(card).toHaveClass("ui-toast", "ui-toast--caution");
    expect(card).toHaveAttribute("data-tone", "caution");
    expect(screen.getByRole("button", { name: "Close toast" })).toBeInTheDocument();
  });
});

describe("toast styling contract", () => {
  it("is an ink-2 card on a rule-2 hairline, 2px radius, no drop shadow", () => {
    expect(declValue(CSS, ".ui-toast", "background-color")).toBe("var(--ink-2)");
    expect(declValue(CSS, ".ui-toast", "border")).toBe("1px solid var(--rule-2)");
    expect(declValue(CSS, ".ui-toast", "border-radius")).toBe("var(--radius-data)");
    expect(declValue(CSS, ".ui-toast", "box-shadow")).toBe("inset 0 1px 0 var(--inset-hi)");
  });

  it("carries the tone as a 2px bar: ink-7, signal-lo (never green), marker, alarm", () => {
    expect(declValue(CSS, ".ui-toast::before", "width")).toBe("2px");
    expect(declValue(CSS, ".ui-toast::before", "background-color")).toBe("var(--ui-toast-bar, var(--ink-7))");
    expect(declValue(CSS, ".ui-toast--success", "--ui-toast-bar")).toBe("var(--signal-lo)");
    expect(declValue(CSS, ".ui-toast--caution", "--ui-toast-bar")).toBe("var(--marker)");
    expect(declValue(CSS, ".ui-toast--error", "--ui-toast-bar")).toBe("var(--alarm)");
  });
});
