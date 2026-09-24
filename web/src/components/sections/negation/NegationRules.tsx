"use client";
// OWNER: m2 (wave 3). The one animation §02 asks for: the section's two hairline
// rules draw in (scaleX 0 → 1, transform-origin center) on first viewport entry,
// the top rule leading the bottom by 60ms (landing-blueprint §02 "Animation").
//
// GSAP via @/motion/gsap only (marketing motion rule) — no useReplay (this is a
// one-shot scroll reveal, not a key-bound replay set-piece) and no engine-free
// .reveal class (that fades opacity; this scales a hairline, which .reveal does
// not express). useMotionMedia leaves the reduced-motion branch empty: the
// server-rendered rules already sit at their resting, full-width state (no
// inline transform, negation.module.css .rule has none), which IS the designed
// end state (motion spec §5, plan §2 hard rule 3 sibling — nothing here softens
// a colour flip, but the same "reduced motion renders the end state" contract
// applies to every entrance).
import { useRef, type ReactNode } from "react";
import { gsap, ScrollTrigger, useMotionMedia } from "@/motion/gsap";
import { DUR_S, EASE } from "@/motion/tokens";

const RULE_SELECTOR = "[data-negation-rule]";
const LEAD_DELAY_S = 0.06; // 60ms, landing-blueprint §02

export function NegationRules({ children, className }: { children: ReactNode; className?: string }) {
  const scopeRef = useRef<HTMLDivElement>(null);

  useMotionMedia(
    ({ reduced }) => {
      if (reduced) return; // static full-width rules stand as the end frame; nothing to build
      const root = scopeRef.current;
      if (!root) return;
      const rules = Array.from(root.querySelectorAll<HTMLElement>(RULE_SELECTOR));
      const [top, bottom] = rules;
      if (!top || !bottom) return;

      gsap.set(rules, { scaleX: 0 });
      ScrollTrigger.create({
        trigger: root,
        start: "top 84%",
        once: true,
        onEnter: () => {
          gsap.to(top, { scaleX: 1, duration: DUR_S.enter, ease: EASE.instrument.gsap });
          gsap.to(bottom, { scaleX: 1, duration: DUR_S.enter, ease: EASE.instrument.gsap, delay: LEAD_DELAY_S });
        },
      });
    },
    { scope: scopeRef },
  );

  return (
    <div ref={scopeRef} className={className}>
      {children}
    </div>
  );
}
