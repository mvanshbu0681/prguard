// OWNER: t8a (wave 3). The root 404: brand-gaps §F copy and grammar (brief's
// binding "404 copy" test) — no illustration, no "Oops", a way home, and the
// provenance footer states the path that was actually requested.
import "../ui/dom-polyfills";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/does-not-exist",
}));

const { default: NotFound } = await import("../../../app/not-found");

describe("app/not-found (404)", () => {
  it("uses the section-index grammar and states there is nothing at this path", () => {
    render(<NotFound />);
    expect(screen.getByText(/\/ 404 — NO SUCH ROUTE/)).toBeInTheDocument();
    expect(screen.getByText("There is nothing at this path.")).toBeInTheDocument();
  });

  it("has no illustration and never says \"Oops\"", () => {
    const { container } = render(<NotFound />);
    expect(container.textContent ?? "").not.toMatch(/oops/i);
    expect(container.querySelectorAll("img").length).toBe(0);
  });

  it("gives a way home", () => {
    render(<NotFound />);
    const home = screen.getByRole("link", { name: /back to the proof bench/i });
    expect(home).toHaveAttribute("href", "/#proof");
  });

  it("the provenance footer states the path that was actually requested, and the status code", () => {
    render(<NotFound />);
    expect(screen.getByText(/GET \/does-not-exist · 404/)).toBeInTheDocument();
  });
});
