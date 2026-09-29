// /findings/<unknown id>: a proper not-found page (an h1, one line, a way back),
// not an error frame. Also: the eyebrow names a specialist once when it and the
// category are the same word.
import "../../ui/dom-polyfills";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setTransportBase } from "@/api/transport";
import { eyebrowFor } from "@/components/routes/finding-detail/DetailHeader";
import { FindingDetailView } from "@/components/routes/finding-detail/FindingDetailView";
import { queryWrapper, testResolver } from "../../data/sample-corpus";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => setTransportBase(null));

describe("FindingDetailView — unknown id", () => {
  it("renders an h1 and a link back to the list", async () => {
    const { resolver } = testResolver();
    setTransportBase(async (input) => resolver(input as Request));
    const { Wrapper } = queryWrapper();
    render(<FindingDetailView id="deadbeef-0000-4000-8000-000000000000" />, { wrapper: Wrapper });
    expect(await screen.findByRole("heading", { level: 1, name: "No finding with that id." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All findings" })).toHaveAttribute("href", "/findings");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("eyebrowFor", () => {
  it("says it once when specialist and category match", () => {
    expect(eyebrowFor({ specialist: "security", category: "security" })).toBe("Security");
    expect(eyebrowFor({ specialist: "bugs", category: "correctness" })).toBe("Bugs · Correctness");
    expect(eyebrowFor({ specialist: null, category: "maintainability" })).toBe("Maintainability");
  });
});
