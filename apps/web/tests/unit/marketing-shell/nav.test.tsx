// OWNER: t8a (wave 3). Nav: the CTA's href/scroll target and the five
// section anchors (brief's binding tests).
import "../ui/dom-polyfills";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Nav } from "@/components/marketing-shell/Nav";
import { NAV_LINKS, RUN_SECTION_ID } from "@/components/marketing-shell/sections";

describe("Nav", () => {
  it("the primary CTA reads RUN A REVIEW and targets #run, scroll-behavior: auto (A5 / brand-gaps §G)", () => {
    render(<Nav />);
    const ctas = screen.getAllByRole("link", { name: /RUN A REVIEW/ });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) expect(cta).toHaveAttribute("href", `#${RUN_SECTION_ID}`);
    expect(RUN_SECTION_ID).toBe("run");
  });

  it("renders the five section anchors from NAV_LINKS, each pointing at #<id>", () => {
    render(<Nav />);
    const nav = screen.getByRole("navigation", { name: "Section" });
    for (const link of NAV_LINKS) {
      const anchor = within(nav).getByRole("link", { name: link.label });
      expect(anchor).toHaveAttribute("href", `#${link.id}`);
    }
  });

  it("the wordmark links back to the hero", () => {
    render(<Nav />);
    const home = screen.getByRole("link", { name: /Witness/i });
    expect(home).toHaveAttribute("href", "#proof");
  });

  it("the scroll rail is decorative", () => {
    const { container } = render(<Nav />);
    const rail = container.querySelector("[data-scroll-rail]");
    expect(rail).not.toBeNull();
    expect(rail?.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
