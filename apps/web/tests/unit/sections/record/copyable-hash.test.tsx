// OWNER: m5 (wave 3). <CopyableHash> — first-8…last-4, the full value on hover
// (title) and click-to-copy (landing-blueprint §07: "rendered first-8…last-4 with the
// full value on hover/copy").
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CopyableHash } from "@/components/sections/record/CopyableHash";

const FINGERPRINT = "70f2459184df78fcdcbae1df66c153908fbaa353d9d8658c11b4b31d5d67333d";

describe("CopyableHash", () => {
  it("renders first-8…last-4 and keeps the full value in title", () => {
    render(<CopyableHash value={FINGERPRINT} />);
    const el = screen.getByTitle(FINGERPRINT);
    expect(el.textContent).toContain("70f24591…333d");
    expect(el.textContent).not.toContain(FINGERPRINT);
    expect(el).toHaveAttribute("title", FINGERPRINT);
  });

  it("copies the FULL value to the clipboard on click, not the truncated form", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyableHash value={FINGERPRINT} />);
    fireEvent.click(screen.getByTitle(FINGERPRINT));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(FINGERPRINT));
  });

  it("is keyboard-operable (Enter copies, matching the click)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyableHash value={FINGERPRINT} />);
    fireEvent.keyDown(screen.getByTitle(FINGERPRINT), { key: "Enter" });
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(FINGERPRINT));
  });
});

describe("CopyableHash — short values", () => {
  it("prints a value shorter than 13 characters whole (hashShort's own rule)", () => {
    render(<CopyableHash value="abc123" />);
    expect(screen.getByTitle("abc123")).toHaveTextContent("abc123");
  });
});
