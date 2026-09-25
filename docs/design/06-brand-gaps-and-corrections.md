# PART 1 — GAP ANALYSIS

## 1. Owner asks that nothing in the corpus answers

| Ask | Status | Severity |
|---|---|---|
| **Logo / brand mark** | **Absent.** The design system defines four *mechanic* marks (vial, spirit level, ridge pattern, wax seal) and utility chrome. There is no PRGuard mark, no lockup, no clear space, no minimum size, no monochrome rule. | **Critical** |
| **Wordmark treatment** | One line exists, in the landing nav: `PRGUARD` — GSC 560, 15px, +0.06em, preceded by an 8px registration tick. No construction, no lockups, no don'ts. | **Critical** |
| **Favicon** | Never mentioned in any of four blueprints. | High |
| **OG / social card** | Never mentioned. A judge pasting the link into Slack gets a grey rectangle and a URL. | High |
| **App icon / GitHub App avatar** | Never mentioned — and this is a *shipped product surface*. It appears beside `prguard[bot]` on every comment PRGuard has ever posted. | **Critical** |
| **404 / 500 / offline / JS-off marketing states** | Dashboard states are specified well (§2.0). Marketing has none. | Medium |
| **Naming & voice guidelines** | Copy is written everywhere; the rules that generate it are written nowhere. The four blueprints already disagree on how to capitalise the proof states. | High |
| **"How every button works"** | Buttons are fully specified as *components*. Three specific buttons have no specified **behaviour**: the nav `RUN A REVIEW →` (destination never stated), the pre-warmed PR chips in §11, and `↻ restore` in the tamper control. | Medium |
| **Font fallback stack** | `next/font/local` is configured with `adjustFontFallback: false` and manual ascent/descent overrides — but no `font-family` fallback chain is written anywhere. If the woff2 404s on venue wifi, the terminal's column alignment is undefined. | Medium |
| **The GitHub comment** | **The single largest gap in the entire plan.** S8's delivery ladder posts inline review comments — that markdown body *is* the product for every user who never opens the dashboard. Nothing in 4 blueprints, 8 research areas or the judgement specifies what it contains, how it is formatted, or what it looks like. | **Critical** |
| **Dashboard mobile** | "Internal dashboard" is used to excuse it, but the submission link is one tap from a phone. Zero spec below 768px. | Medium |
| **`/login`, `/onboarding/install`** | Listed as routes in the dashboard IA. Never specified. First 60 seconds of a real user's life. | Low (hackathon) |
| **Print stylesheet** | Named three times as a deliverable for `/audit` and `/accuracy`. Never written. | Low |

---

## 2. Contradictions between the four blueprints

Each row gives the ruling I'd take and why.

| # | Contradiction | Ruling |
|---|---|---|
| 1 | **`--ease-mass` has three different values.** design-system: `cubic-bezier(0.45, 0, 0.08, 1)`. landing: `(0.62, 0, 0.10, 1)`. motion: `(0.52, 0, 0.08, 1)`. All three claim to be resolving the same collision with `--ease-instrument`. | **Motion owns easing. Take `(0.52, 0, 0.08, 1)`** and delete the other two lines. Motion is the only document that shows its working and ships an escape hatch. |
| 2 | **`--alarm` used as text.** design-system §1.5 measures `--ink-0` on solid `--alarm` at **Lc 43.3** and rules `--alarm` **fill-only**, with `--alarm-text #FFBFB7` for body and `--alarm-hi` for ≥24px only. But landing renders `→ blocks merge` and the traceback `E` line in `--alarm`/`--alarm-hi` at 13–20px, and dashboard §2.5 specifies the gate block as "solid `--alarm`, `--ink-0` text". | **design-system wins — it did the measurement.** Gate block becomes `--alarm-text` on `--alarm-tint-hi` with a 1px `--alarm` border (Lc −74.6). Traceback becomes `--alarm-text`. `→ blocks merge` at 20px may stay `--alarm-hi`; below 18px it may not. |
| 3 | **Hero H1 is 72px or 62px.** design-system: `clamp(…, 4.5rem)` = 72px. landing: 62px with the character arithmetic (0.600em advance × 620px column = 14.3 chars at 72px, 16.6 at 62px). judgement: "decide in the first hour." | **62px.** Landing is the only document that did the arithmetic, and the arithmetic is correct. Update design-system §2.3 to `clamp(2.25rem, 0.9rem + 3.9vw, 3.875rem)`. |
| 4 | **Severity segment growth is 520ms or 420ms.** design-system and landing say 520ms. Motion says "Resolution: round it to `--dur-4` (420ms). The grid is not negotiable for one element's vanity." | **420ms.** Motion owns the duration grid. Two documents still carry the off-grid value. |
| 5 | **Skeletons shimmer or they don't.** design-system §5.15 ships a `sweep` keyframe. Motion §3.2 bans shimmer outright ("decorative motion implying progress it does not have"). Dashboard §2.0: "no shimmer, no spinner." | **Ban it.** 2-to-1, and motion's reasoning is the product's own thesis. Delete the `sweep` keyframe from the design system. |
| 6 | **Dialog enters at 180ms or 420ms.** design-system §5.11: 180ms `--ease-snap`. Motion §4.3: `--dur-4` (420ms) `--ease-instrument`. | **180ms.** A 420ms dialog on the dashboard also violates motion's own 220ms dashboard ceiling. |
| 7 | **Motion's dashboard ceiling contradicts motion's own component specs.** §2.2: "If any transition in `app/(app)/` exceeds 220ms it is a bug." §4.8.2: ChainRail draw at `--dur-4` (420ms) — and ChainRail ships on `/audit`. Same for ContributionBar (6 × 420ms) in finding detail. | **Add an explicit carve-out:** the three shared evidence components (`ProofBench`, `ChainRail`, `ContributionBar`) run their entrance at `--dur-4` on both surfaces, because they are the same component and forking their timing forks the code. Everything else on the dashboard obeys 220ms. |
| 8 | **Severity sparkline is 20px or 64px.** design-system §5.4: "20px six-segment sparkline". landing §05: "20px". dashboard §3a: "`density="glyph"` — 64×10px". | **64×10px in the table, 20px inline in prose.** They are two different uses; name them `glyph` and `inline` and stop calling both "the sparkline". |
| 9 | **Sheets are permitted or banned.** design-system §5.10 permits sheets for filter panels and the sub-1024px suppression form. Motion §4.3: "Sheets are permitted only for the ⌘K sub-pages." | **design-system.** Motion over-generalised a rule that was only ever about *findings*. |
| 10 | **Landing violates the design system's own mono-caps rule.** design-system §2.3: label tier is "Cap at 4 words — uppercase mono past that tanks readability." Landing §02 ships a ~20-word uppercase mono bridge line: `PRGUARD PROVES IT · RANKS IT BY BLAST RADIUS · NEVER REPEATS ITSELF · KEEPS YOU IN CHARGE ON THE RECORD`. | **Rewrite the bridge line** as four short mono-caps chips on one rule (`PROVES IT` · `RANKS IT` · `REMEMBERS` · `ON THE RECORD`), or set it in Inter `--text-dim` at 13px. |
| 11 | **The hero's trust numbers sit in a failing contrast tier.** Landing's calibration strip (`execution-verified precision 0.91 (n=312)` etc.) is `--text-dim`, which design-system measures at **Lc −43.6** and explicitly rules "non-body only… never a chip label". These are the three most load-bearing numbers above the fold. | **Promote the values to `--text-body` (Lc −78.2); keep only the metric *names* in `--text-dim`.** |
| 12 | **Registration marks on dashboard panels.** design-system R5/§5.3: `<Exhibit>` only, "never on ordinary dashboard panels". Dashboard §3a puts them on the ContributionBar track; §0 rule 2 lists them on four dashboard components. | **No conflict in practice** — those four *are* evidence frames. Restate R5 as "evidence frames only, on both surfaces" so it stops reading as a marketing-only rule. |
| 13 | **Section count: nine or fifteen.** Judgement: "nine sections", cut to seven. Landing: fifteen (00–15), ≈9,200px + 2,200px pinned. | See §6 — this is a symptom of the weakest part of the plan, not a formatting disagreement. |
| 14 | **Tamper scope.** Judgement/design-system: "recomputing the whole chain on every keystroke". Landing §07: six events. Dashboard §2.9: "recomputes the whole visible window". | **Rendered window only**, never the whole chain. 1,428 async `subtle.digest` calls per keystroke is not a design, it is a stall. |
| 15 | **Two of the six accuracy metrics are the same number.** Landing §10 publishes `disproven_rate 0.140 (n=537)` *and* `self_caught_false_positive_rate 0.140 (n=537)` — identical value, identical denominator. | Either they are definitionally identical (in which case publishing both is padding — the exact sin the product attacks) or the definitions differ and the fixture data is wrong. **Resolve before the accuracy page ships.** A judge who reads the two definitions side by side will ask. |

---

## 3. Stated as settled, actually open

| Decision | Where it looks settled | Why it isn't |
|---|---|---|
| **Nine backend endpoints** | Dashboard §1.2 lists them as "asks" with fallbacks, then every screen spec assumes them. | `/runs`, `/repos`, `/pulls`, `/cost`, `/settings/policy` are the spine of 14 of 22 routes. If the backend cannot move, the dashboard is 5 screens, not 22 — and nobody has costed that version. |
| **The canonical-JSON spec** | Named in three blueprints as a "day zero, non-negotiable" deliverable. | No owner is named, no fixture format is defined, and unlike the endpoints it has **no fallback**. If it slips, the flagship interaction demos as a false `chain.verified = false`. |
| **The seeded disproven finding** | Stated as a backend requirement in four places. | Same: no owner. It gates the `D` key, landing §03, landing §10, and two of six accuracy metrics. |
| **The shader concession** | Judgement lists it open; landing §0 pre-writes the refusal sentence. | It *is* effectively decided (refuse), but nobody has said so to the owner. Decide it out loud in hour one or it reopens on day four. |
| **`self_caught_false_positive_rate` publication** | Judgement: open. Landing §10: published prominently with a rehearsed answer. | Landing decided it. Fine — but retire it from the open list so it isn't relitigated. |
| **The light/print audit theme** | Design-system §7.2 ships it; judgement lists it open and first-to-cut; dashboard §2.9 ships it. | Two documents build a thing the judgement says will probably be cut. Decide, then delete the spec or the caveat. |
| **Vercel AI Elements** | The component-kits research ranks it the single biggest find ("almost literally PRGuard's spec": `Terminal` with real ANSI, `TestResults` mapping 1:1 to `proof_status`, `StackTrace` parsing a raw trace, `Commit` with red-by-default deletions). **All four blueprints silently build every one of these from scratch and never mention it.** | This is not a contradiction, it is an unexamined reversal — and given §6 it is the best schedule recovery available. See §4. |

---

## 4. Recommendations that survived their own refutation, or were dropped without argument

**Correctly dropped after refutation** (good hygiene — these all held):
Berkeley Mono (terminal-app + open-source licence clauses, not price) · Rive at the corrected ~896 KB gz, not 200 KB · CodeRabbit-ships-Rive (a false positive on the word "AI-driven") · APCA Lc 60 → Lc 75 body floor · Inter `cv01`/`ss03` → `cv05`/`cv11` · Safari 26 not 18 for scroll-driven CSS · "zero of 18 sites show a terminal" softened to the defensible form, and landing §09 names no competitor at all.

**Still live, and dangerous:**

| Item | Problem |
|---|---|
| **"CodeRabbit, $50M ARR, $1.5B val"** sits in the PRODUCT CONTEXT header. | The $1.5B valuation and the $143M round were **refuted** — uncorroborated by Sacra (which tracks them through July 2026 and shows $88M total, latest a $60M Series B at ~$550M) and by TechCrunch. The $50M ARR figure is confirmed *as a Sacra estimate*. If the deck or the pitch says "$1.5B", it is the most falsifiable sentence in the submission. **Say "≈$50M ARR, Sacra estimate" or say nothing.** |
| **The severity chroma ramp** | design-system honestly refutes its own direction (measured luminance 0.240 → 0.316 → **0.398** → 0.352 → 0.256 — rises then falls, so it does *not* survive greyscale) and demotes colour to a third cue. Landing §05 and dashboard §3a still describe the ramp in language implying it works. Terminology only, but fix the wording. |
| **Vercel AI Elements** | Not refuted — just dropped. `<Terminal>` takes `output` (ANSI-aware), `isStreaming`, `autoScroll`; `<TestResults>` takes `{passed, failed, skipped, total, duration}` with four statuses; `<StackTrace>` takes a raw trace string and dims `node_modules` frames. shadcn-style install copies source into your repo, so you own and restyle it entirely. **Install per-component, never `all.json`** (the bulk manifest pulls `ai`, `media-chrome`, Mermaid, and a Rive WebGL2 runtime). Recommended as a **day-1 two-hour spike**, not a mandate: if `<Terminal>` restyles cleanly to the ink tokens, it saves most of a day on the one component the schedule cannot afford to slip. |

---

## 5. Demo-day failure modes

**Already mitigated, well:** bundle 404 (armed force-reveal handshake) · reduced motion as a designed second state · projector washout (`[data-contrast="high"]`, built day one) · wifi loss (polling at 1.2s, not SSE) · WebGL/GPU (removed entirely) · preview-vs-production cold starts · backend down (fixture mode) · total failure (90-second MP4 on the desktop) · canonical-JSON divergence (flagged, if not owned).

**Residual, unmitigated:**

| Failure | Likelihood | Mitigation |
|---|---|---|
| **The tamper control silently does nothing.** `crypto.subtle` is **only available in a secure context**. Demoing from `http://192.168.x.x:3000` — the normal way to show a laptop build on a projector or a second machine — makes `crypto.subtle` `undefined`. The flagship interaction becomes an inert text field with no error. | **High.** Nobody checked this. | Feature-detect on mount; if unavailable, render the field read-only with a printed mono line: `hash verification requires https or localhost`. And demo from `localhost` or the production domain, never a LAN IP. |
| **A false `chain.verified = false` on first load** from a serialiser mismatch. | Medium | On mount, verify the *untouched* chain once. If it reports false, **do not render the broken-chain UI** — render `verification unavailable — serialiser mismatch` in `--marker`. A false break on the trust feature is worse than no feature. |
| **Out-of-order async digests** from a fast typist. `subtle.digest` is a promise; a 120ms debounce does not guarantee resolution order. | Medium | Monotonic request id; discard stale resolutions. |
| **"Show me what it actually posts on the PR."** | **Very high — this is the most likely live question**, and there is no answer anywhere in the plan. | See Part 2E. |
| **A font 404 destroys terminal column alignment.** | Low-medium | Explicit fallback chain (Part 2G). All candidate monos are 0.600em advance, so alignment survives — but only if the chain is written down. |
| **Judge opens the submission link on a phone and lands on the dashboard.** | Medium | One honest banner (Part 2G), one hour of work. |
| **Two accuracy metrics are the same number.** | Medium | §2 row 15. |

---

## 6. The single weakest part of this plan

**It is not a design decision. It is the schedule.**

Add the specified work:

- **Landing:** 15 sections, ≈9,200px + 2,200px pinned, including a bespoke contribution bar, a three-breakpoint hand-authored SVG pipeline, a contenteditable Web Crypto tamper control, six Wilson-interval metric cards, a comparison table, a live transactional run surface with polling, an FAQ, and a scope/pricing band.
- **Dashboard:** 22 routes, a virtualized findings table with frozen columns and cursor pagination, a nested four-step ⌘K palette, a two-level waterfall, a chain viewer with per-row recomputation, an accuracy page, a cost page with four charts, and six settings screens.
- **Shared:** three components shipping at multiple densities, a gamut-clamped OKLCH token pipeline with an APCA CI gate, a fixture mode, a reduced-motion second state, a projector variant, and a light/print theme.

The published schedule is **6.5 days**. Landing gives "sections 08–15" — eight sections including the accuracy report and the live run surface — **half a day**. Dashboard gives all 22 routes **≈1.5 days**, on the same calendar days the landing blueprint has already claimed.

One competent engineer builds this in **12–14 days**, not 6.5. The cut list is correct about *what* to protect but cuts nowhere near enough volume to close a 2× gap.

**Concrete recut** (protects every named never-cut item):

1. **Landing drops to 9 sections, ≈6,200px.** Keep: hero · negation · we-were-wrong · **the comment (new, Part 2E)** · severity instrument · pipeline · identity+recorder · accuracy · close+footer. **Cut outright:** §04 proof-state legend (folds into §03 as four chips), §08 agent-caught, §09 comparison, §12 scope/price, §13 FAQ — all four survive as linked sub-pages, which is what the research recommends anyway.
2. **Dashboard ships 8 routes, not 22.** `/runs/:id` (live + result), `/findings`, `/findings/:id`, `/suppressions`, `/audit`, `/accuracy`, `/` overview, `/settings/policy` read-only. Everything else is a 404 with a mono line reading `not built for the beta`. That is **on-brand** — stating a limitation is the voice.
3. **The pipeline scroll scrub is cut on day one, not held as contingency.** The live driver is needed for `/runs/:id` regardless; build it once, drive the marketing section from a `▶ PLAY` control and hover, and reclaim a full day.
4. **Spike AI Elements `<Terminal>` on day 1 morning.** Two-hour timebox. If it restyles, keep it.

Second-weakest, and worth naming: **the landing page is 2× the length of the most confident page in the category** (Cursor Bugbot, 5,080px), and the plan's own research says so. The recut fixes both problems with one decision.

---
---

# PART 2 — THE MISSING PIECES, WRITTEN

---

## A. Brand mark — **THE BENCH**

### Concept

The mark is the hero composition compressed to 16 pixels.

A square field. Inside it, **two horizontal bars stacked with a gap**: the upper bar is a **1.5px outline** (hollow), the lower bar is **solid**. Flush left, a short vertical **seam tick** crosses the gap and joins them. Outside the square's four corners sit **detached registration ticks** — the same 8px L-shapes that bracket every evidence frame in the product.

**It reads as:** two panes — base and head. One empty, one filled. A pass and a fail. A seam between them. Framed by crop marks.

**Why this and not the alternatives:**

- A shield, a checkmark, a robot, a sparkle, a brain, a hexagon and a padlock are all banned by the design system's own anti-pattern list, and all are worn out in this category.
- A chain link reads as crypto and destroys the audit feature's credibility before anyone reads a word.
- A "P" or "G" in a rounded square is what every AI startup ships.
- The registration mark alone is too thin to survive a 16px favicon.
- **The bench is the only geometry in the category that means something specific.** It is not a metaphor for security; it is a literal diagram of the mechanism.

### Construction (24×24 grid, all integers)

```
 ·                    ·        ┐ corner ticks: 5×5 L-shapes,
   ┌────────────────┐          │ 1.5px stroke, detached by 2px,
   │                │          │ at 0.10 alpha (0.22 on hover)
   │  ▭▭▭▭▭▭▭▭▭▭▭▭  │  ← base: 1.5px outline bar, 14×4, radius 1
   │  │             │
   │  ▌             │  ← seam: 1.5px vertical, 3px tall, flush left
   │  │             │
   │  ████████████  │  ← head: solid bar, 14×4, radius 1
   │                │
   └────────────────┘
 ·                    ·
```

| Element | Geometry (24×24 artboard) |
|---|---|
| Outer frame | 18×18, centred, **not drawn** — it is the optical boundary the corner ticks imply |
| Base bar | x 5, y 6, w 14, h 4, `fill: none`, `stroke-width: 1.5`, radius 1 |
| Seam | x 5.75, y 10, w 1.5, h 4 |
| Head bar | x 5, y 14, w 14, h 4, solid fill, radius 1 |
| Corner ticks | 5×5 L-shapes at (1,1) (18,1) (1,18) (18,18), `stroke-width: 1.5`, butt caps, miter joins |

Strokes are butt-capped and miter-joined — the same language as the four mechanic marks. No rounded terminals anywhere.

### Simplification ladder (mandatory)

| Rendered size | Form |
|---|---|
| ≥ 32px | Full mark: corner ticks + base + seam + head |
| 20–31px | **Drop the corner ticks.** Base + seam + head only |
| ≤ 19px, and every circular crop | **Drop the seam.** Two bars only — one hollow, one solid. Bump stroke to 2px |

**Never** render the full mark below 32px. The corner ticks fall below one device pixel and turn to mud.

### Colour

| Context | Bars | Corner ticks |
|---|---|---|
| Default, dark | `--signal` `#2ECEDD` | `--rule-2` `oklch(1 0 0 / 0.14)` |
| One-colour, dark | `--text-primary` `#EEF0F3` | same |
| One-colour, light (print, invoices, the light audit export) | `--ink-0` `#080A0D` | `oklch(0 0 0 / 0.14)` |
| Forced colors | `CanvasText` | `CanvasText` |
| **Never** | a gradient · two colours in one mark · `--alarm` (reserved) · any hue outside the three families |

### The one motion the mark is permitted
The head bar's fill is a **0ms flip** — the same verdict language as everything else. Used in exactly two places: the favicon (§C) and the marketing page's own tab title during a live run. The mark **never** animates in the nav, in the footer, or on a loading screen.

### Don'ts
Do not rotate it · do not outline both bars · do not fill both bars · do not add a circle, square or rounded-rect container (the corner ticks *are* the container) · do not place it on a photograph · do not reproduce it below 16px · do not add a glow, a shadow, or a bevel · do not animate the corner ticks · do not use it as a bullet, a loading spinner, or a cursor.

---

## B. Wordmark — **PRGUARD**

```
PRGUARD
```

| Property | Value |
|---|---|
| Face | Google Sans Code |
| Weight | **560** (variable axis — not 500, not 600) |
| Case | All caps. Always. |
| Tracking | **+0.04em** — deliberately tighter than the 11px label tier's +0.12em, so it reads as a *name* rather than as a system label |
| Size | 15px in nav; 20px in the footer; never below 12px |
| Colour | `--text-primary`. The mark carries the accent; the wordmark does not. |
| Spelling | One word. **Never** `PRGuard` in the wordmark, never `PR-Guard`, never `pr guard`, never camelCase, never a coloured `PR`. |

> In running prose the product is **PRGuard** (capital P, capital R, capital G). The all-caps `PRGUARD` form exists only in the wordmark, the nav and the footer.

### Lockups

**Lockup A — Horizontal (default).** Mark at 20px, then a **1px vertical hairline rule** in `--rule-2` at full cap-height, then the wordmark. Gaps of 10px either side of the rule.

```
▣ │ PRGUARD
```

The hairline — not whitespace — is the ownable detail. It reads as a rack unit, a spec sheet, a rule on a drawing. It is the same 1px hairline that separates every panel in the product.

**Lockup B — Horizontal with rail.** Lockup A, plus a 1px `--signal-lo` rule beneath the wordmark at exactly the wordmark's width. Reserved for the footer and the OG card. Never in the nav.

**Lockup C — Stacked.** Mark at 32px, 12px gap, wordmark at 15px, both centred. For the 404 page, the print header, and the loading state.

**Lockup D — Mark only.** Favicon, app icon, GitHub App avatar, README badge, browser tab.

### Clear space
On all four sides, **equal to the height of one bar** in the mark (4px at a 24px artboard, i.e. `mark-height ÷ 6`). Nothing enters it — not a nav item, not a divider, not a badge. The detached corner ticks live *inside* the clear space and are exempt.

### Minimum sizes
Lockup A: 96px wide · Lockup C: 32px wide · Mark alone: 16px · Wordmark alone: 12px.

### Wordmark don'ts
No letter-spacing above +0.06em (it becomes a label) · no colour on individual letters · no gradient · no italic (the face ships one, don't use it) · never set in Inter · never set in a system mono · never outlined · never on an angle · never with a tagline locked to it (taglines are page copy, not brand furniture).

---

## C. Favicon, OG, app icon, GitHub App avatar

### Favicon — with a live-state variant

Ship four files:

| File | Spec |
|---|---|
| `/icon.svg` | Mark only, no corner ticks, no seam (≤19px rule). `--signal` bars on **transparent**, with an embedded `@media (prefers-color-scheme: light)` swapping to `--ink-0`. |
| `/favicon.ico` | 32×32 and 16×16, bars at 2px stroke, `--signal` on `--ink-0` (never transparent — Windows composites onto white). |
| `/apple-touch-icon.png` | 180×180, mark on a **solid `--ink-0` field with no radius** — iOS applies its own mask and composites transparency onto white. |
| `/icon-mask.svg` | Safari pinned-tab monochrome mask, single-path, solid black. |

**The live-state favicon.** During a live review on `/runs/:id`, swap `<link rel="icon">` to a runtime-drawn variant:

| Run state | Head bar |
|---|---|
| running | `--signal` outline, 1200ms heartbeat via canvas redraw |
| gate clear | both bars `--signal`, head solid |
| **gate blocked** | head bar `--alarm` |

Costs ~25 lines against a 32×32 `OffscreenCanvas`. It is the cheapest genuinely delightful, genuinely on-brand detail available, it works when the tab is in the background, and nobody in this category does it.

### OG / social card

`1200 × 630`, generated at build time with Next's `ImageResponse`.

```
┌──────────────────────────────────────────────────────────────┐
│  ▣ │ PRGUARD                    graph paper, 64px major grid │
│                                                              │
│  We don't guess.              ┌────────────────────────────┐ │
│  We run the test.             │ base 7c41a09               │ │
│                               │ 1 passed in 0.42s          │ │
│  ─────────────────            ├──── HEAD 9c2d4b1 ──────────┤ │
│                               │ 1 failed in 0.39s          │ │
│                               └────────────────────────────┘ │
│                                              ▣ PROVEN        │
├──────────────────────────────────────────────────────────────┤
│  PASSES AT BASE · FAILS AT HEAD · PROVEN     → blocks merge   │
└──────────────────────────────────────────────────────────────┘
```

**Satori constraints — these are hard and will break the build if ignored:** no `mask-image`, no `backdrop-filter`, no `feTurbulence`, no CSS custom properties, no `oklch()`. Build the card from **flat rects, literal hex values, and linear-gradients only**. The graph paper is drawn as repeating `<div>` rules, not as a background-image. Both fonts must be loaded as `ArrayBuffer`s; the variable axis is not honoured, so **use a static 560 instance** for the wordmark or it renders at 400.

Tags:
```html
<meta property="og:image" content="/og.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta property="og:title" content="PRGuard — proven, or it doesn't block" />
<meta property="og:description"
      content="An AI code reviewer that executes its own claims. Every finding carries a repro test run at your base SHA and your head SHA. Only proven findings can block a merge." />
```

**Dynamic OG for shared runs and findings** — `/runs/:id/opengraph-image` rendering the actual gate state and verdict — is a genuinely strong idea and is **the first OG work to cut.**

### App icon / GitHub App avatar — *the one nobody specified*

This appears beside `prguard[bot] reviewed 2 minutes ago` on **every comment PRGuard has ever posted**. It is the most-seen brand surface in the entire product and it is the one nobody wrote down.

| Property | Value |
|---|---|
| File | 512×512 PNG, no transparency |
| Form | **Mark only, no corner ticks, no seam** — GitHub circle-crops it, and the ticks land outside the circle |
| Field | Solid `--ink-0` `#080A0D`, edge to edge |
| Bars | `--signal` `#2ECEDD`, scaled to **56% of the frame width**, optically centred, 3px stroke on the base bar |
| Verification | Must be legible at **20px** — screenshot it at 20px in a GitHub thread before shipping. If the hollow/solid distinction dies, thicken the base bar's stroke, do not shrink the gap |
| Never | a `--alarm` variant (a bot with a permanently red avatar reads as broken) · text in the avatar · a light field (it must read as itself in GitHub's light *and* dark themes) |

---

## D. Naming and voice guidelines

The product's entire differentiator is that it replaces adjectives with artifacts. The copy has to do the same thing or the design is arguing with the writing.

### The four rules that generate everything else

1. **Every number carries its denominator.** `0.91 (n=312)`. No exceptions, not in a hero, not in a chip, not in a tweet. A number without an `n` is deleted, not rounded.
2. **No adjective may do a measurement's job.** If a sentence would survive on a competitor's site, it is worth zero and it is cut.
3. **Say what happened, in the order it happened.** `[subject] [verb] [object] [at the specific place]`. "The sandbox ran the test at `9c2d4b1`" — not "PRGuard intelligently validates your changes."
4. **PRGuard is the subject for system behaviour. "We" is reserved for the team's own admissions.** This is why §03's headline works and why it could not be "PRGuard was wrong about this one." The system executes; the team owns mistakes. Never mix them in one sentence.

### Capitalising the states — *the four blueprints currently disagree*

| Context | Form | Example |
|---|---|---|
| In a UI chip, 11px mono caps | `PROVEN` | the badge |
| In an API path, a log line, a provenance footer, a code block | `proof_status: proven` | monospace, lowercase, always |
| In prose | *reworded* | "the repro test passed at base and failed at head" |

> **A state is a value, not an adjective.** Never write "a proven bug", "proven findings are blocking", "we disprove findings". Write "a finding with `proof_status: proven`", or reword. The moment `proven` becomes an adjective it becomes an opinion, which is the thing the word exists to replace.

Same rule for the nine stages: `S3 SPECIALISTS` in mono caps on a diagram; "the four specialists" in prose; never "Stage Three Specialists".

Mechanics are **M1–M4 in internal documents only**. The letters never appear on the site.

### Banned words and constructions

**Adjectives:** intelligent · smart · context-aware · best-in-class · enterprise-grade · powerful · seamless · effortless · cutting-edge · frontier · world-class · revolutionary · game-changing · robust · blazing.

**Verbs:** supercharge · unlock · empower · leverage · streamline · elevate · transform · democratise · reimagine.

**Claims:** "understands your codebase" · "thinks like a senior engineer" · "reasons about" · "just works" · "AI-powered" (say what it does instead) · "trusted by developers everywhere" (we have no customers).

**Shapes:** "Build faster. Ship smarter." and every two-clause imperative of that form · a headline that is a category noun phrase ("The AI Code Reviewer") · a headline that would work on a competitor's site · a stat bar of round numbers · exclamation marks · emoji, anywhere, including the GitHub comment.

**Superlatives without a check:** never "the only", "the first", "nobody else". The permitted form is the checkable one: *"We could not find another reviewer that publishes a false-positive rate with a denominator. The list is above — check it."*

**Punctuation:** at most **one em-dash per paragraph**. Em-dash-in-every-sentence is a documented slop signal and a judge who has read forty hackathon sites this week will register it before they register the argument.

### Competitor policy

**Never name a competitor on the marketing site.** Three reasons, and the third is the real one: several competitive claims in the research did not survive fact-checking; two named competitors have left the category entirely; and a checkable list is more confident than a named one. Internally, name them freely.

**Never quote a competitor's funding.** The `$1.5B` figure in the product context is refuted (see §4). If a valuation is needed, use "≈$50M ARR, per a Sacra estimate" and nothing more.

### Fixed copy — do not paraphrase

These three strings are load-bearing and must appear verbatim wherever they appear:

> **"That is the rate at which the system caught itself before the claim reached your pull request."**
>
> **"Only proven findings can block a merge. Everything else is a comment."**
>
> **"Degraded, never invisible."** *(internal, for the fallback handshake)*

### Numeric style

| Quantity | Precision | Face |
|---|---|---|
| Severity score, weights, contributions, rates | **3 decimals**, always (`0.810`, not `0.81`) | mono, tabular, slashed zero |
| Money | 4 decimals (`$0.0412`) | mono, tabular |
| Latency | 1 decimal + unit (`14.2s`) | mono, tabular |
| Token counts | thin-space grouped (`41 022`) | mono, tabular |
| SHAs | 7 chars in prose, full on copy | mono |
| Hashes | `first-8…last-4`, full 64 in `title` and on copy | mono |
| Timestamps | ISO 8601 UTC with `Z` in evidence; relative in lists | mono |

Precision **never varies within a column.** `0.810` and `0.81` in the same table is the single fastest way to look improvised.

### Tense and person

Present tense for what the system does ("PRGuard writes a repro test"). Past tense **only** for a captured artifact ("the sandbox ran it at `9c2d4b1`"). Never future tense — "PRGuard will analyse your PR" is a promise, and this product does not make promises.

---

## E. The missing landing section — **THE COMMENT**

### Why it exists

Every visual on the landing page is PRGuard's own chrome. A reviewer's actual question is *"what will this put in my pull request?"* and fifteen sections never answer it. The comment is the only surface most users will ever see, and it is the most likely live question in Q&A.

### Where it goes, and what it costs

**Insert immediately after §04 (proof states). Number it `/ 05 — WHAT LANDS IN YOUR PR`.** Renumber below.

**It pays for itself by cutting §08 (the agent-caught story).** Both sections do the same job — show a concrete artifact — and this one closes a gap while §08 duplicates a claim §04 and §07 already make.

### The visual idea, and it is the best one available without a shader

> **This is the only section on the entire dark site rendered in GitHub's own light-grey PR chrome.**

Full-bleed, `#ffffff` / `#f6f8fa`, GitHub's borders, GitHub's avatar row, GitHub's monospace. After four sections of near-black instrument panel, a white PR thread is the loudest contrast moment on the page — and it is *honest* contrast, because it is literally a different system. It says "this is your workflow, not our dashboard" without a word of copy, and it earns back most of what was conceded by refusing WebGL.

Rendered as a **static, pixel-accurate mock** at two breakpoints, not an iframe. No animation except a 240ms opacity reveal.

### Copy

**Section index:** `/ 05 — WHAT LANDS IN YOUR PR`

**H2:** `One comment. Never an approval.`

**Subhead (Inter 18px, `--text-body`, max 58ch):**
> PRGuard posts exactly one review per run, with `event: COMMENT`. It has never posted `APPROVE`, and the code path to do so does not exist — there is a test that asserts it on every build.

### The rendered comment (this is also the S8 backend spec)

Header row, in GitHub's chrome:

```
▣  prguard[bot]  reviewed 2 minutes ago                    Comment
```

Inline comment body, anchored at `checkout.py:41`:

```markdown
**`proof_status: proven`** · severity **`0.810`** critical

`session.refresh()` returns `None` when the account has no default
currency. Line 41 dereferences it.

**Proof** — a repro test was generated and executed in a sandbox at both SHAs:

| | SHA | result |
|---|---|---|
| base | `7c41a09` | `1 passed in 0.42s` |
| head | `9c2d4b1` | `1 failed in 0.39s` |

<details><summary>terminal output at head <code>9c2d4b1</code></summary>

    E   AttributeError: 'NoneType' object has no attribute 'currency'
    tests/test_repro_a91f3c2e.py:41: AttributeError
    1 failed in 0.39s

</details>

**Severity `0.810`** — path_sensitivity `.250` + reachability `.180` +
coverage_gap `.120` + blast_radius `.083` + proof_confidence `.143` +
churn `.035`, crossing the `.75` critical threshold.
[inputs and weights ↗](…)

This finding is proven, so the `prguard` check is failing. Three other
findings in this review are advisory and do not block.

`fingerprint a91f3c2e…8b4d` · [dismiss with a reason ↗](…) ·
[how often we're wrong ↗](…)
```

Beneath it, the **review summary comment**:

```markdown
**PRGuard** reviewed `#4821` in 41.2s · [full run ↗](…)

**Gate: failing** — 1 proven finding.

| | |
|---|---|
| raised | 12 |
| dropped at the coordinator | 4 |
| deduplicated | 3 |
| suppressed by an existing rule | 1 |
| **proven** | **1** |
| disproven — refuted by execution | 1 |
| inconclusive / not attempted | 2 |

Delivered: 9 inline at the exact line, 2 at the nearest line in a diff hunk,
1 at file level. **0 silently dropped.**

`event: COMMENT` — PRGuard does not approve pull requests.
```

### Rules for the comment (a backend deliverable, not a decoration)

| Rule | Why |
|---|---|
| **Never `APPROVE`.** Guarded by `test_review_event_is_never_approve`. | M4 |
| **Never an emoji**, including in the summary table | Instantly cheapens a governance product |
| **Never a collapsed "Nitpicks" section** | That is the incumbent's signature; arriving with it reads as imitation |
| **Every inline comment carries its fingerprint** | The dismissal has to be traceable, and it is how M3 reaches the user |
| **Terminal output is always inside `<details>`** | An unrolled traceback in a PR thread is hostile |
| **Every claim links to the artifact that supports it** | "inputs and weights ↗", "full run ↗" — the provenance line, restated in GitHub's idiom |
| **"how often we're wrong ↗" is mandatory on every proven finding** | It is the product's whole posture, placed at the exact moment the reader is most sceptical |
| **Cap inline comments at 10 per review**; the rest go to the summary with a count | Never silently drop, never flood |
| **Markdown only.** No HTML beyond `<details>`/`<summary>` | GitHub sanitises the rest, and it degrades badly in email notifications |

### Composition

Full-bleed band, 700px tall, `#f6f8fa`. The mock sits centred at 880px max-width in GitHub's card chrome (1px `#d0d7de`, 6px radius). PRGuard's own copy above it stays on the dark substrate; the white band starts below the subhead and ends with the provenance line, which is **inverted** here — `--ink-0` on white:

```
POST /repos/{owner}/{repo}/pulls/{n}/reviews  →  { "event": "COMMENT", … }
```

### Animation

One opacity reveal at `--dur-3` on `--ease-instrument`, `once: true`. **Nothing else.** No typing, no scroll parallax, no hover on the mock. It is a photograph of a thing that already happened.

### Mobile

GitHub's own comment chrome collapses at 375px; mirror it. The severity breakdown line wraps to three lines. The `<details>` block renders collapsed. The summary table becomes six stacked label/value rows.

---

## F. 404, 500, offline, and first load

Every one uses the section-index grammar. No illustration, no "Oops!", no cartoon.

### 404

```
┌ / 404 — NO SUCH ROUTE ─────────────────────────────────────┐
│                                                            │
│   ▣                                                        │
│   PRGUARD                                                  │
│                                                            │
│   There is nothing at this path.                           │
│                                                            │
│   [ ← BACK TO THE PROOF BENCH ]                            │
│                                                            │
└ GET /runs/4e8b1d0/pipeline  ·  404  ────────────────────────┘
```

Lockup C, `--ink-0`, graph paper, no grain. The provenance footer prints **the path that was actually requested** and the status code — the same device as every evidence frame, applied to a failure. One ghost CTA. No search box, no "popular pages", no sitemap.

### 500

Identical structure, `/ 500 — UNHANDLED`, body: `Something on our side failed. The request id is below.` Footer carries the request id with click-to-copy and a `[Copy request id]` ghost button. Link to `/healthz`. **Never** "we're working on it" — nobody is, and the product's voice does not lie about state.

### Dashboard offline

Not a page — a 32px `--marker` band pinned under the top bar:
```
OFFLINE · last successful poll 14s ago · retrying
```
Cached data stays rendered at full opacity. Write actions disable with a title explaining why. Dimming stale-but-valid data is a lie about its validity.

### First load, JS disabled

```html
<noscript>
  <style>[data-reveal]{opacity:1!important;animation:none!important}</style>
</noscript>
```
Plus one mono line in the footer, rendered only inside `<noscript>`:
> `Replay, the audit chain tamper control and the live run view need JavaScript. Everything above is static.`

Stating the limitation is the voice. The hero, both terminal panes, the verdict and the provenance line all render without a byte of JS — which is the whole point of the frame-0 architecture.

---

## G. Small holes closed

### Nav CTA behaviour
`RUN A REVIEW →` in the nav **scrolls to §11 (Run One)**, it does not route to `/app`. There is no account and no install required to run a review on a public PR, so sending a first-time visitor to a login screen would be a self-inflicted wound. `scroll-behavior: auto` — Next 16 removed the automatic smooth scroll; do not opt back in. The footer CTA does the same. Only the `[LIVE]` badge in the dashboard top bar routes to `/app`.

### Font fallback chain

```css
--font-mono: "Google Sans Code", ui-monospace, "SF Mono", "Menlo",
             "Cascadia Mono", "Consolas", monospace;
--font-sans: "Inter Variable", -apple-system, BlinkMacSystemFont,
             "Segoe UI", system-ui, sans-serif;
```

Every candidate mono has a **0.600em advance**, so terminal column alignment survives a font failure intact — the one property that matters. Add a `size-adjust` fallback face for the sans so the prose does not reflow:

```css
@font-face {
  font-family: "Inter Fallback";
  src: local("Arial");
  size-adjust: 107%;
  ascent-override: 90%;
  descent-override: 22%;
}
```

### Tamper control guards (all four required)

```ts
// 1 — secure context. crypto.subtle is undefined on http://192.168.x.x
if (!window.isSecureContext || !crypto?.subtle) {
  return <ReadOnlyChain note="hash verification requires https or localhost" />;
}

// 2 — verify the UNTOUCHED chain once on mount.
//     A false break on load is worse than no feature at all.
if (!(await verify(events))) {
  return <ChainRail state="unavailable"
                    note="verification unavailable — serialiser mismatch" />;
}

// 3 — monotonic request id; discard stale async digests
const seq = ++reqId.current;
const result = await recompute(window);
if (seq !== reqId.current) return;

// 4 — recompute the RENDERED WINDOW only, never the whole chain
```

### Dashboard on a phone
Below 768px, render the top bar, a `--marker` banner, and a read-only stacked view:
> `PRGuard's dashboard is built for a keyboard and a wide screen. This is a read-only view.`

Tables become cards; the ⌘K palette, `j`/`k` and bulk actions are hidden rather than broken. One hour, and it is on-brand — the product states its limitations rather than degrading silently.

### Repo presentation
Hackathon judges open the repo. Put Lockup D + the one-line description at the top of the README, the same `Proven, or it doesn't block.` line, and a 12-second GIF of the proof bench. `README.md` is a brand surface and currently nobody owns it.