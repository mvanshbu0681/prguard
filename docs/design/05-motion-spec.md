# PRGuard — Motion & Interaction Specification
**Direction:** COLD LIGHT (spine) + Exhibit grafts 1–4 + BLAST DOOR grafts 5–7
**Surfaces:** `app/(marketing)/` and `app/(app)/` in one Next.js 16.3.6 app
**Status:** normative. Where this document and the direction brief disagree, this document wins — every divergence is flagged and justified inline.

---

## 0. Scope and source of truth

This spec governs every moving pixel in PRGuard. It is written so that an engineer can implement any interaction without a design conversation, and so that a reviewer can reject a PR by citing a clause.

Three rules override everything below:

1. **The designed state and the end state are the same frame.** Every animation in this product is an *arrival* at a composition that already works statically. If a screenshot of the end state does not carry the claim, no amount of motion will.
2. **Motion is instrumentation or it is deleted.** Nothing loops that is not driven by telemetry. Nothing pulses that is not alive.
3. **One deliberate exception exists** — the 0 ms verdict flip (§2.5). It is the most important motion decision in the project. Everything else in this spec exists to make that one exception legible.

---

## 1. Motion philosophy

PRGuard's entire thesis is that opinions are worthless and only captured evidence counts, so its motion must read as a machine *actuating and then returning a result* — never as an interface performing. Every transition is short, quantised, hard-out, and terminates in a composition that would have been correct if it had never moved at all; nothing eases in slowly, nothing overshoots, nothing bounces, and nothing loops except a single 1 px heartbeat dot whose period is the real telemetry interval. The one long movement on the entire product is a 1400 ms scan line travelling the proof bench, and it exists because a scan is what the product literally does. Against that uniformly eased field, the verdict — `PROVEN`, `DISPROVEN`, `chain.verified = false`, the merge gate closing — flips colour in **zero milliseconds**, with only a 180 ms scale carrying the motion. That instantaneous flip is unmissable precisely because everything around it is eased, and it is the difference between a UI that animates and a machine that answers.

---

## 2. Token set

### 2.1 Easing tokens

Three curves plus `linear`. No fourth curve ships. No inline `cubic-bezier()` literals are permitted anywhere in the codebase — lint rule in §3.4.

| Token | Value | Shape | Used for | Where |
|---|---|---|---|---|
| `--ease-instrument` | `cubic-bezier(0.33, 0, 0.12, 1)` | flat start, accelerate, hard arrest | every entrance, wipe, rail draw, section rule, reveal | both surfaces |
| `--ease-snap` | `cubic-bezier(0.2, 0, 0, 1)` | immediate start, hard arrest | hover, focus, chip, press, state flip scale, tooltip | both surfaces |
| `--ease-mass` | `cubic-bezier(0.52, 0, 0.08, 1)` | long wind-up, long accelerate, harder arrest | **exactly one element** — the scan line's travel down the proof bench | marketing only |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | ease-in, no arrest | every exit / dismiss | both surfaces |
| `linear` | — | — | **every** scroll-scrubbed value, without exception | marketing only |

> **Resolved collision.** The synthesis instructs grafting BLAST DOOR's `--ease-mass: cubic-bezier(0.33, 0, 0.12, 1)` onto COLD LIGHT — but that is byte-identical to COLD LIGHT's published `--ease-instrument`, so the graft as written adds a token and no behaviour. Resolution: `--ease-instrument` keeps its published value untouched (it is the spine), and `--ease-mass` is retuned to `cubic-bezier(0.52, 0, 0.08, 1)`. Over a 1400 ms, ~420 px travel that difference is ≈150 ms of additional visible wind-up and a materially harder stop — enough to read as weight against a field of 420 ms entrances. **Escape hatch:** if on the demo machine the wind-up reads as hesitation rather than mass, set `--ease-mass: var(--ease-instrument)` and delete the token. One line, zero downstream cost.

**Banned curve shapes, categorically:**
- Any curve with `y1 < 0` or `y2 > 1` (overshoot/bounce). Nothing in this product bounces.
- Tailwind's default `cubic-bezier(0.4, 0, 0.2, 1)` on anything a judge will look at. It is the transition curve of an un-art-directed site.
- Easing applied to a scrubbed value. Easing a scrub fights the scroll input and reads as lag, not as polish.

### 2.2 Duration tiers

Six tiers. Quantised. **Any value not on this grid is a bug**, enforced by lint (§3.4).

| Tier | Token | Value | Applies to |
|---|---|---|---|
| **instant** | `--dur-0` | `0ms` | verdict colour, gate colour, `chain.verified` flip, severity band label snap, numeric readouts. See §2.5. |
| **fast** | `--dur-1` | `120ms` | hover (all classes), focus ring, chip tint, registration-mark brighten, terminal-row append, keyboard row move |
| **base** | `--dur-2` | `180ms` | state-flip scale `1.045 → 1`, tooltip enter, press release, layout morph, dropdown enter |
| **settle** | `--dur-3` | `240ms` | small reveal, underline draw, strike-through draw, opacity enter, desaturate-below-break |
| **slow** | `--dur-4` | `420ms` | element entrance, 2 px rail wipe, section rule draw, chain-rail draw, dialog enter |
| **cinematic** | `--dur-5` | `1400ms` | **the hero scan line, and nothing else on either surface** |
| *(exit)* | `--dur-exit` | `160ms` | every dismiss / exit, paired with `--ease-exit` |

Two ceilings, both hard:

- **Dashboard ceiling: 220 ms.** If any transition in `app/(app)/` exceeds 220 ms it is a bug. The product is sold as keyboard-fast; a 420 ms entrance in a findings table is a lie about the tool.
- **Marketing ceiling: 420 ms**, with `--dur-5` as the single documented exception.

### 2.3 Stagger tokens

| Token | Value | Applies to |
|---|---|---|
| `--stagger-sibling` | `60ms` | chips, cards, ledger rows, severity segments, metric rows, delivery-ladder rungs |
| `--stagger-stage` | `120ms` | the nine pipeline stations |
| `--stagger-lane` | `0 / 60 / 120 / 180ms` | the four S3 specialist lanes — applied to **completion only, never to start**, because they genuinely run in parallel and the stagger exists solely to break mechanical simultaneity |
| `--stagger-row-group` | `0 / 120 / 240ms` | terminal rows, implemented as **three stepped groups**, never as N individual delays |

**Stagger cap: 6 items / 360 ms total.** The 7th and subsequent siblings share the 6th's delay. A stagger that takes longer than the thing it is revealing is decoration.

### 2.4 Tier assignment rules

Given any new interaction, pick the tier by answering in order:

1. Is it a **verdict, a gate, or a chain-verification state**? → `--dur-0`, no transition property at all. Stop.
2. Is it **pointer- or keyboard-initiated and must feel like a direct response**? → `--dur-1`, `--ease-snap`.
3. Is it a **state change the user caused but did not point at** (a chip flipping, a tooltip arriving, a press releasing)? → `--dur-2`, `--ease-snap`.
4. Is it a **small graphic being drawn** (a rule, an underline, a strike-through)? → `--dur-3`, `--ease-instrument`.
5. Is it an **element arriving on screen for the first time**? → `--dur-4`, `--ease-instrument`. On the dashboard, downgrade to `--dur-2`.
6. Is it **the scan line**? → `--dur-5`, `--ease-mass`.
7. Is it **leaving**? → `--dur-exit`, `--ease-exit`.

If none apply, the answer is that the thing should not animate.

### 2.5 The 0 ms exception

The following state changes have **no `transition` property on the colour**, ever:

- `proof_status` chip → `PROVEN` / `DISPROVEN` / `INCONCLUSIVE`
- merge gate → blocked / clear
- `chain.verified` → `true` / `false`
- severity band label crossing a threshold (`.15 / .35 / .55 / .75`)
- a run's terminal status

Each is paired with **one** of two motion companions, never both:

- **Stamp** (the thing appearing or asserting): `transform: scale(1.045) → scale(1)` over `--dur-2` on `--ease-snap`.
- **Expand** (the thing widening to accommodate new text, e.g. `gate · blocked · 1 proven`): `transform: scaleX()` on a fixed-width track over `--dur-3` on `--ease-instrument`, with the label cross-faded at `--dur-1`.

> Do not soften this. Do not add a 60 ms fade "so it isn't jarring." The jar *is* the message.

### 2.6 CSS implementation

```css
@theme static {
  /* easing */
  --ease-instrument: cubic-bezier(0.33, 0, 0.12, 1);
  --ease-snap:       cubic-bezier(0.2, 0, 0, 1);
  --ease-mass:       cubic-bezier(0.52, 0, 0.08, 1);
  --ease-exit:       cubic-bezier(0.4, 0, 1, 1);

  /* duration */
  --dur-0: 0ms;
  --dur-1: 120ms;
  --dur-2: 180ms;
  --dur-3: 240ms;
  --dur-4: 420ms;
  --dur-5: 1400ms;
  --dur-exit: 160ms;

  /* stagger */
  --stagger-sibling: 60ms;
  --stagger-stage:   120ms;

  /* telemetry-driven */
  --heartbeat-period: 1200ms; /* overwritten at runtime from the API */
}
```

`@theme static` (not plain `@theme`) is mandatory: the hand-authored 9-stage pipeline SVG reads `--signal`, `--marker`, `--alarm` and the duration tokens via `getComputedStyle`, and plain `@theme` omits variables Tailwind believes are unused.

**`--heartbeat-period` is the only token written at runtime**, and it is written to the heartbeat element, **never to `:root`** (§6.1).

---

## 3. Library decision — final

### 3.1 The stack

| Role | Choice | Version (exact pin, no caret) | Scope | Cost |
|---|---|---|---|---|
| **Primary engine** | GSAP + ScrollTrigger | `gsap@3.15.0` | `app/(marketing)/` **only** | 28.3 KB + 18.0 KB = **46.3 KB gz** |
| GSAP React binding | `@gsap/react` | `2.1.2` | marketing only | ~1 KB |
| **Secondary engine** | Motion via `LazyMotion` + `m` + `domAnimation` | `motion@13.4.1` | `app/(app)/` **only** | 4.6 KB initial + 15 KB deferred ≈ **20 KB gz** |
| Smooth scroll | **none** | — | — | 0 KB |
| 3D / WebGL / canvas | **none** | — | — | 0 KB |
| Hashing (tamper control) | Web Crypto `crypto.subtle.digest` | platform | both | 0 KB |
| ANSI → tokens | `anser` | `2.3.5` | both | 0.04 MB unpacked, zero deps |
| Virtualisation | `@tanstack/react-virtual` | `3.14.13` | dashboard | ~6 KB gz |

**GSAP plugin set (marketing):** core + `ScrollTrigger` only. `SplitText`, `ScrambleText`, `MorphSVG`, `Flip`, `DrawSVG`, `MotionPath` and `ScrollSmoother` are **not imported**. Total marketing animation budget: **46.3 KB gz**, not the ~68–77 KB a full plugin set would cost.

**Why GSAP primary despite Motion being MIT:** the one pinned section needs `pin` + `snap` + `invalidateOnRefresh` + `fastScrollEnd` together, and Motion has no equivalent for that combination without hand-writing sticky-container maths. **Why Motion secondary:** `layoutId` and `AnimatePresence` genuinely have no GSAP equivalent without writing a bespoke Flip choreography per case, and the dashboard needs dozens.

### 3.2 Banned, with the reason

| Banned | Reason |
|---|---|
| **Lenis / ScrollSmoother / any smooth-scroll** | An instrument does not have momentum. Judges scrub; smoothed scroll reads as buffering on a trackpad and breaks Cmd-F. Also removes the entire `gsap.ticker` / `lagSmoothing(0)` integration surface. |
| **Three.js / R3F / drei / any `<canvas>`** | 90–105 KB gz for three alone before shaders; a stutter on the venue projector costs the judging moment while communicating nothing about proof. Also: `@react-three/fiber@9.7.0` peers `react >=19 <19.3`, which conflicts with React 19.3.0 — a dependency fight for zero product value. |
| **Paper Shaders / any GLSL** | Pre-1.0 (`0.0.8x`, breaking changes under `0.0.x`), and an abstract animated field is the visual form of an unfalsifiable assertion on a product whose claim is falsifiability. |
| **Rive** | ~896 KB gz measured (100.8 KB JS + 795.3 KB WASM), and the free tier cannot export a `.riv` at all. |
| **Lottie / dotLottie** | ~485 KB gz of WASM plus an After Effects dependency you do not have. |
| **Spline** | No LICENSE file, no `license` field — proprietary by default — at ~479 KB gz. |
| **Vanta** | Last published 2022. |
| **`@number-flow/react` / any count-up** | §4.10.1. Numbers snap. |
| **Custom cursors, magnetic buttons, cursor trails, site audio** | 2 of 21 current Awwwards SOTD winners ship a custom cursor; 0 of 21 ship audio. A hijacked pointer fights the text selection people need when reading terminal output. |
| **`animation-timeline: view()` / `scroll()` as a mechanism** | Baseline *limited*; Firefox absent from stable. A CSS-only reveal parks elements at their 0 % keyframe — a Firefox judge sees a blank page. Permitted **only** inside `@supports (animation-timeline: scroll())` for one decorative scroll-progress rail, with a ScrollTrigger-driven fallback rendered beneath it. |
| **Spinners, anywhere** | The run emits `stage_index`/`stage_total`/`heartbeat`. A spinner throws that away. See §4.1.4. |
| **Skeleton shimmer** | Shimmer is decorative motion implying progress it does not have. Skeletons are static `--ink-2` blocks at exact final dimensions. |
| **Springs with damping ratio ζ < 1** | Nothing in this product overshoots. See §3.3. |

### 3.3 Coexistence

**The boundary is the route group, not taste.**

```
app/(marketing)/  →  GSAP only.  Motion import = lint error.
app/(app)/        →  Motion only. GSAP import = lint error.
app/_shared/      →  neither. Shared components take a `progress: number`
                     prop and animate nothing themselves.
```

The three components that ship on both surfaces — `<ProofBench>`, `<StageRail>`, `<ContributionBar>` — are **animation-agnostic**. They accept `progress` (0…1) and `mode` (`"static" | "scrub" | "live" | "replay"`) and render a pure function of that number. The marketing route drives `progress` from a GSAP scrubbed timeline; the dashboard drives it from `(stage_index - 1 + stagePhase) / stage_total`. Neither component imports an animation library. **This is the single most important architectural decision in this spec** — it is what lets the same object be the hero and the live run view.

**Motion configuration (dashboard root):**

```tsx
<MotionConfig
  reducedMotion="user"
  transition={{ type: 'tween', duration: 0.18, ease: [0.2, 0, 0, 1] }}
>
```

Motion's default is a spring; this replaces it globally with `--dur-2` / `--ease-snap`. **Springs are banned by default.** Exactly one spring configuration is permitted, for `layoutId` morphs where the travel distance is unknown at author time:

```ts
{ type: 'spring', stiffness: 520, damping: 46, mass: 1 }
```

Damping ratio ζ = 46 / (2·√(520·1)) = 46 / 45.61 = **1.009** — critically damped, no overshoot, settles ≈180 ms. Any spring proposed in review must show its ζ and it must be ≥ 1.0.

**Route changes and ScrollTrigger.** Next's App Router replaces the DOM on client navigation without a reload. Every route-scoped trigger must die with its component — `useGSAP()` wraps a `gsap.context()` and reverts on unmount, which is the only correct pattern. In addition:

```ts
// module scope, ONCE, never inside useEffect (StrictMode double-registers)
gsap.registerPlugin(useGSAP, ScrollTrigger);

// inside the component
useGSAP(() => {
  const mm = gsap.matchMedia();
  mm.add({
    isDesktop: '(min-width: 1024px)',
    reduce: '(prefers-reduced-motion: reduce)',
  }, (ctx) => {
    const { isDesktop, reduce } = ctx.conditions!;
    if (reduce) return;            // reduced-motion timelines are never BUILT
    if (!isDesktop) { /* per-stage reveals, no pin */ return; }
    /* pinned scrub */
  });
  return () => mm.revert();
}, { scope: container });

// after fonts resolve and after any async list mounts
document.fonts.ready.then(() => ScrollTrigger.refresh());
```

### 3.4 Integration pitfalls, with versions

| # | Pitfall | Mitigation |
|---|---|---|
| 1 | **React pin.** `create-next-app` on Next 16.3.6 installs React 19.3.0. | Pin `react`/`react-dom` to **19.2.0** exactly with a `package.json` `overrides` block, and commit the lockfile. No R3F is in the tree so 19.3.0 is *defensible*, but Motion's `AnimateView` (19.3+) is **not used** by this spec, so 19.2.0 has no cost and removes a class of same-day-release risk. Decide once; never use `--legacy-peer-deps`. |
| 2 | **GSAP licence is not SPDX.** `gsap@3.15.0`'s npm `license` field is the free-text string `"Standard 'no charge' license: https://gsap.com/standard-license."` A scanner flags it `UNKNOWN`. | Add one CI allowlist entry. Prepared answer: *Permitted Uses cover "any website, web application, or digital interface by any person or entity"; the only prohibition is building a competing no-code animation builder.* `@gsap/react@2.1.2` carries the same non-SPDX string — expect **two** rows, not one. |
| 3 | **Plugin double-registration** under React StrictMode. | `gsap.registerPlugin()` at module scope only. Lint: `no-restricted-syntax` banning `registerPlugin` inside a callback. |
| 4 | **Event-handler leaks.** Animations created in a raw `onClick` escape `gsap.context()` cleanup and survive route changes. | Use the `contextSafe()` wrapper returned by `useGSAP`. |
| 5 | **Cross-engine thrash.** GSAP and Motion touching the same DOM subtree in one frame is the documented read/write-thrash case. | Enforced by the route-group boundary + `no-restricted-imports`: `{"paths":[{"name":"gsap","message":"GSAP is marketing-only"},{"name":"motion/react","message":"Motion is dashboard-only"}]}` scoped per directory in flat config. |
| 6 | **`next lint` was removed in Next 16** and `next build` no longer lints. | Linting must be wired explicitly in CI or none of rules 3/5/9 are enforced. This is a real, silent gap. |
| 7 | **Tailwind v4 renamed `outline-none` → `outline-hidden`.** Pasted v3 form snippets silently change focus behaviour. | Grep for `outline-none` before ship. Focus ring is never `outline: none` (§4.1.5). |
| 8 | **`@theme` vs `@theme inline` vs `@theme static`.** `--font-sans: var(--font-geist)` needs `inline`; tokens read by JS need `static`. | Token file uses all three deliberately; documented in the file header. |
| 9 | **`will-change` sprayed.** | `will-change` is added imperatively immediately before a timeline plays and removed in its `onComplete`. Lint: ban `will-change` in stylesheets. |
| 10 | **`ScrollTrigger` start values cached across font load / async mount.** | `invalidateOnRefresh: true` on any trigger whose `end` is computed, plus the `document.fonts.ready` refresh above. |
| 11 | **iOS Safari's collapsing toolbar fights `pin`.** | Pin is disabled below 1024 px via `gsap.matchMedia()` — not via a CSS class, because the timeline must never be *constructed* on mobile. |
| 12 | **Canonical-JSON divergence** breaks the tamper control's credibility (§4.8.3). | Not a motion problem, but it is the failure mode that makes the flagship interaction demo as broken. Canonicalisation rules live in a shared spec file, tested against identical fixtures on both sides in CI; a failing fixture is a build-breaking error. |

### 3.5 The fallback handshake

Two layers, both required.

**Layer 1 — nothing is hidden by the stylesheet.** There is **no `opacity: 0` and no `visibility: hidden` in any authored CSS.** Below-the-fold content renders at full opacity by default. The hiding class is added **by JS**, only after JS has confirmed the runtime loaded and can animate, and it must be added in the **same synchronous task** that places the element at its start position and starts the timeline — so no frame can paint between hide and animate.

```html
<!-- in <head>, before any stylesheet -->
<style>
  html.anim-armed [data-reveal] { opacity: 0 }
  @keyframes prg-force-reveal { to { opacity: 1 } }
  html.anim-armed [data-reveal] {
    animation: prg-force-reveal 1ms linear 1600ms forwards;
  }
  html.anim-ready [data-reveal] { animation: none }
</style>
```

**Layer 2 — the armed force-reveal.** The `anim-armed` class is written by an inline script in `<head>`. The bundle disarms it (`anim-ready`) **only after confirming `window.gsap && window.ScrollTrigger` actually exist**. If the bundle 404s on venue wifi, the CSS animation fires at 1600 ms and every section appears in its final state.

Plus `<noscript><style>[data-reveal]{opacity:1!important;animation:none!important}</style></noscript>`.

> **Degraded, never invisible.** A judge who scrubs the scrollbar or arrives with a blocked CDN must never see a blank page. This is ~20 lines and it has saved more demos than any timeline.

---

## 4. Interaction catalogue

**Compositor column legend:**
**S** = compositor-only (`transform`, `opacity`, `clip-path`, `filter`) — free.
**P** = one-shot paint (a single short colour/border transition on one element) — permitted, bounded by §6.1.
**L** = layout — **banned**, appears only to mark something explicitly forbidden.

---

### 4.1 Controls

#### 4.1.1 Buttons — primary (solid `--signal`, `--ink-0` text, 2 px radius)

| State | Trigger | Properties | Duration | Easing | Compositor |
|---|---|---|---|---|---|
| Hover | `@media (hover:hover)` pointerenter | `background-color` `--signal` → `--signal-hi` | `--dur-1` | `--ease-snap` | P |
| Press | pointerdown | `transform: translateY(0.5px)` | `90ms` | `--ease-snap` | S |
| Release | pointerup | `transform: translateY(0)` | `--dur-2` | `--ease-snap` | S |
| Focus-visible | keyboard | `outline: 2px solid var(--signal-hi); outline-offset: 2px` | `--dur-1` | `--ease-snap` | P |
| Loading | `aria-busy="true"` set | label unchanged; a 1 px `--signal-lo` underline wipes `scaleX 0→1` over `--dur-4`, then loops `900ms linear` | see cell | `--ease-instrument` then `linear` | S |
| Success | resolve | label + glyph swap at `--dur-0`; holds `1400ms`; reverts via `--dur-exit` opacity cross-fade | mixed | `--ease-exit` | P + S |
| Disabled | attr | `background: --ink-5; color: --ink-8`; no transition | `--dur-0` | — | P |

**No spinner.** The loading rail is a determinate-looking indeterminate that matches the instrument language. Success is achromatic + a `--signal-lo` underline — **there is no green anywhere in this product** (§4.9.4).

#### 4.1.2 Buttons — ghost / secondary (transparent, `--rule-2` border)

Identical to primary except: hover transitions `background-color: transparent → --ink-2` and `border-color: --rule-2 → --rule-3`, both `--dur-1` / `--ease-snap`, both P.

#### 4.1.3 Chips (proof status, severity band, stage state, event type)

| State | Trigger | Properties | Duration | Easing | Compositor |
|---|---|---|---|---|---|
| Rest | — | static | — | — | — |
| **Verdict stamp** | `proof_status` resolves | `background-color` + `color` + `border-color` | **`--dur-0`** | *none* | P |
| paired with | same | `transform: scale(1.045) → scale(1)` | `--dur-2` | `--ease-snap` | S |
| Hover (interactive chips only) | pointerenter | `background` steps one ink rung | `--dur-1` | `--ease-snap` | P |
| Enter (list of chips) | in-view once | `opacity 0 → 1`, **no translate** | `--dur-3` | `--ease-instrument` | S |
| Stagger | — | `--stagger-sibling` (60 ms), capped at 6 | — | — | — |

Every chip carries a **mandatory glyph**. `PROVEN` (solid cyan fill, filled vial) and `DISPROVEN` (cyan *outline*, struck-through vial) share the `--signal` hue by design; colour alone never carries state, and under `forced-colors: active` the glyph is the only surviving channel.

#### 4.1.4 Toggles / switches (motion, contrast, density, wrap)

- Thumb: `transform: translateX()` over `--dur-2` on `--ease-snap`. **S**
- Track: `background-color` `--ink-4 → --signal-lo` over `--dur-1`. **P**
- Focus ring as §4.1.5.
- The **motion toggle** in the marketing footer writes `data-motion="reduced"` on `<html>` and takes effect on the next frame with no transition — a judge flipping it should see the product *change state*, not animate into a new state.

#### 4.1.5 Focus ring — global, non-negotiable

```css
:focus-visible {
  outline: 2px solid var(--signal-hi); /* #65E7F5, 13.50:1 on --ink-0 */
  outline-offset: 2px;
  transition: outline-color var(--dur-1) var(--ease-snap);
}
```

`outline: none` (and Tailwind v4's `outline-hidden`) appears nowhere. Every focusable row carries `scroll-margin-top` equal to the sticky header's height — WCAG 2.4.11 *Focus Not Obscured* is **Level AA**, not AAA, and a sticky stage header covering a `j`/`k`-focused row fails it.

#### 4.1.6 Inputs / filter fields

| State | Properties | Duration | Easing | Compositor |
|---|---|---|---|---|
| Rest | `border: 1px solid var(--ink-7)` (3.03:1 — meaning-bearing borders never use alpha hairlines) | — | — | — |
| Hover | `border-color → --ink-6` | `--dur-1` | `--ease-snap` | P |
| Focus | focus ring per §4.1.5; border unchanged | `--dur-1` | `--ease-snap` | P |
| Error | `border-color → --alarm`, `--dur-0`; message appears `opacity 0→1` `--dur-3` | mixed | `--ease-instrument` | P + S |
| Caret | native | — | — | — |

The `contenteditable` `canonical_json` field (§4.8.3) uses this spec plus a `--rule-3` dashed underline at rest to signal editability without a chrome-heavy input box.

#### 4.1.7 Text links

`text-decoration` is **never** animated (layout). Instead: a 1 px `::after` rule, `transform: scaleX(0) → scaleX(1)`, `transform-origin: left`, `--dur-1`, `--ease-snap`, plus `color: --text-dim → --text-primary` over `--dur-1`. **S + P.** On exit, `transform-origin: right` so the rule retracts the way it came.

---

### 4.2 Surfaces

#### 4.2.1 Panels / cards (the `<Surface>` primitive)

Hover — three simultaneous `--dur-1` / `--ease-snap` changes, and nothing else:

1. Fill steps **exactly one rung** on the ink ladder (`--ink-2 → --ink-3`). Never two. **P**
2. Hairline `--rule-1 → --rule-2`. **P**
3. The four 8 px L-shaped corner registration marks brighten `0.10 → 0.22` alpha. **P**

**Nothing translates. Nothing scales. Nothing glows. There is no drop shadow in this product.**

> **Hard rule (Exhibit graft):** registration marks appear **only on evidence-bearing frames** — the proof bench, the exhibit panels, the finding-detail proof pane, the audit chain frame. Never on buttons, chips, or ordinary dashboard panels. The moment they escape, the one ownable detail becomes a template tic.

#### 4.2.2 Table rows (findings, suppressions, audit, runs)

| State | Trigger | Properties | Duration | Easing | Compositor |
|---|---|---|---|---|---|
| Hover | pointerenter | `background: --ink-2 → --ink-3` | `--dur-1` | `--ease-snap` | P |
| Keyboard-focused (`j`/`k`) | keydown | a single absolutely-positioned 2 px `--signal` indicator `transform: translateY()` | `--dur-1` | `--ease-snap` | **S** |
| Selected | `v` / click | `background → --ink-4` + 2 px `--signal` left bar | `--dur-1` | `--ease-snap` | P |
| Severity tint | data | static — never animates | — | — | — |
| Row enter (new finding streams in) | data | `opacity 0 → 1` only, **no translate, no height** | `--dur-1` | `--ease-instrument` | S |
| Row leave (suppressed) | action | `opacity → 0.45` + strike-through draw; **row is never removed** | `--dur-3` | `--ease-instrument` | S |

> **Critical INP decision:** `j`/`k` navigation moves **one absolutely-positioned indicator element via `transform`**. It does not re-render 400 rows, and it does not toggle a class on each row. This is the difference between 8 ms and 200 ms on a large findings list.

Rows are never zebra-striped; separators are `--rule-hair` at `oklch(1 0 0 / 0.055)`. At 32 px rows on near-black, alternating fills band visibly and read as a 2010s admin template.

#### 4.2.3 Tabs / segmented controls

Active indicator: a single 2 px `--signal` bar, `transform: translateX()` + `scaleX()` over `--dur-2` on `--ease-snap`. **S.** Label colour `--text-dim → --text-primary` over `--dur-1`. **P.** Panel content does **not** cross-fade — it swaps at `--dur-0`. Cross-fading tab panels on a data surface reads as slow and costs a paint over a large area.

#### 4.2.4 Section rules (marketing)

A 1 px hairline with a tick mark and a mono index (`/ 05 — COMPUTED SEVERITY`). On first view: `transform: scaleX(0) → scaleX(1)`, `transform-origin: left`, `--dur-4`, `--ease-instrument`. **S.** Once. Never reverses.

---

### 4.3 Overlays

| Overlay | Enter | Exit | Compositor | Notes |
|---|---|---|---|---|
| **Tooltip** | `opacity 0→1` + `transform: translateY(2px)→0`, `--dur-2`, `--ease-snap`, 400 ms open delay / 0 ms close | `opacity → 0`, `--dur-exit`, `--ease-exit` | S | Tooltips never carry load-bearing information. Definitions, caveats and `n` values are **always-visible 13 px body text** (Exhibit graft 4), never tooltips. |
| **Dropdown / combobox / select** | `opacity 0→1` + `transform: scaleY(0.98)→1`, `transform-origin` at the trigger edge, `--dur-2`, `--ease-snap` | `opacity → 0`, `--dur-exit` | S | No slide. No blur. |
| **Dialog / modal** (suppress confirm, break-glass override) | scrim `opacity 0→1` `--dur-3`; panel `opacity 0→1` + `transform: scale(0.985)→1` `--dur-4` `--ease-instrument`, no offset | both `--dur-exit`, `--ease-exit` | S | The **only** `box-shadow` token in the product (`0 8px 32px oklch(0 0 0 / 0.55)`) is used here and on the ⌘K palette. Never tweened. |
| **Sheet / slide-over** | **BANNED for findings.** | — | — | The proof terminal needs ~940 px at 13 px mono for 80–120 columns; a 560 px sheet truncates the single artifact the product rests on. Master-detail split + a canonical full page instead. Sheets are permitted only for the ⌘K sub-pages, which are already the palette. |
| **Toast** | `opacity 0→1` + `translateY(6px)→0`, `--dur-2`, `--ease-snap`; stack shift `translateY` `--dur-2` | `opacity → 0` + `translateY(4px)`, `--dur-exit` | S | Max 3 visible. Auto-dismiss 5000 ms — anything auto-moving longer needs pause/stop/hide per WCAG 2.2.2, so 5000 ms is the ceiling, not a preference. |
| **⌘K command palette** | scrim `opacity` `--dur-2`; panel `opacity 0→1` + `scale(0.985)→1` `--dur-2` `--ease-snap`; list height animates `--cmdk-list-height` | `--dur-exit` | S (panel), P (list height — see note) | `backdrop-filter: blur(16px)` — one of **exactly two** blur surfaces in the entire product, never animated. |
| **Palette nested page push** | outgoing list `opacity → 0` `--dur-1`; incoming `opacity 0 → 1` `--dur-1`; container height `--dur-2` | reverse on Backspace | S + P | Typing `suppress` pushes a sub-page collecting reason → scope (`line\|file\|pattern\|repo\|tenant`) → expiry, entirely by keyboard. The resulting audit event then appears live in the rail (§4.8.2). **That four-second flow is M3 and M4 demonstrated; it is the highest-value interaction in the dashboard.** |

> `--cmdk-list-height` animates the container height, which is layout. It is permitted as a single bounded exception because the palette is a small isolated subtree over a scrim, it runs once per keystroke-settled state, and the alternative (a fixed-height list) is materially worse UX. Cap the list at 8 visible rows so the animated box stays small.

---

### 4.4 Page entry and route transitions

#### 4.4.1 Marketing page entry

1. **Frame 0, no JS required:** the entire above-the-fold composition is rendered in its final state — both terminal panes, the verdict chip reading `PROVEN`, the provenance line, the stat strip. The `<h1>` is the LCP element and sits **outside every Suspense boundary**.
2. `document.fonts.ready` resolves → `ScrollTrigger.refresh()`, `anim-ready` written.
3. **No page-load entrance animation whatsoever.** No fade-up, no stagger, no curtain, no preloader. The hero is already correct; animating it in would delay the one thing a judge must see in three seconds.
4. The hero replay sequence (§4.6) fires once, after fonts, and only under `prefers-reduced-motion: no-preference`.

#### 4.4.2 Dashboard route transitions

**There are none.** Route changes are instant. The detail pane's content receives a `--dur-1` opacity-only fade (`0.6 → 1`) so the eye registers that something changed; the shell, sidebar, header and table do not move.

- **View Transitions API: not shipped.** Same-document VT is Baseline-newly-available and would be cheap, but it is a paint-tier operation over a large area, it requires `flushSync`, and duplicate `view-transition-name` values throw and abort. On a tool sold as keyboard-fast, a 180 ms navigation animation is a cost with no benefit.
- **Motion `layoutId`** is used for exactly one thing: the severity chip and fingerprint morphing from a findings-table row into the finding-detail sticky header. `--dur-2`, tween (not spring), `--ease-snap`. **S.** This reinforces M3 (identity survives) and is the one place a morph earns its frames.
- Arriving at `/findings/:id` from a `proven` badge **auto-anchors to the Proof section** with `scroll-behavior: auto` (instant). Next 16 removed automatic smooth scrolling; do not opt back in.

---

### 4.5 Scroll-reveal (marketing)

**One batched trigger for the entire page.** Never one trigger per card.

```ts
ScrollTrigger.batch('[data-reveal]', {
  start: 'top 84%',
  once: true,                 // reveals NEVER reverse on scroll-up
  onEnter: (batch) => gsap.to(batch, {
    autoAlpha: 1,
    duration: 0.42,           // --dur-4
    stagger: 0.06,            // --stagger-sibling
    ease: 'customInstrument', // registered from --ease-instrument
    overwrite: true,
  }),
});
```

| Property | Value |
|---|---|
| Trigger | element top crosses 84 % of viewport height, once |
| Properties | `opacity` only. **No translate, no scale.** |
| Duration | `--dur-4` (420 ms) |
| Easing | `--ease-instrument` |
| Stagger | `--stagger-sibling`, capped at 6 |
| Compositor | **S** |
| Reverse | never |

Opacity-only reveals are vestibular-safe by construction, which means the reduced-motion variant is a duration change rather than a redesign (§5).

---

### 4.6 The hero — THE PROOF BENCH replay

**The single most important sequence in the product.** Built **paused-timeline-first and keyboard-bound before scroll is wired** (BLAST DOOR graft 5) so the money shot is frame-identical on demand.

#### 4.6.1 Bindings

| Input | Behaviour |
|---|---|
| `document.fonts.ready` + first view | plays once |
| **`P` key** | replays the proven sequence from t=0, frame-identical |
| **`D` key** | plays the **disproven counter-demo** (§4.6.3) |
| Panel hover | replays, throttled to once per 6 s |
| `R` key | alias for `P` (COLD LIGHT's published binding; both are bound) |

All four call `tl.restart()` on a single `gsap.timeline({ paused: true })`. There is no scroll dependency on this sequence at all — the hero is fully functional with `overflow: hidden` on `<body>`.

#### 4.6.2 The proven sequence (total 4200 ms, then a 4000 ms hold)

| t (ms) | Beat | Properties | Duration | Easing | Compositor |
|---|---|---|---|---|---|
| 0 | **Scan line begins.** A 2 px `--signal-hi` bar at 60 % opacity with a 24 px falloff gradient below it | `transform: translateY(0 → panelHeight)` on **one element** | `--dur-5` (1400) | **`--ease-mass`** | S |
| 0 / 120 / 240 (per pane, offset by scan arrival) | Terminal row groups ignite as the scan crosses them | `opacity 0.35 → 1` on **three stepped groups per pane**, never 60 individual delays | `--dur-1` | `--ease-instrument` | S |
| 400 | Pane A (base SHA) left rail wipes in | `transform: scaleY(0→1)`, `transform-origin: top`, `--signal-lo` | `--dur-4` | `--ease-instrument` | S |
| 1400 | Pane B (head SHA) left rail wipes in, `--alarm` | same | `--dur-4` | `--ease-instrument` | S |
| 1900 | `1 failed in 0.39s` gets a 1 px `--alarm` underline | `transform: scaleX(0→1)`, origin left | `--dur-3` | `--ease-instrument` | S |
| **2200** | **THE STAMP.** Chip flips `--ink-8`/`--rule-2` → solid `--signal`, `--ink-0` text | `background-color`, `color`, `border-color` | **`--dur-0`** | *none* | P |
| 2200 | paired scale | `transform: scale(1.045) → scale(1)` | `--dur-2` | `--ease-snap` | S |
| 2400 | `→ blocks merge` appears in `--alarm` | `opacity 0 → 1` | `--dur-1` (160) | `--ease-instrument` | S |
| **2400 → 6400** | **THE HOLD.** Absolutely nothing moves except the heartbeat dot. | — | 4000 | — | — |
| 6400 | idle | — | — | — | — |

**What does not animate, deliberately:**
- The **provenance footer** (`GET /v1/reviews/4e8b1d0/result → findings[0].proof`) is present and at full opacity from frame 0. Animating it in would undercut the claim that the data *has a source*.
- The **section index header** (`/ 01 — PROOF BY EXECUTION`) is static.
- The **stat strip** numbers (`execution-verified precision 0.91 (n=312)`) do **not** count up (§4.10.1).

> **The 4-second hold is the point** (Exhibit graft 2). Without it the sequence is a demo of animation. With it, it is a machine returning a result and then sitting still, which is the whole brand. Do not shorten it to "keep energy up."

#### 4.6.3 The `D` key — DISPROVEN counter-demo (BLAST DOOR graft 6)

Identical geometry, identical timing, different data. Ten seconds of the system publicly losing an argument with itself.

| t (ms) | Beat | Properties | Duration | Easing | Compositor |
|---|---|---|---|---|---|
| 0–1400 | Identical scan line | as above | `--dur-5` | `--ease-mass` | S |
| 1400 | Pane B rail wipes in **`--signal-lo`**, not `--alarm` | `scaleY(0→1)` | `--dur-4` | `--ease-instrument` | S |
| 1900 | The **claim strikes through** — a 1 px rule across the finding title | `transform: scaleX(0→1)`, origin left | `--dur-3` | `--ease-instrument` | S |
| **2200** | Chip stamps `DISPROVEN` — **cyan OUTLINE**, `--signal` border + `--signal` text, transparent fill, struck-through vial glyph | colour set | **`--dur-0`** | *none* | P |
| 2200 | paired scale | `scale(1.045) → 1` | `--dur-2` | `--ease-snap` | S |
| 2400 | Caption `refuted by execution` appears | `opacity 0 → 1` | `--dur-1` | `--ease-instrument` | S |
| 2400 | Verdict rail reads `gate stays clear · 0 proven · 1 self-refuted` | `--dur-0` colour, `--dur-3` scaleX expand | mixed | `--ease-instrument` | P + S |
| 2400 → 6400 | **HOLD, 4000 ms** | — | — | — | — |

Proven and disproven **share the `--signal` hue** because both are execution results. The difference is **fill vs outline plus a mandatory glyph**, made legible in motion by running the two sequences back to back. Ship the printed legend anyway — cleverness that needs explaining costs comprehension.

**Backend dependency, day zero:** the fixture corpus must contain at least one genuinely disproven finding and one delivery-ladder fallback (an `inline_nearest` and a `commit_status`). A demo showing 100 % proven and four lit ladder rungs is worse than not shipping these sections.

---

### 4.7 The pinned pipeline — the ONE scroll-jacked section

```ts
ScrollTrigger.create({
  trigger: '#pipeline',
  start: 'top top',
  end: '+=220%',
  pin: true,
  scrub: 0.5,                    // a NUMBER, not true — the 0.5s catch-up is the expensive read
  snap: {
    snapTo: [0, .111, .222, .333, .444, .556, .667, .778, .889, 1],
    duration: 0.22,
    delay: 0.04,
    ease: 'power1.inOut',
    directional: true,
  },
  anticipatePin: 1,
  invalidateOnRefresh: true,
});
```

| Aspect | Spec |
|---|---|
| Timeline total length | **exactly 1.0**, each stage occupying **0.1111** — so scroll progress and stage progress are the same number, which is precisely what lets `<StageRail>` be driven by `(stage_index - 1 + stagePhase) / stage_total` in the dashboard |
| Edge draw | every SVG edge carries `pathLength="1"`; one keyframe `stroke-dashoffset: 1 → 0` drives an 80 px fork and a 2400 px spine at **identical perceived speed** |
| Travelling packet | duplicate overlay path, `stroke-dasharray="0.06 0.94"`, `stroke-dashoffset: 1 → 0` |
| Hairline preservation | `vector-effect="non-scaling-stroke"` on every stroke |
| S3 fan-out | four lanes draw **simultaneously**; completion staggered `0 / 60 / 120 / 180 ms`. Stagger is on completion only — they genuinely run in parallel and the caption reads `wall clock = max(lane), not sum` |
| Stage stagger | `--stagger-stage` (120 ms) |
| Scrubbed easing | **`linear`**, always |
| Active station | `--signal` ring, `opacity` + `transform` only |
| S8 delivery ladder | rungs light `inline_exact → inline_nearest → file_level → summary_only`; the rung that actually fired is solid, skipped rungs are ghosted at 0.35 opacity, plus a `0 silently dropped` badge |
| S9 gate | everything else `filter: saturate(0.3)` over `--dur-3`; gate pill flips at `--dur-0` + `--dur-3` scaleX expand |
| Compositor | **S** for all of the above except `stroke-dashoffset`, which is **paint** — see cap below |
| Concurrency cap | **≤ 6 paths animating `stroke-dashoffset` simultaneously.** The other nine sit in their static end state. |
| Below 1024 px | **unpinned**, no scrub. Nine per-stage reveals at `start: 'top 78%'`, `once: true`, opacity-only, `--dur-3`. The timeline is never *constructed* — `gsap.matchMedia()` gates it. |
| Accessibility | a real `<ol>` of the nine stage names is rendered behind the SVG — free SEO, free screen-reader support, and something no competitor's animated diagram provides |

**This is the only pinned section on the entire site.** Nothing else scroll-jacks. `~2700 px` of pinned scroll is the whole budget.

---

### 4.8 Product mechanics

#### 4.8.1 The severity instrument (M2)

| Element | Trigger | Properties | Duration | Easing | Stagger | Compositor |
|---|---|---|---|---|---|---|
| Six weighted segments | in-view once, or `progress` prop | each segment's **fill layer** `transform: scaleX(0 → 1)`, `transform-origin: left` | `520ms`* | `--ease-instrument` | `--stagger-sibling` | **S** |
| Threshold ticks (`.15/.35/.55/.75`) | after segments settle | `opacity 0 → 1` | `--dur-3` | `--ease-instrument` | — | S |
| 3rem readout | the instant the bar crosses the final tick | value **snaps** to `0.81` | `--dur-0` | *none* | — | P |
| Band label | same instant | colour + text swap | `--dur-0` | *none* | — | P |
| Segment hover | pointerenter | segment lightens one chroma step; the matching clause in the generated sentence gets a 1 px underline `scaleX(0→1)` | `--dur-1` | `--ease-snap` | — | P + S |
| List-row sparkline (20 px, 6 segments) | — | **static**, never animates | — | — | — | — |

\* `520ms` is the one authored value that sits off the duration grid, inherited from the published COLD LIGHT spec. **Resolution: round it to `--dur-4` (420 ms).** Six segments at 420 ms with a 60 ms stagger totals 720 ms, which is already at the edge of a judge's attention. The grid is not negotiable for one element's vanity.

> **Never animate `width`.** Each segment is laid out at its final width in a flex row; a solid-fill child is `scaleX`'d. A `clip-path: inset(0 100% 0 0) → inset(0 0 0 0)` reveal of the whole track is the permitted compact alternative where per-segment stagger is not wanted (list rows, 320 px cards) — also **S**.

#### 4.8.2 The audit chain rail (M4)

| Element | Trigger | Properties | Duration | Easing | Compositor |
|---|---|---|---|---|---|
| Rail draw | in-view once | `stroke-dashoffset 1 → 0` on a `pathLength="1"` rail | `--dur-4` | `--ease-instrument` | P (one path) |
| Event rows | after rail | `opacity 0 → 1` | `--dur-3` | `--ease-instrument` | S |
| Row stagger | — | `--stagger-sibling`, capped 6 | — | — | — |
| Row expand (prev_hash + canonical JSON + recomputed hash) | click / Enter | height via Motion `layout` on an isolated subtree | `--dur-2` | tween `--ease-snap` | P (bounded) |
| **New event arrives live** | API | `opacity 0 → 1` + the rail segment extends `scaleY(0→1)` | `--dur-2` | `--ease-instrument` | S |
| Hash copy | click | glyph swap `--dur-0`, holds 1400 ms, reverts `--dur-exit` | mixed | `--ease-exit` | P |

#### 4.8.3 The tamper control — TAMPER BY TYPING (Exhibit graft 3)

**The interaction that wins the Q&A.** A judge changes `"severity": 0.81` to `0.80` with their own keyboard.

| Beat | Trigger | Properties | Duration | Easing | Compositor |
|---|---|---|---|---|---|
| Recompute | `input` on the contenteditable, **debounced 120 ms**, `crypto.subtle.digest('SHA-256', …)` across the whole chain | — | — | — | — |
| **Header flips** | chain invalid | `chain.verified = false · broken_at_seq = 1428`, colour → `--alarm` | **`--dur-0`** | *none* | P |
| **The rail breaks** | same | a **6 px physical gap** — implemented as `transform: translateY(6px)` on the below-break rail segment, *not* a margin change | `--dur-2` | `--ease-snap` | **S** |
| Below-break desaturate | same | `filter: saturate(0.25)` on the container | `--dur-3` | `--ease-instrument` | **S** |
| Hash diff expands | same | `opacity 0 → 1`; `expected a91f3c2e…` over `computed 4d81b0c7…` with the **first differing nibble** on an `--alarm-tint` background | `--dur-3` | `--ease-instrument` | S |
| `↻ restore` | click | everything reverses; header returns at `--dur-0` | `--dur-2` | `--ease-snap` | S |

> The gap is a `transform`, not a layout change, so the recompute-on-every-keystroke loop never triggers reflow. This matters: a judge holding a key down must not make the page stutter — that would refute the product live.

#### 4.8.4 Fingerprint identity demo (M3)

Three commits cross-fade on a 3.2 s loop (`opacity` only, **S**) while the `sha256(category|rule_key|symbol_path|shape_hash)` string stays **pinned and absolutely static**. The stillness of the hash against the moving code *is* the argument; if the hash so much as re-renders, the demo is weaker. Loop pauses via IntersectionObserver; under reduced motion it becomes a three-position stepper with a `Next ▸` control.

#### 4.8.5 Suppression ledger

- Row add: `opacity 0 → 1`, `--dur-2`, **S**.
- Revoke: a 1 px strike-through `scaleX(0→1)` over `--dur-3`, plus the row drops to `opacity 0.45` over `--dur-3`. **The row is never removed.** Append-only must *look* impossible to delete.
- No `AnimatePresence` exit animation exists on this list, by design.

---

### 4.9 Live run (dashboard)

Polling at **1.2 s**, backing off to 4 s after 90 s, `false` on terminal states. Never SSE (a dead `EventSource` mid-demo is a silent, unrecoverable failure; a 1.2 s poll survives a four-second wifi blip).

#### 4.9.1 Stage advance

| Element | Trigger | Properties | Duration | Easing | Compositor |
|---|---|---|---|---|---|
| Active station ring | `stage_index` increments | `opacity` + `transform: scale(1 → 1.06 → 1)` | `--dur-2` | `--ease-snap` | S |
| Completed connector | same | `stroke-dashoffset` completes to 0 | `--dur-2` | `--ease-instrument` | P |
| In-flight connector | every poll | `stroke-dashoffset` creeps to `stagePhase = clamp(secondsSinceHeartbeat / expectedSeconds[stage], 0, 0.92)` | `--dur-2` | `linear` | P |
| Stage label | `stage_index` change **only** | text swap, `--dur-0` | `--dur-0` | — | P |
| Waterfall bar (S3 → four lanes) | duration known | `transform: scaleX()`, origin left | `--dur-2` | `--ease-instrument` | S |

> Rendering the rail from `stage_index` as a **monotonic progress value** rather than as discrete events means a stage that completes inside one 1.2 s tick simply animates further, instead of being skipped. This is the single detail that makes polling look like streaming.

#### 4.9.2 Heartbeat dot — the only loop in the product

```css
@keyframes tick { 0%, 100% { opacity: .35 } 12% { opacity: 1 } }
.heartbeat {
  animation: tick var(--heartbeat-period) steps(1, end) infinite;
}
```

- Period is written from **real telemetry** onto the element (never `:root`).
- `steps(1, end)`, not an ease — an instrument ticks, it does not breathe.
- 6 px, `--signal`, the only pill-shaped element in the entire product.
- **A pulsing dot that pulses when nothing is happening is a lie.** This one is driven by the wire.

#### 4.9.3 Degraded / stalled

| Age since last output | Dot | Text | Transition |
|---|---|---|---|
| < 10 s | `--signal`, ticking | `12s since last output` in `--text-dim` | — |
| 10–20 s | `--marker`, ticking | same, `--marker` | `--dur-1` colour, P |
| **> 20 s** | **`--marker`, animation stops entirely** | `21s since last output` + a `Re-run` affordance appears `opacity 0→1` `--dur-3` | `--dur-0` colour flip, S for the affordance |
| degraded stage | connector switches to `--marker` dashed, slow marching-ants `stroke-dashoffset` loop at 2600 ms `linear` | degradation listed in the right rail | P, ≤ 1 path at a time |

A 1 Hz text ticker updates the seconds count. The ticker writes **only a text node**, never a class, never a style.

#### 4.9.4 The gate

**There is no green.** Correcting the brief: `gate clear` is **achromatic** — `--text-body` on `--ink-1` with a 1 px `--signal-lo` underline. Refusing GitHub's green check three pixels away in a PR tab is both a differentiator and a legibility win.

| Transition | Properties | Duration | Easing | Compositor | A11y |
|---|---|---|---|---|---|
| clear → **blocked** | `background --alarm-tint`, `border --alarm`, `color --alarm-hi` | **`--dur-0`** | *none* | P | `role="alert"` fires — **the only `role="alert"` in the product** |
| paired | `transform: scale(1.045) → 1` | `--dur-2` | `--ease-snap` | S | — |
| label expands (`gate · blocked · 1 proven`) | `transform: scaleX()` on a track + label cross-fade | `--dur-3` / `--dur-1` | `--ease-instrument` | S | — |
| blocked → clear | reverse, `--dur-0` colour | `--dur-0` | *none* | P | `role="status"` |
| break-glass override | magenta is **not** in this palette; override rows use `--marker` + a wax-seal glyph + a wider row | `--dur-2` | `--ease-snap` | P | logged, announced politely |

`--alarm` appears **at most once per screen, by design.** Scarcity is what makes it loud.

#### 4.9.5 The proof terminal — streaming

**Marketing hero: nothing types.** The panes are rendered complete at frame 0 and the scan line reveals three stepped row-groups per pane. Typing animation is banned there: it delays the payoff past the three-second window and it fakes a process that already finished.

**Dashboard live run: genuine append.**

| Aspect | Spec |
|---|---|
| Trigger | new rows arrive from the poll |
| Properties | `opacity 0 → 1` on appended rows only. **No translate. No height animation.** |
| Duration | `--dur-1` |
| Easing | `--ease-instrument` |
| Burst cap | during a burst, only the **last 40 rows** animate; earlier rows appear at opacity 1 immediately |
| Autoscroll | pinned to bottom unless the user has scrolled up ≥ 1 row, then a `↓ 14 new lines` affordance appears |
| ANSI | parsed by `anser` with `use_classes: true` into our own CSS classes, rendered into a virtualized `<pre>` |
| Never | `xterm.js`. It is 5.65 MB, owns its scrollback and sizing, and fights SSR, virtualization, selection and theming for a static captured artifact. |
| Wrapping | **off**. Horizontal scroll inside each pane. Wrapping destroys traceback alignment. |
| A11y | `role="log"` with `aria-busy="true"` during bursts, flipped false when settled |
| Compositor | **S** |

---

### 4.10 Numbers and text

#### 4.10.1 Numbers — the refusal

**No number in this product counts up, ever.**

- `/accuracy` metrics: rendered at final value. `execution_verified_precision 0.91 (n=312)` with its definition as always-visible 13 px body text and a Wilson interval as a hairline error bar (Exhibit graft 4). The error bar does not animate either.
- Severity readout: **snaps** at `--dur-0`.
- Live cost (`usd_estimate`, `input_tokens`, `output_tokens`, `cache_read_tokens`): the value **replaces instantly** on each poll. No digit roll, no odometer, no `@number-flow`.
- Every numeral, everywhere, is `font-variant-numeric: lining-nums tabular-nums slashed-zero` on Google Sans Code with `letter-spacing: 0`.

> A metric that spins while a judge reads it is decoration on the one surface that must read as rigorous. Fewer than 1 % of pages set tabular figures; on a product full of live-updating costs and scores, jittering digits are the fastest way to look improvised. **The refusal to animate the numbers is the point.**

#### 4.10.2 Text reveals

- Body/heading reveal: `opacity 0 → 1`, `--dur-4`, `--ease-instrument`, no translate. **S.** That is the entire vocabulary.
- **Per-character and per-word reveals are banned.** `SplitText` is not imported. An unmanaged split turns an `<h1>` into 47 individually-announced characters for a screen reader, and CodeRabbit already ships a per-letter rotating headline — arriving with the same gimmick reads as imitation of the incumbent.
- **Hash/text scrambles are banned.** `ScrambleTextPlugin` is not imported. A scrambling `event_hash` implies computation that is not happening, fights click-to-copy and text selection, and is exactly the kind of "looks like proof" gesture this product exists to replace with actual proof. The hash is rendered as `a91f3c2e…8b4d`, static, with click-to-copy.
- Strike-throughs (disproven claim, revoked suppression) are a 1 px rule `scaleX(0→1)` over `--dur-3` from the left. **S.**

---

## 5. `prefers-reduced-motion` — a designed second state

Implemented **once**, as `@media (prefers-reduced-motion: reduce)` **plus** a `[data-motion="reduced"]` attribute on `<html>`, so the OS preference and the visible footer toggle share one code path. GSAP timelines are constructed inside `gsap.matchMedia()` with a `reduce` condition so they are **never built at all**; Motion uses `<MotionConfig reducedMotion="user">`.

**`* { animation: none !important }` is explicitly forbidden.** It is worse than doing nothing: any element whose visible state is produced *by* the animation stays at its initial state.

| Animation type | Reduced variant — what it becomes |
|---|---|
| **Hero scan line** | Never runs. The bench is already in its end state at frame 0 — proven chip stamped, `→ blocks merge` present. **Nothing is lost**, because the designed state and the end state are the same frame. This is the structural payoff of §0 rule 1. |
| **`P` / `D` key replays** | Both keys still work. They advance the sequence **beat by beat on keypress**, with zero tweening — press `P` repeatedly to step through scan → rails → stamp → verdict. The demo survives intact. |
| **Pinned pipeline** | Section **un-pins** and enters normal document flow at natural height. All nine stages render complete, S3 fan-out drawn, S8 ladder lit, gate red. A `Step ▸ / ◂ Back` control walks the nine states with no tweening. |
| **Scroll-reveal** | `opacity 0 → 1` over `--dur-1` (120 ms) with zero translate. Opacity-only is vestibular-safe, so this is a duration change, not a redesign. |
| **Section rule draws** | Rendered at full width, no `scaleX`. |
| **Severity contribution bar** | Renders at full value immediately, threshold ticks visible, readout at `0.81`. Hover clause-highlighting still works. |
| **Audit chain rail draw** | Rail rendered complete. Row expand still animates at `--dur-1` (it is user-initiated and small). |
| **Tamper break** | The 6 px gap, the desaturate and the header flip **all still happen**, because they are the *result* the user asked for. The `--dur-3` desaturate drops to `--dur-1`. A state change caused by the user's own keystroke is not gratuitous motion. |
| **Fingerprint 3-commit loop** | Loop stops. Becomes a three-position stepper with an explicit `Next ▸` control; the pinned hash still does not move. |
| **Heartbeat dot** | Animation stops; the dot renders static at `opacity 1`. **The numeric age keeps ticking as text** (`12s since last output`) — the information survives, the motion does not. |
| **Terminal streaming append** | Rows appear at opacity 1, no fade. Autoscroll becomes instant. |
| **Verdict / gate 0 ms flip** | **Unchanged.** A 0 ms colour change is not motion. The paired `scale(1.045) → 1` is dropped. |
| **Chips, buttons, rows, hover** | Colour transitions kept at `--dur-1` (colour is not vestibular). All `transform` dropped: no press `translateY`, no tooltip `translateY`, no dropdown `scaleY`. |
| **Dialogs / palette / toasts** | `opacity` only, `--dur-1`. No `scale`, no translate. |
| **`layoutId` morph** | Disabled — the chip appears in its destination position instantly. |
| **Delivery-ladder rung reveal** | All rungs render in final state, lit/ghosted, immediately. |
| **Marching-ants degraded connector** | Static dashed line in `--marker`; the `21s since last output` text carries the state. |
| **Skeletons** | Unchanged — they never animated. |

**The footer toggle is a demo asset.** It sits in the marketing footer alongside the contrast toggle, writes `data-motion="reduced"` and takes effect on the next frame. A judge flipping it and watching the product remain fully legible is a ten-second moment that signals maturity more cheaply than any animation.

---

## 6. Performance rules

### 6.1 The compositor contract — enforced as lint

**Permitted per frame:** `transform`, `opacity`, `clip-path`, `filter`.

**Banned per frame, categorically:**
`width`, `height`, `top`, `left`, `right`, `bottom`, `margin`, `padding`, `border-width`, `box-shadow`, `background-position`, `background-size`, and any property that triggers layout.

**Bounded, not banned:** `background-color`, `color`, `border-color`, `stroke-dashoffset`.
- Permitted as a **one-shot transition ≤ 240 ms on a single element** (this is the hover language, §7).
- **Never** tweened across a scroll scrub.
- **Never** more than **6 elements** transitioning colour simultaneously (chip stagger is capped at 6 for exactly this reason).
- `stroke-dashoffset` is paint: **≤ 6 paths animating simultaneously** in the pipeline; the remaining nine sit static.

**Never animate a CSS custom property on `:root`.** It triggers style recalculation across the entire invalidated subtree — one documented case forced recalc on 1,300+ elements at ~8 ms/frame. `--heartbeat-period` is written to the heartbeat element; the pipeline's scrub progress is written to the SVG container; neither touches `:root`.

**`will-change` discipline:** added imperatively immediately before a timeline plays, removed in `onComplete`. Never present in a stylesheet. A hundred 500×500 CSS-px cards permanently promoted is ~400 MB of texture memory on a DPR-2 display.

### 6.2 Layer budget

| Surface | Max concurrently promoted layers | What they are |
|---|---|---|
| Marketing hero | **3** | scan line, sticky header, the one hovered panel |
| Pinned pipeline | **3** | the pinned container, the active station, the travelling packet |
| Dashboard | **2** | sticky header, the `j`/`k` selection indicator |

**`backdrop-filter` in exactly two places in the entire product:** the sticky header and the ⌘K palette, both at `blur(16px)` maximum, **never animated, never over live scrolling data.** Cost scales with both blurred area and radius, and stacked layers multiply.

### 6.3 INP

Target: **≤ 200 ms p75**, measured on the production domain under 4× CPU throttle.

| Lever | Rule |
|---|---|
| Keyboard nav | `j`/`k` moves **one** absolutely-positioned indicator via `transform`. It does not re-render the table. |
| Polling | the 1.2 s poll must not re-render the findings table. Select only rows whose data changed; `<StageRail>` takes a number, not an object. |
| Virtualisation | TanStack Virtual above ~400 rows on the findings table, the diff, the terminal and the audit chain — one primitive, four surfaces. |
| Long tasks | any handler projected over 50 ms splits with `setTimeout` + `requestAnimationFrame`. `scheduler.yield()` is used **only** behind a feature check — it has zero Safari support. |
| Below-fold | `content-visibility: auto` + `contain-intrinsic-size` on sections 04–09 and on long finding lists. |
| LCP | the `<h1>` is the LCP element and sits **outside every Suspense boundary**. React can fall back to a boundary you did not expect under a slow network; a boundary above the headline is a self-inflicted regression. |
| Live regions | `role="status"` on the stage label announces **only on `stage_index` change**, never on every 1.2 s poll. The live region is rendered empty in the shell, before any content changes, or nothing is announced at all. |

### 6.4 "How the canvas is loaded"

**There is no canvas.** Zero `<canvas>`, zero WebGL, zero shaders, zero video, zero runtime-vector players on either surface. The "cinematic" read is delivered by:

- **Graph paper substrate** — two repeating `linear-gradient`s, 1 px lines at `oklch(1 0 0 / 0.028)`, 8 px minor / 64 px major. Static. Painted on the section background, never on a promoted layer. Under 1 KB, no image request, and it is what stops a large dark gradient from banding and from reading as an unstyled div.
- **Grain** — one inline `feTurbulence` (`type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"`, 180×180 tile, opacity 0.035, `mix-blend-mode: overlay`). **Bounded to named sections. Never `position: fixed; inset: 0` across the document** — an unbounded per-pixel-computed filter on a 3× phone is a multi-megabyte GPU texture. `numOctaves` never exceeds 3. `baseFrequency` and `seed` are never animated.
- **One static radial** behind the hero bench. It never animates.
- **Depth** — one rung on the ink ladder + a 1 px hairline + `inset 0 1px 0 oklch(1 0 0 / 0.06)`. Zero drop shadows outside the two overlay surfaces.

This is the concession that must be *sold*, not assumed. The prepared sentence: *"Of 22 elite dark dev-tool sites surveyed, essentially none ship a WebGL hero; CodeRabbit's cinematic 3D is a conic gradient over flat panels at 2–12 % white; and for a product whose claim is that it executes code, a floating abstract object is the visual form of an unfalsifiable assertion."*

### 6.5 Mobile motion budget (< 768 px, and `pointer: coarse`)

| Rule | Value |
|---|---|
| Pinned pipeline | **off** below 1024 px — timeline never constructed |
| Hero scan | runs **once** on first view via IntersectionObserver, then never again |
| Scroll-reveal | `--dur-1` (120 ms), opacity-only |
| Hover language | entirely absent — every hover rule is inside `@media (hover: hover)`, which Tailwind v4 applies to `hover:` automatically |
| Grain | opacity drops to 0.02; graph paper to 0.02 |
| Heartbeat | kept (1 px, opacity-only, negligible) |
| Terminal | 12 px / 20 px, horizontal scroll inside each pane, `--dur-1` row append |
| Promoted layers | **1** |
| Marketing first-party JS | ≤ 170 KB gz before any (nonexistent) 3D chunk |
| Dashboard shell | ≤ 250 KB gz |

---

## 7. Hover language

**One system. Six classes. Every hover in the product belongs to exactly one.**

The invariants, which hold for every class without exception:

- **Duration is always `--dur-1` (120 ms).** No hover is faster; no hover is slower.
- **Easing is always `--ease-snap`.**
- **Nothing translates. Nothing scales. Nothing glows. Nothing gains a shadow.**
- **Surfaces step exactly one rung on the ink ladder. Never two.**
- Every rule lives inside `@media (hover: hover)`.
- Exit uses the same duration and easing — hover-out is symmetric, not faster.

| Class | Elements | On hover | Compositor |
|---|---|---|---|
| **A — Evidence frames** | proof bench, exhibit panels, finding-detail proof pane, audit chain frame | 1. corner registration marks `0.10 → 0.22` alpha<br>2. hairline `--rule-1 → --rule-2`<br>3. **fill does not change** | P |
| **B — Interactive surfaces** | cards, table rows, list items, ledger rows, stage stations | 1. fill one rung (`--ink-2 → --ink-3`)<br>2. hairline `--rule-1 → --rule-2`<br>3. no registration marks | P |
| **C — Controls** | buttons, chips, toggles, tabs, palette items, ladder rungs | 1. fill one rung (or `--signal → --signal-hi` on primary)<br>2. border one rung (`--rule-2 → --rule-3`)<br>3. `:active` adds `transform: translateY(0.5px)` at 90 ms | P (+ S on press) |
| **D — Text links** | inline prose links, breadcrumb segments, file:line references | 1. colour `--text-dim → --text-primary`<br>2. a 1 px `::after` rule `scaleX(0→1)` from the left (retracts to the right on exit) | P + S |
| **E — Data atoms** | hashes, SHAs, fingerprints, `file:line`, seq numbers, severity segments, terminal lines | 1. `background: oklch(1 0 0 / 0.04)`<br>2. `cursor: copy` (or `pointer` for navigable atoms)<br>3. **no border change, no fill step**<br>4. severity segments additionally lighten one chroma step and underline the matching clause in the generated sentence | P |
| **F — Inert** | headings, body copy, static labels, provenance lines, section indices, registration marks on non-evidence frames | **nothing** | — |

### Why this is the whole system

Because there is exactly one surface-step, one hairline-step and one duration, a hover in PRGuard reads as *the instrument acknowledging your pointer* rather than as an element performing. The registration marks (Class A) are the single ownable hover detail in the product — they exist nowhere else in the category — and they are reserved for evidence frames precisely so that the gesture keeps meaning something. The moment they appear on a button, the system becomes a template.

**What is deliberately absent from hover:** no lift, no shadow bloom, no border glow, no gradient sweep, no cursor-tracked spotlight, no magnetic pull, no scale, no colour *animation* over more than 120 ms, no sound. Every one of those is available; refusing all of them is the point of view.

---

## Appendix A — Motion inventory (the complete moving-pixel census)

| # | Motion | Surface | Tier | Compositor | Cuttable? |
|---|---|---|---|---|---|
| 1 | Hero scan line | marketing | `--dur-5` | S | **never** |
| 2 | Verdict stamp (0 ms + scale) | both | `--dur-0` + `--dur-2` | P + S | **never** |
| 3 | `D`-key disproven counter-demo | marketing | as #1 | S | 2nd-to-last |
| 4 | Pipeline scroll scrub | marketing | `linear` | S + P | **cut #1** |
| 5 | Pipeline live driver | dashboard | `--dur-2` | S + P | **never** (dashboard needs it) |
| 6 | Severity contribution bar | both | `--dur-4` | S | **never** |
| 7 | Tamper break | both | `--dur-2`/`--dur-3` | S | **never** |
| 8 | Chain rail draw | both | `--dur-4` | P | keep |
| 9 | Heartbeat dot | both | `--heartbeat-period` | S | **never** |
| 10 | Gate flip | both | `--dur-0` + `--dur-2` | P + S | **never** |
| 11 | Scroll-reveal batch | marketing | `--dur-4` | S | keep |
| 12 | Section rule draws | marketing | `--dur-4` | S | cut #3 |
| 13 | Fingerprint cross-fade loop | marketing | 3.2 s loop | S | cut #4 |
| 14 | Terminal row append | dashboard | `--dur-1` | S | keep |
| 15 | Hover language (all 6 classes) | both | `--dur-1` | P | **never** |
| 16 | Focus ring | both | `--dur-1` | P | **never** |
| 17 | `j`/`k` indicator | dashboard | `--dur-1` | S | **never** |
| 18 | `layoutId` chip morph | dashboard | `--dur-2` | S | cut #2 |
| 19 | Palette / dialog / toast enter-exit | both | `--dur-2`/`--dur-exit` | S | keep |
| 20 | Delivery-ladder rung reveal | both | `--dur-3` | S | keep |

**Cut order under pressure:** (1) pipeline scroll scrub → static diagram with stage hover, (2) `layoutId` morph, (3) section rule draws, (4) fingerprint loop, (5) the `D`-key counter-demo. **Never cut #1, #2, #6, #7, #9, #10, #15, #16, #17.**

---

## Appendix B — Open decisions this spec closes

| Question | Decision |
|---|---|
| `--ease-mass` collides with `--ease-instrument` | Retuned to `cubic-bezier(0.52, 0, 0.08, 1)`, scan line only, with a one-line escape hatch (§2.1). |
| React pin | **19.2.0** exactly, with `overrides`. `AnimateView` is not used, so 19.3 buys nothing. |
| One animation library or two | **Two, split by route group, enforced by `no-restricted-imports`** — not by discipline. Note that Next 16 removed `next lint`, so this must be wired in CI explicitly or it is unenforced. |
| Smooth scroll | **None.** This also deletes the entire `gsap.ticker` / `lagSmoothing(0)` integration surface. |
| View Transitions API | **Not shipped.** Motion `layoutId` covers the one morph that earns its frames. |
| Count-up numbers | **Banned.** The refusal is the message (§4.10.1). |
| Text scramble on hashes | **Banned.** It implies computation that is not happening — self-refuting on this product. |
| Green pass state | **Does not exist.** Gate clear is achromatic on a cyan underline. |
| `520ms` severity segment (off-grid) | **Rounded to `--dur-4` (420 ms).** The grid is not negotiable for one element. |
| Projector variant | `[data-contrast="high"]` promotes every hairline to solid `--ink-7` (#595E64, 3.03:1). **Built on day one alongside the token file**, not in the day-six polish block — four lines of CSS if the tokens are semantic, a rewrite if they are not. Switch to it before walking on stage. |

---

## Appendix C — Definition of done

- [ ] Every `cubic-bezier()` in the codebase is a token reference. Zero literals. (grep)
- [ ] Every duration is one of the seven tokens. (grep for `ms` / `s` in transition and GSAP `duration`)
- [ ] Zero `opacity: 0` and zero `visibility: hidden` in authored CSS. (grep)
- [ ] `anim-armed` / `anim-ready` handshake verified by throttling the GSAP chunk to 0 bytes in devtools.
- [ ] Zero `outline: none` / `outline-hidden`. (grep)
- [ ] `will-change` absent from all stylesheets. (grep)
- [ ] No CSS custom property animated on `:root`. (grep for `:root` in keyframes)
- [ ] GSAP absent from the `app/(app)/` bundle; Motion absent from `app/(marketing)/`. (bundle-analyzer)
- [ ] `P` and `D` keys replay frame-identically ten times in a row.
- [ ] `[data-motion="reduced"]` produces a complete, legible page in every section — checked by screenshot, not by assertion.
- [ ] `[data-contrast="high"]` checked on an actual projector.
- [ ] Reduced-motion `P`-key beat-stepping works.
- [ ] Marketing route ≤ 170 KB gz first-party JS; dashboard shell ≤ 250 KB gz.
- [ ] INP ≤ 200 ms on the findings table under 4× CPU throttle, measured on the **production domain** (Vercel bytecode caching and pre-warming are production-only).
- [ ] The hero reads correctly as a **still image** — if it does not, it does not read in three seconds either.
- [ ] A 90-second MP4 of the proven-bug moment sits on the demo machine's desktop.