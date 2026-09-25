# Build Plan — PRGuard frontend (marketing site + internal dashboard)

- **Run ID:** 2026-09-23-prguard-frontend
- **Design docs (authoritative, do not re-litigate):** `docs/design/00-decisions.md` → `06-*.md`
- **Backend (authoritative for API shapes):** `docs/specs/2026-09-14-pr-reviewer-v1-spec.md` §6
- **Status:** awaiting `execute`
- **Frontend root:** `web/` (the repo root already holds the Python package in `src/`)

**Whole-project VERIFY:**

```
npm run verify
```

which is `tsc --noEmit && eslint . && vitest run && npm run tokens:verify && npm run api:check && next build`.

**Binding condition, inherited in spirit from the backend plan:** VERIFY must pass **with the
FastAPI backend stopped**. `NEXT_PUBLIC_FIXTURES=1` is the default in test and CI, and every track's
VERIFY subset below holds under it. A frontend that cannot build without a live backend cannot be
demoed on venue wifi.

> Two setup exceptions, stated once so no builder is surprised: `npm install` runs **once with
> network** in T0, and `npm run api:gen` runs **once against a live backend** in T2 to emit the typed
> client, which is then **committed**. After that, everything is offline. Both happen in their named
> track and nowhere else.

---

## 1. The constraint, and how this plan dissolves it

**The problem.** Three components — `<ProofBench>`, `<ContributionBar>`, `<ChainRail>` — ship on
*both* surfaces, at different densities, and they are the product. Every marketing section and half
the dashboard routes import them. Built naively, that serialises the whole build behind one person
writing three hard components, and then two people race to modify them from opposite directions at
2am.

**Rejected strategy — "build the marketing site, then the dashboard."** It is the obvious order and
it is wrong here. It builds each evidence component twice (once as a marketing set-piece, once as a
dashboard panel), discovers on day five that the marketing version hard-codes fixture data and
cannot accept a live run, and forks the timing of two components that must stay identical. The
design docs are explicit that these three are *one* component at three densities; forking them
forks the code.

**Chosen strategy — a 30-minute seed, then a foundation wave, then the three evidence components in
parallel, then the two surfaces in parallel.**

1. **Wave 0 (T0, ~30 min, one builder).** Next app, pinned dependency set, the complete token file,
   fonts, the ESLint engine-boundary rule, the CI contrast gate, and one smoke test so `vitest`
   exits 0. `npm install` runs here. This is the only genuinely serial step.
2. **Wave 1 (T1, T2, T3 — three builders).** Split along the only seam with no cross-imports:
   - **T1 — primitives and chrome.** Pure presentation. Imports nothing but tokens.
   - **T2 — typed client and fixture corpus.** Pure data. Imports nothing from `components/`.
   - **T3 — motion substrate.** Pure behaviour. Imports nothing from T1 or T2.
3. **Wave 2 (T4–T7, four builders).** The three evidence components plus the stage rail. Each
   imports only wave-0/1 output. **No wave-2 track imports another wave-2 track** — enforced by the
   pinned contract set in §5.
4. **Wave 3 (T8, T9, T10 — three builders).** The two surfaces plus charts. Each composes wave-2
   components and never modifies them.
5. **Wave 4 (T11).** Integration and demo hardening. One indivisible thing, and this plan says so
   rather than faking parallelism.

**The trade-off, stated plainly.** We pay ~30 minutes of dead serial time plus the wall-clock of the
slowest wave-1 track before parallelism starts, and we accept that nobody sees a rendered marketing
section until wave 3. In exchange the three components that *are* the product are built once, by
people who are not also fighting page layout, and the dashboard gets them for free.

---

## 2. Locked inputs

From `docs/design/00-decisions.md`. These are settled. A builder who wants to reopen one raises it
before starting, not mid-track.

| | Decision |
|---|---|
| **D1** | **COLD LIGHT, zero WebGL.** No Three.js, no R3F, no shader package, no canvas hero, no concession shader. Depth comes from the graph-paper substrate, one ink rung + 1px hairline + `inset 0 1px 0 oklch(1 0 0 / 0.06)`, the 1400ms scan, the 0ms verdict flip, and exactly one pinned section. |
| **D2** | **9 landing sections + 8 dashboard routes.** Pipeline scroll scrub cut on day one. Unbuilt routes 404 with `not built for the beta`. |
| **D3** | **All six accuracy metrics published**, with always-visible definitions, `n`, and Wilson intervals. No count-ups. |

**NEVER CUT, under any schedule pressure:** `<ProofBench>` · `<ContributionBar>` · `<ChainRail>` ·
`/audit` · `/accuracy`. Those five are PRGuard. Without them this is a nicely-typeset dark admin
panel with nothing to say.

**Three hard rules, restated here because they are the ones that get violated at 2am:**

1. **Registration marks appear only on evidence-bearing frames.** Never on buttons, chips, or
   ordinary dashboard panels. The moment they go everywhere, the one ownable detail becomes a
   template tic.
2. **GSAP never enters `app/(app)/`. Motion never drives scroll.** Enforced by an ESLint
   `no-restricted-imports` rule in T0, not by discipline. Two engines on one DOM subtree is the
   documented read/write-thrash case.
3. **Verdict and gate colour changes are 0ms** — no `transition` property at all — paired with
   `scale(1.045) → 1` over 180ms. Because every other transition is eased, the instantaneous flip
   reads as a machine returning a result. **It must not be softened.**

---

## 3. Stack — pin exactly, no carets on anything load-bearing

Versions were verified 2026-09-22. **T0 confirms each one resolves before anything else starts**;
if one has moved, T0 pins the nearest working version and records it here in the same commit.

| Layer | Choice | Note |
|---|---|---|
| Runtime | **Node 22 LTS** | Clears `@hey-api/openapi-ts` (≥22.18), ESLint 10, and shadcn (≥20.18.1) |
| Framework | **Next.js 16.3.6**, one app, two route groups | Not a monorepo, not Multi-Zones — cross-zone links are hard navigations, and hero CTA → live dashboard is the whole narrative |
| React | **19.2.0**, pinned exact, with a `package.json` `overrides` block | No R3F in the tree, so the usual peer constraint does not apply. Decide once, commit the lockfile |
| CSS | **Tailwind 4.3.3**, CSS-first | `@theme inline` for `next/font` vars; **`@theme static`** for any token `<StageRail>` reads via `getComputedStyle` |
| Primitives | **shadcn/ui**, `init -b radix` | Base UI's stable package was renamed `@base-ui/react`; the widely-cited `@base-ui-components/react@1.0.0-rc.0` is npm-deprecated. Radix is the boring correct choice |
| Marketing motion | **GSAP 3.15.0 + ScrollTrigger** | ~46 KB gz. Its npm `license` field is Webflow's non-SPDX free-text string — add one CI allowlist entry |
| Dashboard motion | **Motion**, via `LazyMotion` | ~20 KB gz |
| Typed client | **`@hey-api/openapi-ts`**, pinned exact | It is 0.x; a minor bump breaks generation |
| Server state | **TanStack Query** + generated query keys | |
| URL state | **nuqs 2.10.1** | URL is the source of truth for every filter |
| Tables | **`@tanstack/react-table` ^8.21.3** | **Not v9** — ESM-only, weeks old, no migration guide |
| Command palette | **cmdk 1.1.1** | |
| Syntax | **Shiki**, 6–10 languages imported individually | **Never the barrel import** |
| Diff | **`@git-diff-view/react`**, behind one `<PRGuardDiff>` | One wrapper, so swapping it later is one file |
| ANSI | **`anser`**, `use_classes: true` | **Not xterm.js** — we render captured output, we do not run a terminal |
| Charts | **Recharts 3.10.1** under shadcn `ChartContainer` | Chosen because the shadcn chart layer themes from CSS custom properties, so charts inherit the token ramp for free |
| Contrast CI | **`apca-w3`** | The official package. Body floor is **Lc 75**, not the commonly-cited Lc 60 |
| Toasts | **sonner** | |

**Banned, with the reason, so nobody re-proposes them:** Three.js / R3F / any WebGL (D1) · Lenis
(adds a frame of latency to the interaction judges use most) · Rive (~896 KB gz measured, and the
free tier cannot export a `.riv`) · Lottie/dotLottie (~485 KB gz of WASM) · Spline (no LICENSE file)
· Vanta (last publish 2022) · React Flow / `@xyflow` on marketing (attribution badge or $169/mo;
Cloudflare hand-writes its lines) · Magic UI `AnimatedBeam` (its gradient pins `y1`/`y2` to `"0%"`
under `userSpaceOnUse`, so the light wipes horizontally across the bounding box instead of
travelling the path — structurally wrong for a vertical spine) · CSS `animation-timeline: view()` as
a *mechanism* (Firefox absent from stable; a Firefox judge sees every element parked at its 0%
keyframe) · custom cursors, magnetic buttons, cursor trails, site audio · any preloader · Motion+
(£299 — GSAP 3.13+ ships SplitText and ScrambleText free).

---

## 4. Wave structure

```
wave 0    T0  seed                                                    1 builder,  ~30 min
             │
wave 1    T1  primitives    T2  data layer     T3  motion substrate   3 builders
             └──────────────┴─────────────────┴──────────┐
wave 2    T4 ProofBench  T5 ContributionBar  T6 ChainRail  T7 StageRail   4 builders
             └────────────┴──────────────────┴────────────┘
wave 3    T8  marketing (9 sections)   T9  dashboard (8 routes)   T10 charts   3 builders
             └──────────────────────────┴──────────────────────────┘
wave 4    T11 integration + demo hardening                            1 builder
```

Wave 3 tracks **compose** wave-2 components and must not modify them. If T8 needs a prop
`<ProofBench>` does not have, it raises it to the T4 owner, who adds it — it does not get added in
T8's worktree.

---

## 5. The pinned contract set — why wave 2 has no internal dependencies

T1 and T2 ship these *first*, inside wave 1, and they are **read-only for everyone afterwards**.
This is what lets four wave-2 builders work without importing each other.

```ts
// web/src/lib/contracts.ts — owner T2 (wave 1); frozen after wave 1 merges

export type ProofStatus = 'proven' | 'disproven' | 'inconclusive' | 'not_attempted' | 'not_applicable' | 'skipped_no_env';
export type SeverityBand = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type GateConclusion = 'failure' | 'neutral' | 'success';
export type FindingStatus = 'proposed' | 'published' | 'suppressed' | 'dropped' | 'disproven';
export type StageState = 'pending' | 'running' | 'done' | 'degraded' | 'failed';
export type DeliveryMode = 'inline_exact' | 'inline_nearest' | 'file_level' | 'summary_only' | 'not_delivered';

/** Canonical, fixed, never reordered — weight descending, ties by declaration order.
 *  Fixed order is what makes the 64px glyph comparable across 1,284 rows at a glance. */
export const SEVERITY_INPUTS = [
  'path_sensitivity',   // 0.25
  'reachability',       // 0.20
  'blast_radius',       // 0.15
  'coverage_gap',       // 0.15
  'proof_confidence',   // 0.15  — the only input about the system's own certainty; renders hatched
  'churn',              // 0.10
] as const;

export const SEVERITY_THRESHOLDS = { low: 0.15, medium: 0.35, high: 0.55, critical: 0.75 } as const;

export const STAGES = [
  'ingest', 'context', 'specialists', 'coordinator', 'severity',
  'identity', 'proof', 'delivery', 'finalise',
] as const;   // stage_index is 1-based to match GET /v1/reviews/{id}
```

```ts
// web/src/components/evidence/props.ts — owner T1 (wave 1); frozen after wave 1 merges
// The four wave-2 components agree on these signatures BEFORE any of them is written.

export type Density = 'glyph' | 'compact' | 'detail';

export interface ProofBenchProps {
  proof: FindingProof;              // from the generated client
  density: Exclude<Density, 'glyph'>;
  mode?: 'static' | 'replay';       // 'static' renders frame 0 — this is the day-1 deliverable
  onReplayEnd?: () => void;
}

export interface ContributionBarProps {
  score: number;
  inputs: Record<(typeof SEVERITY_INPUTS)[number], number>;
  weights: Record<(typeof SEVERITY_INPUTS)[number], number>;
  density: Density;
}

export interface ChainRailProps {
  events: AuditEvent[];
  verified: boolean;
  brokenAtSeq?: number | null;
  tamperable?: boolean;             // false on marketing until T8 opts in
}

export interface StageRailProps {
  stages: { key: (typeof STAGES)[number]; state: StageState; ms?: number }[];
  orientation: 'horizontal' | 'vertical';
  mode: 'live' | 'replay' | 'static';
}
```

**The rule:** anyone may *read* these files after wave 1; only the named owner may change them, and
only by raising it. A wave-2 builder blocked on a missing field adds it to their own local type and
files it — they do not edit the frozen file.

---

## 6. Track table

| Track | Wave | Depends on | Owns (paths under `web/`) | Never-cut content |
|---|---|---|---|---|
| **T0** | 0 | — | `package.json`, `next.config.ts`, `eslint.config.js`, `app/globals.css`, `app/tokens/*.css`, `app/fonts.ts`, `scripts/verify-tokens.ts` | the token file, the engine-boundary lint rule |
| **T1** | 1 | T0 | `src/components/ui/**`, `src/components/chrome/**`, `src/components/evidence/props.ts` | `<Surface>`, `<Exhibit>`, registration marks |
| **T2** | 1 | T0 | `src/api/**` (generated, committed), `src/lib/contracts.ts`, `src/lib/query.ts`, `fixtures/**` | the fixture corpus |
| **T3** | 1 | T0 | `src/motion/**`, the `[data-anim]` handshake in `app/layout.tsx` | the fallback handshake |
| **T4** | 2 | T1,T2,T3 | `src/components/evidence/ProofBench/**` | **all of it** |
| **T5** | 2 | T1,T2 | `src/components/evidence/ContributionBar/**` | **all of it** |
| **T6** | 2 | T1,T2 | `src/components/evidence/ChainRail/**` | **all of it** |
| **T7** | 2 | T1,T2,T3 | `src/components/evidence/StageRail/**`, `src/lib/pipeline-geometry.ts` | the live driver |
| **T8** | 3 | T4–T7 | `app/(marketing)/**` | hero, we-were-wrong, severity, pipeline, accuracy |
| **T9** | 3 | T4–T7 | `app/(app)/**` | `/runs/:id`, `/findings/:id`, `/audit`, `/accuracy` |
| **T10** | 3 | T1,T2 | `src/components/charts/**` | calibration scatter on `/accuracy` |
| **T11** | 4 | T8,T9,T10 | integration only — see §7 | the demo-day checklist |

---

## 7. Track detail

### T0 — Repo seed · wave 0 · ~30 min · one builder

Creates `web/` and nothing outside it.

1. `npx create-next-app@16.3.6` into `web/`, TypeScript, App Router, Tailwind v4, no `src/app` split
   beyond the two route groups: `app/(marketing)/` and `app/(app)/`.
2. **Pin every dependency exactly** (no carets on React, Next, Tailwind, GSAP, Motion,
   `@hey-api/openapi-ts`, `@tanstack/react-table`). Commit `package-lock.json`. Confirm each version
   in §3 resolves; if one has moved, pin the nearest working version and amend §3 in the same commit.
3. **`app/tokens/core.css`** — the complete OKLCH token set from `docs/design/02-design-system.md`
   §1, authored in OKLCH with generated hex fallbacks. **`app/tokens/marketing.css`** — marketing-only
   additions. Splitting these costs twenty minutes now and stops a marketing tweak regressing the
   dashboard at 2am.
4. **`[data-surface="app"]`** overrides (`--grid-alpha: 0.018`, `--grain-opacity: 0`, nothing above
   180ms) and **`[data-contrast="high"]`** (every hairline promoted to solid `--ink-7 #595E64`).
   **Both on day one, not day six** — four lines of CSS if the tokens are semantic, a rewrite if not.
5. **`app/fonts.ts`** — `next/font/local`, Google Sans Code v7.001 (variable) + Inter Variable,
   self-hosted, `adjustFontFallback: false` with manual ascent/descent overrides, **and an explicit
   `font-family` fallback chain** (`ui-monospace, "SF Mono", Menlo, Consolas, monospace`). All
   candidate monos are 0.600em advance, so terminal column alignment survives a font 404 — but only
   if the chain is written down.
6. **`scripts/verify-tokens.ts`** — CI gate. Binary-searches max in-gamut chroma per `(L, hue)` for
   sRGB and Display-P3 separately; asserts every token round-trips and every text token clears its
   **APCA Lc 75** floor using `apca-w3`. Several values that "looked safe" during research were
   outside sRGB and silently clipped; on the P3 laptop the demo runs on, a clipped `oklch()`
   disagrees visibly with its hex fallback.
7. **`eslint.config.js`** — the engine boundary, as a rule and not a convention:

   ```js
   { files: ['app/(app)/**', 'src/components/charts/**'],
     rules: { 'no-restricted-imports': ['error', { patterns: ['gsap', 'gsap/*'] }] } },
   { files: ['app/(marketing)/**'],
     rules: { 'no-restricted-imports': ['error', { patterns: ['motion/react', 'framer-motion'] }] } },
   ```
8. `shadcn init -b radix`. One smoke test so `vitest run` exits 0.

**VERIFY:** `npm run verify` green on an otherwise empty app.

---

### T1 — Primitives and chrome · wave 1 · depends: T0

Pure presentation. Imports tokens; imports nothing else.

- **`<Surface elevation>`** — the entire depth model: one ink rung + 1px `--rule-1` +
  `inset 0 1px 0 oklch(1 0 0 / 0.06)`. **Zero drop shadows exist in this product.**
  `backdrop-filter` is permitted in exactly two places (sticky header, ⌘K palette) and nowhere else.
- **`<Exhibit>`** — the bracket that wraps every evidence frame: index strip above
  (`/ 05 — COMPUTED SEVERITY`), four 8px L-shaped corner registration marks at 0.10 alpha (0.22 on
  hover), provenance footer below in 11px mono `--text-dim`
  (`GET /v1/reviews/{id}/result → findings[0].proof`). **Hard rule 1 lives here:** `<Exhibit>` is the
  only component that renders registration marks, so misuse is grep-able.
- **Substrate** — graph paper as two repeating linear-gradients (8px minor / 64px major at
  `--grid-alpha`) plus one bounded inline `feTurbulence` grain at 0.035, marketing only. This is
  ~60 lines of CSS and it carries most of the expensive read; it is also what stops a large dark
  field reading as an unstyled div.
- **Components**, each with its full state set from `docs/design/02-design-system.md` §5: button
  (all variants), input, badge/chip (including the severity and proof badges with their **mandatory
  glyphs**), table row, code block, terminal block, diff line, tooltip, sheet, dialog (**180ms**,
  `--ease-snap`), tabs, toast, skeleton (**no shimmer** — decorative motion implying progress it
  does not have).
- **Hover system**, applied uniformly: one ink rung on rows and ghost buttons, +1 lightness step on
  primary, registration marks 0.10→0.22 on evidence frames, 1px underline draw on links (240ms),
  everything else 120ms, `:active` 90ms. **No lift, no scale, no shadow, no glow on hover, anywhere.**
- **Brand** — `<Mark>` and `<Wordmark>` per `docs/design/06-*.md` §A/§B, including the mandatory
  simplification ladder (≥32px full · 20–31px drop corner ticks · ≤19px and every circular crop drop
  the seam, 2px stroke).
- Freezes `src/components/evidence/props.ts` (§5) at the end of the track.

**VERIFY:** `npm run verify` + a Storybook-free render test asserting `<Exhibit>` renders marks and
`<Surface>` renders no `box-shadow` outside the two permitted inset rules.

---

### T2 — Data layer and fixture corpus · wave 1 · depends: T0

Pure data. Imports nothing from `components/`.

- **`npm run api:gen`** against a live local backend → `src/api/**`, **committed to the repo**. CI
  asserts it is clean (`npm run api:check`). A flaky backend at build time must not break the build.
- TanStack Query client with generated query keys and options; the suppress mutation's
  `onSuccess` invalidation set (findings + suppressions + audit) written once and shared.
- nuqs wiring so every list filter is in the URL. A judge must be droppable straight into
  `/findings?severity_min=high&proof_status=proven&blocking=true`.
- **`src/lib/contracts.ts`** (§5), frozen at end of track.
- **`fixtures/**`** — the seeded JSON corpus, and this is a *content* deliverable, not scaffolding.
  It must contain, at minimum:
  - one **proven** finding with full base/head terminal output (the hero's finding),
  - one genuinely **disproven** finding (gates the `D`-key counter-demo, section 03, and two of the
    six accuracy metrics),
  - one **inconclusive** and one **not_attempted**,
  - one `inline_nearest` and one `file_level` delivery, and one `commit_status` gate fallback
    (without these the S8 ladder shows four lit rungs and no story),
  - an audit chain long enough to scroll, with a known-good hash chain,
  - an accuracy payload whose six metrics are **six distinct numbers** (see §9, blocker 3).
- **`NEXT_PUBLIC_FIXTURES=1`** swaps the generated client's `fetch` for a resolver over that corpus.
  The entire app demos with the backend off. This is the insurance policy *and* the local dev
  experience, so it is used every day and cannot rot.

**VERIFY:** `npm run verify` with `NEXT_PUBLIC_FIXTURES=1`, plus a test asserting every
`ProofStatus`, `DeliveryMode` and `GateConclusion` value appears at least once in the corpus.

---

### T3 — Motion substrate · wave 1 · depends: T0

Pure behaviour. Imports nothing from T1 or T2.

- The four easings and five durations as CSS custom properties **and** as a TS constants export, so
  GSAP timelines and CSS transitions cannot drift apart.
- GSAP + ScrollTrigger registration, marketing-only entry point. Motion + `LazyMotion`, dashboard-only
  entry point. Route-change cleanup for both.
- **The fallback handshake** — this is the single cheapest piece of demo insurance in the plan:

  ```html
  <style>
    [data-anim] { visibility: hidden; animation: force-reveal 0s 1600ms forwards; }
    @keyframes force-reveal { to { visibility: visible; } }
    html.anim-ready [data-anim] { animation: none; }
  </style>
  <noscript><style>[data-anim]{visibility:visible!important;animation:none!important}</style></noscript>
  ```

  JS adds `anim-ready` **only after confirming the animation runtime actually loaded**. Bundle 404s
  on venue wifi → everything appears in its final state at t=1600ms. *Degraded, never invisible.*
- **`useReplay(timeline, { key })`** — a paused-timeline-first primitive: builds the timeline, does
  **not** autoplay, exposes `play()/restart()`, binds a keyboard key, and only optionally attaches a
  ScrollTrigger. Every set-piece in the product is built on this, which is what makes the
  scroll-scrub cut (D2) a one-line change rather than a rewrite.
- **Reduced motion as a designed second state**, not an off switch: for each animation type, the
  reduced variant is the *end frame*, rendered immediately. A `prefers-reduced-motion` test renders
  every set-piece and asserts its final DOM equals the animated end state.
- The heartbeat keyframe (1200ms, `steps(1, end)`), which stops and turns `--marker` past 20s.
- Lint rule: the compositor contract — `transform`, `opacity`, `clip-path`, `filter`,
  `stroke-dashoffset` only. **Never animate a CSS custom property on `:root`** (one measured case
  forced recalc on 1,300+ elements at 8ms/frame).

**VERIFY:** `npm run verify` + the reduced-motion end-state test.

---

### T4 — `<ProofBench>` · wave 2 · depends: T1, T2, T3 · **never cut**

The signature component. Ships on the hero and on `/findings/:id`.

Build in this order, and **the track is demoable after step 1**:

1. **`mode="static"` at frame 0** — both terminal panes rendered, seam label, verdict rail stamped,
   provenance strip present, **no animation**. At the end of this step the hero already works. That
   property is what makes this plan safe.
2. **`mode="replay"`** — the timeline: scan line travels on `--ease-mass` over 1400ms (the only use
   of that curve in the product), pane A resolves, seam, pane B resolves, `PROVEN` chip stamps at
   t=2200ms with a **0ms colour flip** + `scale(1.045) → 1`, `→ blocks merge` at t=2400ms, then
   **HOLD 4.0 seconds with nothing moving except the heartbeat dot.** That hold is where a judge
   reads; without it this is a demo of animation rather than a machine returning a result.
3. **`P` and `D` bindings** via `useReplay`. `D` runs the identical sequence on the disproven fixture:
   pane B shows `1 passed in 0.61s` in cyan, the claim strikes through, the chip stamps `DISPROVEN`
   in cyan **outline** with `refuted by execution`, the rail reads
   `gate stays clear · 0 proven · 1 self-refuted`.

Details that are not optional: terminal panes **scroll horizontally and never wrap** (wrapping
destroys traceback alignment); 13px/22px line height; `anser` with `use_classes: true` mapped to the
quarantined code palette; the `E` traceback line in `--alarm-text`; 2px `--signal-lo` rail on pane A
and 2px `--alarm` on pane B; on the hero the panel is masked
`linear-gradient(to bottom, #000 0% 78%, transparent)` so it reads as "there is more product than
fits here".

**VERIFY:** `npm run verify` + a test asserting the replay end-state DOM equals the `static` frame-0
DOM for the proven fixture (this is also the reduced-motion guarantee).

---

### T5 — `<ContributionBar>` · wave 2 · depends: T1, T2 · **never cut**

Hand-authored inline SVG. **No chart library** — Recharts costs ~7MB unpacked to draw six
rectangles, and a chart library's tooltip/legend conventions fight the instrument register.

- Track 640×28px at `density="detail"`; filled length **is** the score (`score × 640`), so the
  arithmetic is checkable by eye.
- Six segments in the frozen `SEVERITY_INPUTS` order, width `value × weight × 640`, minimum rendered
  width 3px with a 1px divider so a near-zero input stays locatable.
- **One hue, six lightness steps** (`oklch(0.86 → 0.51, C 0.09, H 205)`), brightest = biggest lever.
  `proof_confidence` reuses its step plus a 2px 45° hatch.
- **Threshold ticks at .15/.35/.55/.75**, 1px `--ink-6`, extending 6px below with 11px mono labels;
  the crossed tick promotes to 2px in the band colour. **This is the move that answers "why critical
  and not high?" in one glance with no legend.**
- Readout **snaps** — 3rem mono, no count-up. The input table below prints raw × weight =
  contribution to **3 decimals**, with the Σ row and the band rule.
- Hover a segment → +1 lightness step, its table row highlights, **and the matching clause in the
  mono pull-quote gets a 1px underline**. Arrow keys do the same, so it is not mouse-only.
- `density="glyph"` = 64×10px, no ticks/labels/hatch, band letter 4px to its right, `aria-label`
  carrying score and band.

**Banned here and stated in the component's own doc comment:** radar/spider charts. Radar encodes by
area, so it systematically misrepresents the one number the product's credibility rests on.

**VERIFY:** `npm run verify` + a property test asserting rendered segment widths sum to
`score × trackWidth` within 1px across 500 random input/weight sets.

---

### T6 — `<ChainRail>` · wave 2 · depends: T1, T2 · **never cut**

The audit chain viewer and the tamper control.

- Vertical rail of events; each row shows `seq`, `event_type`, `actor`, and hashes as
  `first-8…last-4` with the full 64 in `title` and on copy.
- **Web Crypto verification** of `sha256(prev_hash ‖ canonical_json)` over the **rendered window
  only**, never the whole chain — 1,428 async `subtle.digest` calls per keystroke is a stall, not a
  design.
- **Tamper by typing:** the `canonical_json` field is `contenteditable`, debounced 120ms. The rail
  breaks with a visible 6px gap, everything below desaturates, the header snaps (0ms) to
  `chain.verified = false · broken_at_seq = 1428`, and the expected/computed hashes are diffed with
  the **first differing nibble highlighted**. `↻ restore` repairs it.
- **Three guards that are the difference between a flagship interaction and an inert text field:**
  1. **`crypto.subtle` is only available in a secure context.** Feature-detect on mount; if absent,
     render the field read-only with a printed mono line
     `hash verification requires https or localhost`. Demoing from `http://192.168.x.x:3000` — the
     normal way to show a laptop build on a projector — makes it `undefined`.
  2. **Verify the untouched chain once on mount.** If it reports false, render
     `verification unavailable — serialiser mismatch` in `--marker` and **do not render the
     broken-chain UI**. A false break on the trust feature is worse than no feature.
  3. **Monotonic request id** on every digest; discard stale resolutions. A fast typist otherwise
     resolves promises out of order.

**VERIFY:** `npm run verify` + tests for: a good chain verifies; a mutated byte breaks at the right
seq; `crypto.subtle === undefined` degrades to read-only with the printed line; out-of-order
resolutions are discarded.

---

### T7 — `<StageRail>` · wave 2 · depends: T1, T2, T3

The 9-stage pipeline, shipping on both surfaces from one component.

1. **Static geometry first** — three breakpoint sets generated from **one** TS constants file with
   an `elbow(from, to)` helper. Hand-authored inline SVG. Every edge carries `pathLength="1"` (so one
   keyframe drives an 80px fork and a 2400px spine at identical perceived speed) and
   `vector-effect="non-scaling-stroke"` (so hairlines stay 1px at every viewBox scale). S3's four
   specialists render as a genuine parallel fork — that fork is the diagram's whole argument.
2. **`mode="live"` driver** — consumes `stage_index` / `stage_total` / `heartbeat` from
   `GET /v1/reviews/{id}`. **This is needed by `/runs/:id` regardless**, which is exactly why it is
   built before anything marketing-specific.
3. **`mode="replay"`** for the marketing section, driven by a visible `▶ PLAY` control and hover.
   **Per D2 the scroll scrub is not built.** If it is ever added it is one ScrollTrigger attached to
   the existing paused timeline.

Stage states per `docs/design/02-design-system.md` §1.11. **Never more than 6 paths animating
simultaneously** — `stroke-dashoffset` is a paint property; the rest sit in static end state.

**VERIFY:** `npm run verify` + a test asserting all three breakpoint geometries derive from the same
constants file and that no more than 6 edges carry an active animation class at any tick.

---

### T8 — Marketing site · wave 3 · depends: T4–T7

Nine sections per D2, in this order, each changing exactly one belief:

| # | Section | Belief |
|---|---|---|
| 01 | **Hero — the Proof Bench** ★ | "This executes code. Different category of claim." |
| 02 | The negation | "The problem isn't that I need more findings." |
| 03 | **We were wrong** *(occupies the logo-wall slot)* | "This vendor tells me when it's wrong." |
| 04 | **What lands in your PR** | "I know exactly what this puts in my thread." |
| 05 | The instrument face (M2) | "The score is arithmetic I can recompute." |
| 06 | The pipeline *(the one pinned section)* | "There's a real architecture, and it runs in parallel." |
| 07 | Identity + flight recorder (M3+M4) | "Rejections stick. The record can't be edited." |
| 08 | The accuracy report | "These numbers have denominators and error bars." |
| 09 | The close + footer | "Proven, or it does not block." |

Copy is written in `docs/design/03-landing-blueprint.md` and is **not** to be improvised. The voice
rules in `docs/design/06-*.md` §D are binding: every number carries its denominator; no adjective
does a measurement's job; **no competitor is ever named**; at most one em-dash per paragraph; a state
is a value, not an adjective (`proof_status: proven`, never "a proven bug").

Two sections carry specific engineering:

- **03 replaces the logo wall.** We have no customers; a thin or fabricated logo row reads as a
  student project instantly. Paying the trust tax *before* asking for any belief is what makes 04–07
  land, and it is the single most important ordering decision on the page.
- **04 is the only section on the entire dark site rendered in GitHub's own light-grey PR chrome** —
  full-bleed `#f6f8fa`, GitHub's borders and avatar row, as a static pixel-accurate mock at two
  breakpoints (not an iframe), with one 240ms opacity reveal and **nothing else**. After four
  sections of near-black instrument panel it is the loudest contrast moment on the page, and it is
  *honest* contrast because it is literally a different system. Its content doubles as the **S8
  comment-body spec** for the backend.

Also: nav scroll behaviour, the first-300ms entry sequence, scroll progress, `P`/`D` key hints,
**no custom cursor**, **no preloader**. Cut sections (proof-state legend, agent-caught, comparison,
scope/price, FAQ) ship as linked sub-pages **only if wave 3 finishes early** — they are not in scope.

**VERIFY:** `npm run verify` + Lighthouse on the built marketing route with LCP/INP/CLS recorded in
the PR description (recorded, not gated — a gate here would be cut at 2am and then ignored).

---

### T9 — Dashboard · wave 3 · depends: T4–T7

Eight routes per D2. Sidebar groups: **Reviews · Governance (Suppressions / Audit / Accuracy) ·
Settings** — that one string sells M4 every time anyone glances at the rail.

| Route | Notes |
|---|---|
| `/` | Overview: recent runs, accuracy summary, gate-outcome bar |
| `/runs/:id` | **One route, mode switches on `status`.** LIVE = `<StageRail mode="live">` + heartbeat; RESULT = gate block, ladder breakdown, counts, cost, findings |
| `/findings` | Virtualised table, cursor pagination, `<ContributionBar density="glyph">` per row, filters in the URL |
| `/findings/:id` | **The most important screen.** Body markdown, code location via `<PRGuardDiff>` + Shiki, `<ContributionBar density="detail">`, `<ProofBench density="detail">`, delivery-ladder outcome, fingerprint history, suppress action |
| `/suppressions` | The ledger. Append-only: revoke, never delete |
| `/audit` | `<ChainRail tamperable>` |
| `/accuracy` | Six metric cards (D3) + charts from T10 |
| `/settings/policy` | Read-only |

Every other route is a 404 carrying one mono line: `not built for the beta`. **Stating a limitation
plainly is the voice** — this is on-brand, not an apology.

- **Polling at 1.2s with backoff. Never SSE.** An SSE connection that drops on venue wifi shows a
  frozen dashboard; a poll that fails retries. Surface `seconds_since_heartbeat` as
  `12s since last output` beside the heartbeat dot, which turns `--marker` past 20s.
- Row height 32px (26px compact toggle, persisted and mirrored to the URL). **Hairline separators,
  never zebra striping** — at 32px rows on near-black, alternating fills band visibly and read as a
  2010s admin template.
- Optimistic suppress via one pure reducer shared by the optimistic path and the server response, so
  both compute the identical next state; roll back with a sonner toast carrying the endpoint and the
  status code.
- ⌘K palette (cmdk), `?` shortcut sheet.
- **A mobile banner.** The submission link is one tap from a phone; the dashboard is not responsive
  below 768px and should say so in one honest line rather than rendering broken.

**VERIFY:** `npm run verify` with `NEXT_PUBLIC_FIXTURES=1`; every one of the 8 routes renders, and
every route's empty / loading / error state is reachable in a test.

---

### T10 — Charts · wave 3 · depends: T1, T2

Recharts under shadcn's `ChartContainer`, themed entirely from CSS custom properties so every chart
inherits the token ramp for free.

Global rules: charts sit on the graticule (no separate `CartesianGrid` fill); axis labels 11px mono
caps; all numerics tabular; mount animation is a 180ms opacity fade and nothing more. **No donuts,
no pies, no radars, no count-ups.**

`/accuracy`: (1) the six metrics are **cards, not a chart** — each with an always-visible definition,
`n`, and a Wilson CI hairline; (2) proof-state composition over time as a 100% stacked area, four
bands, which makes the disproven band's persistence visible — that persistence *is* the argument;
(3) human dismissal rate by category, horizontal bars sorted descending with `n` printed on each;
(4) **calibration — predicted band vs observed addressed rate**, scatter with a reference diagonal
and a Wilson whisker per point. Chart 4 is the one no competitor can draw, because it requires a
deterministic predicted score *and* an observed outcome. If `n` per band is small it renders what it
has with wide intervals and prints `n per band: 41 / 88 / 121 / 47 / 15` — **never hidden.**

`/cost`: cost-per-review histogram with p50/p95 reference lines (**never a mean**); per-stage latency
p50/p95 (this seeds `expectedSeconds` for the live rail); wall-clock vs sum-of-stages, which makes
S3's parallelism visible as a persistent gap; cache-hit % and token mix.

**VERIFY:** `npm run verify` + a snapshot asserting every chart reads its colours from
`--chart-*` tokens and hard-codes none.

---

### T11 — Integration and demo hardening · wave 4 · depends: T8, T9, T10

Serial, one builder, and it is not a formality.

1. **Resolve the 15 cross-blueprint contradictions** already ruled on in
   `docs/design/06-*.md` §2 — chiefly: `--ease-mass` is `cubic-bezier(0.52, 0, 0.08, 1)` and the
   other two values are deleted; `--alarm` is fill-only, so the gate block is `--alarm-text` on
   `--alarm-tint-hi` with a 1px `--alarm` border; hero H1 is **62px**; severity growth is 420ms;
   skeletons do not shimmer; dialogs enter at 180ms.
2. **Full a11y pass:** live regions on the run status, visible focus ring at `--signal-hi`,
   `scroll-margin-top` for WCAG 2.4.11 (**Level AA, not AAA**), decorative SVG hidden from AT,
   keyboard path through the findings table, forced-colors mode.
3. **Switch to `[data-contrast="high"]` and look at it on the actual projector** if one is available,
   on the actual demo laptop otherwise. The ink-0…ink-3 steps collapse into one flat black on a
   washed-out venue display, and the 0.028-alpha graph paper disappears entirely.
4. **Set the literal hero headline string at 1280 / 1440 / 1920 on the demo machine** and confirm
   Google Sans Code's variable `wght` axis renders. If it falls back to a static 400 cut, the entire
   hierarchy flattens. If it reads as a terminal banner rather than a headline, drop the clamp
   ceiling — **do not change typeface**.
5. **Record a 90-second MP4** of the proven-bug moment and leave it on the desktop.
6. **Demo-day checklist**, run once end-to-end:
   - Demo from **localhost or the production domain — never a LAN IP** (`crypto.subtle`).
   - Demo from **production, never a preview URL** (bytecode caching and pre-warming are
     production-only).
   - Backend off → fixture mode still demos the whole app.
   - Bundle blocked in devtools → the 1600ms force-reveal fires and nothing is invisible.
   - `prefers-reduced-motion` on → every set-piece renders its end state.
   - Firefox and Safari both render the pipeline and the chain rail.

**VERIFY:** `npm run verify`, plus the six checklist items executed and ticked in the PR description.

---

## 8. Conflict surface and the integration protocol

**Same-wave overlap: zero.** Every track owns disjoint paths (§6). The two shared files —
`src/lib/contracts.ts` and `src/components/evidence/props.ts` — are written in wave 1 and **frozen**.

**Cross-wave, deliberate, append-only:** wave-3 tracks import wave-2 components and **never modify
them**. A missing prop is raised to the wave-2 owner, not patched in place. If wave 2 has already
merged, the owner ships a follow-up commit; the wave-3 builder does not.

**Freeze rules** (these prevent the expensive conflicts):

| File | Frozen after | Who may change it |
|---|---|---|
| `app/tokens/*.css` | T0 merges | T0 owner only, by raising it |
| `src/lib/contracts.ts` | wave 1 merges | T2 owner only |
| `src/components/evidence/props.ts` | wave 1 merges | T1 owner only |
| `eslint.config.js` | T0 merges | nobody during the build |
| `package.json` dependencies | T0 merges | T0 owner only — a second person running `npm i <pkg>` is how the lockfile breaks at 2am |

**Merge order:** T0 → (T1, T2, T3 in any order) → (T4, T5, T6, T7 in any order) →
(T8, T9, T10 in any order) → T11. Each track rebases on `main` before opening its PR, and
`npm run verify` must be green on the rebased branch, not on the branch point.

**Worktrees.** Same pattern the backend used: one `git worktree` per track on an `agent/fe-*`
branch. `.claude/worktrees/` is already gitignored.

---

## 9. Backend asks — day zero, and they currently have no owner

These gate flagship interactions. Land them before wave 2 starts or the affected tracks build
against a moving target.

1. **The canonical-JSON spec.** `<ChainRail>` recomputes `sha256(prev_hash ‖ canonical_json)` in the
   browser. One byte of divergence in key order, whitespace or unicode escaping produces a **false
   break** — the most self-refuting failure this product could ship. Write the rules into a shared
   spec file, test both sides against identical fixtures in CI, treat a failing fixture as a
   build-breaking error. **Backend owns the spec; frontend consumes it.**
2. **Seed the demo corpus** (T2's fixture list above) — at minimum one genuinely disproven finding,
   one `inline_nearest`, one `commit_status`. Without them the `D` key has nothing to run, the S8
   ladder shows four lit rungs and no story, and `/accuracy` reads 100% proven, which is worse than
   not shipping it.
3. **Resolve the duplicate accuracy metric.** `disproven_rate` and `self_caught_false_positive_rate`
   currently carry an identical value and an identical denominator. Either they are definitionally
   the same number — in which case publishing both is padding, the exact sin this product attacks —
   or the definitions differ and the fixtures are wrong. **A judge reading the two definitions side
   by side will ask.**
4. **Nine missing endpoints**, ranked with fallbacks in `docs/design/04-dashboard-blueprint.md` §1.2.
   The top three (`GET /v1/reviews` list, `GET /v1/findings/{id}`, `GET /v1/cost`) are worth a real
   ask; the rest have client-side workarounds that are acceptable for the beta.
5. **Merge `devteam/2026-09-14-pr-reviewer-v1` into `main`** before T2 starts, so the OpenAPI schema
   is on the default branch for codegen. `main` currently carries only docs.

---

## 10. Risks in this plan

| Risk | Why it is real | Mitigation |
|---|---|---|
| **Wave 2 is the critical path and all four tracks are hard** | ProofBench, ContributionBar, ChainRail and StageRail are the four most novel components in the build, and everything in wave 3 waits on them | Each is demoable at its step 1 (static frame). If a wave-2 track slips, wave 3 composes the static version and the animation lands later |
| **The 62px monospace headline may read as a terminal banner** | Mono is wide and unforgiving at display size | Tested on the demo machine on day one (T11 step 4 is pulled forward for this one check). Fallback is 56–62px, **not** a different typeface |
| **Canonical-JSON divergence** | Unowned, and it produces a *false* break on the trust feature | T6 guard 2 renders `verification unavailable` rather than the broken-chain UI. §9 item 1 is the real fix |
| **The token CI gate is annoying and gets disabled** | An APCA failure at 2am is the classic moment someone comments out a check | The gate prints the failing token, its measured Lc, and the nearest passing value, so fixing it is faster than disabling it |
| **Two motion engines** | Someone imports GSAP into a dashboard component | ESLint rule in T0, not discipline. It is the reason the rule exists |
| **Scope is still ambitious even recut** | 9 sections + 8 routes + 4 novel components is a real build | §11 |

---

## 11. De-scope ladder if the clock runs out

In this exact order. Stop as soon as the schedule closes.

1. **T10 chart 4** (the calibration scatter) → the other three ship.
2. **`/settings/policy`** → 404 with `not built for the beta`.
3. **Marketing section 07** (identity + flight recorder) → its content is already carried by
   `/audit` in the dashboard, which the demo visits anyway.
4. **`<ProofBench>` replay** → ship `mode="static"` only. The hero still works; the `P`/`D` demo is
   performed in the dashboard instead.
5. **`<StageRail mode="replay">`** on marketing → static diagram with hover only.
6. **The light/print theme and Export-evidence** → already first-to-cut per the design docs.

**Never reached, at any point on this ladder:** `<ProofBench>` static, `<ContributionBar>`,
`<ChainRail>`, `/audit`, `/accuracy`. If the schedule threatens those five, cut a whole marketing
section instead — the page can lose a section and still argue; the product cannot lose its evidence
and still be PRGuard.

---

## 12. Definition of done

- `npm run verify` green on `main`, **with the backend stopped**.
- All 9 marketing sections and all 8 dashboard routes render from fixtures with no console errors.
- The six demo-day checklist items in T11 are executed and ticked.
- `P` replays the hero deterministically; `D` runs the disproven counter-demo.
- A judge can type into the `canonical_json` field and watch the chain break, on the demo machine,
  from the demo URL.
- The 90-second MP4 is on the desktop.

---

## 13. Execution addendum — decisions made at kickoff (2026-09-23)

Found while preparing the build. Each one closes a gap the design docs left open or corrects a
fact that turned out to be wrong. These are binding on every track.

**A1 — Node.** The machine runs Node 26; `engines` is `>=22.18`. Every §3 floor (hey-api ≥22.18,
ESLint 10, shadcn ≥20.18.1) is satisfied. Node 22 is not required.

**A2 — Branching.** All work lands on `frontend/prguard-web`. Tracks work on `agent/fe-*`
branches in worktrees. `main` is untouched and the backend branch is **not** merged; instead the
OpenAPI document was extracted from `devteam/2026-09-14-pr-reviewer-v1@eeb1be8` and is committed
at `web/openapi/openapi.json` (14 paths, 55 schemas). §9 item 5 is therefore not a blocker.

**A3 — Routes.** Marketing owns `/`. The dashboard overview lives at **`/overview`** (both route
groups cannot own `/`). The other seven dashboard routes are top-level: `/runs/[id]`, `/findings`,
`/findings/[id]`, `/suppressions`, `/audit`, `/accuracy`, `/settings/policy`. Known-but-unbuilt
paths (`/runs`, `/repos`, `/cost`, other `/settings/*`) render the beta 404:
`not built for the beta`.

**A4 — The pipeline loses its pin.** D2 cut the scroll scrub; a pinned section without a scrub is
dead scroll. Section 06 is a normal section: it renders its static geometry immediately, plays
**once** on first viewport entry (IntersectionObserver, never gating visibility), and carries a
`▶ PLAY` / replay control plus per-stage hover. The site now has **zero** pinned sections.

**A5 — "Run One" folds into §09 The Close.** D2 cut §11, but the nav CTA was specified to scroll
to it. §09 therefore carries the run surface: a PR URL input (`owner/repo#42` or a URL) plus
pre-warmed PR chips. Nav and hero `RUN A REVIEW →` scroll to `#run` (`scroll-behavior: auto`).
Submit → `POST /v1/reviews` → `/runs/:id`. In fixture mode → `/runs/<demo run id>`, which plays a
**simulated live progression** (T2 owns the simulation). `READ THE ACCURACY REPORT` scrolls to §08.

**A6 — Six accuracy metrics, all distinct.** `proof.disproven_rate` and
`self_caught_false_positive_rate` are **definitionally identical** (both `disproven / attempted`,
verified in `core/accuracy.py`). Publishing both would be padding. The six are:
`execution_verified_precision`, `self_caught_false_positive_rate`, `human_dismissal_rate`,
`addressed_rate`, `proven_rate`, and `inconclusive_rate` — the last derived client-side as
`proof.inconclusive / proof.attempted`, with that derivation printed in its provenance line. One
footnote states that `proof.disproven_rate` is the same quantity and is not shown twice. This
closes §9 blocker 3.

**A7 — The blueprint's hero numbers were mutually impossible.** Under the backend's real formulas,
`execution_verified_precision 0.91 (n=312)` implies 28 disproven findings and
`self_caught_false_positive_rate 0.14 (n=537)` implies 75. **No number on any surface is
hardcoded.** Every metric is computed by T2 from one set of raw counts using the exact backend
formulas (rounded to the backend's `RATIO_PRECISION`), written to the fixture corpus, and every
surface — hero calibration strip included — renders from that fixture. Numeric style: 3 decimals,
always.

**A8 — Canonical JSON, frontend side (closes §9 item 1 for the browser).** The backend hashes
`(prev_hash or "") + json.dumps(doc, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`
over `{tenant_id, seq, event_type, actor_type, actor_id, payload, created_at}`, where
`created_at` is `isoformat()` with `+00:00`. The API serialises the same instant with `Z`. So the
TypeScript canonicaliser must: sort keys recursively; emit no whitespace; emit non-ASCII raw;
convert a trailing `Z` to `+00:00`; and **render floats in Python `repr` form** — Python hashes
`1.0` and `1e-05` where JavaScript writes `1` and `0.00001`, so a naive verifier shows a false
break. This requires a lossless parse that keeps each number's lexeme. Cross-language test vectors
are generated by the backend's own `compute_event_hash`, never hand-computed.

**A9 — Backend gap: `AuditItem` has no `tenant_id`, but the hash covers it.** Browser-side
verification of a live chain is therefore impossible today. Fixtures carry `tenant_id`. In live
mode without it, `<ChainRail>` shows the server's `chain.verified` verdict with the printed note
`browser verification needs tenant_id in GET /v1/audit`, and the tamper field is read-only. The
fix is one additive field on `AuditItem`; it is **recommended, not done** — the backend is out of
this build's scope.

**A10 — Canonical demo identifiers.** Every surface uses the same story, so every agent uses these:
base SHA `7c41a09`, head SHA `9c2d4b1`, proven finding id prefix `a91f3c2e`, review id prefix
`4e8b1d0`, repro file `tests/test_repro_7e3f1a.py`, failing test `test_charge_uses_account_currency`,
failure `AttributeError: 'NoneType' object has no attribute 'currency'`. Full UUIDs live in
`web/src/lib/demo-ids.ts` (T2).

**A11 — Missing endpoints.** The generated client covers the 14 real paths. One hand-written
extension, `web/src/api/ext.ts`, covers `GET /v1/reviews` (list) for `/overview` — fixture-served,
with a live fallback that lists runs this browser has created. Nothing else is invented.

**A12 — Resource discipline (16 GB RAM, ~16 GB free disk).** Heavy commands go through
`web/scripts/slot.sh`: at most **2** concurrent `next build`, at most **3** concurrent dev-server or
Playwright sessions. Worktrees get `node_modules` by APFS clone (`cp -cR`, near-zero disk), never a
fresh install. Each track uses its own dev port (§7 briefs). Dev servers are stopped when a track
finishes.

**A13 — The severity worked example was also impossible.** The blueprints' `0.810` example sums
correctly only with inputs the backend can never emit (`reachability 0.9`, `coverage_gap 0.8`,
`proof_confidence 0.95` — all three are discrete in `core/severity.py`), and the spec's §6.4
example claims `0.81` while summing to `0.89`. The fixture uses valid inputs that genuinely score
`0.810` through the backend's own `severity.compute`: reachability `1.0`, blast_radius `0.7`,
path_sensitivity `1.0`, coverage_gap `0.5`, churn `0.3`, proof_confidence `1.0`. Every surface
renders the fixture; the blueprint table is not to be copied.

**A14 — Wave 1 is split seven ways, not three.** T1 → t1a (chrome, evidence frame, brand),
t1b (UI primitives), t1c (semantic badges + all icons), t1d (code, terminal, diff surfaces).
T2 → t2a (typed client, providers, hooks, fixture resolver) and t2b (fixture corpus generator).
T3 unchanged. The t2a/t2b interface is `web/public/fixtures/README.md` plus the binding ids in
`manifest.json`; `src/lib/api-types.ts` is the one import point for API shapes.

**A15 — Toolchain facts from T0.** ESLint is 9.39.5 (10 crashes eslint-plugin-react), TypeScript
6.0.3 (typescript-eslint caps below 6.1), React 19.2.8 (what Next 16.3.6 is tested with; the
19.2.0 pin existed only for an R3F peer range that does not apply). Google Sans Code lacks
`↻ ▶ ▣ ✓ ✗ Σ ⋯ ‖ ⚠` — those are drawn as inline SVG, never left to a fallback font.
