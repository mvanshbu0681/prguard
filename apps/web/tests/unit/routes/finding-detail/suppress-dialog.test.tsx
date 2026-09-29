// OWNER: d3 (wave 3). <SuppressDialog> — form validation (empty reason,
// pattern scope without match_path) and the optimistic suppress / rollback
// path, over the real useSuppressFinding hook and the sample fixture corpus
// (tests/unit/data/sample-corpus.ts, t2a's own test infra).
import "../../ui/dom-polyfills";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setTransportBase } from "@/api/transport";
import { SuppressDialog } from "@/components/routes/finding-detail/SuppressDialog";
import { useFinding } from "@/lib/hooks";
import { F3, queryWrapper, testResolver } from "../../data/sample-corpus";

const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));

afterEach(() => {
  setTransportBase(null);
  toastError.mockReset();
  toastSuccess.mockReset();
});

describe("SuppressDialog — form validation", () => {
  it("blocks submission and shows an error when the reason is empty", async () => {
    const user = userEvent.setup();
    const { Wrapper } = queryWrapper();
    const onOpenChange = vi.fn();
    render(<SuppressDialog finding={F3} open onOpenChange={onOpenChange} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: "Suppress" }));

    expect(await screen.findByText("A reason is required.")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("blocks submission and shows an error for scope=pattern with no match_path", async () => {
    const user = userEvent.setup();
    const { Wrapper } = queryWrapper();
    const onOpenChange = vi.fn();
    render(<SuppressDialog finding={F3} open onOpenChange={onOpenChange} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("radio", { name: "pattern" }));
    await user.type(screen.getByLabelText("Reason"), "vendor code, tracked in ENG-4102");
    await user.click(screen.getByRole("button", { name: "Suppress" }));

    expect(await screen.findByText("A match path is required for scope=pattern.")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("submits once match_path is filled in for scope=pattern", async () => {
    const user = userEvent.setup();
    const { resolver } = testResolver();
    setTransportBase(async (input) => resolver(input as Request));
    const { Wrapper } = queryWrapper();
    const onOpenChange = vi.fn();
    render(<SuppressDialog finding={F3} open onOpenChange={onOpenChange} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("radio", { name: "pattern" }));
    await user.type(screen.getByLabelText("Match path"), "src/api/**");
    await user.type(screen.getByLabelText("Reason"), "vendor code, tracked in ENG-4102");
    await user.click(screen.getByRole("button", { name: "Suppress" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

describe("SuppressDialog — expiry", () => {
  it("defaults to Never and offers quick picks; Pick a date reveals a date field", async () => {
    const user = userEvent.setup();
    const { Wrapper } = queryWrapper();
    render(<SuppressDialog finding={F3} open onOpenChange={vi.fn()} />, { wrapper: Wrapper });
    const group = screen.getByRole("radiogroup", { name: "Expires" });
    expect(screen.getByRole("radio", { name: "Never" })).toHaveAttribute("aria-checked", "true");
    expect(group.textContent).toContain("30 days");
    expect(screen.queryByLabelText("Expiry date")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "30 days" }));
    expect(screen.getByText(/^Lifts on /)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Pick a date" }));
    expect(screen.getByLabelText("Expiry date")).toHaveAttribute("type", "date");
  });
});

describe("SuppressDialog — optimistic update and rollback", () => {
  let release: () => void;
  let gate: Promise<void>;

  function install(options: { failWith?: "network" } = {}) {
    const { resolver } = testResolver();
    gate = new Promise((resolve) => (release = resolve));
    setTransportBase(async (input) => {
      const req = input as Request;
      if (req.method === "POST") {
        await gate;
        if (options.failWith === "network") throw new TypeError("Failed to fetch");
      }
      return resolver(req);
    });
  }

  it("flips the finding's status to suppressed before the response arrives", async () => {
    install();
    const user = userEvent.setup();
    const { Wrapper } = queryWrapper();
    const findingHook = renderHook(() => useFinding(F3.id), { wrapper: Wrapper });
    await waitFor(() => expect(findingHook.result.current.data?.status).toBe("published"));

    const onOpenChange = vi.fn();
    // Both renders share the same QueryClient (the `Wrapper` closure), so the
    // dialog's mutation patches the finding query the hook above is subscribed to.
    render(<SuppressDialog finding={F3} open onOpenChange={onOpenChange} />, { wrapper: Wrapper });

    await user.type(screen.getByLabelText("Reason"), "accepted risk, tracked in ENG-9001");
    await user.click(screen.getByRole("button", { name: "Suppress" }));

    await waitFor(() => expect(findingHook.result.current.data?.status).toBe("suppressed"));
    expect(findingHook.result.current.data?.suppression?.suppression_id).toMatch(/^pending:/);
    // The optimistic phase is still in flight: the dialog has not yet closed.
    expect(onOpenChange).not.toHaveBeenCalled();

    release();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    await waitFor(() => expect(findingHook.result.current.data?.suppression?.suppression_id).not.toMatch(/^pending:/));
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("rolls the finding back to published on a network failure and raises a failure toast", async () => {
    install({ failWith: "network" });
    const user = userEvent.setup();
    const { Wrapper } = queryWrapper();
    const findingHook = renderHook(() => useFinding(F3.id), { wrapper: Wrapper });
    await waitFor(() => expect(findingHook.result.current.data?.status).toBe("published"));

    const onOpenChange = vi.fn();
    render(<SuppressDialog finding={F3} open onOpenChange={onOpenChange} />, { wrapper: Wrapper });

    await user.type(screen.getByLabelText("Reason"), "accepted risk, tracked in ENG-9001");
    await user.click(screen.getByRole("button", { name: "Suppress" }));

    await waitFor(() => expect(findingHook.result.current.data?.status).toBe("suppressed"));

    release();
    await waitFor(() => expect(findingHook.result.current.data?.status).toBe("published"));
    expect(findingHook.result.current.data?.suppression).toBeNull();
    expect(toastError).toHaveBeenCalledTimes(1);
    // The dialog stays open on failure — a rolled-back write is not a completed one.
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
