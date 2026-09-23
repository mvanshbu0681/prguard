"use client";

// OWNER: T1b (wave 1). Design §5.12, motion §4.2.3.
//
// List: a 1px --rule-hair bottom rule. Tab: 32px, 12px padding-x, 11px mono caps.
// Rest --text-dim → hover --text-body (120ms) → selected --text-primary plus a
// 2px --signal bar (meaning-bearing, so a solid token). One bar slides between
// tabs with transform only (translateX + scaleX, 180ms --ease-snap); panels
// swap in 0ms — no cross-fade on a data surface. Before the list has measured
// (first paint, no JS) each selected tab draws its own bar, so nothing is
// missing at frame 0. Radix supplies role="tablist", arrow-key roving focus.
//
// Tabs are BANNED inside finding detail (design §5.12): the proof must never be
// behind a tab.
import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Tabs({ className, orientation = "horizontal", ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" orientation={orientation} className={cn("ui-tabs", className)} {...props} />;
}

/** Where the indicator must sit for the active tab, in the list's own coordinates. */
export function indicatorTransform(list: DOMRect, tab: DOMRect, scrollLeft: number): string {
  const x = tab.left - list.left + scrollLeft;
  return `translateX(${Math.round(x * 100) / 100}px) scaleX(${Math.round(tab.width * 100) / 100})`;
}

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

function TabsList({ className, children, ref, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const indicatorRef = React.useRef<HTMLSpanElement>(null);
  const setListRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      listRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  useIsoLayoutEffect(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator || typeof ResizeObserver === "undefined") return;
    if (list.getAttribute("aria-orientation") === "vertical") return;

    let frame = 0;
    const place = () => {
      const active = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (!active) {
        list.removeAttribute("data-indicator");
        return;
      }
      indicator.style.transform = indicatorTransform(list.getBoundingClientRect(), active.getBoundingClientRect(), list.scrollLeft);
      // Reveal (and arm the transition) a frame later, so the first placement never animates.
      if (list.getAttribute("data-indicator") !== "ready") {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => list.setAttribute("data-indicator", "ready"));
      }
    };

    place();
    const mutations = new MutationObserver(place);
    mutations.observe(list, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] });
    const sizes = new ResizeObserver(place);
    sizes.observe(list);
    list.querySelectorAll('[role="tab"]').forEach((tab) => sizes.observe(tab));
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      sizes.disconnect();
    };
  }, []);

  return (
    <TabsPrimitive.List ref={setListRef} data-slot="tabs-list" className={cn("ui-tabs__list", className)} {...props}>
      {children}
      <span ref={indicatorRef} data-slot="tabs-indicator" className="ui-tabs__indicator" aria-hidden="true" />
    </TabsPrimitive.List>
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger data-slot="tabs-trigger" className={cn("ui-tabs__trigger", className)} {...props} />;
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("ui-tabs__content", className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
