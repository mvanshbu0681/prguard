// OWNER: m6 (wave 3). The brief's test: "submit routes to /runs/<id>", plus
// the shape-validation and chip/focus behaviour the form owns. Runs through
// the real `useCreateReview` hook against the sample fixture resolver
// (tests/unit/data/sample-corpus.ts), the same pattern
// tests/unit/data/hooks.test.tsx uses — not a hand-rolled mock of the mutation
// — so a change to the resolver's `POST /v1/reviews` contract breaks this
// test too, not just the hook's own.
import "../../ui/dom-polyfills";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));

import { setTransportBase } from "@/api/transport";
import { RunForm } from "@/components/sections/close/run-form";
import { makeQueryClient } from "@/lib/query";
import { EMPTY_PR_URL_MESSAGE, INVALID_PR_URL_MESSAGE } from "@/components/sections/close/pr-validation";
import { queryWrapper, REVIEW_A, testResolver } from "../../data/sample-corpus";

const DEMO_PR = "acme/checkout-service#4821";

function setup(options: Parameters<typeof testResolver>[0] = {}) {
  const { resolver } = testResolver(options);
  setTransportBase(resolver);
  const { Wrapper } = queryWrapper(makeQueryClient());
  return render(<RunForm chips={[DEMO_PR, "acme/web-storefront#1135"]} />, { wrapper: Wrapper });
}

beforeEach(() => {
  push.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  window.location.hash = "";
});
afterEach(() => setTransportBase(null));

describe("RunForm", () => {
  it("renders the input, the pre-warmed chips and the submit", () => {
    setup();
    expect(screen.getByLabelText(/pull request/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: DEMO_PR })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "acme/web-storefront#1135" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /RUN A REVIEW/ })).toBeInTheDocument();
  });

  it("clicking a chip fills the input and focuses it", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "acme/web-storefront#1135" }));
    const input = screen.getByLabelText<HTMLInputElement>(/pull request/i);
    expect(input).toHaveValue("acme/web-storefront#1135");
    expect(input).toHaveFocus();
  });

  it("blocks an empty submission with the required message, never calling the API", async () => {
    const { resolver, loads } = testResolver();
    setTransportBase(resolver);
    const { Wrapper } = queryWrapper(makeQueryClient());
    const user = userEvent.setup();
    render(<RunForm chips={[DEMO_PR]} />, { wrapper: Wrapper });
    await user.click(screen.getByRole("button", { name: /RUN A REVIEW/ }));
    expect(await screen.findByText(EMPTY_PR_URL_MESSAGE)).toBeInTheDocument();
    expect(loads.some((p) => p.includes("/v1/reviews"))).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the backend's INVALID_PR_URL wording on a garbage shape, without calling the API", async () => {
    const { resolver, loads } = testResolver();
    setTransportBase(resolver);
    const { Wrapper } = queryWrapper(makeQueryClient());
    const user = userEvent.setup();
    render(<RunForm chips={[DEMO_PR]} />, { wrapper: Wrapper });
    await user.type(screen.getByLabelText(/pull request/i), "definitely not a pull request");
    await user.click(screen.getByRole("button", { name: /RUN A REVIEW/ }));
    expect(await screen.findByText(INVALID_PR_URL_MESSAGE)).toBeInTheDocument();
    expect(loads.some((p) => p.includes("/v1/reviews"))).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("a valid submission is inert-loading (static ellipsis, aria-busy, no spinner) then routes to /runs/<review id>?replay=1", async () => {
    const user = userEvent.setup();
    setup({ latency: 15 });
    await user.type(screen.getByLabelText(/pull request/i), DEMO_PR);
    const button = screen.getByRole("button", { name: /RUN A REVIEW/ });
    await user.click(button);

    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector("svg")).toBeTruthy(); // the drawn ellipsis, not text/spinner markup
    expect(button.querySelector("[class*='spin']")).toBeFalsy();

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/runs/${REVIEW_A}?replay=1`));
  });

  it("clicking a pre-warmed chip then submitting reaches the same demo run", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "acme/web-storefront#1135" }));
    await user.click(screen.getByRole("button", { name: /RUN A REVIEW/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/runs/${REVIEW_A}?replay=1`));
  });

  it("focuses the input when the page arrives at #run", () => {
    window.location.hash = "#run";
    setup();
    expect(screen.getByLabelText(/pull request/i)).toHaveFocus();
  });

  it("does not focus the input when the hash names a different section", () => {
    window.location.hash = "#accuracy";
    setup();
    expect(screen.getByLabelText(/pull request/i)).not.toHaveFocus();
  });

  it("a later hashchange to #run moves focus into the input", () => {
    setup();
    expect(screen.getByLabelText(/pull request/i)).not.toHaveFocus();
    act(() => {
      window.location.hash = "#run";
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(screen.getByLabelText(/pull request/i)).toHaveFocus();
  });
});
