# Design decisions — LOCKED

> Settled 2026-09-23 by Vansh, after the 33-agent research workflow of 2026-09-22.
> These three were the only genuinely open calls. They are closed. Do not reopen them
> mid-build — decision 1 in particular costs ~2 days if it is reopened after day one.

---

## D1 — Visual direction: **COLD LIGHT, zero WebGL.** Sell the refusal.

**Decision:** ship the instrument/forensic direction flat. No Three.js, no R3F, no shader
package, no canvas hero, and **no concession shader** behind section 02.

**The prepared sentence** (use this verbatim if anyone asks why there is no 3D):

> Of 22 elite dark dev-tool sites surveyed, essentially none ship a WebGL hero. CodeRabbit's
> "cinematic 3D" is a conic gradient over flat panels at 2–12% white. And for a product whose
> claim is that it executes code, a floating abstract object is the visual form of an
> unfalsifiable assertion.

Depth is delivered by: the graph-paper substrate, one ink rung + 1px hairline +
`inset 0 1px 0 oklch(1 0 0 / 0.06)`, the 1400ms scan on `--ease-mass`, the 0ms verdict flip,
and exactly one pinned section (the 9-stage pipeline).

Supersedes the "one bounded concession" option in `01-direction-verdict.md` open decisions.

---

## D2 — Scope: **recut to 9 landing sections + 8 dashboard routes.**

**Landing ships 9 sections, ≈6,200px:**
hero · negation · we-were-wrong · what-lands-in-your-PR · severity instrument · pipeline ·
identity + flight recorder · accuracy report · close + footer.

**Cut from the page, shipped as linked sub-pages:** the proof-state legend (folds into
we-were-wrong as four chips), the agent-caught story, the comparison table, scope/retention/price,
the FAQ.

**Dashboard ships 8 routes:**
`/` · `/runs/:id` (live + result, one route) · `/findings` · `/findings/:id` ·
`/suppressions` · `/audit` · `/accuracy` · `/settings/policy` (read-only).

Every other route is a 404 carrying one mono line: `not built for the beta`. Stating a
limitation plainly **is** the voice — this is on-brand, not an apology.

**The pipeline scroll scrub is cut on day one, not held as contingency.** The live stage driver
is needed for `/runs/:id` regardless; build it once, drive the marketing section from a `▶ PLAY`
control plus hover. Reclaims a full day and de-risks the only pinned section on the site.

**NEVER CUT, under any schedule pressure:** the Proof Bench, the severity instrument face,
the tamper control. Those three are the product.

---

## D3 — Self-report: **publish all six accuracy metrics, with `n` and Wilson intervals.**

Every metric renders its value, its **definition as always-visible 13px body text — never a
tooltip**, its sample size, and a Wilson confidence interval as a hairline error bar. Numbers
do **not** count up.

`self_caught_false_positive_rate` is published prominently, including in the hero calibration
strip. Rehearsed answer, verbatim:

> **"That is the rate at which the system caught itself before the claim reached your pull request."**

Rationale: half-disclosing is worse than not disclosing for a product whose thesis is proof,
and no competitor publishes a false-positive rate with a denominator at all.

**Blocker before this ships:** the landing blueprint currently prints `disproven_rate 0.140
(n=537)` and `self_caught_false_positive_rate 0.140 (n=537)` — identical value, identical
denominator. Either they are definitionally the same number (in which case publishing both is
padding, the exact sin this product attacks) or the fixtures are wrong. Resolve before
`/accuracy` ships; a judge reading the two definitions side by side will ask.

---

## Consequent day-zero work, both currently unowned

1. **Canonical-JSON spec — backend owns it, frontend consumes it.** The chain viewer recomputes
   `sha256(prev_hash ‖ canonical_json)` in the browser. One byte of divergence in key order,
   whitespace or unicode escaping produces a **false break** — the most self-refuting failure
   available to this product. Write the rules into a shared spec file, test both sides against
   identical fixtures in CI, and treat a failing fixture as a build-breaking error.

2. **Seed the demo corpus** with at least one genuinely **disproven** finding, one
   `inline_nearest` delivery fallback, and one `commit_status` gate fallback. Without them the
   `D`-key counter-demo has nothing to run, the S8 ladder shows four lit rungs and no story, and
   `/accuracy` shows 100% proven — which is worse than not shipping it.

Also: `main` carries only docs. The backend is 121 commits on
`devteam/2026-09-14-pr-reviewer-v1`. Merge it before frontend work starts, so the OpenAPI
schema is on the default branch for typed-client generation.

---

## Reading order for implementers

1. `00-decisions.md` (this file) — what is settled
2. `01-direction-verdict.md` — why, and the two directions we did not build
3. `02-design-system.md` — tokens, type, texture, components. Every value is measured.
4. `03-landing-blueprint.md` — section by section, with real copy
5. `04-dashboard-blueprint.md` — IA, screens, the three hard problems
6. `05-motion-spec.md` — **owns easing and duration** where blueprints disagree
7. `06-brand-gaps-and-corrections.md` — the logo, the wordmark, the PR comment spec, and the
   15 cross-blueprint contradictions with a ruling on each
8. `90-research-corpus.md` — the verified evidence behind all of it
