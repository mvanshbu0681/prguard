// OWNER: T3 (wave 1). Reveals: a [data-anim] element's first appearance, engine-free.
//
// The contract, end to end:
//   <li data-anim className="reveal">        hidden by the handshake until revealed, or
//                                             force-revealed at 1600ms if no runtime loads
//   markAnimReady() (./handshake)            disarms the force-reveal and starts THE
//                                             revealer below, once per document
//   startAutoReveal()                        every [data-anim] element in the document,
//                                             including ones mounted later, is revealed the
//                                             first time its top crosses 84% of the viewport
//                                             (motion spec §4.5), in batches: elements that
//                                             cross together stagger by position; elements
//                                             already scrolled past are shown static
//   motion.css .reveal                       opacity 0 → 1 (.reveal-rise adds a rise of at
//                                             most 8px) on --dur-enter / --ease-instrument,
//                                             delayed min(index, 5) × --stagger-sibling
// So a component never wires a reveal: it marks the element and the runtime does the
// rest, on both surfaces. One batched observer for the page, never one per card (§4.5).
// Reduced motion: the same reveal at --dur-1, opacity only (§5). Reveals never reverse.
//
// Rules for [data-anim]: never on the hero, the <h1> or anything a judge must read in
// the first three seconds (they render final at frame 0, §4.4.1); never nested (a
// revealed child cannot show through a hidden parent); never on a set-piece that
// useReplay / useSequence drives (those render their end frame statically).

import { ANIM_ATTR, ANIM_IN_ATTR, ANIM_IN_STATIC, REVEAL_INDEX_VAR } from "./attrs";
import { fitDraw } from "./draw";
import { isPassed, onceInView } from "./in-view";
import { STAGGER } from "./tokens";

export { REVEAL_INDEX_VAR };

/** [data-anim] elements not yet revealed. */
export const PENDING_SELECTOR = `[${ANIM_ATTR}]:not([${ANIM_IN_ATTR}])`;

/** Reveal now (animated). `index` is the position in its batch; the stagger caps at 6 items. */
export function revealNow(el: Element, index = 0): void {
  const i = Math.min(Math.max(0, Math.floor(Number.isFinite(index) ? index : 0)), STAGGER.cap - 1);
  if (el instanceof HTMLElement || el instanceof SVGElement) el.style.setProperty(REVEAL_INDEX_VAR, String(i));
  if (el.matches(".draw")) fitDraw(el); // a first-appearance draw: measure the dash first (./draw)
  el.setAttribute(ANIM_IN_ATTR, "");
}

/** Show without animating (the element is already visible, or must not move). */
export function showStatic(el: Element): void {
  el.setAttribute(ANIM_IN_ATTR, ANIM_IN_STATIC);
}

/**
 * Replay a reveal (lab and demo controls): hide the elements, let one style recalc
 * land, then reveal them again with fresh batch indices.
 */
export function replayReveal(elements: Iterable<Element>): void {
  const list = [...elements];
  list.forEach((el) => el.removeAttribute(ANIM_IN_ATTR));
  // Reading a computed style flushes the change, so the animation restarts (a style
  // recalc, not a layout).
  list.forEach((el) => void getComputedStyle(el).animationName);
  list.forEach((el, i) => revealNow(el, i));
}

interface Revealer {
  stop(): void;
  watched: Map<Element, () => void>;
}

let revealer: Revealer | null = null;

function eachMatch(node: Node, selector: string, fn: (el: Element) => void): void {
  if (!(node instanceof Element)) return;
  if (node.matches(selector)) fn(node);
  node.querySelectorAll(selector).forEach(fn);
}

/**
 * Start the document's revealer (idempotent: one per document). markAnimReady() calls
 * it; nothing else needs to. Returns a stop function (tests, teardown).
 */
export function startAutoReveal(): () => void {
  if (typeof document === "undefined") return () => {};
  if (revealer) return revealer.stop;

  const watched = new Map<Element, () => void>();
  const watch = (el: Element) => {
    if (watched.has(el) || el.hasAttribute(ANIM_IN_ATTR)) return;
    watched.set(
      el,
      onceInView(
        el,
        (entry, index) => {
          watched.delete(el);
          // Scrolled past before the runtime arrived: show it as it is, nobody sees it move.
          if (entry && isPassed(entry)) showStatic(el);
          else revealNow(el, index);
        },
        { passed: true },
      ),
    );
  };
  const unwatch = (el: Element) => {
    const stop = watched.get(el);
    if (!stop) return;
    watched.delete(el);
    stop();
  };

  eachMatch(document.documentElement, PENDING_SELECTOR, watch);

  // Content mounted later (a client-side route change, an async list) is revealed too;
  // content removed before it was seen is let go, so the observer holds no dead nodes.
  const mutations =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver((records) => {
          for (const record of records) {
            if (record.type === "attributes") {
              if (record.target instanceof Element && record.target.matches(PENDING_SELECTOR)) watch(record.target);
              continue;
            }
            record.removedNodes.forEach((node) => eachMatch(node, `[${ANIM_ATTR}]`, unwatch));
            record.addedNodes.forEach((node) => eachMatch(node, PENDING_SELECTOR, watch));
          }
        });
  mutations?.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: [ANIM_ATTR] });

  const self: Revealer = {
    watched,
    stop() {
      mutations?.disconnect();
      [...watched.values()].forEach((stop) => stop());
      watched.clear();
      if (revealer === self) revealer = null;
    },
  };
  revealer = self;
  return self.stop;
}

/** Stop the document's revealer, if one runs (tests, teardown). */
export function stopAutoReveal(): void {
  revealer?.stop();
}

/** How many [data-anim] elements the revealer is waiting on (lab readouts, tests). */
export function pendingReveals(): number {
  return revealer?.watched.size ?? 0;
}
