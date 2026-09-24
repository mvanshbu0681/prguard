// OWNER: t8a (wave 3). MobileMenu: the < 1024px nav (brief step 2) — opens
// on the trigger, lists every link, closes when a link is chosen.
import "../ui/dom-polyfills";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MobileMenu } from "@/components/marketing-shell/MobileMenu";
import { NAV_LINKS, RUN_SECTION_ID } from "@/components/marketing-shell/sections";

describe("MobileMenu", () => {
  it("is closed until the trigger is clicked, then lists every section link and the CTA", async () => {
    const user = userEvent.setup();
    render(<MobileMenu links={NAV_LINKS} activeId="proof" runHref={`#${RUN_SECTION_ID}`} />);

    expect(screen.queryByRole("link", { name: NAV_LINKS[0].label })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open navigation/i }));

    for (const link of NAV_LINKS) {
      const anchor = screen.getByRole("link", { name: link.label });
      expect(anchor).toHaveAttribute("href", `#${link.id}`);
    }
    const cta = screen.getByRole("link", { name: /RUN A REVIEW/ });
    expect(cta).toHaveAttribute("href", `#${RUN_SECTION_ID}`);
  });

  it("closes when a section link is chosen", async () => {
    const user = userEvent.setup();
    render(<MobileMenu links={NAV_LINKS} activeId="proof" runHref={`#${RUN_SECTION_ID}`} />);
    await user.click(screen.getByRole("button", { name: /open navigation/i }));

    const first = screen.getByRole("link", { name: NAV_LINKS[0].label });
    await user.click(first);

    expect(screen.queryByRole("link", { name: NAV_LINKS[0].label })).not.toBeInTheDocument();
  });
});
