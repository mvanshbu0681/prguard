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
    template: "%s — PRGuard",
    default: "PRGuard — proven, or it doesn't block",
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
