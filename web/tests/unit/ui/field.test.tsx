// OWNER: T1b (wave 1). Design §5.2 and §8.2: the label names the control, the hint
// and the error describe it (aria-describedby), the error sets aria-invalid and is
// never colour alone. Holds for a control nested inside another component (a
// SelectTrigger inside its Select root), which is why the wiring is context.
import "./dom-polyfills";
import { render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Field, useFieldControl } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { declValue, parseCss, readWebFile } from "./css-tree";

const CSS = parseCss(readWebFile("src/styles/ui.css"));

const describedBy = (el: HTMLElement) => (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);

describe("Field wiring", () => {
  it("names an Input by its label and describes it by the hint", () => {
    render(
      <Field label="Pull request" hint="owner/repo#42 or a URL.">
        <Input />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Pull request" });
    const hint = screen.getByText("owner/repo#42 or a URL.");
    expect(describedBy(input)).toEqual([hint.id]);
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.getByText("Pull request")).toHaveAttribute("for", input.id);
  });

  it("marks an error: aria-invalid, described by hint and error, glyph plus text, not an alert", () => {
    render(
      <Field label="Reason" hint="Required. At least 8 characters." error="3 characters. A reason needs 8." required>
        <Textarea defaultValue="dup" />
      </Field>,
    );
    const textarea = screen.getByRole("textbox", { name: "Reason" });
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(textarea).toHaveAttribute("aria-required", "true");
    const error = screen.getByText("3 characters. A reason needs 8.").closest("p")!;
    const hint = screen.getByText("Required. At least 8 characters.");
    expect(describedBy(textarea)).toEqual([hint.id, error.id]);
    expect(error.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(textarea).toHaveAccessibleDescription("Required. At least 8 characters. 3 characters. A reason needs 8.");
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it("wires a SelectTrigger nested inside its Select root", () => {
    render(
      <Field label="Scope" error="Pick a scope.">
        <Select defaultValue="file">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="line">line</SelectItem>
            <SelectItem value="file">file</SelectItem>
          </SelectContent>
        </Select>
      </Field>,
    );
    const trigger = screen.getByRole("combobox", { name: "Scope" });
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger).toHaveAccessibleDescription("Pick a scope.");
    expect(screen.getByText("Scope")).toHaveAttribute("for", trigger.id);
  });

  it("uses the controlId it is given, and keeps a control's own describedby first", () => {
    render(
      <>
        <p id="format-note">A SHA is 40 hex characters.</p>
        <Field label="Head SHA" hint="Copy it from the run." controlId="head-sha">
          <Input mono aria-describedby="format-note" />
        </Field>
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Head SHA" });
    expect(input.id).toBe("head-sha");
    expect(describedBy(input)).toEqual(["format-note", "head-sha-hint"]);
    expect(input).toHaveAttribute("data-mono", "");
  });

  it("gives two Fields distinct ids", () => {
    render(
      <>
        <Field label="Base">
          <Input />
        </Field>
        <Field label="Head">
          <Input />
        </Field>
      </>,
    );
    const [a, b] = screen.getAllByRole("textbox");
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("leaves a control outside any Field untouched", () => {
    const { result } = renderHook(() => useFieldControl({ id: "x", "aria-describedby": "y" }));
    expect(result.current).toEqual({ id: "x", "aria-describedby": "y" });
    render(<Input aria-label="Filter" />);
    expect(screen.getByRole("textbox", { name: "Filter" })).not.toHaveAttribute("aria-describedby");
  });

  it("merges inside a Field through the hook, for a hand-built control", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Field label="Expiry" hint="ISO date." error="In the past." required controlId="expiry">
        {children}
      </Field>
    );
    const { result } = renderHook(() => useFieldControl({}), { wrapper });
    expect(result.current).toEqual({ id: "expiry", "aria-describedby": "expiry-hint expiry-error", "aria-invalid": true, "aria-required": true });
  });
});

describe("Field and input styling contract (design §5.2, motion §4.1.6)", () => {
  it("draws a meaning-bearing 1px --ink-7 outline on --ink-1, 32px, 2px radius", () => {
    expect(declValue(CSS, ".ui-input", "border")).toBe("1px solid var(--ink-7)");
    expect(declValue(CSS, ".ui-input", "background-color")).toBe("var(--ink-1)");
    expect(declValue(CSS, ".ui-input", "height")).toBe("32px");
    expect(declValue(CSS, ".ui-input", "border-radius")).toBe("var(--radius-data)");
  });

  it("flips an invalid border to --alarm in 0ms (the border is geometry, so alarm is legal)", () => {
    expect(declValue(CSS, '.ui-input[aria-invalid="true"]', "border-color")).toBe("var(--alarm)");
    expect(declValue(CSS, '.ui-input[aria-invalid="true"]', "transition-duration")).toBe("var(--dur-0)");
  });

  it("sets the label in 11px mono caps --text-dim and the error in --alarm-text, the hint in --text-body", () => {
    expect(declValue(CSS, ".ui-field__label", "color")).toBe("var(--text-dim)");
    expect(declValue(CSS, ".ui-field__error", "color")).toBe("var(--alarm-text)");
    expect(declValue(CSS, ".ui-field__hint", "color")).toBe("var(--text-body)");
    expect(declValue(CSS, ".ui-field__label", "margin-bottom")).toBe("6px");
  });
});
