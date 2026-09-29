// OWNER: t9a (wave 2). The brief's test: "beta pages render the exact line"
// (plan A3 / D2: `not built for the beta`, verbatim) and link to every route
// that does exist.
import "../ui/dom-polyfills";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BetaNotFound } from "@/components/app-shell/BetaNotFound";
import { APP_NAV_ITEMS } from "@/components/app-shell/routes";

describe("BetaNotFound", () => {
  it('renders exactly the mono line "not built for the beta"', () => {
    render(<BetaNotFound route="/cost" />);
    expect(screen.getByText("not built for the beta")).toBeInTheDocument();
  });

  it("names the requested route in the index and the provenance footer", () => {
    render(<BetaNotFound route="/settings/members" />);
    expect(screen.getAllByText(/settings\/members/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/GET \/settings\/members/)).toBeInTheDocument();
  });

  it("links to every route that is built", () => {
    render(<BetaNotFound route="/cost" />);
    for (const item of APP_NAV_ITEMS) {
      const link = screen.getByRole("link", { name: item.label });
      expect(link).toHaveAttribute("href", item.href);
    }
  });

  it("renders no registration marks — this is an ordinary panel, not an evidence frame", () => {
    const { container } = render(<BetaNotFound route="/settings/members" />);
    expect(container.querySelectorAll("[data-registration-mark]")).toHaveLength(0);
  });
});
