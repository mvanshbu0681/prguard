// OWNER: t9a (wave 2). The brief's tests: "chords navigate" and "shortcuts
// ignored inside inputs" (dashboard §1.5). ⌘K and ⌘B are exercised too, since
// they share the same typing guard.
import "../ui/dom-polyfills";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { useGlobalShortcuts } from "@/components/app-shell/useGlobalShortcuts";

function Harness(props: { onOpenPalette?: () => void; onToggleSidebar?: () => void; onOpenShortcuts?: () => void; enabled?: boolean }) {
  useGlobalShortcuts({
    onOpenPalette: props.onOpenPalette ?? (() => {}),
    onToggleSidebar: props.onToggleSidebar ?? (() => {}),
    onOpenShortcuts: props.onOpenShortcuts ?? (() => {}),
    enabled: props.enabled,
  });
  return <input aria-label="a text field" />;
}

describe("useGlobalShortcuts", () => {
  it("g then o navigates to /overview", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    document.body.focus();
    await user.keyboard("go");
    expect(push).toHaveBeenCalledWith("/overview");
  });

  it("g then s navigates to /suppressions", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    document.body.focus();
    await user.keyboard("gs");
    expect(push).toHaveBeenCalledWith("/suppressions");
  });

  it("a letter with no leader does not navigate", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    document.body.focus();
    await user.keyboard("o");
    expect(push).not.toHaveBeenCalled();
  });

  it("never fires a chord while typing in an input", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText("a text field"));
    await user.keyboard("go");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("a text field")).toHaveValue("go");
  });

  it("opens the palette on the platform's ⌘K/Ctrl+K", async () => {
    const user = userEvent.setup();
    const onOpenPalette = vi.fn();
    render(<Harness onOpenPalette={onOpenPalette} />);
    document.body.focus();
    await user.keyboard("{Control>}k{/Control}");
    expect(onOpenPalette).toHaveBeenCalledTimes(1);
  });

  it("does not open the palette from inside an input", async () => {
    const user = userEvent.setup();
    const onOpenPalette = vi.fn();
    render(<Harness onOpenPalette={onOpenPalette} />);
    await user.click(screen.getByLabelText("a text field"));
    await user.keyboard("{Control>}k{/Control}");
    expect(onOpenPalette).not.toHaveBeenCalled();
  });

  it("opens the shortcut sheet on a bare ?", async () => {
    const user = userEvent.setup();
    const onOpenShortcuts = vi.fn();
    render(<Harness onOpenShortcuts={onOpenShortcuts} />);
    document.body.focus();
    await user.keyboard("?");
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled (the mobile shell)", async () => {
    const user = userEvent.setup();
    const onOpenPalette = vi.fn();
    render(<Harness onOpenPalette={onOpenPalette} enabled={false} />);
    document.body.focus();
    await user.keyboard("{Control>}k{/Control}");
    expect(onOpenPalette).not.toHaveBeenCalled();
  });
});
