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

/** [ids, classes/attributes/pseudo-classes, elements/pseudo-elements] for the simple selectors used here. */
function specificity(selector: string): [number, number, number] {
  const s = selector.replace(/:(not|is)\(/g, "(").replace(/"[^"]*"|'[^']*'/g, "");
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const pseudoElements = (s.match(/::[\w-]+/g) ?? []).length;
  const classes = (s.match(/\.[\w-]+/g) ?? []).length + (s.match(/\[[^\]]+\]/g) ?? []).length + (s.replace(/::[\w-]+/g, "").match(/:[\w-]+/g) ?? []).length;
  const elements = (s.replace(/\[[^\]]+\]/g, "").match(/(^|[\s>+~(])[a-z][\w-]*/g) ?? []).length;
  return [ids, classes, elements + pseudoElements];
}
const beats = (a: [number, number, number], b: [number, number, number]) => a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])));

describe("the toaster overrides outrank sonner's unlayered rules", () => {
  const sonnerCss = readWebFile("node_modules/sonner/dist/styles.css").replace(/\s+/g, " ");
  const ours = readWebFile("src/styles/ui.css");

  it.each([
    ["[data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast] [data-close-button]", ".ui-toaster[data-sonner-toaster] [data-sonner-toast] .ui-toast__close[data-close-button]"],
    [
      "[data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast] [data-close-button]:hover",
      ".ui-toaster[data-sonner-toaster] [data-sonner-toast] .ui-toast__close[data-close-button]:hover",
    ],
    ["[data-sonner-toast][data-removed='true'][data-front='true'][data-swipe-out='false']", '.ui-toaster [data-sonner-toast][data-removed="true"][data-front="true"][data-swipe-out="false"]'],
    [
      "[data-sonner-toast][data-removed='true'][data-front='false'][data-swipe-out='false'][data-expanded='true']",
      '.ui-toaster [data-sonner-toast][data-removed="true"][data-front="false"][data-swipe-out="false"][data-expanded="true"]',
    ],
    [".sonner-loader[data-visible='false']", '.ui-toaster .ui-toast__icon .sonner-loader[data-visible="false"]'],
    ["[data-sonner-toaster][data-sonner-theme='dark'] [data-description]", ".ui-toaster[data-sonner-toaster] [data-sonner-toast] .ui-toast__body"],
    ["[data-sonner-toast]:focus-visible", ".ui-toaster [data-sonner-toast]:focus-visible"],
    ["[data-sonner-toaster][data-lifted='true']", '.ui-toaster[data-sonner-toaster][data-lifted="true"]'],
    [
      "[data-sonner-toast][data-removed='true'][data-front='false'][data-swipe-out='false'][data-expanded='false']",
      '.ui-toaster [data-sonner-toast][data-removed="true"][data-front="false"][data-swipe-out="false"][data-expanded="false"]',
    ],
    ["[data-sonner-toast][data-swipe-out='true'][data-y-position='bottom']", '.ui-toaster [data-sonner-toast][data-swipe-out="true"][data-y-position]'],
    ["[data-sonner-toast]", ".ui-toaster [data-sonner-toast]"],
  ])("%s", (sonnerSelector, ourSelector) => {
    expect(sonnerCss, "the sonner rule this override answers is gone: re-check the override").toContain(sonnerSelector);
    expect(ours.includes(`${ourSelector} {`) || ours.includes(`${ourSelector},`), `ui.css declares ${ourSelector}`).toBe(true);
    expect(beats(specificity(ourSelector), specificity(sonnerSelector)), `${ourSelector} must outrank ${sonnerSelector}`).toBe(true);
  });

  it("computes specificity the way the cascade does", () => {
    expect(specificity("[data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast] [data-close-button]")).toEqual([0, 4, 0]);
    expect(specificity('.ui-toaster [data-sonner-toast][data-y-position="bottom"]:not([data-mounted="true"])')).toEqual([0, 4, 0]);
    expect(specificity(".ui-toast::before")).toEqual([0, 1, 1]);
  });

  it("keeps the tone bar off ::before, which sonner restyles on swipe and exit", () => {
    expect(sonnerCss).toContain("[data-sonner-toast][data-swiping='false'][data-removed='true']::before");
    expect(ours).not.toMatch(/\.ui-toast::before/);
  });
});

describe("toast styling contract", () => {
  it("is an ink-2 card on a rule-2 hairline, 2px radius, no drop shadow", () => {
    expect(declValue(CSS, ".ui-toast", "background-color")).toBe("var(--ink-2)");
    expect(declValue(CSS, ".ui-toast", "border")).toBe("1px solid var(--rule-2)");
    expect(declValue(CSS, ".ui-toast", "border-radius")).toBe("var(--radius-data)");
    expect(declValue(CSS, ".ui-toast", "box-shadow")).toBe("inset 0 1px 0 var(--inset-hi)");
  });

  it("carries the tone as a 2px left border: ink-7, signal-lo (never green), marker, alarm", () => {
    expect(declValue(CSS, ".ui-toast", "border-left")).toBe("2px solid var(--ui-toast-bar, var(--ink-7))");
    // Never on ::before: sonner stretches the toast's ::before to inset 0 as it exits.
    expect(declValue(CSS, ".ui-toast::before", "background-color")).toBeUndefined();
    expect(declValue(CSS, ".ui-toast--success", "--ui-toast-bar")).toBe("var(--signal-lo)");
    expect(declValue(CSS, ".ui-toast--caution", "--ui-toast-bar")).toBe("var(--marker)");
    expect(declValue(CSS, ".ui-toast--error", "--ui-toast-bar")).toBe("var(--alarm)");
  });
});
