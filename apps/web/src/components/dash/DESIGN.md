# Witness dashboard — design system

The dashboard speaks the landing page's language (`src/components/v2`, live at `/`).
Open the landing and look before you design anything. The dashboard should feel like the
same product walked inside: calm white (or ink) canvas, big confident Jakarta numerals, lime
as the one loud colour, sky photography with glass on top, pills for everything you can press.

It was rejected once for looking "AI-made". Things that read as generated, and are banned:
a uniform grid of identical icon+number stat cards; tables used where a composed row or a
card would say more; every section the same height and weight; long explanatory paragraphs;
decorative gradients; emoji; drop shadows on cards; more than one lime CTA per view;
`/ 01 — SECTION` instrument labels (that was the old system).

## Tokens (`app/tokens/dashboard.css`)

The theme is `data-dash-theme="light"|"dark"` on `<html>`. Only ever use `--w-*` tokens
(or their Tailwind colours `bg-w-surface`, `text-w-muted`, `border-w-line`, `rounded-w-card`,
`shadow-w-pop`, `font-w-display` …). Never hard-code a colour that must flip with the theme.
Literal `#cbf857` / `#131313` / white are fine where the landing uses them on a fixed ground
(e.g. text on a photograph, the ink chip inside a lime button).

| role | token | light | dark |
|---|---|---|---|
| window / rail | `--w-canvas` | #f3f3f5 | #09090b |
| page frame | `--w-panel` | #fff | #111113 |
| card | `--w-surface` | #f4f4f6 | #18181b |
| card in a card | `--w-surface-2` | #fff | #202024 |
| wells, tracks | `--w-surface-3` | #ebebef | #26262b |
| text / 2 / muted / subtle | `--w-text` `--w-text-2` `--w-muted` `--w-subtle` | ink → slate | zinc |
| hairline | `--w-line` (`-strong`, `-heavy`) | black 6% | white 7% |
| inverse card / button | `--w-inverse` / `--w-on-inverse` | ink / white | white / ink |
| brand | `--w-lime`, `--w-on-lime`, `--w-lime-soft`, `--w-accent-text` | | |
| status | `--w-danger(-text/-soft)`, `--w-warn(-…)`, `--w-ok(-…)`, `--w-blue(-…)` | | |
| severity | `--w-sev-critical/high/medium/low/info` | | |
| charts | `--w-chart-1…6`, `--w-chart-grid`, `--w-chart-axis` | ink leads | white leads |

Lime is never text on white — use `--w-accent-text` (olive) for "positive" text in light mode.

**One colour code for states** — read it from the kit, never pick your own:
`PROOF_ENCODING` / `PROOF_COLOR` / `PROOF_LABEL` (proven = lime, refuted = `--w-chart-1`,
inconclusive = amber, no env = blue, not attempted / not applicable = greys) and
`GATE_ENCODING` / `GATE_COLOR` (blocked = red, clear = lime, neutral = grey). Red means
"blocks the merge"; lime means "proven" or "clear" — nothing else.

**Ink cards** (`tone="ink"`) are always a dark island: ink in light mode, charcoal with a
hairline in dark mode; inside them the inverse pair and secondary tokens are the dark theme's.

**Canonical numbers** — the same metric reads the same everywhere (proven bugs, median review,
review count). A scoped subset says its scope in the sentence ("25 of them proven").

## Type

- Display & numbers: **Plus Jakarta Sans** (`--w-font-display`), 500–600, tight tracking
  (page title 34/600/-0.9px, section title 19/600/-0.35px, big numbers 40–56/500/-1.3px,
  tabular-nums).
- UI text: **Geist** (`--w-font-sans`) 13–15px.
- Labels, buttons, tags: **Geist Mono** UPPERCASE +0.12em (`--w-font-mono`) 10.5–13px.
- Code, SHAs, paths: Geist Mono, normal case, no tracking.

## Shape, depth, glass

- Radii: frame 24, card 20, inset card 16, inner 12, small 8, and **pill (999px) for
  everything interactive** — buttons, inputs, segmented controls, tags, nav items.
- Cards have **no shadow**: grey `surface` card on the white panel, or a 1px `--w-line`
  hairline on `panel`. Elevation (`--w-shadow-pop/-float`) is only for popovers, menus,
  floating docks and the active pill in a segmented control.
- **Glass** only where something sits over moving or photographic content: tiles on a sky
  photo (`<GlassTile>`), the sticky top bar, the command palette, a floating action dock.
  Never glass on a flat grey card.
- Photography: `/marketing/hero-sky.jpg` (sky), `/marketing/cta-grass.jpg` (grass, for
  "go / all clear" moments). **At most one photographic moment per page**, via `<PhotoCard>`.

## Buttons (`<Button>`)

| variant | use |
|---|---|
| `primary` + `chip` | THE action of the view (lime pill + ink circular chip, arrow rotates 45° on hover). One per view. |
| `dark` | strong secondary (ink pill; white in dark mode) |
| `secondary` / `outline` | normal actions |
| `ghost` | tertiary, toolbars |
| `glass` | only on photographs |
| `danger` | destructive (quiet red pill; confirm in a dialog) |

Sizes `sm` 32 / `md` 40 / `lg` 48. Icon-only: `<IconButton>` (round). Labels are 1–3 words.

## Kit (`import { … } from '@/components/dash/kit'`)

`Page` (route frame — every route renders inside one) · `PageHeader` (eyebrow, title, `soft`
second clause, description, actions) · `SectionHeader` · `Eyebrow` · `Rise` (landing entrance,
stagger with `delay`) · `Card` (tone `surface|panel|inset|ink|lime|navy`, `pad`, `interactive`,
`href`) · `PhotoCard` · `GlassTile` · `Button` · `IconButton` · `Tag` · `GateBadge` ·
`ProofBadge` · `SeverityScore` · `SeverityRail` · `bandColor` · `Stat` · `Delta` ·
`Segmented` · `TextField` · `Kbd` · `Switch` · `Avatar` · `AvatarStack` · `Sparkline` ·
`MiniBars` · `StackBar` · `Meter` · `Ring` · `Dot` · `Skeleton` · `Divider` · `Row` ·
`EmptyState`. Formatting: `@/components/dash/format` (`relTime`, `usd`, `seconds`, `pct`,
`sha`, `repoSlug`, `humanize`, `CORPUS_NOW` …). Theme: `useDashTheme()` from
`@/components/dash/theme` when a chart needs to know.

Compose these with Tailwind layout utilities (flex/grid/gap/p-*) and your own CSS module for
anything bespoke. Your module CSS must read `--w-*` tokens only.

## Layout

- The shell gives you a rounded white frame with a 64px glass top bar floating over the top of
  it (already padded). Your route renders `<Page>` → `<PageHeader>` → sections.
- Page max width 1320px, 36px gutters (16px on phones). Section gap 28–40px; card grid gap 16px.
- Page titles end with a period. One lime CTA per view (the sidebar's "New review" is dark).
- Compose like the landing's bento: **asymmetric** spans (2fr/1fr, a tall card beside two
  stacked), one hero moment at the top, then denser working sections below.
- Must work at 390px wide (single column, no horizontal page scroll) and at 1440px.

## Motion (enforced by `npm run motion:lint`)

- Animate only `transform`, `opacity`, `filter`, `clip-path` freely. `background-color`,
  `color`, `border-color` transitions must be ≤ 240ms. Never transition `box-shadow`,
  `backdrop-filter` or `all`. No `will-change` in CSS. No overshooting cubic-beziers.
- Entrance: `<Rise delay={…}>` (700ms rise+fade, stagger 60–80ms, max ~6 items).
- Hover: cards lift 2px, arrow chips rotate 45°, photos zoom 1.04. Nothing bounces.
- Always honour `prefers-reduced-motion`.
- No GSAP in the dashboard (ESLint enforces). `motion` (Motion/Framer) is allowed.
