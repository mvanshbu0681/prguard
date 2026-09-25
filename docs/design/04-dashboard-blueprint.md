# PRGuard — Internal Dashboard Blueprint

**Direction:** COLD LIGHT spine + the seven grafts. Instrument-grade, cold, flat, evidence-first.
**Stack lock:** Next.js 16.3.6 · React 19.2.0 pinned exact · Node 22 LTS · Tailwind 4.3.3 CSS-first · shadcn `init -b radix` · Motion 13.4.1 via LazyMotion (dashboard only, GSAP never crosses the route boundary) · TanStack Query 5.103.2 · TanStack Virtual 3.14.13 · `@tanstack/react-table` pinned `^8.21.3` (NOT v9) · cmdk 1.1.1 · nuqs 2.10.1 · Recharts 3.10.1 under shadcn `ChartContainer` · anser 2.3.5 · Shiki 4.4.3 · `@git-diff-view/react` 0.1.7 behind one wrapper · react-resizable-panels 4.13.2 · lucide-react for utility chrome only.

---

## 0. Governing principles

Five rules that resolve every ambiguity below. If a screen decision contradicts one of these, the rule wins.

1. **Every panel is bracketed.** A header strip (`/ 03 — PROOF · finding a91f3c2e`) above, a provenance footer (`GET /v1/reviews/4e8b1d0/result → findings[3].proof`) below, in 11px Google Sans Code at `--text-dim`. The footer is not decoration — it is a debugging affordance that happens to be the positioning rendered as UI. It costs one `<span>`.
2. **Registration marks appear only on evidence-bearing frames.** ProofBench, ChainRail, ContributionBar, the diff. Never on buttons, chips, nav, or ordinary dashboard panels. The moment they escape, the one ownable detail becomes a template tic.
3. **No green anywhere.** Gate clear is achromatic body text on an 8% cyan tint with a 1px `--signal-lo` underline. Proven and disproven share the cyan hue because both are execution results; they differ by fill vs outline plus a mandatory glyph.
4. **Nothing in the dashboard animates longer than 180ms.** If a dashboard transition exceeds 220ms it is a bug. The only continuing motion is the heartbeat dot, and it pulses at the *real* heartbeat interval or not at all.
5. **Colour alone never carries state.** Every proof state, severity band, gate state and chain state carries a glyph and a text label. This is a CVD requirement (measured: add-vs-remove diff hues collapse to ΔE 3.6 under deuteranopia) and a forced-colors requirement.

### 0.1 Token layer (dashboard deltas from the marketing layer)

`tokens/core.css` is imported by both surfaces. `tokens/marketing.css` is imported only by `app/(marketing)/`. Splitting these costs twenty minutes on day one and prevents a marketing tweak regressing the dashboard at 2am.

```css
/* core.css — shared */
:root {
  --ink-0:#080A0D; --ink-1:#0F1114; --ink-2:#16191C; --ink-3:#1E2125;
  --ink-4:#272B2E; --ink-5:#32363A; --ink-6:#41464B; --ink-7:#595E64; --ink-8:#646A70;
  --text-dim:#8D9399;      /* APCA Lc -43.6 — non-body only */
  --text-body:#CDD1D6;     /* APCA Lc -78.2 — clears the REAL Lc 75 body floor */
  --text-primary:#EEF0F3;  /* APCA Lc -97.8 */

  --rule-hair: oklch(1 0 0 / 0.055);  /* decorative only, 1.11:1 */
  --rule-1:    oklch(1 0 0 / 0.09);
  --rule-2:    oklch(1 0 0 / 0.14);
  --rule-3:    oklch(1 0 0 / 0.22);
  /* MEANING-BEARING borders (input outline, selected row, focus) floor at --ink-7 = 3.03:1 */

  --signal-hi:#65E7F5;  /* focus ring, live trace */
  --signal:#2ECEDD;     /* proof_status = proven, active stage */
  --signal-lo:#0698A4;  /* 2px status rails, completed connectors */
  --signal-tint:#13282C;
  --alarm:#F64F47; --alarm-hi:#FD8074; --alarm-tint:#2B181A;
  --marker:#E7B551;     /* inconclusive, degraded, stale heartbeat */

  /* severity: strictly monotone CHROMA ramp — survives greyscale and CVD as intensity */
  --sev-info:#83878B; --sev-low:#A39879; --sev-medium:#CFA25A;
  --sev-high:#F18336; --sev-critical:#F64F47;

  --ease-instrument: cubic-bezier(0.33, 0, 0.12, 1);
  --ease-snap:       cubic-bezier(0.2, 0, 0, 1);
}

/* dashboard overrides */
[data-surface="app"] {
  --grid-alpha: 0.018;   /* graph paper becomes a functional graticule, not texture */
  --grain-opacity: 0;    /* grain costs paint on a scrolling 400-row table */
  --dur-state: 120ms; --dur-enter: 180ms;  /* nothing above 180ms */
}
[data-contrast="high"] {  /* projector variant — build day one, not day six */
  --rule-hair: #595E64; --rule-1: #595E64; --rule-2: #595E64; --rule-3: #6C7278;
}
```

**Gamut discipline.** All chromatic tokens are authored in OKLCH and run through a CI gamut-clamp that binary-searches max in-gamut chroma per `(L, hue)` for sRGB and Display-P3 separately, emitting both. Several values in the research corpus that "looked safe" were outside sRGB and silently clipped — on the P3 MacBook the demo runs on, a clipped `oklch()` disagrees visibly with its hex fallback. A CI check asserts every `-11`/`-12` pair clears its APCA floor and every token round-trips.

### 0.2 Density and type

| Role | Face | Size / leading | Notes |
|---|---|---|---|
| Body, prose | Inter Variable | 13px / 1.5 | `cv11`, `cv05`; **not** `ss03` (Latvian cedillas only — no-op in English) |
| Data, mono | Google Sans Code | 12.5px / 1.5 | tracking exactly **0**; `lining-nums tabular-nums slashed-zero` global |
| Terminal, diff | Google Sans Code | 13px / 22px | looser than Linear's 14/24 — tracebacks need line separation more than density |
| Labels, chips, section index | Google Sans Code 500 | 11px, UPPERCASE, +0.12em | the instrument panel legend |
| Readout (severity score) | Google Sans Code 500 | 3rem / 1.0 / -0.020em | snaps, never counts up |

Row height **32px** default, **26px** compact (toggle persisted per-table in localStorage, mirrored to URL for shareability). Radii **2px** on data surfaces, **4px** on panels, **6px** on the largest container. Hairline separators at `--rule-hair`, **never zebra striping** — at 32px rows on near-black, alternating fills band visibly and read as a 2010s admin template.

Numerals use Linear's pattern so `font-feature-settings` and `font-variant-numeric` do not cancel each other:

```css
.tabular {
  font-feature-settings: var(--font-settings), "zero" !important;
  font-variant-numeric: lining-nums tabular-nums slashed-zero !important;
}
```

---

## 1. Information architecture

### 1.1 Route table

Routes live under `app/(app)/`. The marketing site is `app/(marketing)/` in the **same** Next app — not a monorepo, not Multi-Zones. Cross-zone links must be plain `<a>`, which would make the single most important click in the demo (hero CTA → live dashboard) a hard reload with no prefetch.

| Route | Screen | Primary endpoint |
|---|---|---|
| `/` | Overview | `GET /v1/reviews?limit=8` + `GET /v1/accuracy` + `GET /v1/cost?window=7d` |
| `/runs` | Run list | `GET /v1/reviews` (cursor) |
| `/runs/:id` | **Run view** — LIVE or RESULT, one route, mode switches on `status` | `GET /v1/reviews/{id}` → `GET /v1/reviews/{id}/result` |
| `/runs/:id/findings` | Findings scoped to a run (sub-tab) | `GET /v1/findings?review_id=` |
| `/findings` | Findings list, cross-repo | `GET /v1/findings` |
| `/findings/:id` | **Finding detail** — the most important screen | `GET /v1/findings/{id}` |
| `/repos` | Repositories | `GET /v1/repos` |
| `/repos/:owner/:name` | Repo detail + policy | `GET /v1/repos/{owner}/{name}` |
| `/repos/:owner/:name/pulls` | Pull requests | `GET /v1/repos/{owner}/{name}/pulls` |
| `/repos/:owner/:name/pulls/:number` | PR detail — every run for this PR, run-to-run finding delta | `GET /v1/pulls/{id}/reviews` |
| `/suppressions` | Suppression ledger | `GET /v1/suppressions` |
| `/suppressions/:id` | One suppression, deep-linked from a finding | `GET /v1/suppressions/{id}` |
| `/audit` | Audit chain viewer | `GET /v1/audit` |
| `/audit/:seq` | Deep link to an event (scrolls + expands) | `GET /v1/audit?around={seq}` |
| `/accuracy` | Accuracy self-report | `GET /v1/accuracy` |
| `/cost` | Cost and latency | `GET /v1/cost` |
| `/settings/policy` | Gate policy, risk tiers, thresholds | `GET/PUT /v1/settings/policy` |
| `/settings/repositories` | Per-repo overrides | `GET/PUT /v1/settings/repositories` |
| `/settings/members` | Members and roles | `GET /v1/settings/members` |
| `/settings/integrations` | GitHub App install state | `GET /v1/settings/integrations` |
| `/settings/api-keys` | Tokens | `GET/POST/DELETE /v1/settings/api-keys` |
| `/settings/budgets` | Cost caps and alerts | `GET/PUT /v1/settings/budgets` |
| `/login`, `/onboarding/install` | Auth, GitHub App install | — |

Overlays (not routes): ⌘K palette, the suppress sub-page inside it, the `?` shortcut sheet, the Export-evidence dialog.

### 1.2 Backend asks (day zero, ranked)

The shipped API covers the evidence surfaces. Nine endpoints are missing for the shell. Ranked by how badly the dashboard degrades without them; the fallback column is the hackathon workaround if the backend cannot move.

| # | Endpoint | Why | Fallback if not shipped |
|---|---|---|---|
| 1 | `GET /v1/reviews` (cursor, filters: repo, status, gate) | `/runs`, `/` and the breadcrumb switcher have no list source | Hardcode the seeded run ids |
| 2 | `GET /v1/findings/{id}` | Detail page currently has to fetch the whole list and filter client-side | `GET /v1/findings?id=` then `[0]` |
| 3 | `GET /v1/cost` (aggregate: per-stage p50/p95, cost histogram, cache-hit %) | `/cost`, and it seeds `expectedSeconds` for the live stage rail | Constants file with observed p50 |
| 4 | `GET /v1/repos`, `GET /v1/repos/{o}/{n}` | `/repos` | Group `GET /v1/reviews` by `repo` client-side |
| 5 | `GET /v1/repos/{o}/{n}/pulls`, `GET /v1/pulls/{id}/reviews` | `/pulls` and run-to-run delta | Group reviews by `pr_number` |
| 6 | `GET /v1/findings/{id}/fingerprint-history` | The M3 "identity survives" panel | Query `GET /v1/findings?fingerprint=` and sort by commit time |
| 7 | `GET/PUT /v1/settings/policy` | Settings is otherwise read-only prose | Render policy read-only from the run payload |
| 8 | `GET /v1/audit?around={seq}&limit=` | `/audit/:seq` deep links, and windowed loading past 1k events | Fetch all, scroll client-side |
| 9 | `GET /v1/suppressions/{id}` | Deep link from a finding | Filter the list |

**Two non-negotiable backend requests beyond endpoints:**

- **The canonical-JSON spec, day zero, owned by the backend.** The chain viewer recomputes `sha256(prev_hash ‖ canonical_json)` in the browser via Web Crypto. It shows a **false break** the moment the browser's serialisation diverges from the backend's by one byte of key order, whitespace or unicode escaping — the most self-refuting failure available to this product. Write the rules into a shared spec file, test both sides against identical fixtures in CI, treat a failing fixture as a build-breaking error.
- **Seed the demo corpus with at least one genuinely disproven finding, one `inline_nearest` delivery fallback and one `commit_status` gate fallback.** Without them the S8 ladder shows four lit rungs and no story, and the accuracy page shows 100% proven — which is worse than not shipping it.

### 1.3 Shell

**Top bar, 48px**, `--ink-1`, 1px `--rule-1` bottom, `backdrop-filter: blur(16px)` (one of exactly two places in the product).

```
[PRGUARD]  acme ▸ api-gateway ▸ #4821 ▸ run 4e8b1d0        [LIVE] [◐] [≈] [⌘K] [VM]
```

Every breadcrumb segment is a combobox (Vercel pattern), keyboard-reachable and typeable. It keeps current scope and the ability to change scope in one glyph, which matters because PRGuard's data is inherently three-level scoped. Right cluster: a fixture/live badge (11px mono, `--marker` in fixture mode), the `[data-contrast]` projector toggle, the `[data-motion]` toggle (both write attributes on `<html>` so a judge can flip them live in two seconds), the ⌘K hint chip, the avatar.

**Left rail, 224px**, collapsible to 52px icon-only via ⌘B, persisted.

```
WORK
  Overview            g o
  Runs                g r
  Findings            g f
  Repositories        g p
────────────────────────────
GOVERNANCE
  Suppressions        g s
  Audit               g a
  Accuracy            g y
────────────────────────────
  Cost & latency      g c
                            ⌄
  Settings            g ,     (pinned bottom)
```

Naming the second group **Governance** sells M4 every time anyone glances at the rail, for the cost of one string. Group labels are 11px mono caps at `--text-dim`. The active item gets a 2px `--signal` left bar plus `--ink-4` fill — never a pill, never a rounded highlight.

**No page-level chrome beyond this.** No hero logo lockup, no upgrade banner, no marketing CTA. Every pixel spent on brand furniture is stolen from the waterfall and the terminal, which are the only two screens anyone remembers.

### 1.4 Command palette (cmdk 1.1.1)

⌘K opens a `Command.Dialog` at `--ink-1` with `blur(16px)` (the second and last backdrop-filter). **Nested pages** are the whole point — a flat palette would be a commodity.

```
Root page
  › Go to…            runs, findings, repos, suppressions, audit, accuracy, cost, settings
  › Recent            last 5 runs, last 5 findings (from localStorage)
  › Actions           Suppress finding…   Re-run review   Export evidence…
                      Verify chain        Toggle density  Toggle contrast
  › Search            free text → GET /v1/findings?q= (shouldFilter={false}, server ranks)

Suppress sub-page  (pushed by "Suppress finding…" or by `s` on a focused row)
  Step 1  Reason      free text, REQUIRED, min 8 chars, no default, no dropdown of excuses
  Step 2  Scope       line | file | pattern | repo | tenant   (↑↓ then Enter)
  Step 3  Expiry      never | 7d | 30d | 90d | custom date
  Step 4  Confirm     shows the exact N findings this will affect, then ⌘Enter
```

On confirm: optimistic row strike-through, `POST /v1/findings/{id}/suppress`, then the resulting **audit event animates into the ChainRail live** if the audit rail is on screen. That four-keystroke flow is M3 and M4 demonstrated in four seconds, and it is the flow no competitor can perform because none of them have a ledger.

Items carry `keywords` for synonym matching (`suppress` also matches `dismiss`, `ignore`, `mute`). Groups get `hidden` rather than unmounting during filtering, so the list height animates via `--cmdk-list-height`.

### 1.5 Keyboard map

Deliberately reuses GitHub muscle memory where it is free, and deliberately **avoids `c` and `x`** — GitHub binds those to the Commits dropdown and Link-an-issue on exactly the screens reviewers are reflexive on. Reusing them does the opposite of what a fluent reviewer expects.

| Key | Action | Scope |
|---|---|---|
| `⌘K` | Palette | global |
| `⌘B` | Toggle rail | global |
| `?` | Shortcut sheet | global |
| `g` then `o r f p s a y c ,` | Go to section | global |
| `j` / `k` | Next / previous row | any `role="grid"` |
| `o` / `Enter` | Open focused row | grid |
| `v` | Select / deselect focused row | grid |
| `V` | Select all visible | grid |
| `/` | Focus the filter input | grid |
| `t` | Repo / file finder | global |
| `s` | Suppress focused finding (opens the palette sub-page) | grid, detail |
| `p` | Jump to Proof section | finding detail |
| `e` | Export evidence | finding detail, audit |
| `y` | Copy canonical URL | detail screens |
| `⌘Enter` | Confirm the active form | palette, dialogs |
| `Esc` | Close overlay, then clear selection, then blur | global |
| `.` | Toggle density (32px ↔ 26px) | grid |

`j/k` are scoped to a roving-tabindex `role="grid"` and bound only while focus is inside it, so they do not fight native scrolling or screen-reader browse mode.

**Focus ring, non-negotiable:** `outline: 2px solid var(--signal-hi); outline-offset: 2px` — never `outline: none` (and note Tailwind v4 renamed the class to `outline-hidden`, so grep any pasted v3 snippet for `focus:outline-none`). `#65E7F5` measures 13.50:1 on `--ink-0` — unmissable on a venue projector.

**WCAG 2.4.11 Focus Not Obscured is Level AA, not AAA.** Every focusable row carries `scroll-margin-top` equal to the sticky header height, or a j/k-focused row slides under the sticky stage header and fails an AA criterion.

---

## 2. Screens

### 2.0 States, defined once

Every screen below references these. Deviations are called out explicitly.

**Loading.** Skeletons match final dimensions exactly (CLS is a self-inflicted wound on a dense UI). Panel header strips and provenance footers render **immediately** — they are static strings and rendering them first is what makes the page feel instant. Body gets N skeleton rows at the current density, filled `--ink-2`, no shimmer, no spinner. Tables render the real header row plus 8 skeleton rows. A spinner appears nowhere in this product: every long operation has known structure and a heartbeat.

**Empty.** Never "No data available." Every empty state names the filter that produced it and offers the next action.
> `No findings above medium in this run. 4 were dropped at S4 as speculative.` `[Show dropped]` `[Clear filters]`

**Error.** Inline within the frame, never a toast. `--alarm` 1px border, the failing endpoint printed in the provenance footer, the status code, a request id with click-to-copy, `[Retry]`. Toasts (sonner) are reserved for **write** outcomes only.
> `504 · GET /v1/reviews/4e8b1d0/result · req_8f3a21` `[Retry]` `[Copy request id]`

**Fixture mode.** When `NEXT_PUBLIC_FIXTURES=1`, an 11px mono banner in the top bar reads `FIXTURE MODE · corpus seeded 2026-09-19`. Every screen renders fully with the backend off. This is half a day of work that produces nothing a judge sees when everything works, and it is the highest-expected-value block in the schedule.

**Forced colors.** A `@media (forced-colors: active)` block restores every glyph and text label, because alpha borders and opacity-as-meaning are both destroyed there — and that is precisely where PROVEN and DISPROVEN, same hue by design, become identical unless the glyph carries it.

---

### 2.1 `/` — Overview

**Layout.** Single column, 1280px max, four stacked bands on the graticule.

1. **Live strip** (only if any run is `running`). Horizontal row of compact `<StageRail density="glyph">` cards, one per in-flight run: repo, PR number, `Stage 3/9 — specialists`, heartbeat dot, `12s`. Clicking opens `/runs/:id`. This is the first thing on the page because a live run is the most interesting thing that can be true.
2. **Gate outcomes, 7 days.** A single horizontal stacked bar: `blocked (proven)` in `--alarm`, `clear` achromatic on `--signal-tint`, `degraded` in `--marker`. Counts printed inline in mono, not in a legend. Below it one mono line: `47 runs · 3 blocked · all 3 by a proven finding`.
3. **Proven vs disproven, 8 weeks.** 100% stacked area (Recharts), four bands, no count-up. Caption: `we refuted 14 of our own findings before they reached a PR`.
4. **Two half-width panels.** Left: *Top repos by blocked findings* — horizontal bars, n on each. Right: *Cost, 7 days* — a single number in 3rem mono with `usd_estimate` p50/p95 beneath and a cache-hit percentage.

**Data.** `GET /v1/reviews?limit=8&status=running` (polled at 1.2s while any are running), `GET /v1/reviews?limit=50&window=7d`, `GET /v1/accuracy`, `GET /v1/cost?window=7d`.

**Empty (no runs ever).** Full-frame: `No reviews yet. PRGuard reviews a pull request when GitHub sends a webhook, or on demand.` `[Install the GitHub App]` `[Run a review on a seeded PR]` — the second button POSTs to `/v1/reviews` with the demo fixture, which means the empty state is also the demo launcher.

**Provenance footers.** `GET /v1/reviews?window=7d`, `GET /v1/accuracy`, `GET /v1/cost?window=7d`.

---

### 2.2 `/repos` and `/repos/:owner/:name`

**List layout.** A table, not cards. Columns: `[repo]` `[risk tier]` `[runs 7d]` `[blocked 7d]` `[proven rate]` `[median latency]` `[median cost]` `[last run]`. Sorted by blocked desc — the repos that need attention float. Risk tier renders as an 11px mono chip: `TRIVIAL` / `STANDARD` / `FULL` at `--ink-8` / `--text-body` / `--signal`.

**Detail layout.** Two columns at ≥1200px.
- Left (68%): PR list (see 2.3), then a 30-day sparkline strip of runs per day with blocked days marked by an `--alarm` tick.
- Right (32%): the policy card — resolved risk tier and *where it came from* (`inherited from org default` vs `overridden at /settings/repositories`), gate mode, delivery ladder preferences, suppression count scoped to this repo with a link into the ledger pre-filtered.

**Data.** `GET /v1/repos`, `GET /v1/repos/{owner}/{name}`, `GET /v1/suppressions?scope=repo&repo=`.

**Empty.** `No repositories connected. PRGuard sees a repository once the GitHub App is installed on it.` `[Manage installation]`

---

### 2.3 `/repos/:owner/:name/pulls` and `.../pulls/:number`

**List.** Columns: `[#]` `[title, truncate]` `[author]` `[head SHA, mono 7-char]` `[runs]` `[gate]` `[proven]` `[updated]`. Gate renders as a chip: `BLOCKED` solid `--alarm`; `CLEAR` achromatic on `--signal-tint` with a 1px `--signal-lo` underline; `DRY RUN` at `--marker`; `PENDING` at `--ink-8`.

**PR detail.** The distinctive screen here is the **run-to-run finding delta**, which nothing else in the category shows.

```
┌ / 01 — RUNS ON #4821 ────────────────────────────────────────────┐
│  run 4e8b1d0   head 9c2d4b   12m ago   BLOCKED   1 proven        │
│  run 2a71f0c   head 7c41a09  1h ago    CLEAR     0 proven        │
└──────────────────────────────────────────────────────────────────┘
┌ / 02 — DELTA · 2a71f0c → 4e8b1d0 ────────────────────────────────┐
│  + a91f3c2e  critical 0.810  null-deref in session.currency      │
│  ~ 7e3f1a44  high 0.612 → 0.588   coverage_gap fell (test added) │
│  − 4d81b0c7  medium 0.421   suppressed · scope=pattern · vansh.m │
│                                                                   │
│  Identity is by FINGERPRINT, not by line. 7e3f1a44 moved 40 lines│
│  and its symbol was renamed; it is the same finding.             │
└──────────────────────────────────────────────────────────────────┘
      GET /v1/pulls/4821/reviews → findings[] diffed by fingerprint
```

Rows use `+` `~` `−` gutter glyphs (mandatory — colour alone never carries state) and a fingerprint-first identity join. The caption is the M3 argument made without a marketing section.

**Data.** `GET /v1/repos/{o}/{n}/pulls`, `GET /v1/pulls/{id}/reviews`, then `GET /v1/findings?review_id=` for each of the two compared runs.

**Empty.** `No reviews for this pull request yet.` `[Run a review]` → `POST /v1/reviews`, then route to the new `/runs/:id` on the 202's `poll_url`.

---

### 2.4 `/runs/:id` — LIVE view (showpiece)

One route. `status === 'running' | 'queued'` renders LIVE; anything terminal renders RESULT (2.5). The transition is a 0ms colour flip on the gate plus a 180ms cross-fade of the right rail — never a route change, never a remount, so scroll position and selection survive.

#### Layout (1440px)

```
┌─ / 01 — PIPELINE · run 4e8b1d0 · risk tier STANDARD ───────────────────────┐
│                                                                             │
│  ①──②──③⎡bugs      ▓▓▓▓▓▓▓░░░⎤──④──⑤──⑥──⑦──⑧──⑨                          │
│         ⎢security  ▓▓▓▓▓░░░░░⎥                                             │
│         ⎢tests     ▓▓▓▓▓▓▓▓▓▓⎥                                             │
│         ⎣quality   ▓▓▓▓░░░░░░⎦                                             │
│  INGEST CONTEXT SPECIALISTS  COORD SEV IDENT PROOF DELIV FINAL             │
│                                                                             │
│  ● Stage 3/9 — specialists · 12s since last output        [▮ Re-run]       │
└─────────────────────────────────────────────────────────────────────────────┘
  GET /v1/reviews/4e8b1d0 → stage_index / stage_total / heartbeat

┌─ / 02 — WATERFALL ──────────────────────┐ ┌─ / 03 — COUNTERS ─────────────┐
│ S1 INGEST      ▬ 1.8s                   │ │ raised          12            │
│ S2 CONTEXT     ▬▬▬▬ 5.9s                │ │ dropped (spec)   4            │
│ S3 SPECIALISTS ▬▬▬▬▬▬▬▬▬▬▬▬ 14.2s       │ │ deduped          3            │
│   ├ bugs       ▬▬▬▬▬▬▬▬ 9.1s            │ │ suppressed       1            │
│   ├ security   ▬▬▬▬▬▬▬▬▬▬▬▬ 14.2s       │ │ proven           1            │
│   ├ tests      ▬▬▬▬ 4.4s                │ ├───────────────────────────────┤
│   └ quality    ▬▬▬▬▬▬ 6.8s              │ │ cost   $0.0412                │
│ S4 COORDINATOR ░ pending                │ │  in 41,022  out 3,881         │
│ …                                       │ │  cache read 28,440  (69%)     │
│                                         │ ├───────────────────────────────┤
│ wall clock = max(lane), not sum         │ │ DEGRADATIONS                  │
└─────────────────────────────────────────┘ │ · shiki lang go unavailable   │
                                             └───────────────────────────────┘
```

#### The StageRail

Nine ticked stations on a 1px `--rule-2` instrument rail. S3 forks into four simultaneous lanes that reconverge at S4 — the four lanes must be **seen to begin together**, so the entrance stagger (0/60/120/180ms) is applied to their *completion*, never their start.

Station states, each with a glyph so colour is redundant:

| State | Ring | Fill | Connector | Glyph |
|---|---|---|---|---|
| pending | 1px `--ink-6` | none | 1px `--rule-1` | — |
| running | 2px `--signal` | none | `--signal-lo` with a travelling packet | ◐ |
| done | 1px `--signal-lo` | `--signal-lo` | solid `--signal-lo` | ● |
| degraded | 1px `--marker` dashed | none | dashed `--marker` | △ |
| failed | 1px `--alarm` | `--alarm` | solid `--alarm` | ■ |

Edges are hand-authored inline SVG with `pathLength="1"` on every path, so `stroke-dasharray: 1; stroke-dashoffset: 1→0` draws an 80px fork and a 2400px spine at identical perceived speed under one keyframe. Travelling packets are a duplicate overlay path at `stroke-dasharray="0.06 0.94"`. Every stroke carries `vector-effect="non-scaling-stroke"` so 1px hairlines stay 1px across the three breakpoint geometry sets. Three geometry sets (desktop 1200×180, tablet 780×320, mobile 390×960) generated from **one TS constants file** with an `elbow(from,to)` helper — do not attempt to make one bezier survive 1440px → 375px.

**The `progress` contract.** The identical component drives the marketing scrub and the live run:

```ts
progress = (stage_index - 1 + stagePhase) / stage_total
stagePhase = clamp(secondsSinceHeartbeat / expectedSeconds[stage], 0, 0.92)
```

`expectedSeconds` comes from `GET /v1/cost` per-stage p50, falling back to a constants file. The in-flight edge creeps while a stage works and snaps to 1.0 when `stage_index` increments — which means a stage that completes faster than the 1.2s poll just animates further instead of being skipped. Capping at 0.92 prevents a slow stage from visually "finishing" before it has.

**A pulsing dot that pulses when nothing is happening is a lie.** The heartbeat dot runs `@keyframes tick { 0%,100% { opacity:.35 } 12% { opacity:1 } }` at the **real** heartbeat interval, using `steps()` not an ease. Past 20s it stops moving and turns `--marker`. See §5.

#### Waterfall

Two levels, Datadog anatomy: bar length = duration, left offset = start time, absolute ms printed in mono, chevron to expand S3 into its four lanes. The left offsets are the only place the parallel-specialist architecture becomes *visible* — four bars starting at the same x is an architectural claim you cannot make in prose. Caption beneath: `wall clock = max(lane), not sum`.

#### Right rail

Live counters in mono tabular, ticking. Cost block: `usd_estimate`, `input_tokens`, `output_tokens`, `cache_read_tokens`, plus a derived cache-hit percentage. Degradations list — each entry is a `--marker` row with the stage, the reason and what fell back.

#### Accessibility (this screen is where it matters)

```html
<div role="progressbar" aria-valuenow="3" aria-valuemin="1" aria-valuemax="9"
     aria-valuetext="Stage 3 of 9, specialists" />
<div role="status" aria-atomic="true"><!-- rendered EMPTY in the shell --></div>
<pre role="log" aria-busy="false">…</pre>
<div role="alert"><!-- reserved exclusively for the gate turning red --></div>
```

`role="status"` announces only on `stage_index` **change**, never on every 1.2s poll. `role="log"` on the streaming terminal with `aria-busy="true"` during bursts. `role="alert"` fires once, for the gate, and nothing else. The live region must exist in the DOM **before** any content changes or nothing is announced — so it renders empty in the shell, not conditionally when the run starts.

Behind the SVG rail sits a real `<ol>` of the nine stage names with their states as text. Free screen-reader support and free SEO that no competitor's animated diagram provides.

**Loading.** The rail renders all nine stations at `pending` with the labels present, the waterfall renders nine empty tracks at the correct heights. Nothing shifts when data lands.

**Error.** If the poll 5xxs three consecutive times, the rail freezes at last-known state, dims to 45%, and a `--marker` band appears: `Lost contact with the run at stage 3. Last output 34s ago.` `[Retry now]` `[Open raw payload]`. Crucially the rail does **not** reset — losing telemetry is not the same as the run failing, and conflating them is a lie about state.

---

### 2.5 `/runs/:id` — RESULT view

Same route, terminal status. The stage rail collapses to a 40px completed summary strip (all nine done, total wall clock, the one degraded stage flagged). Below it, four sub-tabs as a segmented control (`Pipeline | Findings | Delivery | Cost & timing`) plus a `Raw payload` escape hatch.

**The gate block** sits top-right, 280×64px, and is the only chromatic element on the screen by default.

```
┌──────────────────────────────────┐
│ ■ GATE · BLOCKED                 │   solid --alarm, --ink-0 text
│   1 proven finding · check_run   │
└──────────────────────────────────┘
```
Clear state is achromatic body text on `--signal-tint` with a 1px `--signal-lo` underline and a `○` glyph: `GATE · CLEAR — 0 proven blockers`. Deliberately not green. Green-pass is the most commoditised signal in CI and it sits three pixels from GitHub's own check in a PR tab; refusing it is a differentiator *and* a legibility win.

**Delivery sub-tab — the two ladders.** Rendered as literal ladders with the rung that fired solid and the ones above ghosted, each carrying the reason it was skipped.

```
COMMENT LADDER                        n     
  ▣ inline_exact                      9     
  ▢ inline_nearest                    2     line 41 not in a diff hunk
  ▢ file_level                        1     file has no reviewable hunk
  ▢ summary_only                      0
  ─────────────────────────────────────────
  12 raised · 12 delivered · 0 silently dropped

GATE LADDER
  ▣ check_run                               
  ▢ commit_status                     — not attempted
  ▢ dry_run                           — not attempted
```

The `0 silently dropped` assertion is a badge, not prose, and it is computed (`raised == Σ ladder`) rather than asserted. If it ever disagrees the badge turns `--alarm` and reads `2 unaccounted` — a product that claims nothing is silently dropped must be able to fail that claim visibly.

**Data.** `GET /v1/reviews/{id}/result` → `gate`, `delivery`, `counts`, `cost`, `timing`, `degradations`, `findings[]`, `review_payload`.

**Empty (zero findings).** `Nothing to report. 9 stages ran, 0 findings survived the coordinator, gate clear.` plus the timing and cost panels — an uneventful run is still evidence and should look like it.

---

### 2.6 `/findings` — Findings list

**Layout.** Sticky filter bar (56px) + virtualized table + a fixed footer count strip. Master-detail split via `react-resizable-panels` when opened from a run; standalone rows route to `/findings/:id`.

**Filter bar.** All filters are URL-first via nuqs, so every view is a link a judge can be dropped into, then nameable as a saved view.

`severity_min` (segmented: info low med high critical) · `proof_status` (multi: proven disproven inconclusive not_attempted) · `blocking` (tri-state) · `status` (open suppressed dismissed addressed) · `category` · `repo` · `fingerprint` (exact, from a deep link) · free text `/`.

**Columns.** First four frozen.

| Col | Content | Width |
|---|---|---|
| `[v]` | selection checkbox | 32 |
| severity | 64px ContributionBar sparkline + band letter | 88 |
| proof | glyph chip — ● proven (solid cyan), ○ disproven (cyan outline), △ inconclusive (amber dashed), · not_attempted (ink-8 60%) | 44 |
| title | truncate, 13px Inter | flex |
| location | `path/to/file.py:41` mono, **middle**-truncate (the filename and line matter, the middle does not) | 240 |
| category | 11px mono caps | 96 |
| score | 3 decimals, tabular | 72 |
| age | relative | 72 |
| status | chip | 96 |

Row hover steps `--ink-2 → --ink-3` and brightens nothing else. Selected row gets `--ink-4` fill plus a 2px `--signal` left bar. Blocking rows get a 2px `--alarm` left bar that **overrides** the selection bar (a blocking finding you happen to have selected is still first a blocking finding).

**Pagination.** Cursor-based with an explicit `Showing 1–50 of 1,284` and a `[Load more]` button. Never infinite scroll — it breaks deep links, browser find, and "jump to finding 400". Virtualize with TanStack Virtual above 400 rows.

**Bulk actions.** Capped at 50 selected. One reason required for the batch. The confirm step lists exactly which N findings will be affected and states `this writes 50 append-only audit events`. There is a revoke path, because the ledger never deletes.

**Empty.** Filter-aware, always. `No findings match severity ≥ high + proof = proven. 34 findings match severity ≥ high alone.` `[Drop the proof filter]`

**Data.** `GET /v1/findings?severity_min=&blocking=&proof_status=&status=&repo=&cursor=&limit=50`.

---

### 2.7 `/findings/:id` — Finding detail

The most important screen. **Master-detail split, never a slide-over.** Terminal output at 80–120 columns needs ~940px at 13px mono; a 560px sheet truncates the single artifact the whole product rests on. A finding is evidence, so it must also be a shareable canonical URL.

**No tabs.** One scroll with sticky section headers in fixed order. Tabs hide the proof, and the proof is the positioning. Arriving from a `proven` badge auto-anchors to §04.

**Sticky mini-header (48px)** — never scrolls away: severity readout `0.810 CRITICAL`, proof chip, fingerprint `a91f3c2e…8b4d` click-to-copy, gate impact, `[Suppress s]` `[Export evidence e]`.

```
/ 01 — CLAIM
     Markdown body (react-markdown, restricted schema: p, ul, ol, code, pre,
     strong, em, a, blockquote. No raw HTML. Inline `code` gets Google Sans
     Code at 12.5px on --ink-2 with 2px radius.)
     Below: rule_key, category, specialist that raised it, S4 coordinator
     decision (`kept — not a duplicate of 7e3f1a44 (shape_hash differs)`).
     footer: GET /v1/findings/a91f3c2e → body

/ 02 — LOCATION
     <PRGuardDiff> with the finding card hung inline at line 41. §4 below.
     footer: GET /v1/findings/a91f3c2e → location

/ 03 — WHY THIS SCORE
     <ContributionBar density="detail"> + input table + generated sentence. §3a.
     footer: GET /v1/findings/a91f3c2e → severity.inputs

/ 04 — PROOF
     <ProofBench density="compact"> — base pane, seam, head pane, verdict rail. §3b.
     footer: GET /v1/reviews/4e8b1d0/result → findings[3].proof

/ 05 — DELIVERY
     Which comment-ladder rung fired for THIS finding, and why the rungs above
     were skipped. Plus a link to the posted GitHub comment.
     footer: GET /v1/reviews/4e8b1d0/result → delivery.by_finding['a91f3c2e']

/ 06 — IDENTITY
     Fingerprint history (below). Suppression status for this fingerprint.
     footer: GET /v1/findings/a91f3c2e/fingerprint-history

/ 07 — AUDIT
     <ChainRail scope="finding"> — every audit event touching this fingerprint,
     with per-row recomputation. §3c.
     footer: GET /v1/audit?fingerprint=a91f3c2e
```

#### §06 Identity — fingerprint history

The argument is that the hash stays still while the code moves. So the hash is **pinned and static** at the top of the panel while the commits scroll beneath it. The stillness is the point.

```
fingerprint  sha256(category ‖ rule_key ‖ symbol_path ‖ shape_hash)
             a91f3c2e 4d81b0c7 8f2e91aa 3c7d0e55 … 8b4d       [copy]
────────────────────────────────────────────────────────────────────
 7c41a09   4d ago   checkout.py:41    fn create_session       first seen
 b2e8f10   2d ago   checkout.py:41    fn create_session       unchanged
 9c2d4b    12m      checkout.py:81    fn open_session         ← +40 lines,
                                                                 renamed
────────────────────────────────────────────────────────────────────
 Lines drifted 40. The symbol was renamed. The fingerprint did not change.

 SUPPRESSION   none for this fingerprint.
               (or) suppressed · scope=pattern · expires 2026-12-01 ·
                    "third-party SDK, tracked in ENG-4102" · vansh.m
                    → /suppressions/sup_7f2a   [revoke]
```

#### Suppress action

`s` or the button opens the palette sub-page (§1.4). Nothing about it is a one-click dismiss: the reason is required, the scope is explicit, and the confirm step states the blast radius. On success the finding row strikes through optimistically, the sticky header's status chip flips, and a new event appears in §07 **live**.

**Loading.** Each section renders its header strip and provenance footer immediately, with a body skeleton at the section's known height. The sticky mini-header renders last (it needs the score) and reserves its 48px.

**Error.** Per-section. If the proof fetch fails, §04 shows its own error frame with `GET /v1/reviews/{id}/result` in the footer and a `[Retry]` — the rest of the finding stays readable. A finding whose proof endpoint is down is still evidence about a claim.

**Empty variants.** `proof_status = not_attempted` renders §04 as a 60%-opacity frame with the *reason* printed (`risk tier trivial — proof not attempted`) rather than an absence. `disproven` renders the claim with a strike-through drawn left-to-right over 180ms and the caption `We refuted our own finding. It never reached your PR.` — and the gate block reads `clear · 0 proven · 1 self-refuted`.

---

### 2.8 `/suppressions` — Suppression ledger

Same `<ChainRail>` component as the audit viewer, at `variant="suppressions"`. The design rule: **append-only must look impossible to delete.**

```
┌ / 01 — SUPPRESSION LEDGER · 84 entries · 6 revoked · 0 deleted ──────────┐
│                                                                          │
│ ┃ ● sup_7f2a   2026-09-19 14:22:07Z   vansh.m   scope=pattern           │
│ ┃   "third-party SDK, tracked in ENG-4102"      expires 2026-12-01       │
│ ┃   fingerprint a91f3c2e…8b4d   affects 7 findings   audit seq 1391      │
│ ┃                                                                        │
│ ┃ ● sup_3c19   2026-09-18 09:04:11Z   agent     scope=line              │
│ ┃   ~~"duplicate of sup_7f2a"~~                  REVOKED seq 1402        │
│ ┃   revoked by vansh.m: "scope was too narrow"                           │
│ ┃                        ← struck through, 45% opacity, STILL PRESENT    │
└──────────────────────────────────────────────────────────────────────────┘
  GET /v1/suppressions
```

Revoked rows render struck through at 45% and **remain in place**. There is no delete affordance anywhere on this screen. `DELETE /v1/suppressions/{id}` is wired to the **Revoke** action and the UI says `revoke` everywhere — if the API verb is DELETE, the UI must not inherit its vocabulary, because the semantic is append-a-revocation.

**Filters.** scope · actor (human/agent/system) · active/expired/revoked · repo · fingerprint. URL-first.

**Empty.** `No suppressions. Every finding PRGuard has raised is still on the record.` — which is a boast, not an absence.

**Data.** `GET /v1/suppressions`, `DELETE /v1/suppressions/{id}` (= revoke).

---

### 2.9 `/audit` — Chain viewer

Full spec in §3c. Structural notes here.

**Layout.** Header strip (the verification state) + virtualized rail + a footer with `[Verify chain locally]`, `[Download raw history (JSON)]`, `[Export evidence]`. Virtualize past 200 rows with TanStack Virtual and `measureElement` for the dynamic heights of expanded rows.

**Filters.** event_type · actor · seq range · `around={seq}` deep link · fingerprint (this is what §07 of the finding detail uses).

**Light theme + print stylesheet.** This screen and `/accuracy` are the two surfaces a human exports, prints or pastes into a compliance ticket. A dark-only audit trail is a tell that the audit trail is a prop. `[Export evidence]` renders finding + proof terminal + severity breakdown + audit segment as one paginated document with page numbers, a header carrying the chain head hash, and a footer carrying the generation timestamp and the verification result.

**This is the first thing cut if the schedule slips** — but "here is the PDF you hand your auditor" is a beat nobody else in this category can show, so cut it last among the optionals.

---

### 2.10 `/accuracy` — Accuracy self-report

**Layout.** Six metric cards in a 3×2 grid, then three charts, then a caveats block. Nothing counts up. Half-disclosing is worse than not disclosing for a product whose thesis is proof.

Each card:

```
┌─────────────────────────────────────────────────┐
│ EXECUTION-VERIFIED PRECISION                    │  11px mono caps
│                                                 │
│  0.910                                          │  3rem mono, snaps
│  ├──────────●──────────┤                        │  Wilson 95% CI hairline
│  0.873            0.937      n = 312            │  11px mono
│                                                 │
│  Of findings we claimed as proven, the share    │  13px Inter, ALWAYS
│  where the repro test passed at base and failed │  VISIBLE — never a
│  at head on re-execution.                       │  tooltip
│                                                 │
│  Caveat: computed over runs since 2026-08-01.   │  13px --text-dim
│  Excludes 14 runs where the sandbox timed out.  │
└─────────────────────────────────────────────────┘
      GET /v1/accuracy → execution_verified_precision
```

The six metrics: `proven_rate`, `disproven_rate`, `execution_verified_precision`, `self_caught_false_positive_rate`, `human_dismissal_rate`, `addressed_rate`.

**`self_caught_false_positive_rate` is published prominently**, with the answer rehearsed in one printed sentence directly beneath it:
> *That is the rate at which the system caught itself before the claim reached your PR, which is the inverse of a defect.*

The Wilson interval is the differentiator. It is computed client-side (the backend returns `value` and `n`; the interval is presentation) at z = 1.96:

```
center = (p̂ + z²/2n) / (1 + z²/n)
half   = z/(1 + z²/n) · √( p̂(1-p̂)/n + z²/4n² )
```

Rendered as a 1px `--ink-6` horizontal rule with 4px end caps and a 2px `--signal` tick at the point estimate. For `0.91 (n=312)` that is `[0.873, 0.937]`. An error bar next to a precision figure is something no competitor offers.

**Empty / low-n.** If `n < 30`, the card renders the value at `--text-dim`, widens the interval honestly, and prints `n too small for a stable estimate` instead of hiding the metric. Suppressing a metric because it is inconvenient is the exact behaviour the product attacks.

**Data.** `GET /v1/accuracy` — every metric arrives with its definition string, its n and its caveats array from the API. The UI renders all three; it does not author them.

---

### 2.11 `/cost` — Cost and latency

**Layout.** A summary strip (total spend in window, runs, cost/run p50 and p95, cache-hit %), then four charts (§7), then a table of the 20 most expensive runs with a link each.

The per-stage latency chart on this page is the source of `expectedSeconds` for the live rail (§2.4) — one page feeds another, which is why it earns its place.

**Data.** `GET /v1/cost?window=7d|30d|90d`.

**Empty.** `No completed runs in this window.` with a window switcher, not a dead end.

---

### 2.12 `/settings/*`

Six sub-pages, all the same shape: a left sub-nav, a single column of setting groups, an explicit `[Save]` (no autosave on a policy surface — a governance product does not silently mutate policy), and a diff-preview on save that states what changes and that **it writes an audit event**.

- **`/settings/policy`** — the substantive one. Gate mode (`check_run` preferred, fallbacks in order). Risk tier defaults and their per-tier stage budgets. Severity band thresholds (**displayed with the weights, read-only, with a printed note that they are fixed in code and guarded by a test** — a "computed severity" product must not let severity be a settings field). Blocking rule: `only proven findings can block` rendered as a locked toggle with the enforcing test name printed beneath it in mono: `tests/test_governance_rail.py::test_ai_never_approves`.
- **`/settings/repositories`** — per-repo risk tier overrides and suppression scope permissions, in a table.
- **`/settings/members`** — roles, and who may revoke a suppression or break-glass.
- **`/settings/integrations`** — GitHub App install state, webhook health (`/healthz`, `/readyz` polled at 30s), last delivery, replay control.
- **`/settings/api-keys`** — create shows the token exactly once; the list shows prefix + created + last used, never the value.
- **`/settings/budgets`** — monthly cap, per-run cap, alert thresholds, and what happens on breach (degrade risk tier vs stop).

**The governance stamp**, printed on `/settings/policy` in a bordered frame:
> `The AI posts ONE GitHub review, event: COMMENT. Never APPROVE.`
> `Enforced in code. Guarded by tests/test_governance_rail.py::test_ai_never_approves.`

**Error on save.** Inline beside the field, the endpoint in the footer, and the form does not clear. A 409 renders `policy changed by vansh.m 12s ago` with a `[Show their change]` diff.

---

## 3. The three hard problems

### 3a. Severity — so a human instantly understands WHY

**The decision: a weighted contribution bar with printed threshold ticks. Not a radar.** Radar encodes by area, so it systematically misrepresents the one number the product's credibility rests on, and it is the single most over-used "AI scoring" visual. A stacked bar whose total length *is* the score is self-verifying: you can check the arithmetic by eye.

**Library:** hand-authored inline SVG. No chart library. Six rects, four ticks, one readout — Recharts would cost 7MB unpacked to draw six rectangles, and a chart library's tooltip/legend conventions would fight the instrument register.

**Component:** `<ContributionBar score inputs weights density />` at three densities — `glyph` (64×10px, findings-list row), `compact` (320px, master-detail pane), `detail` (640px, finding detail and the marketing section). Same code, same file, three surfaces.

#### Anatomy at `density="detail"` (worked example, score 0.810)

```
 0.810  CRITICAL                                        ← 3rem mono, SNAPS

 ┌────────────────────────────────────────────────────────────────────────┐
 │████████████│██████████│████│██████│███████│██│                         │
 └────────────────────────────────────────────────────────────────────────┘
      ┊            ┊              ┊                ┊
     .15          .35            .55              .75 ▲
     low         medium          high          critical   ← ticks + labels

 path_sensitivity  reachability  blast  coverage  proof_conf  churn
       .250            .180      .083     .120      .143      .035

 "reachable from an unauthenticated route × 7 callers × untested
  × payments path × proven"                              ← mono pull-quote

 input              raw    weight   contribution
 path_sensitivity  1.000    .25        .250
 reachability      0.900    .20        .180
 blast_radius      0.550    .15        .083
 coverage_gap      0.800    .15        .120
 proof_confidence  0.950    .15        .143   ▨ hatched
 churn             0.350    .10        .035
 ─────────────────────────────────────────────
 Σ                                     .810   ≥ .75 → critical
```

**Exact spec.**

- Track: 640×28px, 2px radius, `--ink-2` fill, 1px `--rule-1` border. Four corner registration marks (this is an evidence frame).
- Filled length = `score × 640` = 518.4px.
- **Segment order is fixed and canonical** — weight descending, ties by spec declaration order: `path_sensitivity .25`, `reachability .20`, `blast_radius .15`, `coverage_gap .15`, `proof_confidence .15`, `churn .10`. Fixed order is what makes the 64px glyph comparable across 1,284 rows at a glance.
- Segment width = `value × weight × 640`. Minimum rendered width 3px with a 1px `--ink-1` divider, so a near-zero input remains locatable rather than vanishing.
- **Colour: one hue, six lightness steps.** Six hues would fight a three-family palette and misread at 320px. The ramp runs `oklch(0.86 → 0.51, C 0.09, H 205)` in weight order, brightest = biggest lever. `proof_confidence` reuses its step plus a 2px 45° hatch, because it is the only input that is about the *system's own certainty* rather than about the code.
- **Ticks** at .15 / .35 / .55 / .75, drawn as 1px full-height marks in `--ink-6` extending 6px below the track, with 11px mono labels. The tick the score has crossed is promoted to 2px in the band colour (`--sev-critical` here). This is the move that answers "why critical and not high?" in one glance with no legend.
- **Readout snaps.** No count-up. A number that spins while a judge reads it is decoration on the one surface that must read as rigorous.
- **Hover** a segment: it brightens one lightness step, its table row gets `--ink-3`, and the corresponding clause in the mono sentence gets a 1px underline. 120ms both ways. Keyboard: arrow keys move between segments with the same effect, so the interaction is not mouse-only.

**Entrance animation** (first view only, once): segments grow left-to-right, 180ms each with 30ms stagger — capped at the dashboard's 180ms budget. The readout snaps to its value the instant the bar crosses the final tick. Under reduced motion the bar renders at full width with no growth, which loses nothing because the designed state and the end state are the same frame.

**At `density="glyph"`:** 64×10px, six segments, no ticks, no labels, no hatch (too small to read), 2px radius, `aria-label="severity 0.810, critical"`. The band letter (`C`) sits 4px to its right in 11px mono at the band colour, so the row is legible in greyscale and in forced-colors.

---

### 3b. Proof — so base-vs-head reads as evidence

**Component:** `<ProofBench finding density />`. This is the same React component as the marketing hero at `density="hero"`; the dashboard uses `density="compact"`. The marketing screenshot and the product screenshot being the *same object* is what makes the site read as a product rather than as two disconnected artifacts.

**Library: `anser@2.3.5`, never xterm.js.** anser is 0.04MB with zero dependencies; xterm.js is 5.65MB, owns its own scrollback and sizing, fights SSR, virtualization, selection and theming, and in v6 removed the canvas renderer. We are rendering a captured artifact, not emulating a terminal. `ansiToJson(text, { use_classes: true, json: true })` produces tokens; we map the classes to our own tokens so the terminal inherits the theme.

**Server-side capture normalisation is a backend requirement.** `\r` rewrites, `\x1b[2K` erase-line and cursor-movement sequences must be collapsed at capture time so progress bars flatten to their final frame. A terminal that renders garbage because nobody normalised the capture is worse than no terminal.

#### Anatomy

```
┌ / 04 — PROOF · finding a91f3c2e ─────────────────────── ● proof_status: PROVEN ┐
│  SANDBOX python:3.12-slim · seed 4a91 · captured 2026-09-19T14:22:07Z          │
├────────────────────────────────────────────────────────────────────────────────┤
│▌ 1  $ git checkout 7c41a09 && pytest -q tests/test_repro_a91f3c2e.py           │  ← 2px --signal-lo rail
│▌ 2  .                                                                          │
│▌ 3  1 passed in 0.42s                                                          │  "passed" in --signal
│                                                                                │
│ ──────────────────────── — HEAD 9c2d4b — ───────────────────────────────────── │
│                                                                                │
│▌ 1  $ git checkout 9c2d4b && pytest -q tests/test_repro_a91f3c2e.py           │  ← 2px --alarm rail,
│▌ 2  E       assert session is not None                                        │     --alarm-tint bg
│▌ 3  E       AttributeError: 'NoneType' object has no attribute 'currency'      │
│▌ 4  tests/test_repro_a91f3c2e.py:41: AttributeError                           │
│▌ 5  1 failed in 0.39s                                                          │  "failed" in --alarm-hi
├────────────────────────────────────────────────────────────────────────────────┤
│  PASSES AT BASE · FAILS AT HEAD · PROVEN                    → blocks merge     │
└────────────────────────────────────────────────────────────────────────────────┘
   GET /v1/reviews/4e8b1d0/result → findings[3].proof
```

**Exact spec.**

- Panes stack vertically below 1400px, side-by-side above (two columns sharing one command row, `base | head`). Stacked is the default because a traceback needs width more than the comparison needs adjacency.
- 13px / 22px Google Sans Code, tracking exactly 0. **Horizontal scroll, never wrap** — wrapping destroys traceback alignment, and alignment is the one visual property a forensic product cannot compromise.
- 40px dimmed line-number gutter at `--ink-8`, `user-select: none` so copying the output copies the output.
- Pane A: 2px `--signal-lo` left rail, `--ink-1` background. Pane B: 2px `--alarm` left rail, `--alarm-tint` background.
- Divider: 1px `--rule-1` with a centred 11px mono label `— HEAD 9c2d4b —`, both SHAs click-to-copy.
- Verdict rail, 44px, `--ink-2`: `PASSES AT BASE · FAILS AT HEAD · PROVEN` in 11px mono caps, right-aligned `→ blocks merge` in `--alarm`.
- Header actions: `[copy raw]` `[download raw]` `[wrap]` `[search]`. Search highlights in place and shows `3/7` with `n`/`N` to step.
- Four corner registration marks at 0.10 alpha, 0.22 on hover. Evidence frame.
- Virtualize the `<pre>` past 400 lines with TanStack Virtual, using `measureElement` for wrapped-line heights when wrap is toggled on.

**The four proof states**, each with a mandatory glyph because proven and disproven deliberately share the cyan hue:

| State | Chip | Pane treatment | Caption |
|---|---|---|---|
| `proven` | solid `--signal` fill, `--ink-0` text, ● filled-vial glyph | base cyan rail, head alarm rail + tint | `→ blocks merge` |
| `disproven` | `--signal` **outline**, ○ struck-vial glyph | both panes cyan rail; **head pane shows `1 passed in 0.61s`**; the claim above is struck through | `refuted by execution · gate stays clear` |
| `inconclusive` | `--marker` dashed border, △ glyph | both panes at 70%, the failure reason printed | `sandbox timed out at 120s — a human must decide` |
| `not_attempted` | `--ink-8`, 60% opacity, no border, · glyph | frame renders at 60% with the reason, no panes | `risk tier trivial — proof not attempted` |

**Ship the legend.** A one-line key beneath the first ProofBench a user encounters: `● proven · ○ disproven — both ran. △ inconclusive · not attempted — neither did.` Making proven and disproven the same hue is the strongest idea in the palette — it refuses to encode self-honesty as failure — but it is not self-evident, and cleverness must not cost comprehension.

**Amber belongs on `inconclusive`, not `disproven`.** FAR 25.1322 defines amber/caution as "requires immediate flightcrew awareness and subsequent response". A self-refuted finding requires no response at all; an inconclusive one genuinely needs a human to decide.

**Motion.** In the dashboard, none — the bench renders in its final state. The 1400ms scan line is a marketing-only affordance on `--ease-mass: cubic-bezier(0.33, 0, 0.12, 1)`, the one curve with real weight, used for exactly one element in the entire product.

**Never ship a PNG of a terminal.** The text must be real, selectable, searchable and syntax-classed. A screenshot of a terminal is exactly what a product that could not actually do this would ship, and a judge who tries to select the stack trace will find out in one second.

---

### 3c. The hash chain — so it reads as tamper-evident

**Component:** `<ChainRail events variant scope />`. **Library: none.** SVG rail + DOM rows + Web Crypto `crypto.subtle.digest('SHA-256', …)` — about twenty lines. No chain-link imagery, no 3D, no blockchain vocabulary. The rail is a 2px vertical line and a per-row hash check; that is all it should ever be.

**Design the BROKEN state first.** The verified state means nothing until the broken state exists.

#### Verified

```
┌ chain.verified = true · 1,428 events · head a91f3c2e…8b4d · verified 3s ago ┐
│                                                     ▔▔▔▔▔▔▔▔ cyan underline │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┃                                                                           │
│ ●  1428  14:22:07Z  +12s   ⬢ human   GATE.BLOCKED      a91f3c2e…8b4d   ⌄   │
│ ┃                                                                           │
│ ●  1427  14:21:55Z  +0.4s  ◇ system  PROOF.PROVEN      4d81b0c7…1e02   ⌄   │
│ ┃                                                                           │
│ ●  1426  14:21:55Z  +2.1s  ▣ agent   FINDING.SCORED    8f2e91aa…77c3   ⌄   │
│ ┃                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
  GET /v1/audit?limit=200
```

Row anatomy: an 8px filled node on the rail · `seq` in mono tabular · absolute UTC + relative delta from the previous event · actor with a distinct glyph (⬢ human / ▣ agent / ◇ system — glyph, never colour alone) · `event_type` as an 11px mono caps chip · hash rendered **first-8 + ellipsis + last-4** with click-to-copy of the full 64.

Expanding a row (`⌄`, or `Enter` on the focused row) reveals:

```
   prev_hash        4d81b0c7 6f2a11de … 1e02
   canonical_json   { "seq": 1428, "event_type": "gate.blocked", … }     ← Shiki, read-only
   event_hash       a91f3c2e 4d81b0c7 … 8b4d
   ─────────────────────────────────────────────────────────────────
   sha256(prev_hash ‖ canonical_json) == event_hash        ✓ verified
                                                            ↑ computed in
                                                              YOUR browser
```

The equality line is the moment a viewer believes the chain is real rather than a schema field. It must be computed, not asserted — Web Crypto makes it real in twenty lines, and a judge who opens devtools and sees a hardcoded `true` destroys the credibility the rest of the screen just built.

#### Broken

```
┌ ■ chain.verified = false · broken_at_seq = 1428 ────────────────────────────┐
│   0ms colour snap to --alarm, 180ms scale(1.045)→1                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┃                                                                           │
│ ●  1429  14:22:19Z  ⬢ human   REVIEW.FINALISED   3c7d0e55…ff10        45%  │
│ ┋                                                    ← dashed --alarm, 45%  │
│ ┋                                                                           │
│ ⊘  1428  ← 6px PHYSICAL GAP IN THE RAIL ───────────────────────────────────│
│                                                                             │
│      expected   a91f3c2e 4d81b0c7 6f2a11de … 8b4d                          │
│      computed   a91f3c2̲e̲ 4d81b0c7 6f2a11de … 8b4d                          │
│                        ▲ first differing nibble, --alarm-tint background    │
│                                                                             │
│ ●  1427  14:21:55Z  ◇ system  PROOF.PROVEN       4d81b0c7…1e02             │
│ ┃                     ← intact below the break, full opacity                │
└─────────────────────────────────────────────────────────────────────────────┘
```

Four things happen at once, and the simultaneity is what sells it:

1. The header colour flips in **0ms** — no transition at all — paired with a 180ms `scale(1.045)→1`. Every other transition in the product is eased; an instantaneous colour flip reads as a machine returning a result rather than a UI animating. This is the most important motion decision in the project and it must not be softened.
2. The rail opens a **literal 6px gap** at `broken_at_seq`. Not a colour change — a physical discontinuity in a continuous line. That makes "tamper-evident" legible in two seconds with no reading.
3. Everything **downstream** of the break (higher seq) drops to 45% opacity with a dashed `--alarm` rail, because those events' hashes no longer chain. Events *below* the break stay at full opacity — they are still verified, and dimming them would be a lie about what was compromised.
4. The broken row auto-expands to show `expected` over `computed` with the **first differing nibble** highlighted. Byte-level, not "hashes differ".

**In the dashboard there is no tamper button.** The contenteditable tamper control is the marketing site's interaction. The dashboard gets `[Verify chain locally]` (recomputes the whole visible window, prints the elapsed ms and the result) and `[Download raw history (JSON)]`. Evidence that cannot leave the product is set dressing.

**The one failure mode that matters.** If the browser's canonical-JSON serialisation diverges from the backend's by one byte of key order, whitespace or unicode escaping, the page loads showing `chain.verified = false` on a chain that is fine — the most self-refuting failure available to this product. Mitigation, day zero, non-negotiable: a shared canonicalisation spec owned by the backend, identical fixtures tested on both sides in CI, and a build-breaking failure if they diverge.

**Suppressions reuse this component** at `variant="suppressions"` with revocations as strike-through rows that remain. Same rail, same identity, one build.

---

## 4. Diff and code rendering

**One wrapper, one file:** `<PRGuardDiff />`. The riskiest dependency in the build (`@git-diff-view` is 0.1.7 from a single maintainer, and its README references a `@git-diff-view/lezer` package that is not published) sits behind exactly one component, so a swap to `react-diff-view@3.3.3` touches one file.

**Chosen:** `@git-diff-view/react@0.1.7` + `@git-diff-view/shiki`. It is the only React diff component where Shiki is a first-class highlighter *and* where per-line metadata injection is a documented prop.

```tsx
// components/evidence/PRGuardDiff.tsx  — the ONLY file that imports @git-diff-view
const highlighter = await getDiffViewHighlighter();
diffFile.initSyntax({ registerHighlighter: highlighter });

<DiffView
  diffFile={diffFile}
  diffViewMode={split ? DiffModeEnum.Split : DiffModeEnum.Unified}
  diffViewTheme="dark"
  diffViewHighlight
  diffViewWrap={false}
  diffViewFontSize={13}
  extendData={findingsByLine}
  renderExtendLine={({ data }) => <FindingCard finding={data} />}
/>
```

**Theme: a custom Shiki theme generated from the token file, never `github-dark`.** The category's entire visual language is GitHub's diff palette; shipping it verbatim carries zero brand and — worse for PRGuard — it collides with proven/disproven, which is the distinction that actually matters. The generated theme is named `prguard-cold` and is built at compile time from `core.css`, so a token change re-themes the code surfaces.

**Diff tints at 8–9% alpha, not the category-standard 20%.** `add` → `oklch(0.80 0.125 158 / 0.08)`, `remove` → `oklch(0.755 0.145 24 / 0.09)`. At 20% the code stops being readable, which is the opposite of what an evidence product wants. **The `+`/`−` gutter glyph is mandatory** — add-vs-remove measures ΔE 3.6 under deuteranopia, so for a meaningful share of users the glyph is the entire semantic channel. Never ship a "clean" diff view that drops the gutter. These two hues are confined to the code surface and may never appear in UI chrome.

**How a finding's lines are highlighted.** Three layers, all redundant with each other:

1. **Row fill** — the offending line(s) get the severity band colour at 10% alpha (`--sev-critical / 0.10` for the worked example). Not the diff tint; a diff tint says "this line changed", a band tint says "this line is accused".
2. **Left rail** — 2px in the band colour on the offending lines, extending across the gutter so it reads at the edge of the pane. If the finding is blocking, the rail is `--alarm` regardless of band.
3. **Inline card** — mounted directly beneath the last offending line via `renderExtendLine`. 88px collapsed: the severity glyph sparkline, the claim title, the proof chip, `[Open finding →]` `[Suppress s]`. Expanding it in place reveals the ContributionBar at `density="compact"` without leaving the diff.

**Standalone snippets** (the generated repro test, the canonical JSON in an audit row, the code context in a claim) use server-rendered Shiki 4.4.3 directly, not the diff component. Import 6–10 languages **individually** — never the barrel, which is 8.25MB unpacked:

```ts
import ts from '@shikijs/langs/typescript';
import tsx from '@shikijs/langs/tsx';
import py from '@shikijs/langs/python';
import go from '@shikijs/langs/go';
import rs from '@shikijs/langs/rust';
import java from '@shikijs/langs/java';
import sql from '@shikijs/langs/sql';
import json from '@shikijs/langs/json';
import sh from '@shikijs/langs/bash';
```

With `transformerNotationHighlight` and `transformerNotationDiff` so a snippet can carry `[!code highlight]` and `[!code ++]` annotations. Transformers add classes only; we write the CSS against our tokens.

**Unsupported language fallback.** If a file's language is not in the bundle, render plain mono at `--text-body` with the line numbers and rails intact, and print `syntax highlighting unavailable for .ex` in 11px mono in the panel header. A degradation stated is not a failure; a degradation hidden is.

**Rejected, with the reason:** Monaco (93.38MB unpacked, drags in marked + dompurify, installs cursor/focus-trap/context-menu affordances that are wrong for evidence you are meant to read); diff2html (string→HTML, needs `dangerouslySetInnerHTML`, no React widget model); `@codemirror/merge` (a two-document editor merge view, not a multi-file PR diff surface).

---

## 5. Real-time strategy

**Polling, not SSE.** A dead `EventSource` mid-demo is a silent, unrecoverable failure with no recovery UI; a 1.2s poll survives a four-second wifi blip. Next's own docs list nginx buffering, CDN buffering, gzip/Brotli buffering and Safari's 1024-byte buffer as things that lump a stream. Say so in the README: production uses a stream, the poll is the deliberate venue-hardened path.

```ts
useQuery({
  ...getReviewOptions({ path: { id } }),
  refetchInterval: (q) => {
    const d = q.state.data;
    if (!d || d.status === 'succeeded' || d.status === 'failed') return false;
    return d.heartbeat_age_s > 90 ? 4000 : 1200;
  },
  refetchIntervalInBackground: false,
  staleTime: 0,
});
```

Terminal states stop polling entirely. Backoff to 4s after 90s avoids hammering a stuck run. `refetchIntervalInBackground: false` plus a `visibilitychange` listener that fires one immediate refetch on return, so a tab you come back to is correct within one frame rather than within 1.2s.

### 5.1 The "12s since last output" heartbeat UX

This is the most important detail on the live screen, because it is the UI admitting what it does and does not know — which is the product's thesis applied to itself.

**The number is a client-side 1Hz ticker, not a poll artefact.** Computing it from the poll cadence would make it jump in 1.2s steps and reveal the polling; computing it from the heartbeat timestamp makes it a real measurement.

```ts
// clock-skew safe: anchor to the server's own `now` when the poll returns it,
// otherwise to the local receipt time, then advance locally at 1Hz.
const anchor = useRef<{serverNow: number; heartbeat: number; localAt: number}>();
// on each successful poll:
anchor.current = { serverNow: data.now, heartbeat: data.heartbeat_at, localAt: performance.now() };
// every 1000ms:
const ageS = (anchor.serverNow - anchor.heartbeat + (performance.now() - anchor.localAt)) / 1000;
```

**Thresholds, and what changes at each:**

| Age | Text | Dot | Extra |
|---|---|---|---|
| < 10s | `--text-dim` | pulsing `--signal` at the real interval | — |
| 10–20s | `--text-body` | pulsing | — |
| 20–45s | `--marker` | **stops pulsing**, turns `--marker` | `[Show raw payload]` appears |
| > 45s | `--alarm` | static `--alarm` | `[Re-run]` appears; a `role="status"` announcement fires once |
| > 120s | `--alarm` | static | Stage rail dims to 45%; `run appears stalled at stage 3` band |

The dot stopping is more informative than the dot speeding up. A pulsing dot that pulses when nothing is happening is a lie; one driven by real telemetry is instrumentation.

The rendered string is literal and mono: `Stage 3/9 — specialists · 12s since last output`. Not a progress percentage, not "Working…". A judge reading that sentence understands the system's epistemic state instantly, which is worth more than any spinner.

**Announcement discipline.** `role="status"` announces only on `stage_index` change and once at each threshold crossing — never on every tick, or the page is unusable with a screen reader. `aria-atomic="true"` means the stage and the age read as one sentence.

**Stage completion faster than the poll.** Because the rail renders from `stage_index` as a monotonic progress value (§2.4) rather than from discrete events, a stage that starts and finishes inside one 1.2s tick just animates further. Nothing is skipped and nothing flickers backwards — `progress` is clamped to be non-decreasing within a run.

**Three consecutive poll failures** freeze the rail at last-known state and show the error band described in §2.4. The rail never resets, because losing telemetry is not the run failing.

---

## 6. Data fetching architecture

**Typed client generated from FastAPI's OpenAPI document, committed to the repo.**

```jsonc
// openapi-ts.config.ts
{
  "input": "http://localhost:8000/openapi.json",
  "output": { "path": "src/api", "format": "prettier" },
  "plugins": [
    "@hey-api/client-fetch",
    { "name": "@tanstack/react-query",
      "queryOptions": true, "queryKeys": true,
      "infiniteQueryOptions": true, "mutationOptions": true }
  ]
}
```

`@hey-api/openapi-ts` pinned **exactly** (it is 0.x; a minor bump can break generation). Requires Node ≥ 22.18 — so standardise on **Node 22 LTS**, which also clears ESLint 10's `^20.19 || ^22.13 || >=24` floor and shadcn's `>=20.18.1`. The openapi-typescript family is not the choice: the whole monorepo last published 2026-02-11, and `openapi-react-query` has quietly dropped off the repo README's package list.

**Why generate rather than hand-write.** Ten endpoints does not obviously justify codegen — but PRGuard's filter surface does. `GET /v1/findings?severity_min=&blocking=&proof_status=&fingerprint=&review_id=&repo=&status=&cursor=` is eight params that are easy to mistype and impossible to catch at runtime. Generated query keys mean cache invalidation after a suppression is surgical and cannot drift from the backend:

```ts
useQuery({ ...getFindingsOptions({ query: { severity_min: 'high', proof_status: ['proven'] } }) });

useMutation({
  ...suppressFindingMutation(),
  onSuccess: (_, vars) => {
    qc.invalidateQueries({ queryKey: getFindingsQueryKey({ query: { review_id } }) });
    qc.invalidateQueries({ queryKey: getSuppressionsQueryKey() });
    qc.invalidateQueries({ queryKey: getAuditQueryKey({ query: { fingerprint: vars.fingerprint } }) });
  },
});
```

**Commit the generated client.** `npm run api:gen` regenerates; CI asserts it is clean. A flaky backend at build time must not be able to break the build.

**Optimistic updates** on the one mutation that needs them (suppress). One pure reducer shared by the optimistic path and the server response so both compute the identical next state; roll back on failure with a sonner toast carrying the endpoint and the status code.

**URL is the source of truth for filters.** nuqs 2.10.1 on every list screen. Every filtered view is a link, which means a judge can be dropped straight into `/findings?severity_min=high&proof_status=proven&blocking=true` and see the three findings that matter. Saved views are a thin layer over named URLs.

**Fixture mode.** `NEXT_PUBLIC_FIXTURES=1` swaps the generated client's `fetch` for a resolver over a seeded JSON corpus committed to the repo. The entire dashboard demos with the backend off. This is the insurance policy, and it is also the local dev experience.

**Cache layering.** The marketing route group uses Cache Components (`'use cache'`, prerendered static shells). The `(app)` group is entirely uncached and reads live — which in Next 16 is already the default, so nothing to configure. After a suppression write from a Server Action, `updateTag()` (read-your-writes) rather than `revalidateTag()`, because the user must see the ledger row on the next paint, not eventually.

---

## 7. Charts

**Recharts 3.10.1 under shadcn's `ChartContainer` / `ChartTooltip` / `ChartLegend`.** Chosen for exactly one reason: the shadcn chart layer themes from CSS custom properties, so every chart inherits the bespoke token ramp for free. Rejected: ECharts (57.5MB unpacked, imperative canvas), Nivo (last published 2025-05-23), Observable Plot (2025-02-14, imperative), Chart.js (canvas — no DOM nodes to style, no inheritance from CSS variables, which is the entire rationale for the choice), Tremor (Apache-2.0 core not MIT, repo ~11 months stale, site still carrying a Jan-2025 acquisition banner).

Chart tokens map to the product's semantics, not to a generic palette:

```css
--chart-proven: var(--signal);
--chart-disproven: oklch(0.78 0.02 205);   /* cyan, desaturated — outline family */
--chart-inconclusive: var(--marker);
--chart-not-attempted: var(--ink-8);
```

**Global chart rules.** Every chart sits on the graticule (the graph paper at 0.018 becomes the gridline system — no separate Recharts `CartesianGrid` fill). Axis labels 11px mono caps. All numerics tabular. No animation on mount beyond a 180ms opacity fade. No legends where a direct inline label fits. **No donuts, no pies, no radars, no count-ups.**

### `/accuracy`

| # | Chart | Type | Why this type |
|---|---|---|---|
| 1 | The six metrics | **Not a chart** — cards with a Wilson CI hairline (§2.10) | A bare percentage without n and an interval is the same category of dishonesty as an LLM adjective |
| 2 | Proof-state composition over time | 100% stacked **AreaChart** by week, four bands | Composition over time; a stacked area makes the disproven band's persistence visible, which is the argument |
| 3 | Human dismissal rate by category | Horizontal **BarChart**, sorted descending, n printed on each bar | Ranked comparison across ~8 categories at readable label widths |
| 4 | Calibration: predicted band vs observed addressed rate | **ScatterChart** with a reference diagonal and a Wilson CI whisker per point | The strongest chart on the page — it shows whether the computed severity actually predicts what humans fix. A product that publishes error bars should also publish its calibration. |

Chart 4 is the one no competitor can draw, because it requires a deterministic predicted score and an observed outcome. If `n` is too small per band, it renders the points it has with wide intervals and prints `n per band: 41 / 88 / 121 / 47 / 15` — never hidden.

### `/cost`

| # | Chart | Type | Notes |
|---|---|---|---|
| 1 | Cost per review | **Histogram** (BarChart over bins) with `ReferenceLine` at p50 and p95 | Never a mean. Bin server-side; Recharts is SVG and struggles past ~5,000 points |
| 2 | Per-stage latency | Stacked horizontal **BarChart** across the nine stages, p50 and p95 as two rows | This is what seeds `expectedSeconds` for the live rail |
| 3 | Wall clock vs sum-of-stages | Two-series **LineChart** over time | Makes the S3 parallelism visible as a persistent gap between the lines |
| 4 | Cache-hit % and token mix | **AreaChart**, `cache_read_tokens / (input + cache_read)` | The one cost lever a user can act on |

### `/` Overview

Chart 3 from `/accuracy` (proof-state composition) at half height, plus the gate-outcome stacked bar (a single `BarChart` with `layout="vertical"` and one row — cheaper and more legible than a donut).

---

## 8. Build order, cut order, and the three hard rules

**Build order.** Day 0 (0.5d): the token file in OKLCH, gamut-clamped, APCA-verified with the official `apca-w3` package; the graticule; the `Surface` primitive with hairlines and registration marks; `[data-contrast="high"]` **on day one, not day six** — it is four lines of CSS if the tokens are semantic and a rewrite if they are not.

Day 1: `<ProofBench>` static at frame 0. Day 2: `<ContributionBar>` all three densities. Day 3: `<ChainRail>` + Web Crypto verification. Day 4: `<StageRail>` static geometry → live driver (the scroll scrub is marketing-only and can slip). Day 5: shell, findings table, run view, finding detail. Day 6: ⌘K nested palette, suppressions, accuracy, cost, the a11y pass, fixture mode, the light/print variant for audit + accuracy, and a 90-second screen recording of the proven-bug moment sitting on the desktop as an MP4.

**Cut order under pressure:** (1) `/repos/:owner/:name/pulls/:number` run-delta, (2) settings sub-pages beyond `/settings/policy`, (3) the light theme + print stylesheet + Export evidence, (4) chart 4 on `/accuracy`.

**Never cut:** `<ProofBench>`, `<ContributionBar>`, `<ChainRail>`, `/audit`, `/accuracy`. Those five are PRGuard. Without them this is a nicely-typeset dark admin panel with nothing to say.

**Three hard rules, restated because they are the ones that will be violated at 2am:**

1. **Registration marks appear only on evidence-bearing frames.** Written down, enforced in review, not left to taste.
2. **GSAP never enters `app/(app)/`; Motion never drives scroll.** Enforced with an ESLint `no-restricted-imports` rule, not with discipline. Two engines on the same DOM subtree is the documented read/write-thrash case.
3. **The canonical-JSON spec is a backend deliverable on day zero, with CI fixtures on both sides.** A false chain break on the flagship trust feature is strictly worse than not shipping the interaction at all.