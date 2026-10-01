// OWNER: t1c (wave 1). The one way utility chrome renders a lucide-react icon
// (docs/design/02-design-system.md §6.2–§6.3, §6.5).
//
//   <Icon icon={Search} />                 16px, decorative (aria-hidden)
//   <Icon icon={Copy} size="sm" label="Copy hash" />   14px, role="img" with a name
//
// - stroke 1.5 on lucide's 24 grid (§6.2), sizes only from the 12/14/16/20/24 scale (§6.3)
// - currentColor always; box sits on the text baseline via vertical-align -0.125em
// - §6.5 bans are enforced here: a banned icon throws in development and renders nothing
//   in production. `tests/unit/badges/icons.test.tsx` also scans app/ and src/ for any
//   banned lucide import, so reaching around this wrapper fails CI too.
// lucide-react is ISC-licensed (not MIT): list it on the attributions page.
import type { LucideIcon, LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";
import { iconPx, type IconSize, type IconSizeName } from "./svg";

/** §6.2: 1.5 on lucide's 24-unit grid. */
export const LUCIDE_STROKE = 1.5;

/**
 * Banned icons, matched against lucide's display names (PascalCase; an alias such as
 * `SparklesIcon` or `Smile` resolves to its canonical name, `Sparkles` / `FaceSlightlySmiling`).
 * The AI-product clichés stay banned: sparkles (the four-point AI star), brains, robots,
 * hexagon grids, neural-network node clouds, magic wands, globes, orbiting integration
 * rings and every emoji. The COLD LIGHT rules against shields, chat bubbles, spinners and
 * "pass" ticks were retired with that design: the landing-page system (src/components/v2,
 * and the dashboard built on it) uses a shield for "verified", a speech bubble for a PR
 * comment and a lime tick for a clear gate.
 */
export const BANNED_ICON_PATTERNS: readonly { pattern: RegExp; reason: string; scope: "6.5" | "rule" }[] = [
  { pattern: /Sparkle/, reason: "sparkles: the four-point AI star concedes the ground PR Guard fights for (§6.5)", scope: "6.5" },
  { pattern: /Brain/, reason: "brains (§6.5)", scope: "6.5" },
  { pattern: /^Bot(?![a-z])|Robot/, reason: "robots (§6.5)", scope: "6.5" },
  { pattern: /Hexagon/, reason: "hexagon grids (§6.5)", scope: "6.5" },
  { pattern: /Network/, reason: "neural-network node clouds (§6.5)", scope: "6.5" },
  { pattern: /Wand/, reason: "magic wands (§6.5)", scope: "6.5" },
  { pattern: /Globe|Earth/, reason: "globes (§6.5)", scope: "6.5" },
  { pattern: /Orbit/, reason: "orbiting integration rings (§6.5)", scope: "6.5" },
  { pattern: /^Face/, reason: "emoji faces (§6.5: every emoji)", scope: "6.5" },
];

/** The reason an icon name is banned, or null when it may be used. */
export function bannedIconReason(name: string): string | null {
  const bare = name.replace(/Icon$/, "").replace(/^Lucide/, "");
  return BANNED_ICON_PATTERNS.find((b) => b.pattern.test(bare))?.reason ?? null;
}

export type IconProps = Omit<LucideProps, "size" | "strokeWidth" | "absoluteStrokeWidth" | "ref"> & {
  icon: LucideIcon;
  size?: IconSize | IconSizeName;
  /** Accessible name. Omit when the icon sits next to text that already says it. */
  label?: string;
};

/** A lucide-react icon at PR Guard's stroke and size scale. */
export function Icon({ icon: Glyph, size = 16, label, className, ...rest }: IconProps) {
  const name = Glyph.displayName ?? "";
  const reason = bannedIconReason(name);
  if (reason) {
    if (process.env.NODE_ENV !== "production") throw new Error(`<Icon icon={${name}}> is banned — ${reason}`);
    return null;
  }
  // Lucide adds aria-hidden only when it sees no aria-* / role / title prop at all, and an
  // explicit `role={undefined}` counts as one. So name the icon, or hide it — explicitly.
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return (
    <Glyph
      size={iconPx(size)}
      strokeWidth={LUCIDE_STROKE}
      focusable="false"
      className={cn("inline-block shrink-0 align-[-0.125em]", className)}
      {...a11y}
      {...rest}
    />
  );
}
