// OWNER: d3 (wave 3). <BackLink> — "a back link to /findings keeps the list's
// filters" (dashboard-blueprint §2.7). document.referrer never updates for a
// same-origin client-side (pushState) transition, so provenance is read off
// the Navigation API's session history instead (window.navigation), which
// DOES carry same-document route changes, including a nuqs filter's query
// string.
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackLink, findingsBackHref } from "@/components/routes/finding-detail/BackLink";

const back = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back }),
}));

function mockNavigation(entries: { id: string; url: string }[], currentIndex: number) {
  (window as unknown as { navigation?: unknown }).navigation = {
    currentEntry: entries[currentIndex],
    entries: () => entries,
  };
}

afterEach(() => {
  delete (window as unknown as { navigation?: unknown }).navigation;
  back.mockReset();
});

describe("findingsBackHref", () => {
  it("reads the previous entry's URL (with its query string) when it is same-origin /findings", () => {
    mockNavigation(
      [
        { id: "1", url: "http://localhost:3000/findings?status=proposed&category=security" },
        { id: "2", url: "http://localhost:3000/findings/a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d" },
      ],
      1,
    );
    expect(findingsBackHref()).toBe("/findings?status=proposed&category=security");
  });

  it("returns null when the previous entry is not /findings (a deep link, a new tab)", () => {
    mockNavigation([{ id: "1", url: "http://localhost:3000/findings/a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d" }], 0);
    expect(findingsBackHref()).toBeNull();
  });

  it("returns null when there is no previous entry at all", () => {
    mockNavigation([{ id: "1", url: "http://localhost:3000/findings/a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d" }], 0);
    expect(findingsBackHref()).toBeNull();
  });

  it("returns null when the Navigation API is unavailable", () => {
    expect(findingsBackHref()).toBeNull();
  });

  it("ignores a cross-origin previous entry even if its pathname is /findings", () => {
    mockNavigation(
      [
        { id: "1", url: "https://evil.example/findings?status=proposed" },
        { id: "2", url: "http://localhost:3000/findings/a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d" },
      ],
      1,
    );
    expect(findingsBackHref()).toBeNull();
  });
});

describe("BackLink", () => {
  it("renders a plain link to the unfiltered list when there is no known /findings history", () => {
    render(<BackLink />);
    const link = screen.getByRole("link", { name: "← BACK TO FINDINGS" });
    expect(link).toHaveAttribute("href", "/findings");
  });

  it("renders a router.back() control (not a filter-dropping Link) once the filtered /findings entry is known", () => {
    mockNavigation(
      [
        { id: "1", url: "http://localhost:3000/findings?status=proposed" },
        { id: "2", url: "http://localhost:3000/findings/a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d" },
      ],
      1,
    );
    render(<BackLink />);
    const button = screen.getByRole("button", { name: "← BACK TO FINDINGS" });
    expect(screen.queryByRole("link", { name: "← BACK TO FINDINGS" })).toBeNull();
    button.click();
    expect(back).toHaveBeenCalledTimes(1);
  });
});
