"use client";
// OWNER: t8a (wave 3). Design §3.1, brief step 2, brand-gaps §G "Nav CTA
// behaviour". 56px, fixed, always visible — it never shrinks or hides on
// scroll-down. Transparent at scroll = 0; past 80px it gains a tinted,
// blurred background and a 1px --rule-1 bottom border over 120ms
// (useNavScrolled). backdrop-filter is permitted here and nowhere else in
// marketing chrome (Surface's own header comment: "the sticky header ...
// only").
//
// RUN A REVIEW -> scrolls to #run (A5 / brand-gaps §G): a plain anchor, never
// a route, never smooth-scroll (the root layout opts out of Next's smooth
// scrolling; a bare href="#run" jumps).
import { Lockup } from "@/components/brand";
import { IndexLabel } from "@/components/chrome";
import { Button } from "@/components/ui/button";
import { MobileMenu } from "./MobileMenu";
import { ScrollProgress } from "./ScrollProgress";
import { MARKETING_SECTIONS, MARKETING_SECTION_IDS, NAV_LINKS, RUN_SECTION_ID } from "./sections";
import { useActiveSection } from "./useActiveSection";
import { useNavScrolled } from "./useNavScrolled";

const RUN_HREF = `#${RUN_SECTION_ID}`;

export function Nav() {
  const activeId = useActiveSection(MARKETING_SECTION_IDS);
  const active = MARKETING_SECTIONS.find((section) => section.id === activeId) ?? MARKETING_SECTIONS[0];
  const scrolled = useNavScrolled(80);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 h-14"
      style={{
        backgroundColor: scrolled ? "color-mix(in oklab, var(--ink-1) 88%, transparent)" : "transparent",
        backdropFilter: scrolled ? "blur(16px) saturate(1.2)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(16px) saturate(1.2)" : "none",
        borderBottom: `1px solid ${scrolled ? "var(--rule-1)" : "transparent"}`,
        // backdrop-filter is not in the compositor allowlist (motion §6.1: transform,
        // opacity, clip-path, filter only) — it pops in with the border/background
        // rather than transitioning; the 120ms flip is on the two properties allowed.
        transitionProperty: "background-color, border-color",
        transitionDuration: "var(--dur-1)",
        transitionTimingFunction: "var(--ease-snap)",
      }}
    >
      <ScrollProgress />
      <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-4 px-4 md:px-8">
        <div className="flex min-w-0 items-center gap-[10px]">
          <a href="#proof" aria-label="PRGuard — the proof bench" className="shrink-0">
            <Lockup variant="A" size="nav" />
          </a>
          <span aria-hidden="true" className="hidden h-3.5 w-px shrink-0 bg-rule-1 lg:block" />
          <IndexLabel
            as="span"
            index={active.index}
            category={active.category}
            aria-live="polite"
            className="hidden truncate text-text-dim lg:inline-flex"
          />
        </div>

        <nav aria-label="Section" className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              aria-current={activeId === link.id ? "true" : undefined}
              className="link-draw type-label data-[active]:text-text-primary"
              data-active={activeId === link.id ? "" : undefined}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <Button asChild variant="primary" size="sm">
            <a href={RUN_HREF}>RUN A REVIEW →</a>
          </Button>
          <div className="md:hidden">
            <MobileMenu links={NAV_LINKS} activeId={activeId} runHref={RUN_HREF} />
          </div>
        </div>
      </div>
    </header>
  );
}
