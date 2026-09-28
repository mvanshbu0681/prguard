"use client";
// OWNER: t8a (wave 3). The < 1024px nav: a menu button opening a Sheet with
// the section links (brief step 2). src/components/ui/sheet.tsx documents
// its "permitted uses" as dashboard filter/settings panels; the nav nowhere
// on the dashboard needs a slide-over, and the marketing brief is explicit
// that the mobile nav is this Sheet, so this is the one marketing use.
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavLink } from "./sections";

export interface MobileMenuProps {
  links: readonly NavLink[];
  activeId: string;
  runHref: string;
}

export function MobileMenu({ links, activeId, runHref }: MobileMenuProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Open navigation">
          <Icon icon={Menu} label="Open navigation" />
        </Button>
      </SheetTrigger>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>Navigate</SheetTitle>
        </SheetHeader>
        <nav aria-label="Section" className="flex flex-col gap-1 px-6 py-4">
          {links.map((link) => (
            <SheetClose asChild key={link.id}>
              <a
                href={`#${link.id}`}
                data-active={activeId === link.id ? "" : undefined}
                className="link-draw type-label w-fit py-2 data-[active]:text-text-primary"
              >
                {link.label}
              </a>
            </SheetClose>
          ))}
        </nav>
        <div className="mt-auto px-6 py-4">
          <SheetClose asChild>
            <Button asChild variant="primary" size="md" className="w-full">
              <a href={runHref}>RUN A REVIEW →</a>
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
