// OWNER: t8a (wave 3). The root 500: brand-gaps §F — identical grammar to
// the 404, a request id, never "we're working on it".
import "../ui/dom-polyfills";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "../../../app/error";

describe("app/error (500)", () => {
  it("uses the section-index grammar and states the failure plainly", () => {
    const error = Object.assign(new Error("boom"), { digest: "req_abc123" });
    render(<ErrorPage error={error} retry={() => {}} />);
    expect(screen.getByText(/\/ 500 — UNHANDLED/)).toBeInTheDocument();
    expect(screen.getByText("Something on our side failed. The request id is below.")).toBeInTheDocument();
  });

  it("never claims anyone is working on it, and has no illustration", () => {
    const error = Object.assign(new Error("boom"), { digest: "req_abc123" });
    const { container } = render(<ErrorPage error={error} retry={() => {}} />);
    expect(container.textContent ?? "").not.toMatch(/working on it/i);
    expect(container.textContent ?? "").not.toMatch(/oops/i);
    expect(container.querySelectorAll("img").length).toBe(0);
  });

  it("shows the request id and copies it on click", async () => {
    const user = userEvent.setup();
    // @testing-library/user-event installs its own navigator.clipboard stub
    // (a getter, reattached in its global afterEach) — spy on its writeText
    // rather than replacing the whole object, or the stub clobbers a mock
    // assigned ahead of time.
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const error = Object.assign(new Error("boom"), { digest: "req_abc123" });
    render(<ErrorPage error={error} retry={() => {}} />);
    expect(screen.getByText(/request id req_abc123/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /copy request id/i }));
    expect(writeText).toHaveBeenCalledWith("req_abc123");
    expect(await screen.findByRole("button", { name: "COPIED" })).toBeInTheDocument();
  });

  it("calls retry() from Try again", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: undefined });
    render(<ErrorPage error={error} retry={retry} />);
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("gives a way home", () => {
    const error = Object.assign(new Error("boom"), { digest: undefined });
    render(<ErrorPage error={error} retry={() => {}} />);
    const home = screen.getByRole("link", { name: /back to the proof bench/i });
    expect(home).toHaveAttribute("href", "/");
  });
});
