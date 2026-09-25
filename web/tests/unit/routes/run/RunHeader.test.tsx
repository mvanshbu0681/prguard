// OWNER: d1 (wave 3). Regression coverage for the fe-d1 fix pass: RunHeader's RE-RUN
// control must stay in the tab order (and keep focus) while a rerun is in flight — a
// native `disabled` attribute drops focus to <body> on click, which button.tsx's own
// contract (src/components/ui/button.tsx) forbids via its `loading` prop instead.
import "../../ui/dom-polyfills";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { RunHeader } from "@/components/routes/run/RunHeader";

function renderHeader(rerunPending: boolean) {
  return render(
    <RunHeader
      reviewId="4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41"
      status={rerunPending ? "queued" : "succeeded"}
      elapsedLabel="41.2s"
      provenance="GET /v1/reviews/4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41/result"
      onRerun={() => {}}
      rerunPending={rerunPending}
    />,
  );
}

describe("RunHeader RE-RUN control", () => {
  it("never carries a native `disabled` attribute, even while pending", () => {
    renderHeader(true);
    const btn = screen.getByRole("button", { name: /RE-RUN/i });
    expect(btn).not.toBeDisabled();
    expect(btn).not.toHaveAttribute("disabled");
  });

  it("marks itself inert with aria-disabled + aria-busy while pending, per button.tsx's `loading` contract", () => {
    renderHeader(true);
    const btn = screen.getByRole("button", { name: /RE-RUN/i });
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("carries neither aria-disabled nor aria-busy once idle", () => {
    renderHeader(false);
    const btn = screen.getByRole("button", { name: /RE-RUN/i });
    expect(btn).not.toHaveAttribute("aria-disabled");
    expect(btn).not.toHaveAttribute("aria-busy");
  });

  it("keeps the RE-RUN label static — never a hand-written RE-RUNNING… string", () => {
    const { rerender } = renderHeader(false);
    expect(screen.getByRole("button", { name: "RE-RUN" })).toBeInTheDocument();
    rerender(
      <RunHeader
        reviewId="4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41"
        status="queued"
        elapsedLabel="0s"
        provenance="GET /v1/reviews/4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41"
        onRerun={() => {}}
        rerunPending
      />,
    );
    expect(screen.queryByText(/RE-RUNNING/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RE-RUN" })).toBeInTheDocument();
  });

  it("stays focused and connected across a focus -> click -> pending transition", async () => {
    const user = userEvent.setup();
    const { rerender } = renderHeader(false);
    const btn = screen.getByRole("button", { name: /RE-RUN/i });
    await user.click(btn);
    expect(document.activeElement).toBe(btn);

    // Simulate the mutation flipping `rerunPending` true on the next render — the exact
    // prop change the reviewer's repro exercised.
    rerender(
      <RunHeader
        reviewId="4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41"
        status="queued"
        elapsedLabel="0s"
        provenance="GET /v1/reviews/4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41"
        onRerun={() => {}}
        rerunPending
      />,
    );
    expect(btn.isConnected).toBe(true);
    expect(document.activeElement).toBe(btn);
    expect(document.activeElement).not.toBe(document.body);
  });
});
