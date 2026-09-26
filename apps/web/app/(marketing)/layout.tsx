// OWNER: t8a (wave 3). The marketing shell: mounts <GsapRuntime /> once (it
// disarms the fallback handshake — without it every [data-anim] element
// force-reveals at 1600ms, plan/motion §3.5), then the nav, the nine frozen
// sections and the footer.
//
// Page entry (design §2 / motion §4.4.1): nothing here gates content. The
// <h1> a wave-3 hero renders is outside every Suspense boundary (there is
// none in this tree), and no page-load entrance animation exists on this
// surface at all — the only motion allowed is the heartbeat dot a section
// owns, and the nav/footer/rail render in their final state at t = 0.
//
// data-surface="marketing" is kept on the outermost wrapper (scopes
// app/tokens/marketing.css) and <main id="main"> is kept (the skip link's
// and page.tsx's target). scroll-margin-top on every section compensates for
// the fixed 56px nav so a `#id` jump (nav, footer, hero CTA) does not land a
// section's head under the header — sections are frozen files wave 3 owns,
// so the rule lives here instead of on each one.
import type { ReactNode } from "react";
import { GsapRuntime } from "@/motion/GsapRuntime";
import { v2FontVariables } from "@/components/v2/fonts";
import { SkipLink } from "@/components/marketing-shell";
import { Footer } from "@/components/v2/footer/Footer";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div data-surface="marketing" className={`min-h-dvh ${v2FontVariables}`}>
      <GsapRuntime />
      <style>{"#main > section[id] { scroll-margin-top: 56px; }"}</style>
      <SkipLink />
      <main id="main">{children}</main>
      <Footer />
    </div>
  );
}
