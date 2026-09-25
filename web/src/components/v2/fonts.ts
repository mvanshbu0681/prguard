// The v2 marketing type system, taken from the otoma8.com reference:
// Plus Jakarta Sans for headlines and lead copy, Geist for UI text, and
// Geist Mono (uppercase, +0.12em) for buttons, nav links and labels.
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";

export const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-v2-display",
  display: "swap",
});

export const geist = Geist({
  subsets: ["latin"],
  variable: "--font-v2-sans",
  display: "swap",
});

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-v2-mono",
  display: "swap",
});

export const v2FontVariables = `${jakarta.variable} ${geist.variable} ${geistMono.variable}`;
