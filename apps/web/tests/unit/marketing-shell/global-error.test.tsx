// OWNER: t8a (wave 3). global-error: renders its own <html>/<body> (Next
// requires it for a root-layout failure), same 500 grammar as app/error.
import "../ui/dom-polyfills";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GlobalError from "../../../app/global-error";

describe("app/global-error (500, root layout failure)", () => {
  it("its root element is <html>, wrapping a <body> (Next requires both for a root-layout failure)", () => {
    // Testing Library's render() mounts into a container React DOM refuses to
    // nest a fresh <html>/<body> inside (a jsdom/React 19 constraint this
    // harness cannot route around: Next itself replaces the whole document
    // for this file, which no test container does) — so the element tree is
    // inspected directly, without mounting to the DOM, which is exactly what
    // "renders its own <html>/<body>" means: this component's root, not a
    // fragment that assumes a surrounding one.
    const error = Object.assign(new Error("boom"), { digest: "req_xyz" });
    const element = GlobalError({ error, retry: () => {} });
    expect(element.type).toBe("html");
    const body = element.props.children;
    expect(body.type).toBe("body");
  });

  it("uses the same section-index grammar, never says \"Oops\" or that anyone is working on it", () => {
    const error = Object.assign(new Error("boom"), { digest: "req_xyz" });
    const { container } = render(<GlobalError error={error} retry={() => {}} />);
    expect(screen.getByText(/\/ 500 — UNHANDLED/)).toBeInTheDocument();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/oops/i);
    expect(text).not.toMatch(/working on it/i);
  });

  it("calls retry() from Try again", async () => {
    const retry = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: undefined });
    render(<GlobalError error={error} retry={retry} />);
    screen.getByRole("button", { name: /try again/i }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("gives a way home", () => {
    const error = Object.assign(new Error("boom"), { digest: undefined });
    render(<GlobalError error={error} retry={() => {}} />);
    const home = screen.getByRole("link", { name: /back to the proof bench/i });
    expect(home).toHaveAttribute("href", "/");
  });
});
