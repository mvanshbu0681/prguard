"use client";

// OWNER: T1b (wave 1). The real overlays — portaled to <body>, modal, focus-
// trapped — opened by the buttons, by a key (D S K M L T, ⌘K), or by
// ?open=dialog|sheet|palette|menu|listbox|toasts so a screenshot can hold one open.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandDialog, Command } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Toaster, notifyWrite } from "@/components/ui/sonner";
import type { LabData } from "./lab-data";
import { FiltersSheetBody, PaletteRoot, ScopeSelect, SuppressDialogBody } from "./parts";

type Overlay = "dialog" | "sheet" | "palette" | "menu" | "listbox";
const KEYS: Record<string, Overlay | "toasts"> = { d: "dialog", s: "sheet", k: "palette", m: "menu", l: "listbox", t: "toasts" };
const OVERLAYS = new Set<string>(["dialog", "sheet", "palette", "menu", "listbox"]);

export function LiveOverlays({ data }: { data: LabData }) {
  const [open, setOpen] = useState<Overlay | null>(null);
  const toggle = (name: Overlay) => (next: boolean) => setOpen(next ? name : null);

  const sendToasts = useCallback(() => {
    notifyWrite({ tone: "success", title: "Suppression recorded", ...data.endpoints.suppressCreated });
    notifyWrite({ tone: "info", title: "Re-run requested", ...data.endpoints.rerunAccepted });
    notifyWrite({ tone: "error", title: "Suppress rejected", ...data.endpoints.suppressRejected });
  }, [data]);

  // ?open= acts once per page load, after the first paint. Strict Mode's dev
  // double-mount cancels the first frame in cleanup, so it still fires once.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("open");
    const frame = requestAnimationFrame(() => {
      if (requested === "toasts") sendToasts();
      else if (requested && OVERLAYS.has(requested)) setOpen(requested as Overlay);
    });
    return () => cancelAnimationFrame(frame);
  }, [sendToasts]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((o) => (o === "palette" ? null : "palette"));
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable], [role='dialog'], [role='menu'], [role='listbox']")) return;
      const action = KEYS[event.key.toLowerCase()];
      if (!action) return;
      event.preventDefault();
      if (action === "toasts") sendToasts();
      else setOpen(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sendToasts]);

  return (
    <div data-slot="lab-live" className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="sm" onClick={() => setOpen("dialog")}>
        Dialog <Kbd>D</Kbd>
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen("sheet")}>
        Sheet <Kbd>S</Kbd>
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen("palette")}>
        Palette <Kbd>⌘K</Kbd>
      </Button>
      <DropdownMenu open={open === "menu"} onOpenChange={toggle("menu")}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            Menu <Kbd>M</Kbd>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          <DropdownMenuLabel>
            Finding <span className="normal-case tracking-normal">{data.ids.provenFindingId.slice(0, 8)}</span>
          </DropdownMenuLabel>
          <DropdownMenuItem>
            Copy canonical URL<DropdownMenuShortcut>y</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            Export evidence…<DropdownMenuShortcut>e</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            Suppress finding…<DropdownMenuShortcut>s</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="w-40">
        <ScopeSelect data={data} size="sm" aria-label="Suppression scope" open={open === "listbox"} onOpenChange={toggle("listbox")} />
      </div>
      <Button variant="ghost" size="sm" onClick={sendToasts}>
        Toasts <Kbd>T</Kbd>
      </Button>

      <Dialog open={open === "dialog"} onOpenChange={toggle("dialog")}>
        <DialogContent>
          <SuppressDialogBody data={data} />
        </DialogContent>
      </Dialog>
      <Sheet open={open === "sheet"} onOpenChange={toggle("sheet")}>
        <SheetContent>
          <FiltersSheetBody data={data} />
        </SheetContent>
      </Sheet>
      <CommandDialog open={open === "palette"} onOpenChange={toggle("palette")}>
        <Command>
          <PaletteRoot />
        </Command>
      </CommandDialog>
      <Toaster />
    </div>
  );
}
