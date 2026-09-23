All values verified. Writing the specification.

# PRGuard Design System — v1.0

**Direction:** COLD LIGHT (spine) + Exhibit grafts (provenance line, 4-second hold, tamper-by-typing, Wilson intervals) + three BLAST DOOR grafts (keyboard replay, `D`-key disproven counter-demo, weight curve on one element).

**One sentence the system must render:** *PRGuard proves what it claims, ranks by real blast radius, never repeats itself, and keeps the human in charge on the record.*

**The visual thesis:** this is a precision measuring instrument, not an assistant. Colour is never decoration — it is signal. Severity is a reading off a calibrated scale, not an adjective. The marketing site and the product are the same components.

Everything below has been numerically verified: every OKLCH↔hex pair round-trips, every colour is inside the sRGB gamut, and every contrast figure is computed (WCAG 2.1 ratio + APCA Lc 0.1.9), not estimated. Where the source direction's values were wrong or self-contradictory, I say so inline and give the correction.

---

## 0. Global rules (read before anything else)

| # | Rule | Enforcement |
|---|---|---|
| R1 | **No green anywhere in product chrome.** Gate-clear is achromatic on a cyan tint. | Lint: ban hue 120–190 outside `.prg-code` |
| R2 | **`--alarm` is a fill, never a text colour**, and never a background behind text < 24px. | Lint + review |
| R3 | **Severity is never encoded by colour alone.** Meter fill-count + printed 3-decimal score carry the meaning. | Component API has no colour-only variant |
| R4 | **Never use `opacity` to encode state.** Every state is an explicit token. | Survives `forced-colors: active` |
| R5 | **Registration marks appear only on evidence-bearing frames** — never on buttons, chips, or dashboard panels. | Review rule |
| R6 | **Zero drop shadows** except the ⌘K palette and modals. Elevation = one ink rung + 1px hairline + inset top highlight. | Lint: ban `box-shadow` with blur outside 2 allowlisted selectors |
| R7 | **`backdrop-filter` in exactly two places:** sticky header, ⌘K palette. | Lint |
| R8 | **Nothing is `opacity: 0` in the stylesheet.** Hiding is added by JS only after JS confirms it can animate. | Fallback handshake, §4.6 |
| R9 | **Animate `transform`, `opacity`, `clip-path`, `stroke-dashoffset` only.** Never a custom property on `:root`. | Lint |
| R10 | **Every evidence frame carries a provenance footer** naming the endpoint it came from. | Component requires the prop |

---

## 1. Colour tokens

### 1.1 Method and targets

- **Authoring space:** OKLCH. Hex is generated from OKLCH, never the reverse.
- **Gamut:** every token verified inside sRGB. Max in-gamut chroma was computed per (L, H); no token sits at the boundary, so the oklch() value and the hex fallback agree on P3 displays.
- **Contrast target:** **APCA Lc 75** for body text, **Lc 90** preferred for primary. This is the real APCA body floor — the commonly-cited "Lc 60" is APCA's tier for *non-body content text* (labels, chips, metadata), not body copy. WCAG 2.1 ratios are reported alongside for compliance paperwork only; WCAG materially overstates contrast on near-black.
- **Meaning-bearing borders:** ≥ 3:1 WCAG per SC 1.4.11. Measured floor is `--ink-7` at **3.03:1**.

### 1.2 Ink ladder (neutral surfaces)

Hue 250, chroma 0.004–0.012. Cold graphite, not a blue brand.

| Token | Hex | OKLCH | WCAG vs ink-0 | APCA Lc on ink-0 | Use |
|---|---|---|---|---|---|
| `--ink-0` | `#080A0D` | `oklch(0.145 0.006 250)` | 1.00 | — | Page background, both surfaces |
| `--ink-1` | `#0F1114` | `oklch(0.178 0.007 250)` | 1.05 | — | Panel, sidebar, terminal interior, sticky header |
| `--ink-2` | `#16191C` | `oklch(0.212 0.008 250)` | 1.12 | — | Card, panel header bar, table header, chip at rest |
| `--ink-3` | `#1E2125` | `oklch(0.248 0.008 250)` | 1.23 | — | Row hover, button hover (**exactly one rung, never two**) |
| `--ink-4` | `#272B2E` | `oklch(0.285 0.009 250)` | 1.39 | — | Pressed, selected row fill |
| `--ink-5` | `#32363A` | `oklch(0.330 0.010 250)` | 1.63 | — | Solid divider on non-interactive surfaces, disabled fill |
| `--ink-6` | `#41464B` | `oklch(0.390 0.011 250)` | 2.08 | −10.2 | Solid border, interactive at rest. **Structural, not meaning-bearing** |
| `--ink-7` | `#595E64` | `oklch(0.480 0.012 250)` | **3.03** | −19.3 | **Meaning-bearing border floor** (input outline, selected indicator). Also the `[data-contrast=high]` hairline value |
| `--ink-8` | `#646A70` | `oklch(0.520 0.012 250)` | 3.62 | −24.3 | Disabled text, `not_attempted`, placeholder. **Never body copy** |

### 1.3 Text

| Token | Hex | OKLCH | WCAG / ink-0 | APCA Lc / ink-0 | APCA Lc / ink-2 | Tier |
|---|---|---|---|---|---|---|
| `--text-primary` | `#EEF0F3` | `oklch(0.955 0.004 250)` | 17.36 | **−97.8** | −96.7 | Clears Lc 90 preferred. Headlines, readouts, emphasis |
| `--text-body` | `#CDD1D6` | `oklch(0.860 0.008 250)` | 12.92 | **−78.2** | −77.2 | Clears Lc 75 body floor. All body copy |
| `--text-dim` | `#8D9399` | `oklch(0.660 0.012 250)` | 6.39 | −43.6 | −42.5 | Lc 45 tier. Eyebrows, column heads, units, metadata. **Non-body only** |
| `--text-disabled` | `#646A70` | `oklch(0.520 0.012 250)` | 3.62 | −24.3 | −23.2 | Disabled only. Exempt from SC 1.4.3 |

**Never `#FFFFFF`.** 21:1 on near-black causes halation and scroll afterimages for the ~36% of adults with astigmatism.

### 1.4 Hairlines and overlays (alpha-white, so they compose over the hero glow)

| Token | Value | Over ink-0 | Over ink-2 | WCAG | Use |
|---|---|---|---|---|---|
| `--grid` | `oklch(1 0 0 / 0.028)` | `#0F1114` | `#1D1F22` | 1.05 | Graph-paper lines, 8px minor / 64px major |
| `--grid-dash` | `oklch(1 0 0 / 0.018)` | `#0C0E11` | `#1A1D20` | 1.03 | Dashboard graticule (charts, waterfall) |
| `--rule-hair` | `oklch(1 0 0 / 0.055)` | `#16171A` | `#232628` | 1.11 | Table separators, decorative division. **Decorative only** |
| `--rule-1` | `oklch(1 0 0 / 0.09)` | `#1E2023` | `#2B2E30` | 1.21 | Default panel border |
| `--rule-2` | `oklch(1 0 0 / 0.14)` | `#2B2C2F` | `#37393C` | 1.42 | Interactive border at rest, ghost-button outline |
| `--rule-3` | `oklch(1 0 0 / 0.22)` | `#3E4042` | `#494C4E` | 1.90 | Hover border, registration marks on hover |
| `--inset-hi` | `oklch(1 0 0 / 0.06)` | — | `#24272A` | — | `inset 0 1px 0` top highlight. The entire "milled" effect |
| `--scrim` | `oklch(0 0 0 / 0.60)` | — | — | — | Modal backdrop |

> All four `--rule-*` values are sub-3:1 and are **decorative only**. Any border that carries meaning uses `--ink-7` (3.03:1) or a semantic token.

### 1.5 Accent system — three chromatic families

Measured CVD separation (Machado 2009, severity 1.0, min over protan/deutan/tritan, ΔE in OKLab×100):

| Pair | min ΔE |
|---|---|
| signal ↔ alarm | **19.5** |
| signal ↔ marker | **17.6** |
| alarm ↔ marker | **13.5** |

The canonical Okabe-Ito "colourblind-safe" palette's own floor is ≈7.5. This set clears it by 1.8×. **Adding a fourth chromatic family collapses the floor below 8 — the family count is three and it is not negotiable.**

#### Signal (instrument cyan, hue 205) — execution results, live state, brand

| Token | Hex | OKLCH | WCAG/ink-0 | APCA/ink-1 | Use |
|---|---|---|---|---|---|
| `--signal-text` | `#7AECF8` | `oklch(0.880 0.105 205)` | 14.33 | **−84.6** | Cyan **body text**: terminal `passed` lines, prose. Clears Lc 75 |
| `--signal-hi` | `#65E7F5` | `oklch(0.860 0.115 205)` | 13.50 | −80.9 | **Focus ring**, hero scan line, live trace |
| `--signal` | `#2ECEDD` | `oklch(0.780 0.125 205)` | 10.37 | −66.0 | `proof_status: proven` fill, active stage, brand accent. Label text ≥12px/600 only (Lc 60 tier) |
| `--signal-lo` | `#0698A4` | `oklch(0.620 0.105 205)` | 5.70 | −39.4 | 2px status rails, completed connector, base-SHA pane edge. **Fill only** |
| `--signal-tint` | `#13282C` | 12% signal over ink-1 | 1.29 | — | Surface behind a proven row / cleared gate |
| `--signal-tint-lo` | `#111A1E` | 5% signal over ink-1 | 1.14 | — | Base-SHA terminal pane background |

Chip check: `--ink-0` on solid `--signal` = **Lc 67.7 / WCAG 10.37** → valid for a 12px/600 uppercase chip label.

#### Alarm (hue 27) — the only chromatic gate state, and critical severity

| Token | Hex | OKLCH | WCAG/ink-0 | APCA/ink-1 | Use |
|---|---|---|---|---|---|
| `--alarm-text` | `#FFBFB7` | `oklch(0.860 0.075 27)` | 12.64 | **−76.7** | Red **body text**: the failing traceback line, `1 failed`. Clears Lc 75 |
| `--alarm-hi` | `#FD8074` | `oklch(0.740 0.155 27)` | 8.04 | −53.5 | Large text only (≥24px/400 or ≥18px/700). Section heads, the `→ blocks merge` line at 20px |
| `--alarm` | `#F64F47` | `oklch(0.660 0.205 27)` | 5.78 | −40.6 | **FILL ONLY.** 2px rails, gate bar border, meter segment, glyph squares |
| `--alarm-tint` | `#2B181A` | 12% alarm over ink-1 | 1.18 | — | Blocking-row surface, gate bar background |
| `--alarm-tint-hi` | `#341B1C` | 16% alarm over ink-1 | — | — | BLOCKED chip background |
| `--alarm-tint-lo` | `#241719` | 9% alarm over ink-1 | 1.14 | — | Head-SHA terminal pane background |

> **Critical, verified finding.** `--ink-0` on solid `--alarm` measures only **Lc 43.3**. A solid-red chip with an 11–12px label fails APCA outright. sRGB physically forbids a red that is both saturated and body-legible on near-black: at L 0.82, hue 27, max in-gamut chroma is 0.101, and reaching Lc 75 requires dropping to C 0.075. **Therefore the BLOCKED chip is `--alarm-text` on `--alarm-tint-hi` with a 1px `--alarm` border (Lc −74.6), not a solid red fill.** Solid `--alarm` appears only as geometry: rails, bars, meter segments. This reads *more* instrument-like and is the honest answer.

#### Marker (amber, hue 82) — caution, and only caution

| Token | Hex | OKLCH | WCAG/ink-0 | APCA/ink-1 | Use |
|---|---|---|---|---|---|
| `--marker-text` | `#FACD78` | `oklch(0.870 0.115 82)` | 13.28 | **−79.7** | Amber body text |
| `--marker` | `#E7B551` | `oklch(0.800 0.130 82)` | 10.50 | −66.3 | `proof_status: inconclusive`, degraded stage, stale heartbeat >20s, S8 ladder fallback |
| `--marker-tint` | `#29251B` | 12% marker over ink-1 | 1.30 | — | Degraded row surface |

> **Amber means "act soon", per FAR 25.1322, which defines Caution as requiring *immediate crew awareness and subsequent response*.** A self-refuted finding requires no response at all — so amber goes on **inconclusive** (which genuinely needs a human to decide), never on disproven. This corrects a common misreading of the aviation standard.

### 1.6 Severity — a chroma ramp that is a *redundant* cue

| Token | Hex | OKLCH | Chroma | Luminance Y | WCAG/ink-0 | Band |
|---|---|---|---|---|---|---|
| `--sev-info` | `#83878B` | `oklch(0.620 0.008 250)` | 0.008 | 0.240 | 5.48 | < 0.15 |
| `--sev-low` | `#A39879` | `oklch(0.680 0.045 90)` | 0.045 | 0.316 | 6.91 | ≥ 0.15 |
| `--sev-medium` | `#CFA25A` | `oklch(0.740 0.105 78)` | 0.105 | 0.398 | 8.46 | ≥ 0.35 |
| `--sev-high` | `#F18336` | `oklch(0.720 0.160 52)` | 0.160 | 0.352 | 7.59 | ≥ 0.55 |
| `--sev-critical` | `#F64F47` | `oklch(0.660 0.205 27)` | 0.205 | 0.256 | 5.78 | ≥ 0.75 |

Chroma is **strictly monotone**: 0.008 → 0.045 → 0.105 → 0.160 → 0.205.

**Two measured facts that force R3 (severity is never colour alone):**

1. **CVD:** the worst pair is **medium vs high at ΔE 3.3** (protanopia). Under deuteranopia: medium↔high 3.3, medium↔critical 4.4, low↔critical 6.4, high↔critical 6.3. Five severity bands are **not** separable by hue for a meaningful share of users.
2. **Greyscale:** relative luminance across the ramp is 0.240 → 0.316 → **0.398** → 0.352 → 0.256 — it rises then falls. The ramp does **not** survive desaturation as an intensity ramp. The source direction claims it does; that claim is wrong, because greyscale collapses to luminance, not chroma.

**Consequence, and it is a feature:** severity renders as a **5-segment meter + the printed score to 3 decimals** (`0.812 ██████░░░░ critical`). Colour is the third cue behind fill-count and number. This is also the on-message choice — M2's claim is "this is arithmetic, not an adjective", and the arithmetic is what you show.

Also banned: radar/spider charts for the six inputs. Radar encodes by area, so it systematically misrepresents the one number the product's credibility rests on. Use the weighted contribution bar with printed threshold ticks at .15/.35/.55/.75.

### 1.7 Proof states

Proven and disproven **share the cyan hue** because both are execution results. Differentiate by fill vs outline plus a **mandatory glyph** — colour alone never carries state.

| State | Fill | Border | Text | Glyph | Extra |
|---|---|---|---|---|---|
| `proven` | `--signal` solid | none | `--ink-0` (Lc 67.7) | filled vial | — |
| `disproven` | transparent | 1px `--signal` | `--signal-text` (Lc −84.6) | struck vial | label strikethrough + caption `refuted by execution` |
| `inconclusive` | `--marker-tint` | 1px dashed `--marker` | `--marker-text` (Lc −79.7) | half vial | — |
| `not_attempted` | transparent | 1px `--rule-2` | `--text-disabled` | empty vial | **no opacity trick** — explicit token |

> Making disproven red would encode intellectual honesty as failure and invert the product's proudest behaviour. Cyan-for-both is the strongest idea in the palette and it is **not self-evident** — it requires a visible legend on the page and the mandatory glyph on every chip.

### 1.8 Gate states

| State | Background | Border | Text | Rule |
|---|---|---|---|---|
| `failure` | `--alarm-tint` | `border-top: 2px solid --alarm` | `--alarm-text` | The only chromatic gate state. **At most once per screen** |
| `neutral` | `--ink-2` | 1px `--rule-1` | `--text-dim` | Running / not yet decided |
| `success` | `--signal-tint-lo` | `border-bottom: 1px solid --signal-lo` | `--text-body` | **Achromatic.** An instrument at rest has a needle at zero, not a green light |

Refusing green is both a differentiator and a legibility win: PRGuard's gate sits three pixels from GitHub's own green check in a PR tab.

### 1.9 Finding status

| Status | Text | Border | Treatment |
|---|---|---|---|
| `proposed` | `--text-dim` | 1px **dotted** `--rule-2` | Pre-publication |
| `published` | `--text-body` | 2px left rail `--signal-lo` | — |
| `suppressed` | `--text-dim` | 1px **dashed** `--ink-7` | Ledger glyph. Row **remains present** |
| `dropped` | `--text-dim` | none | **Strikethrough**, no border |

Border *style* (solid / dotted / dashed / none) is a free encoding axis most dashboards ignore. Use it — it survives greyscale, CVD and forced-colors mode. Use 1.5px for dashed at 1× DPR so it is distinguishable from dotted on a low-DPI external monitor.

### 1.10 Diff — the one quarantined exemption

Green and red inside a code surface encode **direction of edit**, not verdict. This convention predates the product and is universally learned. It is quarantined to `.prg-code` descendants, enforced by lint, and never escapes into UI chrome.

| Token | Hex | OKLCH | APCA/ink-1 | Use |
|---|---|---|---|---|
| `--diff-add-text` | `#77E9C0` | `oklch(0.855 0.120 168)` | **−80.4** | Added line text |
| `--diff-add` | `#58D8AE` | `oklch(0.800 0.130 168)` | −69.9 | `+` gutter glyph |
| `--diff-add-bg` | `oklch(0.800 0.130 168 / 0.08)` | — | — | **8% tint**, not the category-standard 20% |
| `--diff-del-text` | `#FFBFB7` | `oklch(0.860 0.075 27)` | −76.7 | Removed line text (same token as `--alarm-text` — coherent: red is the thing that breaks) |
| `--diff-del` | `#F64F47` | `oklch(0.660 0.205 27)` | −40.6 | `−` gutter glyph |
| `--diff-del-bg` | `oklch(0.660 0.205 27 / 0.09)` | — | — | 9% tint |

Measured add↔del CVD separation: **ΔE 13.4** — better than GitHub's palette (≈3.6) because the hues are pushed apart, but still **the `+`/`−` gutter glyph is the semantic channel, not decoration.** Never ship a "clean" diff view that drops the gutter.

Deliberately **not** GitHub's `#3FB950 / #F85149 / #122B26 / #44171B`, which every competitor ships verbatim and which would collide with proven/disproven — the distinction that actually matters.

### 1.11 Stage states (9-stage pipeline, both surfaces)

| State | Node | Connector | Motion |
|---|---|---|---|
| `pending` | hollow, 1px `--ink-6` | 1px `--rule-1` | none |
| `running` | 1px `--signal-hi` ring | `--signal-hi`, `stroke-dasharray: 0.06 0.94`, travelling | 2600ms linear loop |
| `done` | filled `--signal-lo` | solid `--signal-lo`, `stroke-dashoffset: 0` | none |
| `degraded` | filled `--marker` | `--marker`, `stroke-dasharray: 0.01 0.02` marching ants | slow loop + `12s since last output` label |
| `failed` | filled `--alarm` | solid `--alarm` | none |

Every edge carries `pathLength="1"` so one keyframe drives an 80px fork and a 2400px spine at identical perceived speed, and `vector-effect="non-scaling-stroke"` so 1px hairlines stay 1px at every viewBox scale. (These are complementary, not redundant: `vector-effect` scales stroke *width* only; dash arrays are still computed in user-space path length.)

### 1.12 Code surface palette (quarantined)

Near-monochrome by design, built from already-verified tokens. Five values, no new hues.

| Role | Token | Hex | APCA/ink-1 |
|---|---|---|---|
| comment | `--syn-comment` | `#8D9399` | −43.2 † |
| punctuation / plain | `--syn-plain` | `#CDD1D6` | −77.9 |
| keyword / operator | `--syn-keyword` | `#7AECF8` | −84.6 |
| string | `--syn-string` | `#FACD78` | −79.7 |
| number / constant | `--syn-number` | `#77E9C0` | −80.4 |
| function / entity | `--syn-entity` | `#EEF0F3` @ weight 500 | −97.4 |

† Comments are the one deliberate sub-floor value; they are intentionally secondary. `[data-contrast="high"]` promotes `--syn-comment` to `--text-body`.

**ANSI mapping for `anser`** (captured stdout, `use_classes: true`):

| ANSI | Token | Hex |
|---|---|---|
| black / bright-black | `--ink-5` | `#32363A` |
| red / bright-red | `--alarm-text` | `#FFBFB7` |
| green / bright-green | `--diff-add-text` | `#77E9C0` |
| yellow / bright-yellow | `--marker-text` | `#FACD78` |
| blue / bright-blue | `--signal-lo` lifted → `#4FC4D4` | — |
| cyan / bright-cyan | `--signal-text` | `#7AECF8` |
| magenta / bright-magenta | `--signal-hi` | `#65E7F5` |
| white / bright-white | `--text-primary` | `#EEF0F3` |

Magenta collapses into the signal family because pytest output essentially never emits it; this is documented rather than hidden. Normalise `\r` rewrites, `\x1b[2K` and cursor-movement sequences **server-side at capture** so progress bars collapse to their final frame.

### 1.13 The Tailwind v4 `@theme` block

```css
/* ============================================================
   tokens/core.css — imported by BOTH marketing and dashboard
   Tailwind CSS 4.3.3, CSS-first config.
   ============================================================ */
@import "tailwindcss";

/* Wipe Tailwind's default palette. We ship no colour we did not choose. */
@theme {
  --color-*: initial;
}

@theme {
  /* ---------- ink ladder ---------- */
  --color-ink-0:            oklch(0.145 0.006 250);   /* #080A0D */
  --color-ink-1:            oklch(0.178 0.007 250);   /* #0F1114 */
  --color-ink-2:            oklch(0.212 0.008 250);   /* #16191C */
  --color-ink-3:            oklch(0.248 0.008 250);   /* #1E2125 */
  --color-ink-4:            oklch(0.285 0.009 250);   /* #272B2E */
  --color-ink-5:            oklch(0.330 0.010 250);   /* #32363A */
  --color-ink-6:            oklch(0.390 0.011 250);   /* #41464B */
  --color-ink-7:            oklch(0.480 0.012 250);   /* #595E64  3.03:1 */
  --color-ink-8:            oklch(0.520 0.012 250);   /* #646A70 */

  /* ---------- text ---------- */
  --color-text-primary:     oklch(0.955 0.004 250);   /* #EEF0F3  Lc -97.8 */
  --color-text-body:        oklch(0.860 0.008 250);   /* #CDD1D6  Lc -78.2 */
  --color-text-dim:         oklch(0.660 0.012 250);   /* #8D9399  Lc -43.6 */
  --color-text-disabled:    oklch(0.520 0.012 250);   /* #646A70  Lc -24.3 */

  /* ---------- rules, grid, overlays ---------- */
  --color-grid:             oklch(1 0 0 / 0.028);
  --color-grid-dash:        oklch(1 0 0 / 0.018);
  --color-rule-hair:        oklch(1 0 0 / 0.055);
  --color-rule-1:           oklch(1 0 0 / 0.09);
  --color-rule-2:           oklch(1 0 0 / 0.14);
  --color-rule-3:           oklch(1 0 0 / 0.22);
  --color-inset-hi:         oklch(1 0 0 / 0.06);
  --color-scrim:            oklch(0 0 0 / 0.60);

  /* ---------- signal (hue 205) ---------- */
  --color-signal-text:      oklch(0.880 0.105 205);   /* #7AECF8  Lc -84.6 */
  --color-signal-hi:        oklch(0.860 0.115 205);   /* #65E7F5  focus ring */
  --color-signal:           oklch(0.780 0.125 205);   /* #2ECEDD */
  --color-signal-lo:        oklch(0.620 0.105 205);   /* #0698A4 */
  --color-signal-tint:      oklch(0.261 0.028 211);   /* #13282C  12% over ink-1 */
  --color-signal-tint-lo:   oklch(0.211 0.021 216);   /* #111A1E   5% over ink-1 */

  /* ---------- alarm (hue 27) — FILL ONLY at --color-alarm ---------- */
  --color-alarm-text:       oklch(0.860 0.075 27);    /* #FFBFB7  Lc -76.7 */
  --color-alarm-hi:         oklch(0.740 0.155 27);    /* #FD8074  large text only */
  --color-alarm:            oklch(0.660 0.205 27);    /* #F64F47 */
  --color-alarm-tint:       oklch(0.235 0.031 13);    /* #2B181A  12% */
  --color-alarm-tint-hi:    oklch(0.259 0.040 13);    /* #341B1C  16% */
  --color-alarm-tint-lo:    oklch(0.222 0.021 9);     /* #241719   9% */

  /* ---------- marker (hue 82) ---------- */
  --color-marker-text:      oklch(0.870 0.115 82);    /* #FACD78  Lc -79.7 */
  --color-marker:           oklch(0.800 0.130 82);    /* #E7B551 */
  --color-marker-tint:      oklch(0.266 0.019 89);    /* #29251B */

  /* ---------- severity (redundant cue only) ---------- */
  --color-sev-info:         oklch(0.620 0.008 250);   /* #83878B  C 0.008 */
  --color-sev-low:          oklch(0.680 0.045 90);    /* #A39879  C 0.045 */
  --color-sev-medium:       oklch(0.740 0.105 78);    /* #CFA25A  C 0.105 */
  --color-sev-high:         oklch(0.720 0.160 52);    /* #F18336  C 0.160 */
  --color-sev-critical:     oklch(0.660 0.205 27);    /* #F64F47  C 0.205 */

  /* ---------- diff — .prg-code descendants ONLY ---------- */
  --color-diff-add-text:    oklch(0.855 0.120 168);   /* #77E9C0 */
  --color-diff-add:         oklch(0.800 0.130 168);   /* #58D8AE */
  --color-diff-add-bg:      oklch(0.800 0.130 168 / 0.08);
  --color-diff-del-text:    oklch(0.860 0.075 27);    /* #FFBFB7 */
  --color-diff-del:         oklch(0.660 0.205 27);    /* #F64F47 */
  --color-diff-del-bg:      oklch(0.660 0.205 27 / 0.09);

  /* ---------- syntax ---------- */
  --color-syn-comment:      oklch(0.660 0.012 250);
  --color-syn-plain:        oklch(0.860 0.008 250);
  --color-syn-keyword:      oklch(0.880 0.105 205);
  --color-syn-string:       oklch(0.870 0.115 82);
  --color-syn-number:       oklch(0.855 0.120 168);
  --color-syn-entity:       oklch(0.955 0.004 250);

  /* ---------- radius ---------- */
  --radius-data:            2px;
  --radius-panel:           4px;
  --radius-container:       6px;
  --radius-dot:             9999px;

  /* ---------- motion ---------- */
  --ease-instrument:        cubic-bezier(0.33, 0, 0.12, 1);
  --ease-snap:              cubic-bezier(0.20, 0, 0, 1);
  --ease-mass:              cubic-bezier(0.45, 0, 0.08, 1);
  --ease-exit:              cubic-bezier(0.40, 0, 1, 1);
  --dur-hover:              120ms;
  --dur-state:              180ms;
  --dur-reveal:             240ms;
  --dur-enter:              420ms;
  --dur-scan:               1400ms;
}

/* `inline` is REQUIRED because these point at other custom properties
   (the next/font variables). Without `inline` Tailwind emits the var
   reference, not the resolved value, and the font never applies. */
@theme inline {
  --font-display: var(--font-gsc);
  --font-mono:    var(--font-gsc);
  --font-sans:    var(--font-inter);
}

/* `static` force-emits these even when unused, because the 9-stage
   pipeline SVG reads them at runtime via getComputedStyle(). */
@theme static {
  --color-signal:    oklch(0.780 0.125 205);
  --color-signal-hi: oklch(0.860 0.115 205);
  --color-signal-lo: oklch(0.620 0.105 205);
  --color-marker:    oklch(0.800 0.130 82);
  --color-alarm:     oklch(0.660 0.205 27);
  --color-ink-6:     oklch(0.390 0.011 250);
}

@layer base {
  :root { color-scheme: dark; }
  html  { background: var(--color-ink-0); }
  body  {
    background: var(--color-ink-0);
    color: var(--color-text-body);
    -webkit-font-smoothing: antialiased;
  }
  /* Tailwind v4 defaults buttons to cursor:default. Put it back or
     every CTA feels dead. */
  button, [role="button"] { cursor: pointer; }
}
```

**Tailwind v3 → v4 traps** — every pre-2025 snippet you paste hits at least one:

`ring` 3px→1px (use `ring-3`) · default ring colour blue-500→`currentColor` · **default border colour gray-200→`currentColor`** (every `border` in a v3 snippet renders in the text colour) · `shadow-sm`→`shadow-xs`, `shadow`→`shadow-sm`, `rounded`→`rounded-sm`, `blur`→`blur-sm` (whole scale shifted one step) · `outline-none`→`outline-hidden` · `!flex`→`flex!` · `bg-[--brand]`→`bg-(--brand)` · variant stacking flipped to left-to-right · `space-y-*` now `> :not(:last-child)` with margin-**bottom** · `hover:` wrapped in `@media (hover: hover)` · `@apply` in a CSS module needs `@reference`.

---

## 2. Typography

### 2.1 Families and licences

| Role | Family | Licence | Version | Size |
|---|---|---|---|---|
| **Display + mono** | **Google Sans Code** | SIL OFL 1.1, *"Copyright 2025 The Google Sans Code Project Authors"* | **v7.001** (not 7.000 — 7.001 is the latest tag; a matching italic variable cut also ships) | 33.7 KB latin variable |
| **Prose** | **Inter Variable** | SIL OFL 1.1 | v4.1 (internal name-table string reads `4.001`; there is no newer Inter) | 47.1 KB latin wght-only subset / 343.9 KB full opsz+wght |

Combined budget **≤ 85 KB**, both self-hosted via `next/font/local`.

**A monospace as the display face.** Nobody in the AI-code-review category sets headlines in mono, and it is literally on-thesis: a machine that executes produces monospace output. It also makes the marketing headline and the dashboard readout the same voice.

**Verified properties of Google Sans Code that decide it:**
- **Slashed zero by default** (3 contours vs `O`'s 2) — no configuration needed.
- Lowercase `l` has a right-hooking tail; capital `I` has top and bottom bars. Every `l`/`1`/`I`/`0`/`O` ambiguity resolved out of the box.
- **Its only GSUB features are `ccmp`/`locl`/`mark`/`ss01`.** There is *no* `liga` and *no* `calt` — **zero code ligatures exist to fight.** Nothing can silently rewrite `!=` into one glyph inside evidence.
- 0.600em advance — a 64-char SHA line costs the same width as any serious mono.

**Explicitly rejected, with reasons:**

| Face | Why not |
|---|---|
| **Geist / Geist Mono** | CodeRabbit's *only* typeface (verified: their single served woff2 is `Geist Regular` v1.800). Arriving in Geist makes you the cheaper version of the incumbent. Geist Mono additionally has an `l`/`1` collision (open issue vercel/geist-font#102) needing `ss03`, and its `ss09` *removes* the slashed zero |
| **Berkeley Mono** | Disqualified on **terms before price**. The commercial licence states *"Commercial licenses are not compatible with open-source apps"* and restricts commercial use to UI elements with **terminal apps explicitly called out as generally disallowed** — PRGuard's hero *is* a terminal view. Real cost for a small team is $790+ (Startup $495 + Web Fonts module $295); at 8–50 employees the web module becomes a **$45/month subscription** |
| **Inter as a display face** | Linear, Raycast, Neon, Graphite, Resend, Supabase, Modal and Warp all ship it. Prose only |
| **Instrument Serif** | On both raycast.com and warp.dev. The "one tasteful serif accent" move is now a trend marker |
| **Fontshare (Satoshi/Switzer/General Sans)** | ITF FFL v2.0 permits self-hosting but **prohibits subsetting** without written consent — you must ship the full file |

### 2.2 OpenType configuration

```css
/* Inter — prose only.
   NOTE: the widely-copied Linear settings "cv01","ss03" do almost nothing
   in English. cv01 = "Alternate one" (the DIGIT 1 only); ss03 = "Round
   quotes & commas". Neither touches a letterform in ordinary UI labels.
   cv11 (single-storey a) and cv05 (tailed l) are what actually change
   the texture. */
.font-prose {
  font-family: var(--font-sans);
  font-feature-settings: "cv05" 1, "cv11" 1;
  font-optical-sizing: auto;          /* marketing only; dashboard ships wght-only */
}

/* CRITICAL: font-feature-settings REPLACES the whole feature list and will
   cancel font-variant-numeric. Merge them, never stack them. */
:root { --font-settings: "cv05" 1, "cv11" 1; }
.tabular {
  font-feature-settings: var(--font-settings), "tnum", "zero";
  font-variant-numeric: lining-nums tabular-nums slashed-zero;
}

/* Google Sans Code — belt-and-braces. It has no liga/calt to disable,
   but this guarantees verbatim evidence even if the file is ever swapped. */
.font-mono, .prg-code, .prg-terminal, .prg-diff {
  font-family: var(--font-mono);
  font-variant-ligatures: none;
  font-variant-numeric: tabular-nums slashed-zero;
  letter-spacing: 0;                  /* NON-NEGOTIABLE — see §2.5 */
}
```

### 2.3 The scale (root = 16px)

#### Display — Google Sans Code, weight 520 (hero) / 560 (section heads)

| Token | rem | px | Line height | Tracking | Weight |
|---|---|---|---|---|---|
| `display-hero` | `clamp(2.5rem, 1rem + 5.6vw, 4.5rem)` | 40 → **72** | 1.02 | **−0.032em** | 520 |
| `display-h2` | `2.5rem` | 40 | 1.08 | −0.028em | 560 |
| `display-h3` | `1.5rem` | 24 | 1.20 | −0.020em | 560 |
| `display-h4` | `1.125rem` | 18 | 1.30 | −0.014em | 560 |

> **Mono at 72px is unforgiving.** Hard-cap the headline at **8 words**, hand-set line breaks per breakpoint, and set the literal string at 1280/1440/1920 **on the actual demo machine on day one**. Confirm Google Sans Code's variable `wght` axis renders — if it falls back to a static 400 cut the entire hierarchy flattens. If it reads as a terminal banner rather than a headline after that test, drop the clamp ceiling to **3.875rem (62px)** rather than changing typeface.

#### Label — Google Sans Code, weight 500, UPPERCASE, `+0.12em`

| Token | rem | px | Line height |
|---|---|---|---|
| `label` | `0.6875rem` | 11 | 1.40 |

The instrument-panel legend. Every eyebrow, column header, stage name, chip, and section index (`/ 05 — COMPUTED SEVERITY`). **Cap at 4 words** — uppercase mono past that tanks readability.

#### Body — Inter

| Token | rem | px | Line height | Tracking | Max measure |
|---|---|---|---|---|---|
| `lead` | `1.125rem` | 18 | 1.55 | −0.011em | 58ch |
| `body` | `0.9375rem` | 15 | 1.60 | −0.011em | 62ch |
| `small` | `0.8125rem` | 13 | 1.50 | −0.013em | — |
| `micro` | `0.6875rem` | 11 | 1.40 | 0 | — |

#### Data — Google Sans Code, tabular, tracking **exactly 0**

| Token | rem | px | Line height | Weight | Use |
|---|---|---|---|---|---|
| `readout-xl` | `3rem` | 48 | 1.00 | 500 | The severity score. Tracking −0.020em |
| `readout` | `1.25rem` | 20 | 1.20 | 500 | Metric-card values |
| `terminal` | `0.8125rem` | **13 / 22px** (1.6923) | 400 | Terminal + diff. Deliberately looser than Linear's 14/24 because tracebacks need line separation more than density |
| `data` | `0.78125rem` | 12.5 | 1.45 | 400 | Dashboard table cells |
| `chip` | `0.6875rem` | 11 | 1.40 | 600 | Chips, hashes |

#### Dashboard overrides

Body drops to **13px**, 15px reserved for primary content only. Labels stay 11px mono caps. Row height **32px** default with a **26px** compact toggle.

### 2.4 `next/font` setup

```ts
// app/fonts.ts
import localFont from 'next/font/local';

export const gsc = localFont({
  src: [
    { path: './GoogleSansCode-VF.woff2',       weight: '300 800', style: 'normal' },
    { path: './GoogleSansCode-Italic-VF.woff2', weight: '300 800', style: 'italic' },
  ],
  variable: '--font-gsc',
  display: 'swap',
  preload: true,
  adjustFontFallback: false,   // mono metrics differ too much from Arial;
                               // we set our own overrides below
  declarations: [
    { prop: 'ascent-override',  value: '92%' },
    { prop: 'descent-override', value: '24%' },
  ],
});

export const inter = localFont({
  src: './InterVariable-latin.woff2',   // wght-only, 47.1 KB
  variable: '--font-inter',
  display: 'swap',
  preload: true,
});
```

```tsx
// app/layout.tsx  — ROOT layout. Both faces preload on every route,
// which is correct here because both are used on both surfaces.
<html lang="en" className={`${gsc.variable} ${inter.variable}`} data-scroll-behavior="smooth">
```

**Gotchas that bite:**
- `subsets` is a `next/font/google` option **only**. For `next/font/local` you must subset the `.woff2` yourself before importing.
- `adjustFontFallback` accepts only `'Arial' | 'Times New Roman' | false` for local fonts — it cannot be tuned numerically. Use `declarations` for real metric overrides.
- `display: 'swap'` and `preload: true` are already the defaults; stated explicitly for the reader.
- The full Inter opsz+wght cut (343.9 KB) ships on the **marketing** layout only. The dashboard gets the 47.1 KB wght-only subset, because dashboard text lives in a narrow size band where `opsz` earns nothing.

### 2.5 When mono is used — the governing rule

> **Inter renders sentences. Google Sans Code renders everything a machine produced.**

Mono is mandatory for: every SHA, fingerprint, `event_hash`, severity score, weight, contribution, token count, cost figure, latency, `seq` number, timestamp, `file:line` reference, stage label, terminal line, diff line, audit event type, API path, and every chip.

Mono is **forbidden** for: paragraphs, marketing prose, tooltips longer than 6 words, error message bodies.

**Tracking on all monospace data is exactly 0.** Any tracking on mono destroys column alignment, which is the one visual property a forensic product cannot get wrong. The only mono that takes negative tracking is the display line.

Hashes render as **first-8 + ellipsis + last-4** (`a91f3c2e…8b4d`) with click-to-copy and a `title` carrying the full 64 characters.

---

## 3. Space, radius, border, shadow, glow, elevation

### 3.1 Space — 4px base

| Token | px | Use |
|---|---|---|
| `--sp-0` | 0 | — |
| `--sp-px` | 1 | Hairline offsets |
| `--sp-1` | 4 | Icon↔label gap, chip padding-y |
| `--sp-2` | 8 | Dense cell padding, graph-paper minor grid |
| `--sp-3` | 12 | Table cell padding-x, button padding-x (sm) |
| `--sp-4` | 16 | Card padding, mobile gutter, button padding-x (md) |
| `--sp-5` | 20 | Panel padding |
| `--sp-6` | 24 | Section inner padding, card padding (lg) |
| `--sp-8` | 32 | Panel header height, block spacing |
| `--sp-10` | 40 | Terminal gutter width |
| `--sp-12` | 48 | Section spacing (dashboard) |
| `--sp-16` | 64 | Graph-paper major grid |
| `--sp-20` | 80 | Section spacing (marketing, tight) |
| `--sp-24` | 96 | Section spacing (marketing, default) |
| `--sp-32` | 128 | Section spacing (marketing, hero) |

### 3.2 Radius

| Token | px | Applies to |
|---|---|---|
| `--radius-data` | **2** | Chips, inputs, buttons, table cells, terminal panes, diff rows |
| `--radius-panel` | **4** | Cards, panels, dialogs |
| `--radius-container` | **6** | The largest container only (hero bench, command palette) |
| `--radius-dot` | 9999 | **The live heartbeat dot, and nothing else** |

Nothing is pill-shaped. Marketing radii (12/16/24px) on a dense table make rows look like chat bubbles and steal 8px of horizontal room per cell.

### 3.3 Borders

| Purpose | Token | Contrast | Rule |
|---|---|---|---|
| Decorative division | `--rule-hair` | 1.11:1 | Table separators, graph paper. **Never a meaning-bearing edge** |
| Default panel edge | `--rule-1` | 1.21:1 | Cards, panels |
| Interactive at rest | `--rule-2` | 1.42:1 | Ghost buttons, inputs at rest |
| Hover | `--rule-3` | 1.90:1 | — |
| **Meaning-bearing** | `--ink-7` | **3.03:1** | Input outline when focused-within, selected-row indicator, active tab underline |
| Focus ring | `--signal-hi` | 13.50:1 | `outline: 2px solid; outline-offset: 2px` |

`--border-hairline: 0.5px` at `@media (min-resolution: 2dppx)`, `1px` below.

**Never zebra-stripe.** At 32px rows on near-black, alternating fills produce visible banding and read as a 2010s admin template. Every serious dark product (Linear, Vercel, Axiom, Trigger) uses hairlines.

Alpha borders **stack** where two bordered elements abut (0.09 + 0.09 = 0.18). Use `border-collapse` or explicit single-side borders in dense tables.

### 3.4 Shadow — there are two

```css
--shadow-palette: 0 8px 32px oklch(0 0 0 / 0.55);   /* ⌘K palette only */
--shadow-modal:   0 16px 48px oklch(0 0 0 / 0.60);  /* dialogs only */
```

That is the complete inventory. On a dark surface, blur reads as smudge. Depth comes from lightness, not from shadow.

### 3.5 Glow — there are two

```css
/* 1. The single ambient element on the entire site. Never animates.
      Accent coverage across the hero stays under 3% of pixels. */
--glow-hero: radial-gradient(70% 50% at 78% 12%,
             oklch(0.78 0.125 205 / 0.10), transparent 68%);

/* 2. Focus ring — the only "glow" in the dashboard, and it is an outline. */
--focus-ring: 0 0 0 2px var(--color-ink-0), 0 0 0 4px var(--color-signal-hi);
```

**Cyan on near-black is the cyberpunk-hackathon cliché if overused.** It reads as instrumentation only at low coverage: under ~3% of hero pixels, on 1px borders, 2px rails, text and status fills — never as a large area wash, never with a bloom.

### 3.6 Elevation model

Depth is expressed as **one rung on the ink ladder + a 1px hairline + a 1px inset top highlight**:

```css
.surface {
  background: var(--color-ink-2);
  border: 1px solid var(--color-rule-1);
  border-radius: var(--radius-panel);
  box-shadow: inset 0 1px 0 var(--color-inset-hi);   /* the entire "milled" effect */
}
```

| Level | Background | Border | Inset | Example |
|---|---|---|---|---|
| 0 | `--ink-0` | — | — | Page |
| 1 | `--ink-1` | `--rule-hair` | — | Sidebar, sticky header, terminal interior |
| 2 | `--ink-2` | `--rule-1` | `--inset-hi` | Card, panel |
| 3 | `--ink-3` | `--rule-2` | `--inset-hi` | Hover, popover |
| 4 | `--ink-4` | `--ink-7` | `--inset-hi` | Selected, pressed |
| Overlay | `--ink-1` | `--rule-2` | `--inset-hi` + `--shadow-modal` | Dialog, palette |

> **Surfaces step exactly one rung, never two.**

**Elevation must never be the only channel carrying structure.** On a washed-out venue projector the ink-1/ink-2/ink-3 steps (relative luminance 1.00 / 1.06 / 1.16) collapse into one flat black. This is why `[data-contrast="high"]` exists (§8.5) and why every meaningful boundary uses `--ink-7`, not a surface step.

---

## 4. The texture layer

### 4.1 Graph paper — the substrate

This is **non-negotiable**. It is what stops a large dark gradient from banding and from reading as an unstyled div.

```css
.substrate {
  background-color: var(--color-ink-0);
  background-image:
    /* minor grid, 8px */
    repeating-linear-gradient(to right,  var(--color-grid) 0 1px, transparent 1px 8px),
    repeating-linear-gradient(to bottom, var(--color-grid) 0 1px, transparent 1px 8px),
    /* major grid, 64px */
    repeating-linear-gradient(to right,  var(--color-grid) 0 1px, transparent 1px 64px),
    repeating-linear-gradient(to bottom, var(--color-grid) 0 1px, transparent 1px 64px);
}
```

In the dashboard the grid drops to `--grid-dash` (0.018) and becomes **functional**: it is the graticule the 9-stage waterfall and the cost/latency charts sit on. The marketing texture turns into a measurement grid.

### 4.2 Grain — inline `feTurbulence`, bounded

```css
.grain {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  opacity: 0.035;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 180px 180px;
}
/* Safari's overlay compositing differs from Blink — verify in both. */
```

**Rules:**
- `stitchTiles='stitch'` is what prevents visible seams when the tile repeats.
- `numOctaves` **never above 3** — it is a paint-cost cliff for a difference invisible at UI opacity.
- **Bounded to named sections. Never `position: fixed; inset: 0` across the document** — an SVG filter is computed per-pixel, not decoded, so an unbounded full-viewport grain layer on a 3× phone becomes a multi-megabyte GPU texture.
- **Never animate** `baseFrequency` or `seed`.
- Dashboard: grain drops to **0.015 or off entirely** (it costs paint on a scrolling 400-row table) and is **0 inside virtualized lists**.

> Anti-reference: Linear ships a **696,402-byte PNG** for the same effect. The data URI above is under 1 KB, recolourable by editing one number, and needs no request.

### 4.3 Hero background — the full stack

```css
.hero {
  position: relative;
  isolation: isolate;
  background-color: var(--color-ink-0);
}
.hero::before {                    /* graph paper */
  content: ""; position: absolute; inset: 0; z-index: -2;
  background-image:
    repeating-linear-gradient(to right,  var(--color-grid) 0 1px, transparent 1px 8px),
    repeating-linear-gradient(to bottom, var(--color-grid) 0 1px, transparent 1px 8px),
    repeating-linear-gradient(to right,  var(--color-grid) 0 1px, transparent 1px 64px),
    repeating-linear-gradient(to bottom, var(--color-grid) 0 1px, transparent 1px 64px);
  /* fade the grid out at the bottom so it never fights the fold */
  mask-image: linear-gradient(to bottom, #000 0%, #000 72%, transparent 100%);
}
.hero::after {                     /* the one static radial. never animates. */
  content: ""; position: absolute; inset: 0; z-index: -1;
  background: radial-gradient(70% 50% at 78% 12%,
              oklch(0.78 0.125 205 / 0.10), transparent 68%);
}
/* <div class="grain"> is a real child element, z-index 0, above both. */
```

### 4.4 Section index + provenance footer (the bracket)

Every evidence frame is bracketed: **index above, provenance below.**

```css
.exhibit__index {           /* top strip, 28px */
  font: 500 0.6875rem/1.4 var(--font-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  background: var(--color-ink-2);
  border-bottom: 1px solid var(--color-rule-1);
}
/* content: "/ 05 — COMPUTED SEVERITY · finding a91f3c2e" */

.exhibit__provenance {      /* bottom strip, 24px */
  font: 400 0.6875rem/1.4 var(--font-mono);
  color: var(--color-text-dim);
  border-top: 1px solid var(--color-rule-hair);
}
/* content: "GET /v1/reviews/4e8b1d0/result → findings[0].proof
             · captured 2026-09-19T14:22:07Z" */
```

> The provenance line costs one `<span>` and is the single most differentiating device in the system: it tells a judge that what they are looking at **has a source, not a designer** — the positioning sentence rendered as a UI element. In the dashboard it doubles as a genuinely useful debugging affordance.
>
> Do **not** import a longer `EXHIBIT 01 · PROOF · finding a91f3c2e · captured …` header. Index + category + identifier above; the captured-at timestamp drops to the footer beside the provenance path.

### 4.5 Registration marks (R5: evidence frames only)

Four 8px L-shaped corner crop marks, 1px strokes, `0.10 → 0.22` alpha on hover over 120ms. Pure CSS, two strokes per corner.

```css
.exhibit { position: relative; }
.exhibit::before, .exhibit::after {
  content: ""; position: absolute; width: 8px; height: 8px;
  border-color: oklch(1 0 0 / 0.10);
  transition: border-color var(--dur-hover) var(--ease-snap);
  pointer-events: none;
}
.exhibit::before { top: -1px; left: -1px;  border-top: 1px solid; border-left: 1px solid; }
.exhibit::after  { top: -1px; right: -1px; border-top: 1px solid; border-right: 1px solid; }
/* bottom pair via a single child span with the same treatment */
.exhibit:hover::before, .exhibit:hover::after { border-color: oklch(1 0 0 / 0.22); }
```

Reads instantly as CAD viewport / film gate. Nothing else in the category has it — which is exactly why it must not escape onto buttons and chips.

### 4.6 The 1px gradient border (mask-composite)

For the one heavy element (the hero bench frame):

```css
.gradient-border {
  position: relative;
  border-radius: var(--radius-container);
}
.gradient-border::before {
  content: ""; position: absolute; inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(160deg,
    oklch(1 0 0 / 0.16) 0%,
    oklch(1 0 0 / 0.06) 35%,
    oklch(0.78 0.125 205 / 0.14) 100%);
  mask-image: linear-gradient(#000, #000), linear-gradient(#000, #000);
  mask-clip: content-box, border-box;
  mask-composite: exclude;
  pointer-events: none;
}
```

If you ever animate it, the angle **must** be a registered custom property or the animation silently does nothing:

```css
@property --grad-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
```

(`@property` is Baseline: Chrome 85 / Firefox 128 / Safari 16.4.)

### 4.7 Motion system

**Three easings. Nothing else exists.**

```css
--ease-instrument: cubic-bezier(0.33, 0, 0.12, 1);  /* entrances, wipes, scans */
--ease-snap:       cubic-bezier(0.20, 0, 0, 1);     /* chips, hovers, state flips */
--ease-mass:       cubic-bezier(0.45, 0, 0.08, 1);  /* EXACTLY ONE element */
--ease-exit:       cubic-bezier(0.40, 0, 1, 1);     /* exits, 160ms */
```

> **Correction to the source spec.** The BLAST DOOR graft specifies `--ease-mass: cubic-bezier(0.33, 0, 0.12, 1)` — which is byte-identical to COLD LIGHT's `--ease-instrument`, so the token as written adds nothing. I have given `--ease-mass` a genuinely heavier curve (`0.45, 0, 0.08, 1` — slower start, longer accelerate, harder arrest) so the graft's *intent* survives. It is used for **exactly one thing: the scan line's travel down the proof bench.** A curve with real weight on the one element that traverses the whole panel is what separates "animated" from "actuated."

`linear` for **every** scroll-scrubbed value, without exception. Easing a scrub fights the scroll input and reads as lag.

**Banned:** any curve with overshoot. Nothing in this product bounces. Tailwind's default `cubic-bezier(0.4, 0, 0.2, 1)` never appears on anything a judge will look at.

**Five durations, quantised, nothing in between:**

| Token | ms | Use |
|---|---|---|
| `--dur-hover` | 120 | Hover, focus ring, chip tint |
| `--dur-state` | 180 | State-flip scale, tooltip |
| `--dur-reveal` | 240 | Small reveal, underline draw, opacity enter |
| `--dur-enter` | 420 | Element entrance, rail wipe, section rule draw |
| `--dur-scan` | 1400 | The hero scan. The only long duration on the site |

Plus **90ms** for `:active`. Stagger: **60ms** between siblings, **120ms** between pipeline stages, terminal rows as **three stepped groups at 0/120/240ms** (not 60 individual delays).

**The deliberate exception:** verdict and gate colour changes are **0ms** — no `transition` property at all — paired with a `scale(1.045) → 1` over 180ms on `--ease-snap`. Because every other transition is eased, an instantaneous colour flip reads as *a machine returning a result* rather than an interface animating. **This is the single most important motion decision in the project and it must not be softened.**

**The one pulse on the entire product** is the heartbeat dot:

```css
@keyframes tick { 0%, 100% { opacity: 0.35 } 12% { opacity: 1 } }
.heartbeat { animation: tick 1200ms steps(1, end) infinite; }
```

1200ms matches the real poll interval. It stops and turns `--marker` when heartbeat age exceeds 20s, with `18s since last output` printed beside it in mono. **A pulsing dot that pulses when nothing is happening is a lie; one driven by real telemetry is instrumentation.**

**The fallback handshake (R8) — this is what stops a blank page:**

```html
<!-- in <head>, inline -->
<style>
  [data-anim] { visibility: hidden; }
  @keyframes force-reveal { to { visibility: visible; } }
  [data-anim] { animation: force-reveal 0s 1600ms forwards; }
  html.anim-ready [data-anim] { animation: none; }  /* JS disarms only on success */
</style>
<noscript><style>[data-anim]{visibility:visible!important;animation:none!important}</style></noscript>
```

JS adds `anim-ready` to `<html>` **only after confirming the animation runtime actually loaded**. Bundle 404s on venue wifi → everything appears in its final state at t=1600ms. **Degraded, never invisible.**

**Compositor contract, enforced as a lint rule:** `transform`, `opacity`, `clip-path`, `filter`, `stroke-dashoffset` only. Never `width`, `height`, `top`, `left`, `margin`, `box-shadow` or `background-color` per frame. **Never animate a CSS custom property on `:root`** — it triggers paint across the whole invalidated subtree (one measured case forced recalc on 1,300+ elements at 8ms/frame). `will-change` is added immediately before an animation and removed after, never sprayed. `stroke-dashoffset` is a *paint* property: **never more than 6 paths animating simultaneously**; the other edges sit in their static end state.

---

## 5. Component specifications

Shared conventions: hover = surface steps exactly one ink rung + hairline goes `--rule-1 → --rule-2`, 120ms. `:active` = `translateY(0.5px)` at 90ms, **no scale**. Focus = `outline: 2px solid var(--color-signal-hi); outline-offset: 2px`, **never `outline: none`** (and note Tailwind v4 renamed the class to `outline-hidden` — grep pasted v3 snippets).

### 5.1 Button

| Variant | Rest | Hover | Active | Focus | Disabled |
|---|---|---|---|---|---|
| **primary** | bg `--signal`, text `--ink-0` (Lc 67.7), radius 2px | bg `--signal-hi`, 120ms | `translateY(0.5px)`, 90ms | ring | bg `--ink-5`, text `--text-disabled`, `cursor: not-allowed` |
| **secondary** | bg `--ink-2`, text `--text-body`, 1px `--rule-2` | bg `--ink-3`, border `--rule-3` | `translateY(0.5px)` | ring | bg `--ink-1`, text `--text-disabled`, border `--rule-1` |
| **ghost** | transparent, text `--text-body`, 1px `--rule-2` | bg `--ink-2`, border `--rule-3` | `translateY(0.5px)` | ring | text `--text-disabled`, border `--rule-hair` |
| **quiet** | transparent, text `--text-dim`, no border | bg `--ink-2`, text `--text-body` | `translateY(0.5px)` | ring | text `--text-disabled` |
| **danger** | bg `--alarm-tint-hi`, text `--alarm-text` (Lc −74.6), 1px `--alarm` | bg 20% alarm over ink-1, border `--alarm-hi` | `translateY(0.5px)` | ring | — |

**Never** a solid `--alarm` fill with a small label (R2, Lc 43.3).

Sizes: `sm` 26px height / 12px padding-x / 11px label · `md` 32px / 16px / 11px label · `lg` 40px / 20px / 13px label. All labels are **Google Sans Code 500 UPPERCASE `+0.12em`**.

Loading: replace the label with the heartbeat dot at `--signal`; keep the button width fixed (measure the label, set `min-width`) so nothing reflows. `aria-busy="true"`.

### 5.2 Input / textarea / select

```
rest     bg --ink-1 · 1px --rule-2 · text --text-body · radius 2px · 32px height
         placeholder --text-disabled (Lc -24.3, exempt)
hover    border --rule-3, 120ms
focus    border --ink-7 (3.03:1 — MEANING-BEARING, per SC 1.4.11)
         + outline 2px --signal-hi, offset 2px
invalid  border --alarm (the border is geometry, so --alarm is legal here)
         + helper text in --alarm-text at 11px
disabled bg --ink-1 · border --rule-hair · text --text-disabled
```

Label: 11px mono caps `--text-dim`, 6px above. Helper/error text: 11px Inter, 4px below. **Error text is never colour-only** — it carries a 12px alert glyph.

Inputs inside a terminal or diff context use `--font-mono` and `font-variant-numeric: tabular-nums slashed-zero`.

### 5.3 Card / Surface

Two primitives, and the distinction matters:

**`<Surface>`** — ordinary panels. `--ink-2`, 1px `--rule-1`, 4px radius, `inset 0 1px 0 --inset-hi`. **No registration marks.**

**`<Exhibit>`** — evidence-bearing frames only. Everything Surface has, **plus** the four registration marks, **plus** the index strip (28px, `--ink-2`) and the provenance footer (24px). `--radius-container` 6px on the largest instance.

```tsx
<Exhibit
  index="05"
  category="COMPUTED SEVERITY"
  identifier="a91f3c2e"
  provenance="GET /v1/reviews/4e8b1d0/result → findings[0].severity"
  capturedAt="2026-09-19T14:22:07Z"
  density="full" | "compact"
/>
```

Hover (both): surface steps one rung, hairline `--rule-1 → --rule-2`, marks `0.10 → 0.22`, 120ms. **Nothing translates, scales or glows.**

### 5.4 Badge / Pill

Base: 20px height (never render below this), `--radius-data` 2px, 6px padding-x, **11px Google Sans Code 600 UPPERCASE `+0.08em`**, 12px leading glyph, 4px gap.

#### Proof badges

| State | Background | Border | Text | Glyph |
|---|---|---|---|---|
| `PROVEN` | `--signal` solid | none | `--ink-0` (Lc 67.7) | filled vial |
| `DISPROVEN` | transparent | 1px `--signal` | `--signal-text` | struck vial |
| `INCONCLUSIVE` | `--marker-tint` | 1px **dashed** `--marker` | `--marker-text` | half vial |
| `NOT ATTEMPTED` | transparent | 1px `--rule-2` | `--text-disabled` | empty vial |

`DISPROVEN` additionally applies `text-decoration: line-through` to the **finding title**, not to the badge, plus the caption `refuted by execution` in 11px `--text-dim`.

#### Gate badge (280×44px, top-right of every run view)

| State | Background | Border | Text |
|---|---|---|---|
| `BLOCKED` | `--alarm-tint-hi` | `border-top: 2px solid --alarm` | `--alarm-text` + `· 1 proven finding` |
| `RUNNING` | `--ink-2` | 1px `--rule-1` | `--text-dim` |
| `CLEAR` | `--signal-tint-lo` | `border-bottom: 1px solid --signal-lo` | `--text-body` |

Transition on gate change: **0ms colour, 180ms `scale(1.045) → 1`, 220ms width expand.** `role="alert"` fires **only** on BLOCKED.

#### Severity — NOT a badge (R3)

```
0.812  ██████░░░░  CRITICAL
       └─ 5-segment meter, 3px min segment width, gap 2px
          fill = --sev-* for the achieved band, empty = --ink-5
          score in readout mono, tabular, 3 decimals, --text-primary
          band label in 11px mono caps, --text-dim
```

List-row glyph: a **20px six-segment sparkline** of the weighted contributions, so hundreds of rows can be compared at a glance without a colour pill.

Full breakdown (finding detail + marketing §05): a horizontal **weighted contribution bar** whose total length *is* the score, six segments sized `value × weight`, band threshold ticks printed on the same axis at `.15 / .35 / .55 / .75`, one hue at six lightness steps (never six hues), a `2px 45°` hatch on `proof_confidence` because it is the only input about the system's own certainty. Below it, a six-row table `input | raw 0..1 | weight | contribution`, all tabular to 3 decimals. Above it, the generated sentence as a 15px mono pull-quote.

Animation: segments grow left-to-right, 520ms each, 60ms stagger; the 48px readout **SNAPS** (no count-up) the instant the bar crosses the final tick.

### 5.5 Table row

```
height        32px default / 26px compact (toggle persisted)
text          12.5px Google Sans Code (data) / 13px Inter (prose cells)
numerals      tabular-nums slashed-zero, ALWAYS
separator     1px --rule-hair (bottom only). NEVER zebra striping.
rest          transparent
hover         bg --ink-3, 120ms
selected      bg --ink-4 + 2px left bar in --signal-lo
focused (j/k) outline 2px --signal-hi, offset -2px (inset, so it does not
              clip against the sticky header)
              + scroll-margin-top = sticky header height  ← SC 2.4.11, Level AA
```

Findings columns, first four frozen:
`[select] [severity reading] [proof glyph] [title ⋯truncate] [file:line mono middle-truncate] [category] [score 3dp] [age] [status]`

Sticky header: `--ink-1`, `backdrop-filter: blur(8px)`, 1px `--rule-1` bottom.

Pagination: **cursor-based**, with an explicit `Showing 1–50 of 1,284` and a `Load more` button. **Never infinite scroll** — it breaks deep links, browser find-in-page, and "jump to finding 400".

Virtualize above ~400 rows with TanStack Virtual. Saved views are URL-first via `nuqs`, then nameable.

### 5.6 Code block

```
container   .prg-code · bg --ink-1 · 1px --rule-1 · radius 2px
gutter      40px, --text-dim, 12.5px mono, right-aligned, tabular
body        13px / 22px Google Sans Code, letter-spacing 0
            font-variant-ligatures: none
overflow    horizontal scroll — NEVER wrap (wrapping destroys alignment)
selection   background --signal-tint, colour inherit
scrollbar   scrollbar-thin, thumb --ink-5, track transparent
```

Rendered with **Shiki 4.4.3**, dual-theme disabled (dark only), using a custom theme generated from the token file — **never `github-dark`**, because the category's entire visual language is GitHub's palette and it carries zero brand. Import only the 6–10 languages you support; **never the `@shikijs/langs` barrel (8.25 MB)**.

Transformers in use: `transformerNotationHighlight` (`.highlighted` → 1px `--signal-lo` left bar + `--signal-tint-lo` bg), `transformerNotationErrorLevel` (`.error` → `--alarm-tint-lo` bg), `transformerRenderLineNumber`. Transformers emit classes only; the CSS is ours.

Toolbar (32px, `--ink-2`): copy-raw · download-raw · wrap toggle · language label in 11px mono caps.

### 5.7 Terminal block (the signature component)

Used **twice, as the same component**: the marketing hero at `density="full"` and the finding-detail proof pane at `density="compact"`. That identity is what makes the site read as a product rather than as two disconnected artifacts.

```
header (32px, --ink-2, 1px --rule-1 bottom)
  ├ label   11px mono caps --text-dim:  SANDBOX · python:3.12-slim · seed 4a91
  ├ dot     6px --signal heartbeat (radius-dot — the only pill in the product)
  └ chip    proof badge, right-aligned

pane A (base SHA)           pane B (head SHA)
  bg      --signal-tint-lo    bg      --alarm-tint-lo
  rail    2px --signal-lo     rail    2px --alarm
  height  210px (full) / 160px (compact)
  gutter  40px, --text-dim, tabular
  text    13px / 22px mono
  pass    "passed" in --signal-text (Lc -84.6)
  fail    traceback in --alarm-text (Lc -76.7 on the tinted pane — verified)

divider  1px --rule-1 with a centred 11px mono caps label: — HEAD 9c2d4b —

verdict rail (44px, --ink-2)
  left   PASSES AT BASE · FAILS AT HEAD · PROVEN   11px mono caps
  right  → blocks merge                             --alarm-hi, 20px (large-text tier)

provenance footer (24px)
  GET /v1/reviews/4e8b1d0/result → findings[0].proof · captured 2026-09-19T14:22:07Z
```

**Implementation:** `anser@2.3.5` (0.04 MB, zero deps) with `ansiToJson(text, { use_classes: true })` into our own virtualized `<pre>`. **Never `xterm.js`** — 5.65 MB, it owns its own scrollback and sizing, fights SSR, virtualization, selection and theming, and v6 removed the canvas renderer. We are rendering a captured artifact, not emulating a terminal.

**Terminal output must be real, selectable, syntax-highlighted text.** A PNG of a terminal is exactly what a product that could not actually do this would ship.

**Motion (the 4.2s hero sequence, then a 4.0s hold):**

| t | Event |
|---|---|
| 0 | **Already in final state at first paint.** Both terminals rendered, verdict stamped, chip reads PROVEN. Nothing is `opacity: 0` |
| 0 → 1400ms | **Scan line.** 2px `--signal-hi` at 60% with a 24px falloff gradient, `translateY` panel top → bottom, `--ease-mass`. Three stepped row-groups per pane go `opacity 0.35 → 1` at 0/120/240ms offsets. One transform, one element |
| 400ms | Pane A rail wipes in, `scaleY(0→1)`, origin top, 420ms |
| 1400ms | Pane B rail wipes in, `--alarm` |
| 1900ms | `1 failed` gets a 1px `--alarm` underline, `scaleX(0→1)`, 240ms |
| **2200ms** | **THE STAMP.** Chip flips `--ink-8/--rule-2` → solid `--signal` with a **0ms colour change** plus `scale(1.045) → 1` over 180ms |
| 2400ms | `→ blocks merge` fades in, 160ms |
| 2400 → 6400ms | **HOLD. Absolutely nothing moves except the heartbeat dot.** This is where a judge reads. Without it the sequence is a demo of animation; with it, it is a machine returning a result and then sitting still |

Bound to the **`P` key**, paused-timeline-first. Build it keyboard-driven **before** wiring scroll — the money shot is then frame-identical on demand when a judge says "show that again", and if the scroll scrub slips you still have a complete demoable moment.

**`D` key** runs the identical bench on a different finding whose head-SHA run **passes**: pane B shows `1 passed in 0.61s` in `--signal-text`, the claim strikes through, the chip stamps `DISPROVEN` in cyan **outline**, and the verdict rail reads `gate stays clear · 0 proven · 1 self-refuted`. Ten seconds of the system publicly losing an argument with itself. This requires **at least one genuinely disproven finding seeded in the demo corpus** — make it a backend requirement on day zero.

### 5.8 Diff line

```
row         min-height 22px, 13px/22px mono, .prg-diff
gutter      2 columns: old line no. | new line no., 32px each, --text-dim, tabular
marker      12px column, +/− glyph — THE SEMANTIC CHANNEL, never optional
added       bg --diff-add-bg (8%), marker --diff-add, text --diff-add-text
removed     bg --diff-del-bg (9%), marker --diff-del, text --diff-del-text
context     bg transparent, text --syn-plain
hunk header bg --ink-2, 11px mono caps --text-dim
finding     the row carrying a finding gets a 2px left bar in the --sev-* colour
            and an inline finding card hung beneath it
```

8–9% tints, **not** the category-standard 20% — at 20% the code stops being readable, which is the one thing a forensic product cannot afford.

**Implementation:** `@git-diff-view/react@0.1.7` + `@git-diff-view/shiki`, using `renderExtendLine` + `extendData` to hang the finding card under the offending line. **Wrap it in a single `<PRGuardDiff>` component** — it is 0.1.x from a single maintainer and is the riskiest dependency in the build; a swap to `react-diff-view@3.3.3` (whose `widgets` + `renderToken` + `generateLineClassName` cover the same seams) must touch exactly one file.

Virtualize above ~400 lines.

### 5.9 Tooltip

```
bg --ink-3 · 1px --rule-2 · radius 2px · 8px/6px padding
text 11px Inter --text-body (mono if the content is a value)
max-width 260px · offset 8px
enter opacity + 2px translate, 180ms --ease-snap, 400ms open delay
exit  160ms --ease-exit, 0ms close delay
```

**No shadow.** `role="tooltip"` + `aria-describedby`. **Never the only home for information** — definitions, caveats and metric `n` values are always-visible body text, never tooltips (§8.4).

### 5.10 Sheet (slide-over)

**Permitted uses only:** filter panels, the suppression form on viewports < 1024px, settings sub-forms.

**Explicitly banned for finding detail.** Terminal output at 80–120 columns needs ~940px at 13px mono; a 480–600px sheet truncates the single artifact the whole product rests on. Finding detail is a master-detail split plus a canonical full page at `/findings/:id` — because a finding is evidence, and evidence must be a shareable deep link.

```
width 420px · bg --ink-1 · 1px --rule-2 left border · no radius
scrim --scrim, fades 180ms
enter translateX(100% → 0), 240ms --ease-instrument
exit  160ms --ease-exit
focus trapped · Esc closes · focus returns to the trigger
```

### 5.11 Dialog

```
bg --ink-1 · 1px --rule-2 · radius 4px · --shadow-modal
max-width 560px · padding 24px
scrim --scrim
enter opacity 0→1 + scale(0.98→1), 180ms --ease-snap
exit  140ms --ease-exit
```

Header 18px display / body 15px Inter / footer buttons right-aligned, 8px gap, primary last. Focus trap, Esc, return focus. `role="dialog"` `aria-modal="true"` `aria-labelledby`.

### 5.12 Tabs

```
list      1px --rule-hair bottom border
tab       32px height · 12px padding-x · 11px mono caps +0.12em
rest      --text-dim
hover     --text-body, 120ms
selected  --text-primary + 2px bottom bar in --signal (MEANING-BEARING,
          so it is a solid token, not an alpha hairline)
focus     ring
disabled  --text-disabled
```

Indicator slides with `transform: translateX()` + `scaleX()`, 240ms `--ease-instrument`. `role="tablist"`, arrow-key roving tabindex.

> **Tabs are banned inside finding detail.** Tabs hide the proof, and the proof is the positioning. Finding detail is one scroll with sticky section headers in a fixed order — **Claim → Location → Why this score → Proof → Identity → Audit** — auto-anchoring to Proof when arriving from a proven badge.

### 5.13 Command palette (⌘K)

`cmdk@1.1.1`. One of only two `backdrop-filter` surfaces.

```
container  560px · bg --ink-1 @ 92% · backdrop-filter blur(16px) saturate(1.4)
           1px --rule-2 · radius 6px · --shadow-palette · top 18vh
input      48px · 15px Inter · no border · placeholder --text-disabled
           1px --rule-1 bottom
group      11px mono caps --text-dim, 8px padding
item       36px · 13px · icon 14px · shortcut hint right in 11px mono --text-dim
selected   bg --ink-3 + 2px left bar --signal
enter      opacity + scale(0.99→1), 180ms --ease-snap
list       height animated via --cmdk-list-height
```

**Nested pages are mandatory.** Typing `suppress` pushes a sub-page collecting **reason** (required), **scope** (`line | file | pattern | repo | tenant`) and **expiry** entirely by keyboard, then shows the resulting append-only audit event writing itself into the rail live. **That four-keystroke flow is M3 and M4 demonstrated in four seconds**, and no competitor has a ledger to demonstrate.

Bindings reuse GitHub muscle memory **where it is free**: `j`/`k` move, `o`/Enter open, `/` filter, `t` repo finder, `?` cheatsheet, `⌘B` rail.

**Deliberately NOT `c` or `x`** — GitHub binds `c` to the Commits dropdown on Files-changed and `x` to "Link an issue" on exactly the screens reviewers are reflexive on. Reusing them does the *opposite* of what a fluent reviewer expects. Use **`s` to suppress** and **`v` to select**.

### 5.14 Toast

```
bottom-right · 16px offset · stack max 3 · width 360px
bg --ink-2 · 1px --rule-2 · radius 2px · 12px padding · --shadow-palette
title 13px --text-primary · body 11px --text-dim
enter translateY(8px → 0) + opacity, 240ms --ease-instrument
exit  160ms --ease-exit
auto-dismiss 5000ms (success) / never (error — requires explicit dismiss)
```

Variants carry a 2px left bar: info `--ink-7` · success `--signal-lo` (**never green**) · caution `--marker` · error `--alarm`.

`role="status"` for info/success, `role="alert"` for error only. Pause on hover and on focus-within (WCAG 2.2.1).

### 5.15 Skeleton

```css
.skeleton {
  background: var(--color-ink-2);
  border-radius: var(--radius-data);
  position: relative; overflow: hidden;
}
.skeleton::after {                   /* transform-only sweep — no background animation */
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent,
              oklch(1 0 0 / 0.04) 50%, transparent);
  transform: translateX(-100%);
  animation: sweep 1400ms var(--ease-instrument) infinite;
}
@keyframes sweep { to { transform: translateX(100%); } }
```

**Skeleton dimensions must match the final content exactly**, or you pay CLS on the swap. **Never a spinner for anything with known structure** — the backend emits `stage_index`/`stage_total`/`stage_label` and a heartbeat; rendering that as a rotating circle throws away the product's best trust signal.

Under reduced motion the sweep is removed and the skeleton is a static `--ink-2` block.

---

## 6. Iconography

### 6.1 The four bespoke marks (M1–M4)

Drawn by hand in one stroke language. **1.25px strokes, butt caps, miter joins, strict 16px grid, no rounded terminals ever.**

| Mechanic | Mark |
|---|---|
| **M1 Proof** | A sample vial with a fill line. Four states: filled (proven), outline + strike (disproven), half-filled (inconclusive), empty (not attempted) |
| **M2 Severity** | A spirit level with a bubble |
| **M3 Fingerprint** | An actual ridge pattern — concentric arcs with one deliberate break. **Not a generic swirl** |
| **M4 Governance** | A wax seal over a chain link |

The same strokes become the pipeline's nine station glyphs, so the whole system reads as one hand. Budget ~3 hours. Fall back to **Phosphor Bold** (`@phosphor-icons/react`, MIT) if the illustration hour is not there — its heavier weights read more mechanical than Lucide's uniform 2px softness.

### 6.2 Utility chrome

`lucide-react@1.47.0` (**ISC**, not MIT — note it in the attributions page) at matched weight. Override the default stroke:

```css
.lucide { stroke-width: 1.5; }        /* 1.25 optically matches at 16px but
                                         Lucide's grid is 24px; 1.5 is correct
                                         after the 16/24 scale-down */
```

### 6.3 Size scale

| Size | px | Use |
|---|---|---|
| `icon-xs` | 12 | Inside chips, gutter markers |
| `icon-sm` | 14 | Table cells, palette items, buttons (sm) |
| `icon-md` | 16 | Default. Buttons (md), nav, toolbars |
| `icon-lg` | 20 | Section heads, empty states |
| `icon-xl` | 24 | The four mechanic marks at marketing scale |

Icons inherit `currentColor` always. Optical alignment: icon box is `1em` tall with `vertical-align: -0.125em`.

### 6.4 Custom icon rules

1. 16px or 24px artboard, integer coordinates, strokes on the half-pixel so 1px edges stay crisp.
2. `stroke-width` is authored at 1.25 on a 16 grid / 1.5 on a 24 grid; `vector-effect="non-scaling-stroke"` on anything that scales.
3. `fill="none"`, `stroke="currentColor"`, `stroke-linecap="butt"`, `stroke-linejoin="miter"`.
4. Apply CSS transforms to a `<g>` wrapper with `transform-box: fill-box; transform-origin: center;` — Safari mis-handles transforms on the root `<svg>`.
5. Every standalone icon is `aria-hidden="true"` unless it is the only label, in which case it needs `role="img"` + `<title>`.

### 6.5 Banned outright

Sparkles (the four-point AI star), brains, robots, shields-with-ticks, hexagon grids, neural-network node clouds, magic wands, chat bubbles, globes, orbiting integration rings, **and every emoji**.

> The four-point sparkle now means "this button calls an LLM." PRGuard's differentiator is that it does **not** just call an LLM — it executes a test in a container. Using the sparkle concedes the exact ground you are fighting for.

---

## 7. Dark-only or dark + light?

**Decision: dark-only for the product, with two scoped exceptions and one accessibility variant.**

### 7.1 Dark-only for everything

The system ships **one** theme. `color-scheme: dark` is set on `:root`; there is no light-mode token set for the app, no theme toggle in the product, and no `light:` variants in component code.

**Why:**
1. **The visual system and the product thesis are the same object.** An instrument reads its own state on a dark panel; a spectrometer is not available in beige. Shipping a light mode would mean shipping a second, weaker argument.
2. **The palette's entire structure depends on it.** Proven/disproven share a hue and differentiate on fill-vs-outline; gate-clear is achromatic on a cyan tint; the severity chroma ramp is calibrated against `--ink-0` at L 0.145. Every one of those decisions has to be re-derived and re-verified against a light base — that is a full second contrast audit for a surface nobody asked for.
3. **Maintenance cost is real and the benefit is not.** A light theme doubles the token surface, doubles the APCA audit, and doubles the regression risk on 15 components — during a five-day build whose critical path is the Proof Bench, the severity instrument and the tamper control.

### 7.2 Exception 1 — a light **print/export** theme on exactly two surfaces

`/audit` (the hash chain) and `/accuracy` (the self-report) ship a light variant and a print stylesheet, plus an **"Export evidence"** action rendering `finding + proof terminal + severity breakdown + audit segment` as one paginated document.

**Why this exception and no other:** these are the two surfaces a human exports, prints, screenshots into a compliance ticket, or hands to an auditor. **Evidence that cannot leave the product is set dressing**, and a dark-only audit trail is a tell that the audit trail is a prop. "Here is the PDF you hand your auditor" is a beat nobody else in this category can show.

It is scoped as `[data-theme="light"]` on those two route roots only, implemented through the same semantic token names (`--color-ink-0` etc. re-declared), which is why the token layer must be semantic rather than literal from day one.

**Schedule honesty:** this is the **first thing cut** if the schedule slips. Print CSS is easy to leave half-done.

### 7.3 Exception 2 — `[data-contrast="high"]`, the projector variant

Not a theme. A four-line accessibility override, built **on day one alongside the token file, not in the day-six polish block** — it is four lines if the tokens are semantic and a rewrite if they are not.

```css
:root[data-contrast="high"] {
  --color-rule-hair: var(--color-ink-7);   /* every decorative hairline */
  --color-rule-1:    var(--color-ink-7);   /* promoted to solid 3.03:1 */
  --color-rule-2:    var(--color-ink-7);
  --color-rule-3:    oklch(0.560 0.012 250);
  --color-grid:      oklch(1 0 0 / 0.07);  /* 0.028 vanishes on a beamer */
  --color-syn-comment: var(--color-text-body);
}
```

On a washed-out venue display the ink-0/1/2/3 steps (relative luminance 1.00 / 1.06 / 1.16 / 1.23) collapse into one flat black and the 0.028-alpha graph paper disappears entirely. **Switch to this variant before walking on stage.** A visible toggle lives in the footer next to the motion toggle.

---

## 8. Accessibility — non-negotiable

### 8.1 Contrast

| Rule | Value |
|---|---|
| Body text | **APCA Lc ≥ 75** (`--text-body` = −78.2 ✓) |
| Primary / heading text | **Lc ≥ 90** (`--text-primary` = −97.8 ✓) |
| Non-body content text (labels, chips, metadata) | **Lc ≥ 60** (`--text-dim` = −43.6 ✗ → **`--text-dim` is Lc-45 tier: eyebrows, units and column heads only, never a chip label**) |
| Any meaning-bearing border | **WCAG ≥ 3:1** (`--ink-7` = 3.03:1) |
| Focus ring | **2px perimeter minimum, ≥3:1 between focused and unfocused states of the same pixels** (SC 2.4.13) |

WCAG 2.1 ratios are maintained as a second column for procurement, but **APCA Lc is the design target** — WCAG's luminance ratio materially overstates contrast on near-black, and optimising to it produces exactly the low-contrast "aesthetic grey" trap.

**CI gate:** every `-text`, `-body`, `-primary` and `-dim` token is asserted against `--ink-0`, `--ink-1` and `--ink-2` using the official `apca-w3` package. A failing assertion is a **build-breaking error**, not a warning.

### 8.2 Colour is never the only channel

Every state carries at least two of: **glyph**, **border style**, **text label**, **position**, **numeric value**.

- Proof states: hue + fill-vs-outline + **mandatory glyph** + text label.
- Severity: meter fill-count + **printed 3-decimal score** + band label. Measured worst-pair CVD separation is ΔE 3.3 — colour genuinely cannot carry it.
- Diff: `+`/`−` gutter glyph + line position + tint.
- Status: border style (solid / dotted / dashed / none) + text label.
- Stage: glyph + dash pattern + text label.

### 8.3 Focus and keyboard

- `outline: 2px solid var(--color-signal-hi); outline-offset: 2px`. **Never `outline: none`** (Tailwind v4: the class is now `outline-hidden`).
- **`scroll-margin-top` equal to the sticky header height on every focusable row.** SC 2.4.11 *Focus Not Obscured (Minimum)* is **Level AA, not AAA** — a sticky stage header covering a `j`/`k`-focused row is an AA failure, and it is the single most likely accessibility defect in this design.
- Roving tabindex inside `role="grid"` tables; `j`/`k` bound only when focus is inside the grid, so they never fight browse mode.
- Every interaction reachable by keyboard. Every animation interruptible and cancelable by user input.
- Focus returns to the trigger on dialog/sheet close.

### 8.4 Live regions (the 9-stage run)

| Element | Role | Behaviour |
|---|---|---|
| Stage label | `role="status"` (polite + atomic) | Announces **only on `stage_index` change** — never on every 1.2s poll |
| Proof terminal | `role="log"` | Appends; `aria-busy="true"` during bursts, `false` when settled |
| Gate turning red | `role="alert"` | **Reserved exclusively for this.** Nothing else interrupts |
| Stage progress | `role="progressbar"` | `aria-valuenow`/`min`/`max` + `aria-valuetext="Stage 3 of 9, specialists"` |

**The live region must be rendered empty in the shell, before any content changes**, or nothing is announced at all.

The SVG pipeline is `aria-hidden="true"` and carries a real `<ol>` of the nine stage names behind it — free screen-reader support and free SEO that no competitor's animated diagram provides.

### 8.5 Reduced motion is a designed second state, not an off switch

One code path serves both the OS preference and a visible footer toggle:

```css
@media (prefers-reduced-motion: reduce) { :root { --motion: reduced; } }
:root[data-motion="reduced"] { --motion: reduced; }
```

| Animation | Reduced variant |
|---|---|
| Hero scan | Never runs — the bench is **already** in its end state. Nothing is lost, because the designed state and the end state are the same frame |
| Pipeline | All nine stages render complete, un-pinned, in normal document flow |
| Severity bar | Renders at full width |
| Entrances | 120ms **opacity-only**, zero translate (opacity-only is vestibular-safe) |
| Heartbeat dot | Static; the numeric age still ticks as text |
| Skeleton sweep | Removed |
| Counters | Jump to final value |

**Explicitly NOT `* { animation: none !important }`** — that is worse than nothing, because any element whose visible state is *produced by* the animation stays at its initial state. GSAP timelines are constructed inside `gsap.matchMedia()` so they are never built at all.

Per **SC 2.2.2**, any auto-moving content running longer than 5 seconds needs a visible pause/stop control — that includes the ambient conveyor mode of the pipeline.

### 8.6 Forced colours

```css
@media (forced-colors: active) {
  /* Alpha borders and opacity-as-meaning are both destroyed here.
     This is precisely where PROVEN and DISPROVEN — same hue by design —
     become identical unless the glyph carries them. */
  .chip { border: 1px solid CanvasText; forced-color-adjust: none; }
  .chip__glyph { display: inline-block !important; }
  .chip__state-label { position: static; clip: auto; width: auto; height: auto; }
  .severity-meter__segment { border: 1px solid CanvasText; }
  .rail { border-left: 2px solid CanvasText; }
}
```

Every chip carries a visually-hidden state label that becomes visible in forced-colors mode. This is not optional for anything enterprise-facing.

### 8.7 Disclosure

Every metric on `/accuracy` and in marketing §03 renders, **as always-visible body text and never as a tooltip**:

1. its value,
2. its **definition** as a 13px subtitle,
3. its **n**,
4. a **Wilson confidence interval** drawn as a hairline error bar,
5. its caveats.

**The numbers do not count up.** A metric that spins while a judge reads it is decoration on the one surface that must read as rigorous.

**Half-disclosing is worse than not disclosing for a product whose thesis is proof.** `self_caught_false_positive_rate` ships prominently, with the answer rehearsed in one sentence: *"That is the rate at which the system caught itself before the claim reached your PR, which is the inverse of a defect."*

### 8.8 Motion sickness and photosensitivity

Nothing flashes more than 3 times per second. The scan line is a single 1400ms pass, not a loop. No parallax exceeding ±9px. No autoplaying full-bleed video.

---

## Appendix A — File structure and build gates

```
styles/
  core.css        ink ladder · hairlines · semantics · type scale ·
                  easings · durations · radius · space
                  → imported by BOTH surfaces
  marketing.css   grain · hero radial · display sizes · scan keyframes
                  → imported by app/(marketing)/ ONLY
  code.css        .prg-code / .prg-terminal / .prg-diff quarantine
```

Splitting core from marketing costs twenty minutes on day one and prevents a marketing tweak regressing the dashboard at 2am.

**CI gates (all build-breaking):**

| Gate | Check |
|---|---|
| Gamut | Every OKLCH token round-trips to its hex within 1/255 per channel and is inside sRGB |
| Contrast | Every text token vs ink-0/1/2 meets its APCA tier via `apca-w3` |
| Palette discipline | No hue 120–190 outside `.prg-code` descendants (R1) |
| Shadow discipline | No `box-shadow` with a blur radius outside 2 allowlisted selectors (R6) |
| Compositor | No animation of `width`/`height`/`top`/`left`/`margin`/`background-color`; no animated custom property on `:root` (R9) |
| Engine boundary | ESLint `no-restricted-imports`: GSAP never enters `app/(app)/`; Motion never drives scroll |
| Canonical JSON | Browser and backend serialisers produce byte-identical output against shared fixtures |
| Licence allowlist | One entry for GSAP (its npm `license` field is Webflow's non-SPDX free-text string and will scan as UNKNOWN) |

**The canonical-JSON gate is the most important one.** The tamper control shows a **false** break the moment the browser's serialisation diverges from the backend's by one byte of key order, whitespace or unicode escaping — the most self-refuting failure available to this product. **Backend owns the spec; frontend consumes it; both are tested against identical fixtures in CI.**

---

## Appendix B — Locked stack decisions

One Next.js **16.3.6** app, two route groups (`app/(marketing)/`, `app/(app)/`). **No monorepo, no Multi-Zones** — cross-zone links must be plain `<a>`, and the hero CTA → dashboard click is the whole narrative.

Node **22 LTS** (the real floor: ESLint 10 needs `^20.19 || ^22.13 || >=24`; the OpenAPI codegen tools need `>=22.18`). React pinned **exactly** — 19.2.0 is safe; 19.3.0 is also fine since no R3F is in the tree, but Motion's `AnimateView` requires 19.3+. Decide once, pin exactly, commit the lockfile, **no carets on any core dependency**.

Tailwind **4.3.3** CSS-first. shadcn `init -b radix` — **not** base-ui (and note that package was **renamed to `@base-ui/react`**; the widely-cited `@base-ui-components/react@1.0.0-rc.0` is npm-deprecated).

GSAP **3.15.0** + ScrollTrigger on the marketing route only (~46 KB gz measured, not 70). Motion on the dashboard only via `LazyMotion` + `m` + `domAnimation` (~20 KB). **Zero WebGL** — of the elite dark dev-tool set surveyed, essentially none ship a WebGL hero, and CodeRabbit's "cinematic 3D" is a conic-gradient rim light over flat panels at 2–12% white.

Polling at **1.2s with backoff**, never SSE. `anser` for ANSI, never xterm.js. `@tanstack/react-table` pinned **`^8`**, not v9 (v9 is ESM-only with no published migration guide). Shiki with 6–10 languages imported individually. `@git-diff-view` behind one `<PRGuardDiff>` component.

**Demo from a production domain, never a preview URL** — bytecode caching and function pre-warming are documented production-only, so preview is the slowest environment you own.

---

## Appendix C — Cut order under pressure

| Order | Cut |
|---|---|
| 1 | Pipeline scroll scrub (it degrades to a static diagram with stage hover — nothing is lost but polish) |
| 2 | Section 08, the agent-caught story |
| 3 | Bespoke icon marks → Phosphor Bold |
| 4 | Light-theme audit export |

**Never cut the Proof Bench, the severity instrument, or the tamper control. Those three *are* PRGuard** — without them this is a nicely-typeset dark site with nothing to say.

---

## Appendix D — Corrections applied to the source direction

Recorded so the engineer knows what changed and why.

| # | Source said | Correction |
|---|---|---|
| 1 | `--ease-mass: cubic-bezier(0.33, 0, 0.12, 1)` | Byte-identical to `--ease-instrument`, so the token added nothing. Changed to `cubic-bezier(0.45, 0, 0.08, 1)` to preserve the graft's intent |
| 2 | `--alarm-hi` is "alarm-coloured text and the failing traceback line" | Measured **Lc −53.5** — below the Lc 60 non-body floor and far below the Lc 75 body floor. Added `--alarm-text` `#FFBFB7` (Lc −76.7). `--alarm-hi` is now large-text-only |
| 3 | Solid `--alarm` chips | `--ink-0` on `--alarm` is **Lc 43.3**. BLOCKED chip changed to `--alarm-text` on `--alarm-tint-hi` with an `--alarm` border (Lc −74.6). R2 added |
| 4 | Severity ramp "survives greyscale as an intensity ramp" | **False.** Measured luminance is 0.240 → 0.316 → **0.398** → 0.352 → 0.256 — it rises then falls. Greyscale collapses to luminance, not chroma. Severity is now meter + number first, colour third (R3) |
| 5 | APCA floor "Lc 60 body / Lc 90 heading" | Lc 60 is APCA's **non-body content text** tier. Real body floor is **Lc 75**. Targets raised |
| 6 | Inter `font-feature-settings: "cv01","ss03"` | `cv01` = alternate **digit 1**; `ss03` = round quotes and commas. Neither changes a letterform in ordinary UI labels. Replaced with `cv05` (tailed l) + `cv11` (single-storey a), and the `font-feature-settings` / `font-variant-numeric` cancellation trap documented |
| 7 | Google Sans Code v7.000 | Latest tag is **v7.001**, and a matching italic variable cut ships |
| 8 | No diff tokens specified | Added, quarantined to `.prg-code` with a written carve-out from R1, deliberately shifted off GitHub's palette, with the `+`/`−` glyph declared as the semantic channel (measured CVD ΔE 13.4) |
| 9 | "Amber for disproven" implied in places | FAR 25.1322 defines Caution as *requiring immediate awareness and subsequent response*. A self-refuted finding requires none. Amber is bound to **inconclusive** only |
| 10 | Opacity used for `not_attempted` (60%) and `dropped` (45%) | Replaced with explicit tokens — opacity-as-meaning is destroyed in `forced-colors: active` (R4) |