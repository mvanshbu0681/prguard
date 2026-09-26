// OWNER: T3. A replay key never fires while someone is typing, and never on a chord.
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { isTypingTarget, matchesKey, shouldHandleKey, useKeyBinding } from "@/motion/keys";

function key(init: KeyboardEventInit & { key: string }, target: EventTarget = document.body): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(e, "target", { value: target });
  return e;
}

describe("shouldHandleKey", () => {
  it("handles a plain key, case-insensitively (Caps Lock still replays)", () => {
    expect(shouldHandleKey(key({ key: "p" }), "p")).toBe(true);
    expect(shouldHandleKey(key({ key: "P" }), "p")).toBe(true);
    expect(shouldHandleKey(key({ key: "r" }), ["p", "r"])).toBe(true);
    expect(shouldHandleKey(key({ key: "d" }), "p")).toBe(false);
  });

  it.each([
    ["Shift", { shiftKey: true }],
    ["Ctrl", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
    ["Alt", { altKey: true }],
  ])("ignores %s chords", (_label, mods) => {
    expect(shouldHandleKey(key({ key: "p", ...mods }), "p")).toBe(false);
  });

  it("ignores auto-repeat, IME composition and already-handled events", () => {
    expect(shouldHandleKey(key({ key: "p", repeat: true }), "p")).toBe(false);
    expect(shouldHandleKey(key({ key: "p", isComposing: true }), "p")).toBe(false);
    const handled = key({ key: "p" });
    handled.preventDefault();
    expect(shouldHandleKey(handled, "p")).toBe(false);
  });

  const withAttr = (tag: string, name: string, value: string) => () => {
    const el = document.createElement(tag);
    el.setAttribute(name, value); // what React renders for contentEditable / role
    return el;
  };

  it.each([
    ["an input", () => document.createElement("input")],
    ["a checkbox input", withAttr("input", "type", "checkbox")],
    ["a textarea", () => document.createElement("textarea")],
    ["a select", () => document.createElement("select")],
    ["a contenteditable element", withAttr("div", "contenteditable", "true")],
    [
      "a child of a contenteditable element",
      () => {
        const host = withAttr("div", "contenteditable", "")();
        const child = document.createElement("span");
        host.append(child);
        return child;
      },
    ],
    ["an ARIA textbox", withAttr("div", "role", "textbox")],
    ["a combobox (the ⌘K input)", withAttr("div", "role", "combobox")],
  ])("ignores keys typed into %s", (_label, make) => {
    const el = make();
    expect(isTypingTarget(el)).toBe(true);
    expect(shouldHandleKey(key({ key: "p" }, el), "p")).toBe(false);
  });

  it("does not treat buttons, links or contenteditable=false as typing", () => {
    const off = document.createElement("div");
    off.setAttribute("contenteditable", "false");
    for (const el of [document.createElement("button"), document.createElement("a"), off]) expect(isTypingTarget(el)).toBe(false);
  });

  it("matchesKey needs a key", () => {
    expect(matchesKey({ key: "" }, "p")).toBe(false);
  });
});

function Bound({ onKey, enabled = true }: { onKey: (e: KeyboardEvent) => void; enabled?: boolean }) {
  useKeyBinding(["p", "r"], onKey, enabled);
  return (
    <div>
      <input aria-label="field" />
      <div contentEditable suppressContentEditableWarning aria-label="editor">
        text
      </div>
    </div>
  );
}

describe("useKeyBinding", () => {
  it("calls the handler for the bound keys on window and prevents the default", () => {
    const onKey = vi.fn();
    render(<Bound onKey={onKey} />);
    const e = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    fireEvent.keyDown(document.body, { key: "R" });
    fireEvent.keyDown(document.body, { key: "x" });
    expect(onKey).toHaveBeenCalledTimes(2);
    expect(e.defaultPrevented).toBe(true);
  });

  it("ignores keys typed into an input or a contenteditable, and chords", () => {
    const onKey = vi.fn();
    const { getByLabelText } = render(<Bound onKey={onKey} />);
    fireEvent.keyDown(getByLabelText("field"), { key: "p" });
    fireEvent.keyDown(getByLabelText("editor"), { key: "p" });
    fireEvent.keyDown(document.body, { key: "p", metaKey: true });
    fireEvent.keyDown(document.body, { key: "p", shiftKey: true });
    expect(onKey).not.toHaveBeenCalled();
  });

  it("unbinds on unmount and when disabled", () => {
    const onKey = vi.fn();
    const { rerender, unmount } = render(<Bound onKey={onKey} enabled={false} />);
    fireEvent.keyDown(document.body, { key: "p" });
    expect(onKey).not.toHaveBeenCalled();
    rerender(<Bound onKey={onKey} />);
    fireEvent.keyDown(document.body, { key: "p" });
    expect(onKey).toHaveBeenCalledTimes(1);
    unmount();
    fireEvent.keyDown(document.body, { key: "p" });
    expect(onKey).toHaveBeenCalledTimes(1);
  });

  it("always calls the latest handler", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Bound onKey={first} />);
    rerender(<Bound onKey={second} />);
    fireEvent.keyDown(document.body, { key: "p" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
