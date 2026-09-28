// OWNER: T0 (wave 0). FROZEN once T0 merges.
//
// The root layout for all three route groups. It owns only what every route
// shares: both font variables, the motion handshake in <head> (T3) and the
// client providers (T2). The route-group layouts set data-surface on their own
// wrapper — "marketing" in app/(marketing), "app" in app/(app) — which switches
// the token overrides in app/tokens/core.css.
//
// suppressHydrationWarning is scoped to <html> only (one level): T3's head
// script adds anim-armed/anim-ready to its class, and the footer toggles may set
// data-contrast / data-motion on it before React hydrates.
// No data-scroll-behavior="smooth": nav CTAs jump (brand-gaps §G).
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AnimHandshake } from "@/motion/handshake";
import { Providers } from "@/lib/providers";
import { gsc, inter } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s — Witness",
    default: "Witness — proven, or it doesn't block",
  },
  description:
    "An AI code reviewer that executes its own claims. Every finding carries a repro test run at your base SHA and your head SHA. Only proven findings can block a merge.",
  // favicon.ico and the OG/Twitter cards are picked up from app/ by file convention.
  // Declaring `icons` at all drops the icon.svg and apple-icon.png conventions from the
  // head, so they are listed here with the Safari pinned-tab mask (brand-gaps §C).
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    other: [{ rel: "mask-icon", url: "/brand/icon-mask.svg", color: "#131313" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#080A0D", // --ink-0
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${gsc.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <AnimHandshake />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
