# Run log — 2026-09-14-pr-reviewer-v1

## Build waves
- Wave 0: T0 seed. Green.
- Wave 1: T1, T2, T3 parallel. Merged clean. 502 tests.
- Wave 2: T4–T8 parallel (5 builders). Merged clean. One integration fix required
  (`blocking` single-writer invariant: T4's AST scan flagged T5's correct
  `= is_blocking(...)`; T7 genuinely hardcoded `= False`). 1692 tests.
- Wave 3: T9 pipeline. Merged clean. 1745 tests.

## Review Round 1

Six reviewers (T4–T9), fresh context, each reproducing before reporting.
18 regression tests committed at b4a0e5d pin the findings; all red by design.

### Findings, deduped by ROOT CAUSE (not symptom)

| # | Sev | Root cause | Reported as | Cluster |
|---|-----|-----------|-------------|---------|
| R1 | **P0** | `pipeline.py:601` passes `supplied_files` unsanitised → PR-controlled **filenames** reach the model in the **trusted preamble, outside every fence**. Injection yields "no findings" + green gate on a hostile PR. `coordinator.py` likewise fences specialist findings without sanitising them. | T4-F3, T8-F1, T8-F2, T9-F1 | FIX-A |
| R2 | **P0** | `runner.py run_state()` short-circuits on `exit_code == 0` before consulting collection markers, so a **skipped** baseline (`1 skipped`, exit 0) reads as a **pass**. `proven` is reachable with no observed passing baseline → red gate on a bug that does not exist. | T5-F1 | FIX-B |
| R3 | P1 | Review `POST .../reviews` is non-idempotent but inherits the generic 3× 5xx retry → up to 9 duplicate reviews on one run. | T6-F3 | FIX-C |
| R4 | P1 | Two findings sharing a fingerprint both PATCH the same comment; one reaches GitHub nowhere. `assert_conservation` is structurally blind to it. | T6-F1 | FIX-C |
| R5 | P1 | `GitHubError` reading existing comments is swallowed → duplicate comments, no degradation recorded. | T9-F2 | FIX-C |
| R6 | P1 | E26 redaction never runs on review bodies; `redact_secrets` has **zero callers**. Secrets published verbatim to public PRs. | T4-F5, T6-F4 | FIX-C |
| R7 | P1 | Webhook parses the body **before** verifying HMAC, and records `invalid` before the duplicate check → replayed bad signature 500s; an `invalid` row shadows the real delivery so the correctly-signed retry never runs. | T7-F1, T7-F2, T7-F6 | FIX-D |
| R8 | P1 | Accuracy numerator and denominator drawn from different populations → `human_dismissal_rate` 3.0 (300%), `addressed_rate` 2.0. The endpoint whose entire purpose is honesty. | T7-F3, T7-F7 | FIX-D |
| R9 | P1 | `/result.counts.proposed` always 0 — groups by current status, but a finished run has no `proposed` rows. Contradicts §6.3's own worked example. | T7-F4 | FIX-D |
| R10 | P1 | Audit chain: row **deletion** undetected; linkage only checked between adjacent seq. | T7-F5 | FIX-D |
| R11 | P1 | Suppression `scope="file"` is permanently inert (route stores `match_path=None`, matcher requires it); `scope="tenant"` narrowed to one repo. | T4-F1, T4-F2 | FIX-E |
| R12 | P1 | Fingerprint unstable under rename of a local whose name shadows a builtin (`id`, `type`, `list`…). Breaks AC-6(b), suppression, and comment reuse. | T4-F4 | FIX-E |
| R13 | P1 | `all_proofs_skipped_for_env` compares `outcome.status` to `"skipped_no_env"` but that is `outcome.outcome` → dead code; the spec's independent no-sandbox input is lost. | T9-F3 | FIX-E |
| R14 | P1 | `GATE_DEGRADATION_EXEMPT` makes every run on a Docker-less machine report **green** while the sandbox was degraded. | T9-F4 | FIX-E |
| R15 | P1 | Two in-flight runs on one PR **supersede each other**; both end `cancelled`, nothing posted. | T9-F5 | FIX-E |

P2/P3 carried forward, not fixed this round: T5-F2/F3/F4 (unpinned invariants),
T6-F2 (stale `ladder_breakdown`), T6-F5 (commit-status neutral indistinguishable from
success to branch protection), T7-F8 (unbounded `X-Actor-Id`), T8-F3 (test-integrity
reviewer absent from trivial tier), T8-F4/F5, T9-F6 (churn always unavailable),
T9-F7 (disproven findings invisible in review body), T9-F8 (token usage/cost null).

### Verdicts on builder-reported deviations
- T8's claim that the Messages API rejects sampling params on Claude 5: **confirmed true**
  against the installed SDK. Not forwarding `temperature` is correct.
- T4's reading of AC-5's `0.1 ⇒ low` as contradicting §4.4: **confirmed correct**; §4.4 is normative.
- T6's `_weakest_claim` tie-break and `LadderConservationError` over bare `assert`: **verified sound**.
- T9's `get_file_contents` addition: **verified purely additive**.
- T5's `base_applicable` as explicit parameter: **verified correct**; classifier half airtight.
