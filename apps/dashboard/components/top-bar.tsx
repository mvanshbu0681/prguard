"use client";

import clsx from "clsx";
import { ChevronDown, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/lib/session";
import { Mark } from "./brand";
import { useMe } from "./me-provider";
import { Avatar } from "./ui/avatar";

const NAV = [
  { href: "/queue", label: "Queue" },
  { href: "/reviews", label: "Reviews" },
  { href: "/repos", label: "Repositories" },
  { href: "/insights", label: "Insights" },
  { href: "/settings", label: "Settings" },
] as const;

export function TopBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 h-12 border-b border-line bg-surface-0">
      <div className="mx-auto flex h-full max-w-[1200px] items-center gap-5 px-6">
        <Link href="/reviews" className="-ml-1 flex items-center gap-2 rounded-md px-1 py-1" aria-label="PR Guard">
          <Mark size={18} />
          <span className="text-sm font-semibold tracking-[-0.01em] text-primary">PR Guard</span>
        </Link>

        <span aria-hidden="true" className="h-4 w-px bg-line-2" />

        <nav className="flex items-center gap-0.5" aria-label="Main">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex h-7 items-center rounded-md px-2.5 text-sm transition-colors duration-100",
                  active ? "bg-surface-3 text-primary" : "text-dim hover:bg-surface-2 hover:text-primary",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

function UserMenu() {
  const { user } = useMe();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "flex h-8 items-center gap-2 rounded-md pl-1 pr-2 text-sm transition-colors duration-100",
          open ? "bg-surface-3 text-primary" : "text-body hover:bg-surface-2 hover:text-primary",
        )}
      >
        <Avatar src={user.avatarUrl} name={user.login} size={24} />
        <span className="max-w-40 truncate">{user.login}</span>
        <ChevronDown className="size-3 text-dim" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-40 w-56 animate-fade-in rounded-lg border border-line-2 bg-surface-2 p-1 shadow-hi-strong"
        >
          <div className="px-2.5 pb-2 pt-1.5">
            <div className="truncate text-sm font-medium text-primary">{user.name ?? user.login}</div>
            {user.name && <div className="truncate text-xs text-dim">{user.login}</div>}
          </div>
          <div className="-mx-1 my-1 h-px bg-line" />
          <button
            type="button"
            role="menuitem"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              void signOut();
            }}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-sm text-body transition-colors hover:bg-surface-3 hover:text-primary disabled:opacity-50"
          >
            <LogOut className="size-3.5 text-dim" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
