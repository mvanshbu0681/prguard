# PRGUARD — LANDING PAGE BLUEPRINT
### Direction: COLD LIGHT (spine) + Exhibit grafts (provenance, hold, tamper-by-typing, Wilson) + three grafts from BLAST DOOR (keyboard replay, D-key counter-demo, one weighted curve)

---

## 0. THE BET, AND HOW IT ANSWERS THE "3D / CINEMATIC" BRIEF

**The bet in one line:** every visual on this page is a real captured artifact with a printed address, and the page is built so that a judge who never scrolls, never moves the mouse, and has JavaScript blocked still sees the entire argument.

**The 3D concession, stated out loud rather than quietly skipped.** The owner asked for dark, gradient-dark, 3D, cinematic. This page is dark and cinematic. It is not 3D, and here is the sentence to say when asked:

> "Of the elite dark dev-tool sites we surveyed, essentially none ship a WebGL hero. CodeRabbit's 'cinematic 3D' is a conic-gradient rim light over flat panels at 2–12% white. And for a product whose claim is that it executes your code, a floating abstract object is the visual form of an unfalsifiable assertion. We spent the 3D budget on the thing that proves the claim."

Cinematic is delivered as: a graph-paper substrate with bounded grain, four-rung depth stacking with no drop shadows, a 1400ms scan line on the only heavy easing curve in the project, a 0ms verdict flip, a four-second hold where nothing moves, and one pinned section. **If the owner will not budge, the single concession that does not break the direction is one static `<Dithering>` surface at ≤5% opacity behind section 02, pinned to an exact version, behind a WebGL2 feature check, with a static fallback — never in front of text, never load-bearing. Settle this in hour one; it costs two days if reopened on day four.**

---

## 1. GLOBAL SYSTEMS

### 1.1 Colour tokens

Authored **hex-first**; OKLCH is generated from hex and gamut-clamped in a build step. (Two values in the source research were out of sRGB and silently clipped — the brand accent among them. Never hand-write both representations.)

```css
:root {
  /* SURFACE LADDER — depth is one rung + 1px hairline + 1px inset top highlight. Zero drop shadows. */
  --ink-0:  #080A0D;  /* page */
  --ink-1:  #0F1114;  /* panel, terminal interior, sticky header */
  --ink-2:  #16191C;  /* card, panel header bar, table header, chip at rest */
  --ink-3:  #1E2125;  /* row hover, button hover */
  --ink-4:  #272B2E;  /* pressed, selected fill */
  --ink-5:  #32363A;  /* solid divider, disabled fill */
  --ink-6:  #41464B;  /* solid border at rest — structural only, 2.08:1 */
  --ink-7:  #595E64;  /* MEANINGFUL-BORDER FLOOR — 3.03:1. Input outlines, selected rows. */
  --ink-8:  #646A70;  /* disabled text, not_attempted, placeholder */

  /* TEXT */
  --text-dim:     #8D9399;  /* eyebrows, column heads, units. APCA -43.6. Never body. */
  --text-body:    #CDD1D6;  /* APCA -78.2 / WCAG 12.92 — clears the real Lc 75 body floor */
  --text-primary: #EEF0F3;  /* APCA -97.8. Never #FFF — halation is the fastest cheap tell. */

  /* HAIRLINES — alpha, so they compose over the one hero radial instead of scarring it */
  --rule-hair: oklch(1 0 0 / 0.055);  /* graph paper, table separators. DECORATIVE ONLY. */
  --rule-1:    oklch(1 0 0 / 0.09);   /* default panel border */
  --rule-2:    oklch(1 0 0 / 0.14);   /* interactive border, bench edge */
  --rule-3:    oklch(1 0 0 / 0.22);   /* hover, registration marks at hover */

  /* SIGNAL — execution results. Both proven and disproven live here. */
  --signal-hi:   #65E7F5;  /* focus ring (2px solid, 2px offset), the scan line */
  --signal:      #2ECEDD;  /* proof_status: proven, active stage, brand accent */
  --signal-lo:   #0698A4;  /* 2px status rails, completed connectors, scroll rail */
  --signal-tint: #13282C;  /* 12% signal over ink-1 — surface only, never text */

  /* ALARM — the only chromatic gate state. At most once per screen, by design. */
  --alarm:       #F64F47;
  --alarm-hi:    #FD8074;  /* alarm-coloured text, the failing traceback line */
  --alarm-tint:  #2B181A;

  --marker:      #E7B551;  /* inconclusive, degraded stage, stale heartbeat, S8 fallback rung */

  /* SEVERITY — strictly monotone CHROMA ramp 0.008 → 0.045 → 0.105 → 0.160 → 0.205.
     Survives greyscale and CVD as an intensity ramp, not five hues to tell apart. */
  --sev-info:     #83878B;
  --sev-low:      #A39879;
  --sev-medium:   #CFA25A;
  --sev-high:     #F18336;
  --sev-critical: #F64F47;  /* same token as --alarm */

  --grid: oklch(1 0 0 / 0.028);
}
```

**No green anywhere in this product.** Gate clear is `--text-body` on `--ink-1` with a 1px `--signal-lo` underline. An instrument at rest has a needle at zero, not a green light. This is both a differentiator and a legibility win — PRGuard's gate sits three pixels from GitHub's own green check inside a PR tab.

**Projector variant, built day one, not day six** (four lines if the tokens are semantic, a rewrite if they are not):

```css
[data-contrast="high"] {
  --rule-hair: #595E64; --rule-1: #595E64; --rule-2: #595E64; --rule-3: #7A8086;
  --grid: oklch(1 0 0 / 0.09);
}
```

Switch to it before walking on stage. On a washed-out venue display the ink-0/1/2/3 steps collapse into one flat black and the 0.028-alpha graph paper disappears entirely.

### 1.2 Typography

| Role | Face | Spec |
|---|---|---|
| Display + all machine values | **Google Sans Code**, SIL OFL, **v7.001** (not 7.000), variable wght 300–800, ~34KB latin | slashed zero by default, `l` with a right-hooking tail, barred `I`, **zero GSUB ligature features** — nothing can silently rewrite `!=` inside evidence |
| Prose only | **Inter Variable**, SIL OFL, opsz 14–32 + wght 100–900 | `font-feature-settings: "cv11", "cv05"`. Note `cv01`/`ss03` — the settings usually copied from Linear — only affect the digit 1 and quotes/commas and do almost nothing in English. `cv11` (single-storey a) is the one that changes texture. |

**Headline size — corrected from the direction, with the arithmetic.** Google Sans Code's advance is 0.600em. The hero's left column is 620px usable at 1440. At 72px that is 43.2px per character — **14.3 characters per line**, which does not hold a sentence. At **62px** the advance is 37.2px — **16.6 characters per line**, which does.

> **Hero H1 is 62px, hard-capped at 16 characters per line, two lines maximum.** `clamp(2.25rem, 0.9rem + 3.9vw, 3.875rem)` / line-height 1.02 / tracking −0.032em / weight 520. Set the literal string at 1280 / 1440 / 1920 on the actual demo machine on day one, and confirm the variable `wght` axis renders — if it falls back to a static 400 cut, the entire hierarchy flattens.

Full scale:

- **DISPLAY** (GSC 520, tracking −0.032em): hero 62px/1.02 · h2 40px/1.08/−0.028em · h3 24px/1.20/−0.020em
- **LABEL** (GSC 500, UPPERCASE, +0.12em): 11px/1.4 — every eyebrow, column head, stage name, chip, section index
- **BODY** (Inter): lead 18px/1.55/−0.011em · body 15px/1.60/−0.011em · small 13px/1.50/−0.013em · micro 11px/1.40/0
- **DATA** (GSC, tabular): readout-xl 48px/1.0/−0.020em wght 500 · terminal + diff 13px/22px · chip/hash 11px/1.4
- **Tracking on all monospace data is exactly 0.** Any tracking on mono destroys column alignment, which is the one thing a forensic product cannot get wrong.
- Global: `font-variant-numeric: lining-nums tabular-nums slashed-zero`. Applied via Linear's pattern so `font-feature-settings` and `font-variant-numeric` do not cancel each other out:
  ```css
  .tnum { font-feature-settings: var(--font-settings), "zero" !important;
          font-variant-numeric: lining-nums tabular-nums slashed-zero !important; }
  ```
- Hashes render as first-8 + ellipsis + last-4 (`a91f3c2e…8b4d`) with click-to-copy.
- **Display face is declared in the `(marketing)` layout, not the root layout.** Root-layout fonts preload on every route; a hero-only display face would tax the dashboard's LCP on every navigation for a headline it never renders.

### 1.3 Substrate — non-negotiable, ~60 lines of CSS, carries most of the expensive read

```css
body {
  background:
    repeating-linear-gradient(to right,  var(--grid) 0 1px, transparent 1px 8px),
    repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 8px),
    repeating-linear-gradient(to right,  var(--grid) 0 1px, transparent 1px 64px),
    repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 64px),
    var(--ink-0);
}
```

Plus **one bounded inline `feTurbulence` grain** per named section — `type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"`, 180×180 tile, opacity 0.035, `mix-blend-mode: overlay`. Under 1KB as a data URI. **Never `position: fixed; inset: 0`** — an unbounded per-pixel-computed filter on a 3× phone is a multi-megabyte GPU texture. Never animate `baseFrequency` or `seed`.

The grain is not decoration. A large radial gradient across a near-black is exactly where 8-bit sRGB quantisation produces contour rings; 0.035 opacity at overlay blend is one 8-bit step of dither, which is the correct amplitude. Above ~0.08 it stops being a dither and reads as a filter.

**One ambient element on the entire page:** a single static radial behind the hero bench, `radial-gradient(70% 50% at 78% 12%, oklch(0.78 0.125 205 / 0.10), transparent 68%)`. It never animates. Accent coverage across the hero stays under 3% of pixels.

### 1.4 The frame grammar — every evidence panel is bracketed

This is the highest-value graft and it costs two spans.

```
┌ / 05 — COMPUTED SEVERITY · finding a91f3c2e ───────────────┐   ← index strip (11px mono caps, --text-dim)
│                                                            │
│   [ the artifact, rendered at full fidelity ]              │
│                                                            │
└ GET /v1/findings/a91f3c2e → severity · 14:22:07Z ──────────┘   ← provenance strip (11px mono, --text-dim)
```

Four **8px L-shaped corner registration marks**, 1px strokes, 0.10 alpha → 0.22 on hover over 120ms.

> **HARD RULE:** registration marks appear ONLY on evidence-bearing frames. Never on buttons, chips, nav, or generic content panels. The moment they escape, the one ownable detail becomes a template tic.

**Do not import the full `EXHIBIT 01 · PROOF · finding a91f3c2e · captured 2026-09-19T14:22:07Z` header** — it is one field too many and fights the restraint. Index + category + identifier above; captured-at timestamp drops to the footer beside the provenance path.

### 1.5 Shape, depth, iconography

- Radii: 2px on data surfaces, 4px on panels, 6px on the largest container. Nothing is pill-shaped except the heartbeat dot. Buttons are squared at 2px.
- Depth: one rung on the ink ladder + 1px hairline + `box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.06)`. **Zero drop shadows. Zero blur.** `backdrop-filter` exists in exactly two places on the whole marketing site: the sticky header and nothing else.
- Four bespoke marks for M1–M4 in one stroke language: 1.25px strokes, butt caps, miter joins, strict 16px grid, no rounded terminals. Proof = a sample vial with a fill line. Severity = a spirit level with a bubble. Fingerprint = an actual ridge pattern. Governance = a wax seal over a chain link. The same strokes become the pipeline's station glyphs.
- Utility chrome: `lucide-react` at matched weight. **Banned outright:** sparkles, brains, robots, shields-with-ticks, hexagon grids, neural-net node clouds, mascots.
- **Imagery: none.** No photographs, no illustrations, no 3D renders, no stock anything. Every visual is a real product surface, a real captured artifact, or a real diagram of a real mechanism.

### 1.6 Motion system

**THREE easings, published as tokens. Nothing else exists.**

```css
--ease-instrument: cubic-bezier(0.33, 0, 0.12, 1);  /* every entrance, wipe, reveal */
--ease-snap:       cubic-bezier(0.2,  0, 0,    1);  /* 120–180ms: chips, hovers, state flips */
--ease-mass:       cubic-bezier(0.62, 0, 0.10, 1);  /* ONE use only: the scan line's travel */
```

> **Correction to the source direction:** it specified `--ease-mass: cubic-bezier(0.33, 0, 0.12, 1)`, which is byte-identical to `--ease-instrument` — a collision inherited from merging two proposals. A third token with the same curve is not a third token. `--ease-mass` is re-specified as `cubic-bezier(0.62, 0, 0.10, 1)`: slower start, longer accelerate, harder arrest. A curve with real weight on the one element that traverses the whole panel is what separates "animated" from "actuated."

`linear` for **every** scrub, without exception — easing a scrub fights the scroll input and reads as lag. Exits: 160ms on `cubic-bezier(0.4, 0, 1, 1)`.

**BANNED:** any curve with overshoot. Nothing in this product bounces. Tailwind's default `cubic-bezier(0.4, 0, 0.2, 1)` never appears on anything a judge will look at.

**FIVE durations, quantised, nothing in between:** 120 (hover, focus, chip tint) · 180 (state-flip scale, tooltip) · 240 (small reveal, underline draw, opacity enter) · 420 (element entrance, rail wipe, section rule draw) · 1400 (the hero scan — the only long duration on the site).

**Stagger:** 60ms between siblings · 120ms between pipeline stages · terminal rows as **three stepped groups at 0/120/240ms**, never 60 individual delays.

**THE DELIBERATE EXCEPTION — do not soften it.** Verdict and gate colour changes are **0ms**: no `transition` property at all, paired with a 180ms `scale(1.045) → 1` on `--ease-snap`. Because every other transition on the page is eased, an instantaneous colour flip reads as a machine returning a result rather than an interface animating. This is the single most important motion decision in the project.

**Compositor contract, enforced as a lint rule:** `transform`, `opacity`, `clip-path`, `filter` only. Never `width`/`height`/`top`/`left`/`margin`/`box-shadow`/`background-color` per frame. **Never animate a CSS custom property on `:root`** — it triggers paint across the whole invalidated subtree (one measured case forced recalc on 1,300+ elements at 8ms/frame). Scope animated vars to the single animating element. `will-change` added immediately before, removed immediately after, never sprayed.

**The one pulse on the entire site** is the heartbeat dot: `@keyframes tick { 0%, 100% { opacity: .35 } 12% { opacity: 1 } }` at 1200ms, using `steps`, matching the real heartbeat interval. It stops and turns `--marker` when heartbeat age exceeds 20s, with the age printed beside it in mono. A dot that pulses when nothing is happening is a lie; one driven by real telemetry is instrumentation.

**Reduced motion is a designed second state, not an off switch.** Implemented once as `@media (prefers-reduced-motion: reduce)` plus a `[data-motion="reduced"]` attribute on `<html>`, so the OS preference and the footer toggle share one code path. Every GSAP timeline is constructed inside `gsap.matchMedia()` so it is never built at all. Per-section variants are specified below; the global rule is that **every animated thing must read as a still**, which is the right constraint — if the hero does not work frozen it does not work in three seconds either.

Explicitly **not** `* { animation: none !important }` — that is worse than nothing, because any element whose visible state is produced *by* the animation stays at its initial state.

---

## 2. PAGE ENTRY — THE FIRST 300 MILLISECONDS

**There is no preloader.** Not a spinner, not a percentage, not the "hash chain verifying itself" one. It costs LCP, risks an impatient judge, and the page is already interactive underneath. Chain verification belongs in section 07 where it can be interacted with.

| t | What happens |
|---|---|
| **0ms** | HTML streams. Graph paper and grain paint from CSS with zero image requests. Tokens applied from a single `<style>` in `<head>`. Both fonts are `<link rel="preload">`ed, `display: swap`, self-hosted via `next/font/local`. |
| **~40–90ms** | **The H1 paints.** It is the LCP element, it is text, and it sits **outside every Suspense boundary** — an element inside a boundary cannot paint until the boundary swaps and its inline script runs. No JS is required for it. |
| **~90–180ms** | **The Proof Bench paints in its final state.** Both terminals rendered. Verdict stamped. Chip reading `PROVEN`. `→ blocks merge` in alarm red. The money shot is complete before a single byte of animation runtime has executed. |
| **~180–300ms** | The heartbeat dot begins its 1200ms tick — the only motion on the page. The GSAP chunk is still downloading. The page is already finished and readable. |

**Nothing in the stylesheet is `opacity: 0`.** Below-the-fold content renders at full opacity by default. The hiding class is added by JS only *after* JS confirms it loaded and can animate.

**The fallback handshake** (steal this verbatim; it is the cheapest insurance in the plan):

```html
<style>
  /* armed in <head>: reveal everything at 1600ms regardless of what happens */
  [data-reveal] { visibility: hidden; animation: prg-force-reveal 0s 1600ms forwards; }
  @keyframes prg-force-reveal { to { visibility: visible } }
  html.anim-ready [data-reveal] { animation: none; }
</style>
<noscript><style>[data-reveal]{visibility:visible!important}</style></noscript>
```

JS disarms the fallback by adding `anim-ready` to `<html>` **only after confirming `window.gsap && window.ScrollTrigger` actually loaded**. Bundle 404 on venue wifi → everything appears in its final state at t=1600ms. **Degraded, never invisible.** A judge who scrubs the scrollbar must never see a blank page.

**The hero replay does not start** until all three of: `document.fonts.ready` resolves, the animation runtime confirms, and `matchMedia('(prefers-reduced-motion: no-preference)')`. If any fail, frame 0 stands and nothing is lost.

`ScrollTrigger.refresh()` fires on `document.fonts.ready` and after any async mount. `invalidateOnRefresh: true` on any trigger whose `end` is computed.

---

## 3. NAV, SCROLL PROGRESS, CURSOR, KEYBOARD

### 3.1 Nav

**Height 56px, fixed, always visible.** It never shrinks and it never hides on scroll-down — a governance product's chrome does not play peekaboo.

**At scroll = 0:** fully transparent, no border, sitting directly on the graph paper. The wordmark and links float on the substrate.

**Past 80px:** gains `background: color-mix(in oklab, var(--ink-1) 88%, transparent)`, `backdrop-filter: blur(16px) saturate(1.2)`, and a 1px `--rule-1` bottom border — all over **120ms on `--ease-snap`**. This is one of exactly two `backdrop-filter` surfaces in the entire product.

**Layout, left to right:**

| Element | Spec |
|---|---|
| Wordmark | `PRGUARD` — Google Sans Code 560, 15px, +0.06em, `--text-primary`, preceded by an 8px L-registration tick in `--signal` |
| **Live section index** | 11px mono caps, `--text-dim`, sits immediately right of the wordmark behind a 1px `--rule-1` vertical divider. Reads `/ 01 — PROOF BENCH`, then `/ 02 — THE NEGATION`, and so on. Updates on section crossing with a **0ms** text swap — no fade. |
| Anchors | `PROOF` · `SEVERITY` · `GOVERNANCE` · `ACCURACY` — 11px mono caps, `--text-dim` → `--text-primary` on hover over 120ms |
| Ghost CTA | `DOCS` — 2px radius, 1px `--rule-2` border |
| Primary CTA | `RUN A REVIEW →` — solid `--signal`, `--ink-0` text, 2px radius, 11px mono caps |

The live section index is the scroll-progress treatment nobody else in this category has, and it costs one `IntersectionObserver`. It also tells a judge, continuously, that this page has a structure.

### 3.2 Scroll progress

A **2px `--signal-lo` rail** along the top edge of the header, growing from x=0.

```css
@supports (animation-timeline: scroll()) {
  .scroll-rail { transform-origin: left; animation: scale-x linear;
                 animation-timeline: scroll(root block); }
}
```

With a ScrollTrigger fallback beneath, because **scroll-driven CSS is Baseline "limited"** — Chrome/Edge 115, Safari 26, and **Firefox is absent from stable entirely** (still behind `layout.css.scroll-driven-animations.enabled`). A CSS-only mechanism leaves a Firefox judge looking at elements parked at their 0% keyframe, which usually means a blank page. Use it only as progressive enhancement, never as the mechanism.

### 3.3 Cursor

**The system cursor, unchanged.** No custom cursor, no magnetic buttons, no trail, no site audio.

Measured: 2 of 21 current Awwwards SOTD winners ship a custom cursor and **0 of 21** ship audio. On a governance tool a hijacked pointer directly costs Usability — 30% of that rubric — and it fights the text selection people need when reading terminal output.

**One exception, and it is load-bearing:** `cursor: text` inside every terminal pane, every diff, and the contenteditable `canonical_json` field. The evidence must be selectable, and that must be visibly true.

### 3.4 Keyboard

Printed in `--text-dim` micro mono directly under the hero CTAs so a judge can see it without being told:

```
press P to replay · D for a finding we refuted · Esc to stop
```

| Key | Action |
|---|---|
| `P` | Replay the hero proof sequence from frame 0. Deterministic, frame-identical every time. |
| `D` | Run the **disproven counter-demo** on the same bench with a different finding. |
| `Esc` | Kill any running sequence, seek to end state. |
| `▶` (visible control) | Play the 9-stage pipeline in live mode, independent of scroll. |

Bindings attach to `document`, are suppressed when focus is inside an input/contenteditable, and are announced once via a visually-hidden `role="status"` on first mount.

---

## 4. SECTION ORDER — THE ARGUMENT

The order is a single argument with one turn in it. Each section changes exactly one belief, and no section may be moved earlier without breaking the section after it.

| # | Section | Belief it changes | Height |
|---|---|---|---|
| **00** | Nav | — | 56px fixed |
| **01** | **HERO — THE PROOF BENCH** | "This thing executes code. That is a different category of claim." | 100vh ≈ 900 |
| **02** | THE NEGATION | "The problem is not that I need more findings." | 380 |
| **03** | **WE WERE WRONG** *(occupies the logo-wall slot)* | "This vendor will tell me when it is wrong. I can probably believe the rest." | 680 |
| **04** | M1 · PROOF BY EXECUTION | "Only one of four states can block me. That is a rule, not a vibe." | 560 |
| **05** | M2 · THE INSTRUMENT FACE | "The score is arithmetic I can recompute myself." | 820 |
| **06** | THE PIPELINE *(pinned)* | "There is a real architecture behind this, and it runs in parallel." | 900 + 2200 pinned |
| **07** | M3 + M4 · IDENTITY & FLIGHT RECORDER | "Rejections stick. The record cannot be quietly edited." | 880 |
| **08** | THE AGENT CAUGHT | "This catches the specific 2026 failure I am actually afraid of." | 700 |
| **09** | THE COMPARISON | "The category does not do any of this." | 640 |
| **10** | THE ACCURACY REPORT | "These numbers have denominators and error bars. Nobody else publishes this." | 780 |
| **11** | RUN ONE | "I can verify all of it in the next ninety seconds." | 560 |
| **12** | SCOPE, RETENTION, PRICE | "I know exactly what it touches and what it costs." | 520 |
| **13** | FAQ | "My remaining objection is answered." | 640 |
| **14** | THE CLOSE | "Proven, or it does not block." | 420 |
| **15** | FOOTER | — | 220 |

**Total: ≈ 9,200px visual + 2,200px pinned scroll.** That is longer than the ~5,000–7,000px category-confident range and I am flagging it rather than hiding it.

**Why this order and not another:**

- **03 sits where every competitor puts a logo wall.** We have no customers, and a thin or fabricated logo row is read as a student project instantly. More importantly: the disproven artifact is *stronger proof than logos would be*, and paying the trust tax before asking for any belief is what makes sections 04–07 land. This is the single most important ordering decision on the page.
- **06 (the pipeline) sits mid-page, after the two credibility sections.** An architecture diagram before anyone believes you is a diagram of a thing they do not care about. After 03, it reads as "how does something that honest actually work."
- **09 (comparison) cannot come before 04–07.** A comparison table of mechanics the reader has not yet met is a wall of unfamiliar nouns. After the mechanics, every row is a thing they now recognise.
- **10 (accuracy) follows 09 because 09 raises "prove it."** Section 03 teased one number; 10 pays all six with definitions, sample sizes, and Wilson intervals.
- **11 (run one) is immediately before the commercial sections** because it converts the belief accumulated over 10 sections into an action while it is hot.
- **12 and 13 are objection handlers**, and objection handlers go after the argument, never inside it.

**CUT ORDER UNDER PRESSURE, in this exact sequence:**
1. The pipeline **scroll scrub** (section 06 becomes a static diagram with stage hover + the ▶ live control — nothing is lost but polish)
2. Section **08** the agent-caught story (−700px)
3. Fold section **04**'s proof-state legend into section 03 (−560px)
4. Bespoke icon marks (fall back to Phosphor Bold)

**NEVER CUT:** the Proof Bench, the severity instrument, or the tamper control. Those three *are* PRGuard. Without them this is a nicely typeset dark site with nothing to say.

---

## 5. TWO DELIBERATE SUBSTITUTIONS, STATED EXPLICITLY

The brief's minimum section list asks for a **social proof / trust strip** and a **pricing** section. Both are shipped, but not in the form the category ships them, and the reasons are load-bearing:

**Social proof → the Calibration Strip + section 03.** A logo wall, testimonial cards, ARR counters or investor logos are all unavailable (no customers) and all read as fabricated if faked. The slot is occupied instead by three live `/v1/accuracy` numbers *with their denominators* in the hero, and by a finding the system publicly refuted in section 03. A tamper-evident chain a judge can break is a credibility artifact that does not require customers — and no competitor has one, including the ones who ship an "Audit trail" card with no mechanism behind it.

**Pricing page → a pricing *position*, in section 12.** The category is uniformly $12–$99 per seat per month with a "Custom" last column and a −20% annual toggle. Copying that structure silently concedes that PRGuard is the same kind of product. And the claim that usage pricing is unoccupied is **false** — three of the largest players already bill on consumption. So: no tier grid, no toggle, no "Custom." One paragraph stating the axis and the beta terms. GitHub Copilot's code review page shows no pricing at all; this shows the argument without the table.

---

# 6. THE SECTIONS

---

## 01 · HERO — THE PROOF BENCH

> **★ THIS IS THE SIGNATURE MOMENT.** Engineering detail in §7.

**Job:** move the visitor from "another AI code reviewer" to "this executes code at two SHAs and shows me the output" inside three seconds — without requiring them to scroll, click, or wait for an animation.

### Copy

**Eyebrow** (11px mono caps, +0.12em, `--signal`):
```
PROOF BY EXECUTION · BASE SHA / HEAD SHA
```

**H1** (Google Sans Code 520, 62px/1.02/−0.032em, `--text-primary`, two lines, no gradient, no two-tone):
```
We don't guess.
We run the test.
```

**Subhead** (Inter 18px/1.55, `--text-body`, max 58ch):
> PRGuard writes a repro test, executes it in a sandboxed container at your pull request's base SHA and at its head SHA, and attaches the real terminal output. Only proven findings can block a merge.

**CTAs** (2px radius, 11px mono caps):
- Primary: `RUN A REVIEW →` — solid `--signal`, `--ink-0` text
- Secondary: `READ THE ACCURACY REPORT` — ghost, 1px `--rule-2` border

**Keyboard hint** (11px mono, `--text-dim`, directly under the CTAs):
```
press P to replay · D for a finding we refuted
```

**Calibration strip** — hairline-ruled top and bottom, mono tabular, `--text-dim`, this is the trust strip:
```
execution-verified precision  0.91 (n=312)   ·   self-caught false positives  0.14 (n=537)   ·   human dismissal  0.07 (n=284)
```

**No count-up animation on these numbers. The refusal to animate them is the point.**

### Right column — the bench

One rim-lit panel, 4px radius, 1px `--rule-2`, `inset 0 1px 0 oklch(1 0 0 / 0.06)`, four corner registration marks. Bleeds off the right edge of the viewport and is masked `mask-image: linear-gradient(to bottom, #000 0% 78%, transparent 100%)` so it reads as "there is more product than fits here." Nobody elite shows a full uncropped screenshot in a hero.

**1 · INDEX STRIP** (32px, `--ink-2`, 1px `--rule-1` bottom)
```
/ 01 — PROOF BENCH · finding a91f3c2e          ● python:3.12-slim · seed 4a91    [ proof_status: PROVEN ]
```
Heartbeat dot is 6px `--signal`. The chip is solid `--signal` fill, `--ink-0` text, 2px radius, filled-vial glyph.

**2 · TERMINAL PANE A** (210px, `--ink-1`, 2px `--signal-lo` left rail, 40px dimmed line-number gutter, 13px/22px mono, horizontal scroll — **never wrap**, wrapping destroys traceback alignment):
```
$ git checkout a91f3c2 && pytest -q tests/test_repro_7e3f1a.py
.                                                        [100%]
1 passed in 0.42s
```
`passed` renders in `--signal`.

**3 · SEAM** — 1px `--rule-1` divider carrying a centred mono label:
```
— HEAD 9c2d4b1 —
```

**4 · TERMINAL PANE B** (210px, 2px `--alarm` left rail, `--alarm-tint` background):
```
$ git checkout 9c2d4b1 && pytest -q tests/test_repro_7e3f1a.py
F                                                        [100%]
=================================== FAILURES ===================================
_____________________ test_charge_uses_account_currency ______________________
    def test_charge_uses_account_currency():
        acct = resolve_account("acct_7f31")
>       assert charge(acct, 1200).currency == "usd"
E       AttributeError: 'NoneType' object has no attribute 'currency'
tests/test_repro_7e3f1a.py:41: AttributeError
1 failed in 0.39s
```
The `E` line renders in `--alarm-hi`. `failed` renders in `--alarm-hi`.

**5 · VERDICT RAIL** (44px, `--ink-2`, 11px mono caps):
```
PASSES AT BASE · FAILS AT HEAD · PROVEN                              → blocks merge
```
`→ blocks merge` in `--alarm`.

**6 · PROVENANCE STRIP** (32px, 11px mono, `--text-dim`):
```
GET /v1/reviews/4e8b1d0/result → findings[0].proof     ·     captured 2026-09-19T14:22:07Z
```

### Animation

**Frame 0, first paint, zero JS, server-rendered:** the bench is **already in its final state**. Both terminals complete. Verdict stamped. Chip reading PROVEN. Nothing in the stylesheet is `opacity: 0`.

Then, once, after `document.fonts.ready` — and **only** under `prefers-reduced-motion: no-preference` — a **6,400ms sequence**, replayable on `P`:

| t (ms) | Element | Property | Duration | Easing |
|---|---|---|---|---|
| 0 → 1400 | **The scan line** — a 2px `--signal-hi` bar at 60% opacity with a 24px falloff gradient below it | `translateY` panel-top → panel-bottom | 1400 | **`--ease-mass`** *(the only use of this curve in the project)* |
| — | As it crosses each pane, three stepped row-groups per pane | `opacity` 0.35 → 1 at 0/120/240ms offsets | 240 | `--ease-instrument` |
| 400 | Pane A left rail | `scaleY` 0→1, `transform-origin: top` | 420 | `--ease-instrument` |
| 1400 | Pane B left rail (`--alarm`) | `scaleY` 0→1 | 420 | `--ease-instrument` |
| 1900 | The `1 failed` line | 1px `--alarm` underline, `scaleX` 0→1 | 240 | `--ease-instrument` |
| **2200** | **THE STAMP** — proof chip | `background-color` `--ink-8`/`--rule-2` → solid `--signal` at **0ms, no transition** + `scale(1.045) → 1` | 0 / 180 | — / `--ease-snap` |
| 2400 | `→ blocks merge` | `opacity` 0→1 | 160 | `--ease-instrument` |
| **2400 → 6400** | **THE HOLD.** Four full seconds. Absolutely nothing moves except the heartbeat dot. | — | 4000 | — |
| 6400 | idle. Heartbeat continues at 1200ms. | — | — | — |

**The hold is not dead time. It is where a judge reads.** Without it the sequence is a demo of animation; with it, it is a machine returning a result and then sitting still, which is the whole brand.

**`D` — the disproven counter-demo.** The identical bench sequence, on a different finding, whose head-SHA run *passes*:

- Pane B renders `.  [100%]` / `1 passed in 0.61s` with `passed` in `--signal`
- The claim text above the bench gets a strike-through drawn left-to-right over 240ms
- The chip stamps `proof_status: DISPROVEN` in **cyan OUTLINE** (not fill), with the caption `refuted by execution`
- Verdict rail reads: `gate stays clear · 0 proven · 1 self-refuted`
- Provenance strip swaps to `GET /v1/findings/c04d18a2 → proof`

Ten seconds of the system publicly losing an argument with itself, on stage, on demand. No competitor can perform this. It also pays off the palette's best decision — proven and disproven sharing the cyan hue *because both are execution results* — by making the reason legible in motion rather than needing a legend. **(Still ship the legend, in section 04.)**

**Reduced motion:** the scan never runs, the pulse stops. Nothing is lost, because the designed state and the end state are the same frame. `P` and `D` still work — they *seek* the timeline to its end state instead of playing it, so the counter-demo remains demoable.

### Components / libraries

`<ProofBench density="hero">` — the same React component that renders `/findings/:id`'s proof pane at `density="compact"`. **This is the highest-leverage decision in the build:** the marketing screenshot and the product screenshot are literally the same object, which is what makes the site read as a product rather than as two disconnected artifacts.

- ANSI → tokens via **`anser` 2.3.5** (0.04MB, zero deps), `ansiToJson(text, { use_classes: true })` into our own virtualized `<pre>`. **Never `xterm.js`** — 5.65MB, owns its own scrollback and sizing, fights SSR, virtualization, selection and theming. A PNG of a terminal is exactly what a product that cannot actually do this would ship.
- Control sequences (`\r` rewrites, `\x1b[2K`, cursor movement) normalised **server-side at capture**, so progress bars collapse to their final frame.
- Timeline: **GSAP 3.15.0**, built `paused: true` inside `gsap.matchMedia()`.
- `<ProvenanceLine>`, `<SectionIndex>`, `<ProofChip>`, `<Surface>`.

### Mobile (375px)

Bench moves below the headline, full width. Panes drop to 160px at 12px/20px with horizontal scroll inside each. H1 clamps to 36px, three lines. The calibration strip stacks to three rows. Scan runs **once** on first view via `IntersectionObserver`, then never again. `P`/`D` hints are hidden; instead a visible `↻ replay` / `↻ show a refuted one` pair of ghost buttons sits under the bench.

---

## 02 · THE NEGATION

**Job:** reframe the problem so that "more findings" stops sounding like a benefit. This section exists to be read in 1.5 seconds and scrolled past.

### Copy

Full-bleed, centred, on bare graph paper between two tick-marked hairline rules.

**Line 1** (Google Sans Code 520, 40px/1.08/−0.028em, `--text-primary`):
```
The bottleneck is not a shortage of opinions.
```
**Line 2** (same size, `--text-dim`):
```
It is a shortage of evidence.
```

**Bridge line** (11px mono caps, +0.12em, `--text-dim`, 32px below):
```
PRGUARD PROVES IT · RANKS IT BY BLAST RADIUS · NEVER REPEATS ITSELF · KEEPS YOU IN CHARGE ON THE RECORD
```

### Composition

380px tall. Nothing else on screen. No panel, no border, no registration marks — this is bare substrate, which is why the section reads as air rather than as content. The two hairline rules carry a single tick mark each at 25% and 75% of their width.

Character check: line 1 is 44 chars × 24px = 1,056px; line 2 is 28 chars × 24px = 672px. Both fit the 1,312px content width with margin.

### Animation

**Trigger:** first viewport entry, `start: 'top 84%'`, `once: true`.
- The two hairline rules draw in: `scaleX` 0 → 1, `transform-origin: center`, **420ms**, `--ease-instrument`, the top rule leading the bottom by 60ms.
- The text does not animate. It is already there.

**Reduced motion:** rules render at full width. No change.

### Components

Pure CSS + one `ScrollTrigger.batch`. No component needed beyond `<SectionRule>`.

### Mobile

Line 1 breaks to two lines at 22px. Bridge line wraps to three lines and drops the middle dots for line breaks. Rules stay.

---

## 03 · WE WERE WRONG

**Job:** the trust turn. Pay the credibility tax before asking for any belief. This occupies the slot where every competitor puts a customer logo wall.

### Copy

**Section index** (11px mono caps, `--text-dim`):
```
/ 03 — SELF-REFUTATION
```

**H2** (Google Sans Code 520, 40px/1.08/−0.028em):
```
We were wrong about this one.
```

**Body** (Inter 15px/1.60, `--text-body`, max 62ch):
> PRGuard claimed a race condition in the session-refresh path — reachable, untested, on an auth boundary. It wrote a repro test. The sandbox ran it at the head SHA.
>
> It passed. The finding was marked `disproven` and never reached the pull request.

**The struck claim** (13px mono, `--text-dim`, with a strike-through drawn on entry):
```
~~session.refresh() can be entered concurrently; the token swap is not atomic~~
```

**Caption under the strike** (11px mono, `--signal`):
```
refuted by execution · 1.9s after the claim was written
```

**The pre-empt** (Inter 15px, `--text-body`, in a hairline-ruled box):
> That number is not our error rate. It is the rate at which the system catches itself **before** the claim reaches your pull request. The alternative is a tool with the same rate that does not tell you.

**The teased metric**:
```
self_caught_false_positive_rate      0.14      95% CI 0.11–0.17      n = 537
the share of findings the system refuted by execution before publishing them
```

**Forward link** (11px mono, `--signal`, underlined on hover):
```
ALL SIX METRICS, WITH DEFINITIONS, SAMPLE SIZES AND CAVEATS →
```

### Composition

Two columns at 1440: left 6 cols (the copy and the metric), right 6 cols (a compact `<ProofBench density="compact">` showing the **passing** head-SHA run, in an evidence frame with registration marks and a provenance line reading `GET /v1/findings/c04d18a2/result → proof`).

The bench here is the *counter-example* to the hero's bench — same component, opposite outcome. A judge who scrolls from 01 to 03 sees the same object argue both ways, which is the fastest possible demonstration that it is real.

680px tall.

### Animation

**Trigger:** viewport entry, `start: 'top 84%'`, `once: true`.

| Element | Property | Duration | Easing | Delay |
|---|---|---|---|---|
| Strike-through rule on the claim | `scaleX` 0→1, origin left | 240 | `--ease-instrument` | 0 |
| DISPROVEN chip | `opacity` 0→1 + `scale(1.045)→1`, colour at **0ms** | 180 | `--ease-snap` | 240 |
| Metric row | `opacity` 0→1 | 240 | `--ease-instrument` | 360 |
| Wilson interval error bar | `scaleX` 0→1 from the point estimate **outward in both directions** | 420 | `--ease-instrument` | 420 |

**The number does not count up.** A metric that spins while a judge reads it is decoration on the one surface that must read as rigorous.

**Reduced motion:** strike-through renders drawn, chip renders stamped, error bar renders at full width. Opacity-only 120ms entrance, zero translate.

### Components

`<ProofBench density="compact">` · `<ProofChip state="disproven">` · `<MetricReadout>` (value, definition, n, Wilson interval — used again in section 10) · `<Surface variant="evidence">`

### Mobile

Single column. Bench below the copy at full width, panes 160px. The pre-empt box becomes full-width. The metric readout stacks to four rows: value / definition / interval / n.

---

## 04 · M1 · PROOF BY EXECUTION

**Job:** convert the hero's demonstration into a *rule*. The visitor must leave knowing that three of the four states cannot block them.

### Copy

**Section index:** `/ 04 — PROOF BY EXECUTION`

**H2:**
```
Four states. One of them blocks.
```

**Subhead** (Inter 18px, `--text-body`):
> Every finding carries a `proof_status`. It is set by a container, not by a model.

**The four chips**, each with a mandatory glyph — **colour alone never carries state**:

| Chip | Visual | Copy |
|---|---|---|
| `PROVEN` | Solid `--signal` fill, `--ink-0` text, filled-vial glyph | **The test passes at the base SHA and fails at the head SHA.** This is the only state that can turn the merge gate red. |
| `DISPROVEN` | `--signal` OUTLINE only, `--signal` text, strikethrough glyph | **The test passes at the head SHA.** The claim was wrong. PRGuard records the refutation and does not publish the finding. |
| `INCONCLUSIVE` | `--marker` dashed 1px border, `--marker` text, half-filled-vial glyph | **The sandbox could not settle it** — no runner for the language, a flaky test, or a timeout. Advisory. Cannot block. |
| `NOT_ATTEMPTED` | `--ink-8` text at 60% opacity, no border, empty-vial glyph | **No repro was generated.** Below the risk-tier threshold, or the change surface is not executable. Advisory. Cannot block. |

**The rule**, set as a mono pull-quote in a hairline-ruled box, 18px:
```
Only proven findings can block a merge.
Everything else is a comment.
```

**Provenance line:**
```
GET /v1/findings?proof_status=proven&blocking=true
```

### Composition

560px. Four chips in a single row at 1440 (2×2 at 1024, stacked at 375), each in its own hairline-ruled cell with the copy beneath. The rule box spans full width below them. No bench here — the hero already spent that budget.

### Animation

**Trigger:** viewport entry, `once: true`.
- Chips enter **opacity-only**, 240ms, `--ease-instrument`, **60ms stagger**, zero translate.
- The rule box's top and bottom rules draw `scaleX` 0→1 over 420ms after the last chip lands.

**Reduced motion:** everything renders in place. 120ms opacity, no stagger.

### Components

`<ProofChip>` × 4 (the same component used in the hero, the dashboard findings table, and the finding detail header) · `<Surface>`

### Mobile

Chips stack vertically at full width, glyph left, label and copy right. The rule box stays.

---

## 05 · M2 · THE INSTRUMENT FACE

**Job:** kill the suspicion that severity is an LLM adjective. The visitor must be able to check the arithmetic by eye.

### Copy

**Section index:** `/ 05 — COMPUTED SEVERITY`

**H2:**
```
Severity is arithmetic.
```

**Subhead** (Inter 18px):
> Six inputs, each normalised to 0..1. Six fixed weights. The band thresholds are printed on the same axis as the score. No model decides how bad it is.

**The generated sentence**, as a 15px mono pull-quote, `--text-primary`:
```
reachable from an unauthenticated route × 7 callers × untested × payments path × proven
```

**The readout** (Google Sans Code 500, 48px, tabular, `--text-primary`, with the band in 11px mono caps beside it):
```
0.810   CRITICAL
```

**The table** (six rows, all tabular to three decimals, 13px mono):

| input | raw | weight | contribution |
|---|---|---|---|
| `path_sensitivity` | 1.000 | 0.25 | **0.250** |
| `reachability` | 0.900 | 0.20 | **0.180** |
| `coverage_gap` | 1.000 | 0.15 | **0.150** |
| `blast_radius` | 0.700 | 0.15 | **0.105** |
| `proof_confidence` | 0.567 | 0.15 | **0.085** |
| `churn` | 0.400 | 0.10 | **0.040** |
| | | | **0.810** |

**Band legend** (11px mono, `--text-dim`):
```
info < 0.15   ·   low ≥ 0.15   ·   medium ≥ 0.35   ·   high ≥ 0.55   ·   critical ≥ 0.75
```

**Provenance line:**
```
GET /v1/findings/a91f3c2e → severity.inputs · severity.weights · severity.explanation
```

### Composition — the contribution bar

**Not a radar chart.** A radar encodes by area, so it systematically misrepresents the one number the product's credibility rests on, and it is the single most over-used "AI scoring" visual in the category. It is also illegible at 320px.

Instead: **a horizontal weighted contribution bar whose total length IS the score.** Six segments sized `value × weight`, ordered by contribution descending, on the monotone chroma ramp (brightest = largest lever). `proof_confidence` reuses its ramp step plus a 2px 45° hatch, because it is the only input about the system's own certainty rather than about the code.

**Hard tick marks at .15 / .35 / .55 / .75** drawn on the same axis, with mono labels beneath. The bar crosses the `.75` tick and stops — you can *see* why it landed in critical rather than high, with no legend.

Minimum segment width 3px, so `churn` at 0.040 never becomes sub-pixel. Hovering a segment brightens it one chroma step and underlines the corresponding clause in the sentence above (120ms both ways).

Layout: bar spans 8 cols, readout sits right at 4 cols, table below full width, sentence above the bar.

820px.

### Animation

**Trigger:** viewport entry, `once: true`.

| Element | Property | Duration | Easing | Stagger |
|---|---|---|---|---|
| Six segments | `transform: scaleX(0→1)`, origin left, sequentially left-to-right | 520 each | `--ease-instrument` | 60ms |
| Four threshold ticks | `opacity` 0→1 | 240 | `--ease-instrument` | last, after the bar |
| **The readout** | **SNAPS to `0.810` — no count-up** — the instant the bar crosses the final tick | 0 | — | — |
| Band label `CRITICAL` | colour flip at **0ms** + `scale(1.045)→1` | 0 / 180 | — / `--ease-snap` | — |
| Table rows | `opacity` 0→1 | 240 | `--ease-instrument` | 60ms |

**Reduced motion:** bar renders at full width with all segments in place, readout at 0.810, ticks visible, table static.

### Components

`<ContributionBar density="hero">` — the same component renders at 320px in the dashboard finding card, and a 20px six-segment **sparkline** version serves as the list-row glyph for at-a-glance comparison across hundreds of findings. Three surfaces, one component.

### Mobile

Bar is full width at 320px minimum — it survives because it is one dimension. Readout moves above the bar at 36px. Table collapses to six stacked blocks (`input` / `raw × weight = contribution` on two lines each). Tick labels drop to `.15 .35 .55 .75` without the word "threshold." Sentence wraps to three lines.

---

## 06 · THE PIPELINE — NINE STAGES

**Job:** prove there is a real architecture, that S3 genuinely runs four specialists in parallel, and that delivery degrades gracefully instead of silently dropping findings.

**This is the only pinned section on the entire site.** Nothing else scroll-jacks.

### Copy

**Section index:** `/ 06 — NINE STAGES`

**H2:**
```
Nine stages. One comment.
```

**Subhead:**
> Driven by a real recorded run — its actual jitter, its actual degradation event. Wall clock at S3 is `max(lane)`, not `sum`.

**Stage labels** (11px mono caps, on each station):
```
S1 INGEST · S2 CONTEXT · S3 SPECIALISTS · S4 COORDINATOR · S5 SEVERITY
S6 IDENTITY · S7 PROOF · S8 DELIVERY · S9 FINALISE
```

**S3 fork labels:** `bugs 4.1s` · `security 5.8s` · `tests 3.2s` · `quality 4.4s`
**S3 caption:** `wall clock 5.8s = max(lane), not 17.5s = sum(lanes)`

**Live rail** (right-hand, 11px mono):
```
Stage 3/9 — specialists          ● 2s since last output
```

**S8 delivery ladder** (four rungs, the one that fired is solid, the ones above it are ghosted with a reason):
```
inline_exact        ✓ 6 findings
inline_nearest      ✓ 1 finding      line drifted 12 lines since the diff was captured
file_level          —
summary_only        —
                    0 silently dropped
```

**Gate ladder** (three rungs):
```
check_run           ✓ fired
commit_status       —
dry_run             —
```

**Visible control:** `▶ PLAY` (11px mono caps, ghost, top-right of the diagram)

**Provenance line:**
```
GET /v1/reviews/4e8b1d0 → stage_index · stage_total · stage_label · heartbeat
```

### Composition

**Hand-authored inline SVG, <10KB.** Not React Flow (pan, zoom, drag and a required stylesheet you then spend an afternoon disabling, plus an attribution badge or $169/mo — Cloudflare, with unlimited budget, hand-writes its lines). Not Rive (~896KB gzipped measured, and the free tier cannot export a `.riv` at all). Not Lottie (~485KB gz of WASM plus an After Effects dependency). Not Magic UI's AnimatedBeam — its gradient pins `y1`/`y2` to `"0%"` under `userSpaceOnUse`, so the light wipes horizontally across the bounding box rather than travelling the path, which is structurally wrong for any vertical or forked route.

**Three breakpoint geometries generated from one TS constants file** with an `elbow(from, to)` helper. Desktop `viewBox="0 0 1200 760"` (horizontal rail, S3 forking downward into four lanes that reconverge at S4). Tablet `780 × 1100`. Mobile `390 × 1560` (vertical spine, S3's four specialists as an indented group). **Do not attempt to make one bezier survive 1440 → 375.** Every reference that solved this authored separate geometry.

**`pathLength="1"` on every edge**, `vector-effect="non-scaling-stroke"` on every stroke. One keyframe then drives `stroke-dashoffset` identically on an 80px fork and a 2,400px spine. Travelling packets are a duplicate overlay path at `stroke-dasharray="0.06 0.94"`.

Behind the SVG, a real `<ol>` of the nine stage names — free SEO and free screen-reader support that no competitor's animated diagram provides. The SVG itself is `aria-hidden="true"`.

**Stage states** — colour + dash, never colour alone:
- pending: `--ink-6` hairline, hollow station
- running: `--signal` ring, `--signal` packet travelling the inbound connector
- done: `--signal-lo` filled station, solid connector
- degraded: `--marker` dashed connector + a caution glyph

S7 **breaks the visual grammar**: the station expands into a compact `<ProofBench>`. That break is what makes stage seven read as the climax rather than as one of nine.

S9 desaturates everything else to 30% over 300ms while the gate pill flips red at **0ms** and expands 220ms.

### Animation

```js
ScrollTrigger.create({
  trigger: '#pipeline', start: 'top top', end: '+=220%',
  pin: true, scrub: 0.5,
  snap: { snapTo: [0,.111,.222,.333,.444,.556,.667,.778,.889,1],
          duration: 0.22, delay: 0.04, ease: 'power1.inOut', directional: true },
  invalidateOnRefresh: true, anticipatePin: 1
})
```

**The timeline's total length is exactly 1.0, with each stage occupying 0.1111** — so scroll progress and stage progress are the same number. That is precisely what lets the identical component be driven in the dashboard by `(stage_index - 1 + stagePhase) / stage_total`.

`scrub: 0.5` is a *number*, not `true` — the half-second catch-up lag is the entire reason it reads expensive.

The four S3 lanes draw **simultaneously** with completion staggered 0/60/120/180ms. The stagger exists only to break mechanical simultaneity, never to imply sequence.

`linear` for every scrubbed value.

**`▶ PLAY` (live mode)** runs the same timeline on a 9-second clock independent of scroll, paused-timeline-first. **Build the live driver before wiring the scrub** — the dashboard needs it regardless, so the scrub is the only part that can slip.

**Unpinned below 1024px.** Pin fights iOS Safari's collapsing toolbar and produces the jump-and-stick artefact that instantly reads as broken. Below 1024 it becomes nine per-stage reveals at `start: 'top 78%'`.

**Reduced motion:** all nine stages render **complete**, with the S3 fan-out drawn, in normal document flow, unpinned. The `▶ PLAY` control remains and advances the timeline stage-by-stage with zero tweening on each press.

### Components

`<StageRail mode="scrub" | "live" | "static">` — **ships twice.** `mode="live"` driven by `stage_index`/`stage_total`/`heartbeat` is the dashboard's `/runs/:id` hero screen. Built once.

GSAP + ScrollTrigger. No React Flow, no xyflow, no canvas, no WebGL.

### Mobile (375px)

Unpinned vertical spine. Nine stations descending. S3's four specialists render as a 2×2 indented group fed by four short 40px fork curves — the parallel reading survives. Per-lane latency chips collapse to a single `max 5.8s` aggregate. S7's bench collapses to two stacked rows with the head row's `--alarm` left rail as the only chroma. The delivery ladder stays (it is four rows of text). `▶ PLAY` remains.

---

## 07 · M3 + M4 · IDENTITY & THE FLIGHT RECORDER

**Job:** two beliefs. (a) A rejection sticks — the same finding does not come back after a rename. (b) The record is tamper-evident, and the visitor can prove that themselves with their own keyboard.

### Copy

**Section index:** `/ 07 — IDENTITY & THE RECORD`

**H2:**
```
Say no once.
```

### LEFT PANEL — the fingerprint

**Subhead:** > Identity is `sha256(category | rule_key | symbol_path | shape_hash)`. It survives line drift, variable renames and rewording, because none of those are inputs.

**Three commits, cross-fading** in an evidence frame, with the fingerprint **pinned and static** beneath them:

```
7c41a09   def refresh(self, tok):          line 214
9c2d4b1   def refresh(self, token):        line 254        ← renamed, moved 40 lines
4e8b1d0   def refresh(self, access_token): line 251        ← renamed again
```
```
fingerprint   a91f3c2e5d14b90f…8b4d      unchanged across all three
```

**The stillness of the hash against the moving code is the entire argument.**

**Suppression ledger rows beneath:**
```
seq 1204   suppressed   scope: pattern   "known-safe internal caller"   expires 2026-12-01   vansh.m
seq 1319   REVOKED      strikethrough, still present, cannot be removed
```

**Caption:** > A revocation is itself an event. Nothing is ever deleted.

**Provenance:** `GET /v1/suppressions`

### RIGHT PANEL — the flight recorder

**Subhead:** > `event_hash = sha256(prev_hash + canonical_json)`. Six real events, a continuous 2px rail, and a field you can edit.

Six audit rows down a 2px `--signal-lo` vertical rail. Each row: `seq` · `event_type` (mono caps) · actor glyph (human / agent / system) · 8-char hash prefix (click-to-copy) · tabular UTC timestamp.

**Header strip:**
```
chain.verified = true · 6 events · broken_at_seq = null
```

**THE TAMPER CONTROL — by typing, not by button.**

Every row's `canonical_json` field is a single-line **contenteditable** mono input. A ~30-line Web Crypto module recomputes `sha256(prev_hash + canonical_json)` across the whole chain on every keystroke, **debounced 120ms**, using `crypto.subtle.digest('SHA-256', …)`. Zero dependencies.

Change one character — `"severity": 0.810` to `0.800` — and in the same frame:

- Header flips to `chain.verified = false · broken_at_seq = 1428` with a **0ms** colour snap to `--alarm`
- The rail below that row switches from 2px solid `--signal-lo` to 2px dashed `--alarm` **with a literal 6px physical gap where it breaks**
- Every row below drops to 45% opacity over 280ms
- The edited row expands to show two mono lines with the **first differing nibble highlighted**:
  ```
  expected   a91f3c2e4d81b0c7…
  computed   4d81b0c7a91f3c2e…
             ^
  ```
- A `↻ restore` ghost button appears

> A judge changing a value with their own keyboard and watching the rail physically break converts an abstract cryptographic claim into something they personally verified. This is the moment that wins the Q&A, and it is the reason to design the broken state *before* the verified state.

**Provenance:** `GET /v1/audit → chain.verified · broken_at_seq`

### Composition

880px. Two columns at 1440, 6 + 6. Both panels are evidence frames with registration marks and provenance strips. `cursor: text` inside the contenteditable field.

### Animation

**Trigger:** viewport entry, `once: true`.

| Element | Property | Duration | Easing |
|---|---|---|---|
| Chain rail | `stroke-dashoffset` 1→0, `pathLength="1"` | 420 | `--ease-instrument` |
| Six audit rows | `opacity` 0→1 | 240 | `--ease-instrument`, 80ms stagger |
| Three commit panes | cross-fade on a 3.2s loop, `opacity` + `transform` only | 420 each | `--ease-instrument` |
| Fingerprint string | **never moves, never fades, never animates** | — | — |

**On tamper (user-triggered, always available regardless of reduced motion):**
- Header colour: **0ms**
- Rail gap: layout change, rendered instantly
- Downstream rows to 45%: `opacity`, 280ms, `--ease-instrument`
- Hash diff expand: `clip-path` inset, 240ms

**Reduced motion:** commit panes stop cross-fading and render the middle commit statically with the other two as a static stack. Rail renders drawn. **The tamper control still works in full** — it is an interaction, not an animation, and disabling it would remove the best moment on the page from the people who most need the page to work.

### Components

`<ChainRail>` — ships to the dashboard `/audit` route with the tamper control **removed**, virtualization added past 200 rows, and a `download raw history (JSON)` button. Evidence that cannot leave the product is set dressing.

`<PRGuardDiff>` (wrapping `@git-diff-view/react` 0.1.7 + `@git-diff-view/shiki`) for the three commit panes. Wrapped in one component so a swap to `react-diff-view` 3.3.3 touches one file — this is the riskiest dependency in the build.

Web Crypto `subtle.digest`. No dependency.

### ⚠ The one thing that can make this backfire

If the browser's canonical-JSON serialisation diverges from the backend's by one byte of key order, whitespace, or unicode escaping, **the page loads showing `chain.verified = false`** — the most self-refuting failure available to this product.

> **Backend owns a canonicalisation spec file, written on day zero. Frontend consumes it. Both sides test against identical fixtures in CI. A failing fixture is a build-breaking error.**

### Mobile

Panels stack. The commit cross-fade drops to two commits. The chain rail keeps its full six rows — vertical is its natural axis. The contenteditable field gets `inputmode="text"` and a 44px touch target; the break still renders. Hash diff expands to two stacked lines.

---

## 08 · THE AGENT CAUGHT

**Job:** make the abstract governance rail concrete against the specific 2026 fear. Framed as an **event**, not a feature. *(First cut after the pipeline scrub.)*

### Copy

**Section index:** `/ 08 — AN EVENT, NOT A FEATURE`

**H2:**
```
An agent deleted a test to make CI pass.
```

**Body:**
> On 2026-09-14 a coding agent opened PR #4821 against `api-gateway`. Four files changed, three of them fixes. The fourth deleted `tests/test_payment_idempotency.py` entirely — 84 lines, no replacement, no note in the description. CI went green.

**Rendered as a diff, not a diagram** — the diagram budget was spent in section 06. The deleted file renders in `--alarm-tint` by default, with the finding card hung inline at the offending line via `renderExtendLine` + `extendData`.

**The inline finding card:**
```
CRITICAL  0.94    test file deleted with no replacement
severity  coverage_gap 1.00 × 0.15 · path_sensitivity 1.00 × 0.25 · reachability 1.00 × 0.20 …
proof     not_attempted — deletion is structurally proven, no repro needed
gate      check_run: FAILURE — 1 proven finding
```

**The governance stamp**, in a hairline box:
> PRGuard posted one review. Event: `COMMENT`. It has never posted `APPROVE` and the code path to do so does not exist.

**The actual test**, rendered in Shiki, 13px mono:
```python
def test_review_event_is_never_approve():
    """Guards M4. The AI is not a reviewer of record."""
    for call in captured_github_calls:
        assert call.event == "COMMENT", f"posted {call.event}"
```

**The resulting audit event:**
```
seq 1428   gate.blocked   agent:claude-code   a91f3c2e…8b4d   2026-09-14T09:41:22Z
seq 1429   review.posted  system              4d81b0c7…f209   2026-09-14T09:41:23Z   event=COMMENT
```

**Provenance:** `GET /v1/reviews/4e8b1d0/result → review_payload.event`

### Composition

700px. Full-bleed diff pane on the left 7 cols, the governance stamp + test + audit rows stacked on the right 5 cols. The diff is the visual — no second graphic.

### Animation

**Trigger:** viewport entry, `once: true`.
- The deleted-file red tint fills left-to-right: `transform: scaleX(0→1)` on a tint layer, **420ms**, `--ease-instrument`
- The finding card slides up 12px and fades in: `translateY(12px→0)` + `opacity`, **420ms**, `--ease-instrument`, **delay 420ms**
- The gate pill flips to `--alarm` at **0ms** then expands `width` — **no**, expands via `transform: scaleX`, **220ms**, `--ease-snap`
- The two audit rows write in, 240ms opacity, 80ms stagger

**Reduced motion:** tint, card, pill and rows all render in place. 120ms opacity only.

### Components

`<PRGuardDiff>` · `<ContributionBar density="compact">` · Shiki 4.4.3 with `transformerNotationDiff` · `<ChainRail rows={2}>`

### Mobile

Diff switches to unified mode (the `<PRGuardDiff>` wrapper takes `mode="unified"` below 900px). The finding card renders below the offending line at full width rather than inline. The test snippet gets horizontal scroll.

---

## 09 · THE COMPARISON

**Job:** convert accumulated belief into category separation. Every row is a mechanic the visitor has now seen.

### Copy

**Section index:** `/ 09 — WHAT THE CATEGORY SHIPS`

**H2:**
```
Eight questions. Ask any reviewer.
```

**Subhead:**
> We are not naming anyone. Open their pages and check the rows yourself — that is the point of a checkable list.

| | PRGuard | Typical AI reviewer |
|---|---|---|
| Executes the claimed bug at the base SHA and the head SHA | **yes** — `proof_status` | no |
| Publishes findings it refuted itself | **yes** — `disproven_rate 0.14 (n=537)` | no |
| Publishes a false-positive rate with a denominator | **yes** — six metrics, six `n`s, six intervals | no |
| Severity is a deterministic score you can recompute | **yes** — six inputs, six printed weights | an adjective |
| Finding identity survives a variable rename and line drift | **yes** — `sha256(category\|rule_key\|symbol_path\|shape_hash)` | line-anchored |
| Dismissals are recorded with a required reason and a scope | **yes** — append-only ledger, revoke never delete | a hidden comment |
| Audit trail is hash-chained and verifiable on read | **yes** — `chain.verified`, `broken_at_seq` | a timestamp column |
| The bot can approve your pull request | **no** — `event: COMMENT`, guarded by a test | usually yes |

**Footnote** (11px mono, `--text-dim`):
```
Last row is the only one where "no" is the better answer. That is deliberate.
```

### Composition

640px. Full-width table. Column 1 is 46%, columns 2 and 3 are 27% each. **Hairline separators at `--rule-hair`, never zebra striping** — at 40px rows on near-black, alternating fills produce visible banding and read as a 2010s admin template.

PRGuard column cells: `yes` in `--signal`, the mechanism in 11px mono `--text-dim` beneath. "Typical" column cells: `--ink-8`. The final row inverts — PRGuard's `no` is the emphasised cell.

No competitor names, no logos. Three reasons: several competitive claims in the research corpus did not survive fact-checking and would be falsifiable on stage; two named competitors have since left the category entirely; and a checkable list is more confident than a named one.

### Animation

**Trigger:** viewport entry, `once: true`.
- Rows enter `opacity` 0→1, **240ms**, `--ease-instrument`, **60ms stagger**, capped at 6 items (rows 7–8 share row 6's delay).
- The final row's `no` gets a **0ms** colour flip to `--signal` plus `scale(1.045)→1` over 180ms, 240ms after the row lands.

**Reduced motion:** all rows render. 120ms opacity, no stagger.

### Components

Plain semantic `<table>` with `scope` attributes. No table library on the marketing route.

### Mobile

The table becomes **eight stacked cards**, each: question as a 13px heading, then two rows `PRGuard / yes + mechanism` and `Typical / no`. Never a horizontally-scrolling table — the question text is the content and it cannot be truncated.

---

## 10 · THE ACCURACY REPORT — WE MEASURE OURSELVES

**Job:** the strongest defensible claim on the page. Six numbers, each with its definition visible, its denominator, its confidence interval, and its caveats printed as body text.

### Copy

**Section index:** `/ 10 — SELF-REPORT`

**H2:**
```
Every number has a denominator.
```

**Subhead:**
> Measured on the demo corpus over 30 days. Definitions are printed, not hovered. Intervals are Wilson score at 95%. The caveats are below the numbers, in the same size as the numbers.

**Six metric readouts** — value (48px mono tabular), definition (13px Inter, **always visible**, never a tooltip), `n`, and a hairline error bar:

```
proven_rate                          0.580     95% CI 0.54–0.62      n = 537
  share of findings entering S7 for which the repro passed at base and failed at head

disproven_rate                       0.140     95% CI 0.11–0.17      n = 537
  share of findings entering S7 for which the repro passed at head — the claim was wrong

execution_verified_precision         0.910     95% CI 0.87–0.93      n = 312
  share of PROVEN findings a human reviewer confirmed as a real defect

self_caught_false_positive_rate      0.140     95% CI 0.11–0.17      n = 537
  share of findings the system refuted itself before publishing to a pull request

human_dismissal_rate                 0.070     95% CI 0.05–0.11      n = 284
  share of published findings a human dismissed with a reason

addressed_rate                       0.630     95% CI 0.57–0.68      n = 284
  share of published findings changed in a subsequent commit on the same PR
```

**The caveat strip** — hairline-ruled, `--text-body`, 15px, **not collapsed, not behind a disclosure**:

> **Read these against the following.** The corpus is 537 findings across 62 pull requests in 9 open-source repositories, seeded to include at least one disproven finding and one delivery-ladder fallback — so it is not a random sample of your codebase. `execution_verified_precision` is adjudicated by two of our own engineers, not by a third party. `addressed_rate` cannot distinguish "the developer agreed" from "the developer touched that line for another reason." Every `n` here is small enough that the intervals are wide, and we have printed them rather than rounding them away. All six are recomputed nightly and this page reads them live.

**The rehearsed answer**, set as a mono pull-quote:
```
14% is not our error rate.
It is the rate at which the system caught itself
before the claim reached your pull request.
```

**Provenance:** `GET /v1/accuracy → metrics[].value · .definition · .n · .caveats`

### Composition

780px. Six readouts in a 3 × 2 grid at 1440, each in a hairline cell. The caveat strip spans full width beneath. The pull-quote sits right of the caveats at 4 cols.

Wilson intervals render as a **1px hairline error bar** under each value, with the point estimate as a 3px `--signal` tick and the bounds as 1px `--ink-7` end caps.

### Animation

**Trigger:** viewport entry, `once: true`.
- Readouts enter `opacity` 0→1, **240ms**, `--ease-instrument`, **80ms stagger**
- Each error bar expands **outward in both directions from the point estimate**, `transform: scaleX(0→1)` with `transform-origin: center`, **420ms**, `--ease-instrument`, 120ms after its value
- **The numbers do not count up.** Half-disclosing is worse than not disclosing for a product whose thesis is proof, and a spinning number on the one rigorous surface is decoration.

**Reduced motion:** everything renders in place, error bars at full width. 120ms opacity.

### Components

`<MetricReadout>` — the same component as section 03 and as the dashboard `/accuracy` route. Recharts is **not** used here; six error bars are six `div`s and a `transform`.

Data fetched at build time from `/v1/accuracy` with a committed fixture fallback, so a flaky backend cannot break the build or blank the section.

### Mobile

Single column, six stacked readouts. Value at 32px. Definition wraps to two lines. Error bar full width. Caveat strip and pull-quote stack below.

---

## 11 · RUN ONE

**Job:** collapse the distance between reading and verifying. Convert belief into an action while it is hot.

### Copy

**Section index:** `/ 11 — TRY IT`

**H2:**
```
Run one.
```

**Subhead:**
> Paste any public pull request. PRGuard reviews it through the same nine stages, in the same sandbox, and gives you a link you can share. Read-only. No app install. No write access to anything.

**Input** (13px mono, `--ink-1`, 1px `--ink-7` border — a meaning-bearing border, so it must clear 3:1):
```
placeholder: https://github.com/owner/repo/pull/4821
```
**Button:** `RUN →` — solid `--signal`, `--ink-0`

**Pre-warmed chips** (11px mono caps, ghost, 1px `--rule-2`):
```
TRY: fastapi#12908   ·   requests#6841   ·   httpx#3402
```

**Under the input** (11px mono, `--text-dim`):
```
typical run 41–78s · every stage visible as it happens · nothing is written to the PR
```

**When a run is live**, the input is replaced in place by `<StageRail mode="live">` at `density="compact"` plus the live rail readout, and the button becomes `↻ RUN ANOTHER`.

**Provenance (live):**
```
POST /v1/reviews → 202 + poll_url   ·   GET /v1/reviews/{id} every 1.2s
```

### Composition

560px. Centred, single column, 720px max width. An evidence frame with registration marks. Nothing else on screen — this is the page's one transactional surface and it gets air.

### Animation

**Trigger:** user action only. Nothing animates on scroll here.
- Input focus: 2px `--signal-hi` outline with 2px offset, **120ms**, `--ease-snap`. Never `outline: none`.
- On submit: the input row cross-fades to the stage rail, **240ms** `--ease-instrument`.
- The stage rail then animates from real telemetry — the packet advances as `stage_index` increments, and creeps within a stage as `stagePhase = clamp(secondsSinceHeartbeat / expectedSeconds[stage], 0, 0.92)` so a stage that completes faster than the poll interval just animates further rather than being skipped.

**Reduced motion:** cross-fade becomes an instant swap. The stage rail renders as a nine-row text list with the current stage marked, updating on `stage_index` change only.

### Components

- **TanStack Query 5.103.2**, polling: `refetchInterval: q => q.state.data?.status === 'running' ? 1200 : false`, backing off to 4s after 90s.
- **POLLING, NOT SSE.** A 1.2s poll survives a four-second wifi blip; a dead `EventSource` mid-demo is a silent, unrecoverable failure with no recovery UI. Say in the README that production uses a stream and the poll is the deliberate venue-hardened path.
- `<StageRail mode="live" density="compact">` — the same component as section 06 and as the dashboard run view.
- `role="status"` on the stage label, announcing **only on `stage_index` change**, never on every 1.2s poll. `role="progressbar"` with `aria-valuetext="Stage 3 of 9, specialists"`. The live region renders empty in the shell, before any content changes, or nothing is announced at all.

### Demo-day hardening

A `?fixture=1` query param replays a recorded real run deterministically from seeded JSON with the backend off. **Never let a live Anthropic call sit on the critical path**, and say so out loud on stage.

### Mobile

Input full width, button below it at full width. Chips wrap to two rows. Stage rail renders in its vertical mobile geometry.

---

## 12 · SCOPE, RETENTION, AND HOW THIS IS PRICED

**Job:** two objection handlers in one band. What does it touch, and what does it cost. *(Merged deliberately — see §5.)*

### Copy

**Section index:** `/ 12 — SCOPE & TERMS`

Three columns at 1440, each a hairline-ruled block with an 11px mono caps header.

**Column 1 — `PERMISSIONS`**
> A GitHub App with four scopes and nothing else.
>
> `contents: read` — to fetch the diff and the checkout
> `pull_requests: read & write` — to post exactly one review comment
> `checks: write` — to publish one check run
> `metadata: read` — required by GitHub
>
> No organisation scope. No members. No secrets. No write access to any branch.

**Column 2 — `THE SANDBOX`**
> Every execution runs in a container with **no network egress**, a read-only mount of the checkout, a 120-second wall clock and a 2GB memory ceiling. The container is destroyed when the run ends.
>
> Prompts contain the diff hunk, a symbol-graph slice and file paths. Secrets detected at S1 INGEST are redacted before the prompt is assembled. Nothing is used for model training.
>
> No code leaves the sandbox except the captured stdout and stderr attached to a proven finding.

**Column 3 — `RETENTION`**
> Diffs and terminal captures: **30 days**, then purged.
> Findings, fingerprints, suppressions and audit events: retained for the life of the tenant.
>
> Deletion removes derived artifacts. **Audit events are revoked, never deleted** — an append-only ledger that can be emptied is not a ledger, and we would rather tell you that than pretend otherwise.

**Below, full width, a hairline-ruled band — `PRICE`:**

**H3:**
```
We are not going to show you a tier grid.
```

**Body:**
> Every tool in this category is priced between twelve and ninety-nine dollars per seat per month, three or four tiers, "Custom" in the last column, twenty percent off annually. Reproducing that table would concede that PRGuard is the same kind of product.
>
> PRGuard is priced on **proven findings delivered**. You pay when the sandbox executes a repro test and returns `proven` or `disproven` — that is, when you receive an artifact. `inconclusive` and `not_attempted` findings cost nothing, because they are not evidence.
>
> During the beta there is no charge and no card.

**Link** (11px mono, `--signal`): `READ THE BETA TERMS →`

**Honesty line** (11px mono, `--text-dim`):
```
SOC 2 is not claimed. This product is new and we are not going to pretend otherwise.
```

### Composition

520px. Three columns 4/4/4, then the price band full width beneath a 1px `--rule-1`. No registration marks — this is not an evidence frame.

### Animation

**Trigger:** viewport entry, `once: true`. Three column blocks and the price band enter `opacity` 0→1, **240ms**, `--ease-instrument`, **60ms stagger**. Nothing else.

**Reduced motion:** identical minus the stagger, 120ms.

### Components

Plain layout. `<Surface>` only.

### Mobile

Columns stack. Price band follows. The honesty line stays — it is the most quotable string in the section.

---

## 13 · FAQ

**Job:** close the last four objections a technical buyer forms between section 10 and the CTA.

### Copy

**Section index:** `/ 13 — QUESTIONS`

Eight rows, each a hairline-separated disclosure. **Questions render as 15px mono, always visible; answers render open by default at desktop width** — an accordion that hides the answers on a governance product is the same category of mistake as a tooltip on a caveat.

**Does the AI approve pull requests?**
> No. It posts exactly one review with `event: COMMENT`. `APPROVE` is unreachable in the delivery code path and a test asserts it on every build. The test name is `test_review_event_is_never_approve`.

**What happens when it cannot prove a finding?**
> It publishes the finding as `inconclusive` or `not_attempted` and says which. Neither can turn the merge gate red. You get the claim, clearly marked as unproven, and you decide.

**It disagreed with me. How do I make it stop?**
> Dismiss it with a reason and a scope — line, file, pattern, repo or tenant — and optionally an expiry. The fingerprint is `sha256(category | rule_key | symbol_path | shape_hash)`, so the same finding does not return after a rename, a reorder or a line drift. A rejected finding never comes back.

**Can I delete an audit event?**
> No. You can revoke it, and the revocation is itself an event with its own hash. Every state transition is chained, so the trail is tamper-evident and verifiable on read — `GET /v1/audit` returns `chain.verified` and `broken_at_seq`.

**What does it run my code in?**
> `python:3.12-slim` by default, or the runtime your repository declares. No network egress, a read-only checkout mount, a 120-second wall clock, a 2GB ceiling, destroyed on completion.

**Fourteen percent of your findings are refuted. Is that bad?**
> It is the rate at which the system catches itself before the claim reaches your pull request. Every reviewer in this category has a rate like it. We are the only one that measures it and prints it.

**Does it work on languages you cannot execute?**
> Partly. Findings in a language with no runner get `proof_status: not_attempted` and are advisory only — they cannot block. Currently executable: Python, TypeScript, JavaScript, Go.

**Is the check run required?**
> Only if you make it required. PRGuard turns the gate red on a proven finding. Whether red blocks a merge is your branch-protection rule, not ours. That is the whole point of M4.

### Composition

640px. Two columns of four at 1440, single column below 1024. Each row: question (15px mono, `--text-primary`), answer (15px Inter, `--text-body`, max 62ch), 1px `--rule-hair` separator.

### Animation

**Trigger:** viewport entry, `once: true`. Rows enter `opacity` 0→1, **240ms**, `--ease-instrument`, **60ms stagger**, capped at 6.

Hover: surface steps one rung `--ink-0` → `--ink-2` over 120ms. No translate, no scale, no glow.

**Reduced motion:** rows render. 120ms opacity.

### Components

Native `<details>`/`<summary>` at mobile width (open by default at desktop via a media query on `[open]`) — free keyboard support, free screen-reader semantics, zero JS.

### Mobile

Single column, collapsed `<details>`, first one open. Marker replaced with a 8px chevron in `--text-dim`.

---

## 14 · THE CLOSE

**Job:** restate the hero in five words and give exactly one action.

### Copy

**H2** (Google Sans Code 520, 40px):
```
Proven, or it doesn't block.
```

**Primary CTA:** `RUN A REVIEW →` — solid `--signal`, `--ink-0`, 2px radius
**Secondary** (11px mono, `--signal`, underlined on hover): `READ THE ACCURACY REPORT`

**Under the CTAs** (11px mono, `--text-dim`):
```
POST /v1/reviews → 202 + poll_url
```

### Composition

420px. Centred. Bare graph paper. One hairline rule above at 40% width, centred, carrying a single tick.

### Animation

**Nothing animates.** The page ends on stillness, which is the register the whole site has been arguing for.

### Mobile

Headline breaks to two lines at 24px. CTAs stack full width.

---

## 15 · FOOTER

**Job:** the controls a judge needs, and nothing else.

### Composition & copy

56px band, `--ink-1`, 1px `--rule-1` top. Three groups:

**Left — controls** (11px mono caps, ghost buttons, 2px radius):
```
[ MOTION: FULL ]   [ CONTRAST: STANDARD ]
```
`MOTION` writes `data-motion="reduced"` on `<html>`; `CONTRAST` writes `data-contrast="high"`. Both toggle in one click with a **0ms** state flip. A judge flipping reduced motion live and watching the page still work is a ten-second moment worth more than an animation.

**Centre — the legend** (11px mono, `--text-dim`, with the four glyphs inline):
```
◆ proven   ◇ disproven   ◈ inconclusive   ◌ not_attempted   —   proven and disproven share a hue because both are execution results
```

**Right — links** (11px mono caps, `--text-dim`):
```
DOCS · ACCURACY REPORT · AUDIT CHAIN · STATUS · GITHUB
```

**Below, micro row** (11px mono, `--ink-8`):
```
Google Sans Code and Inter Variable, SIL OFL 1.1.   ·   build 4e8b1d0   ·   2026
```

### Animation

None.

### Mobile

Controls on row 1, legend wraps to two rows, links on row 3. Micro row last.

---

# 7. THE SIGNATURE MOMENT, ENGINEERED

**The signature moment is section 01, the Proof Bench, and specifically the frame at t=2400ms.**

Two stacked terminal panes. Cyan `1 passed in 0.42s` at `a91f3c2` above. Red `AttributeError: 'NoneType' object has no attribute 'currency'` and `1 failed in 0.39s` at `9c2d4b1` below. A solid cyan `proof_status: PROVEN` chip between them. `→ blocks merge` in alarm red. No green anywhere.

That single screenshot is the whole product. It is the literal rendering of M1. It is the demo line — *"Tool A says this MIGHT null-deref. We say it DOES — here's the failing test, the stack trace, and the fix"* — frozen as an image. And it is **physically unfakeable by any competitor whose architecture cannot execute code at two SHAs.**

### How it is engineered so it cannot fail

**1. Frame 0 is the money shot.** The bench is server-rendered in its final state. No JS, no fonts, no animation runtime is required for the claim to land. Everything after first paint is additive.

**2. The timeline is paused-first and keyboard-driven before it is scroll-driven.**
```js
const tl = gsap.timeline({ paused: true });
// … built once, inside gsap.matchMedia()
window.addEventListener('keydown', e => {
  if (e.key === 'p' || e.key === 'P') tl.restart();
  if (e.key === 'd' || e.key === 'D') runDisprovenTimeline();
  if (e.key === 'Escape') { tl.progress(1).pause(); }
});
```
The sequence is frame-identical on every run. When a judge says *"show me that again,"* it is one keystroke, and it looks exactly the same.

**3. It never depends on scroll.** The hero replay is not scroll-triggered at all. Only section 06 uses ScrollTrigger, and the scrub is the first thing on the cut list.

**4. The `D` key is the counter-demo.** Ten seconds of the system publicly losing an argument with itself, on demand, on stage. It also makes the palette's best decision legible in motion instead of in a legend. **This requires at least one genuinely disproven finding in the demo corpus — that is a backend requirement on day zero, not a frontend one.** Seed it alongside one `inline_nearest` and one `commit_status` fallback, or the S8 ladder shows four lit rungs and no story. A demo showing 100% proven is worse than not shipping the section.

**5. The terminal output is real, selectable, syntax-highlighted text.** Captured from an actual run against an actual repository, normalised server-side, parsed by `anser`, rendered into our own `<pre>`. A judge can select it, copy it, and paste it. A PNG of a terminal is exactly what a product that could not actually do this would ship.

**6. The four-second hold.** After `→ blocks merge` lands at t=2400, four full seconds where nothing moves except the heartbeat dot. This is where a judge reads. Without it the sequence is a demo of animation; with it, it is a machine returning a result and then sitting still.

**7. Insurance.** A 90-second screen recording of the proven-bug moment, exported as MP4, sits on the presenting laptop's desktop. It costs 20 minutes and it is also the submission video.

---

# 8. BUILD ORDER, COMPONENT INVENTORY, STACK LOCKS

### Build order — every day is additive, so any day can be the last day

| Day | Work | Property |
|---|---|---|
| **0** (0.5d) | Tokens in OKLCH, gamut-clamped, APCA-verified with the official `apca-w3` package. Graph paper + grain + the `<Surface>` primitive with hairlines and registration marks. `[data-contrast="high"]`. ~60 lines of CSS carrying most of the expensive read. **Backend: seed the demo corpus with a disproven finding and a ladder fallback. Write the canonical-JSON spec.** | — |
| **1** (1d) | **THE PROOF BENCH, static, at frame 0 only.** Both terminals rendered, verdict stamped, provenance line present, no animation. | **At the end of day 1 the hero already works.** |
| **2** (1d) | Hero replay timeline (paused/keyboard first, scroll never). `P` and `D` bindings. The fallback handshake. | Sections 01–03 complete. |
| **3** (1d) | Severity instrument — contribution bar, threshold ticks, input table, list-row sparkline. Then the chain rail + contenteditable tamper. | Sections 04, 05, 07 complete. |
| **4–5** (2d) | 9-stage SVG pipeline, sequenced as **static geometry (3 breakpoints from one TS constants file with an `elbow(from,to)` helper) → live-mode driver → scroll scrub LAST.** The live driver is needed for the dashboard regardless, so the scrub is the only part that can slip. | Section 06 complete. |
| **5** (0.5d) | Sections 08–15: comparison, accuracy, run-one, scope/price, FAQ, close, footer. Mostly layout and copy over components that already exist. | Page complete. |
| **6** (0.5d, **NON-NEGOTIABLE**) | Reduced-motion second state. `[data-contrast="high"]` verification on an actual projector. A11y pass — live regions, focus rings, `scroll-margin-top` (WCAG 2.4.11 *Focus Not Obscured* is Level **AA**, not AAA). Offline fixture mode. The 90-second MP4. | Insurance. |

### Component inventory — ten components, three ship twice

| Component | Marketing | Dashboard |
|---|---|---|
| `<Surface>` | every panel | every panel |
| `<ProofBench>` | **hero (01), section 03** | **`/findings/:id` proof pane** |
| `<ContributionBar>` | **section 05** | **finding card at 320px + 20px list sparkline** |
| `<StageRail>` | **section 06 (scrub), section 11 (live)** | **`/runs/:id` hero screen (live)** |
| `<ChainRail>` | section 07 (with tamper) | `/audit` (virtualized, + raw JSON download) |
| `<ProofChip>` | 01, 03, 04 | findings table, finding header |
| `<MetricReadout>` | 03, 10 | `/accuracy` |
| `<PRGuardDiff>` | 07, 08 | finding detail |
| `<ProvenanceLine>` | every evidence frame | **every dashboard panel header** — doubles as a debugging affordance |
| `<SectionIndex>` | nav + every section | panel headers |

### Stack locks — decide once, pin exactly, commit the lockfile

```
Next.js 16.3.6 · Node 22 LTS · TypeScript 5.x
React 19.2.0 PINNED with a package.json `overrides` block (no caret on any core dep)
ONE app, two route groups: app/(marketing)/ and app/(app)/
  — not a monorepo, not Multi-Zones (cross-zone links are hard navigations,
    and the hero CTA → dashboard click is the whole narrative)

Tailwind 4.3.3 CSS-first
  @theme inline  for next/font vars and shadcn's :root/.dark re-export
  @theme static  for every token the pipeline SVG reads via getComputedStyle
shadcn CLI: init -b radix   (NOT base-ui — note the package was renamed to
  @base-ui/react; the widely-cited @base-ui-components/react is npm-deprecated)

GSAP 3.15.0 + ScrollTrigger — MARKETING ROUTE ONLY (~46 KB gz measured, not 70)
  → npm licence field is Webflow's non-SPDX free-text string; add ONE CI allowlist entry
Motion — DASHBOARD ONLY, via LazyMotion + m + domAnimation (~20 KB)
  → enforce the boundary with an ESLint no-restricted-imports rule, not discipline

anser 2.3.5 for ANSI — never xterm.js
Shiki 4.4.3, 6–10 languages imported INDIVIDUALLY, never the 8.25MB barrel
@git-diff-view/react 0.1.7 behind ONE <PRGuardDiff> component
TanStack Query 5.103.2 · @tanstack/react-table pinned ^8 (NOT v9 — ESM-only, no migration guide)
next/font/local: Google Sans Code + Inter Variable, both OFL, ≤85KB combined

ZERO WebGL · ZERO Three.js · ZERO Rive · ZERO Lottie · ZERO Spline · ZERO canvas · ZERO video
Polling at 1.2s with backoff, never SSE
Demo from a PRODUCTION domain, never a preview URL
  (bytecode caching and function pre-warming are production-only)
```

**Budgets:** marketing first-party JS ≤170KB gz · dashboard shell ≤250KB gz · **LCP element is the H1, rendered outside every Suspense boundary** · `content-visibility: auto` + `contain-intrinsic-size` on sections 08–15. Verified with `@next/bundle-analyzer` and Lighthouse on the production deployment.

---

# 9. DECIDE THESE IN THE FIRST HOUR

1. **72px vs 62px mono headline.** The arithmetic above says 62. Set the literal string at 1280/1440/1920 on the demo machine before anything else, and confirm the variable `wght` axis renders. If it still reads as a terminal banner, drop to 56 — do **not** change typeface.
2. **The one shader concession, or none.** Recommended: none, sell the refusal with the prepared sentence in §0. If the owner will not budge, one static `<Dithering>` at ≤5% behind section 02, exact version pin, WebGL2 feature check, static fallback. Free if settled now, two days if reopened on day four.
3. **Fifteen sections or eleven.** Build fifteen. Cut in the published order (pipeline scrub → 08 → fold 04 into 03) only if it tests long. Never cut 03, 05, 07, or 10.
4. **Who owns the canonical-JSON spec.** Backend writes it day zero, frontend consumes it, CI tests both sides against identical fixtures, a failing fixture breaks the build. Skipping this turns the best moment on the page into a false `chain.verified = false` on load.
5. **Does the demo corpus contain a real disproven finding?** If not, seed it today. The `D` key, section 03, and two of the six accuracy metrics all depend on it.
6. **Publish `self_caught_false_positive_rate` on the marketing site — yes or no.** Recommended: yes, prominently, with the one-sentence answer rehearsed and every caveat rendered as always-visible body text. Half-disclosing is worse than not disclosing for a product whose thesis is proof.