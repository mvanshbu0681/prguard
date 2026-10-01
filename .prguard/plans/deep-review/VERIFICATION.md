# Verification: deep-review (third pass)

**Date:** 2026-10-01
**Branch:** `manaskhandelwal/deep-review`, base `f0ad389`, HEAD `1baebaf` (second pass was at `7e2339d`)
**Status:** BLOCKED

Method: goal-backward from `spec.md`. `SUMMARY.md` and `GAPS.md` were read as claims only. I read every commit in
`7e2339d..HEAD` in full (`b1ac695`, `63b769a`, `2564a06`, `aba50b1`, `cea5227`, `23af1d7`, `9bcabe8`, `1baebaf`).
Evidence comes from the code, `tsc`, read-only queries on the Docker DB, the F1 and F2 head snapshots inside the
container, and `gh api` GET calls on `prguard-sandbox`. No tests, builds, app runs or product scripts were run. Secret
checks report counts only.

Which code ran (UTC). Commit times: `2564a06` 00:41:21, `aba50b1` 00:42:30, `cea5227` 00:44:43, `23af1d7` 00:46:10,
`9bcabe8` 00:47:49. The current container started at 00:47:56, and its source contains every fix (grep for
`everyKeyRequired`, "No tools are available now", `evidence?.trim()`, `secretsIn`, the prose filter, `CORE` with `tests`).
- HEAD code: #27 (F2), #28 (F1), #29 (F2), all created at 00:48:07.
- Earlier builds: #21 to #23 (00:45:01) and #24 to #26 (00:46:33). #21 failed `verify:json` on null evidence (llm_call 439),
  which is the bug `23af1d7` fixed. GAPS says #26 predates `9bcabe8`. #20 (00:43:12) predates `cea5227`.
- So the SUMMARY claim "Reviews 21 to 29 on the latest code" holds only for #27 to #29. No F3 run used HEAD code.

## Previous blockers and warnings

| Second-pass item | Now | Evidence |
|---|---|---|
| B1 reviewer JSON fallback rejected by Groq | Fixed | `everyKeyRequired` (`llm/call.ts:177-188`) and the no-tools note (`call.ts:280-281`). In #21 to #29 there are 0 failed `reviewer:*:json` calls and 7 successful ones (llm_calls 474, 496, 497, 501, 556, 559, 567). `trace.reviewers[].failed` is 0 for every reviewer. #18 and #19 (after `2564a06`, before `cea5227`) still failed with "Tool choice is none, but model called a tool" (357, 365). `cea5227` fixes that |
| W1 AC-3 evidence not tied to its finding | Open, now harmful | `grounded()` is unchanged (`verify.ts:76-96`). It let a fabricated rejection drop a planted bug on #28 (Blocker 1) |
| W2 AC-4 | Open, worse on HEAD | #28 posted 3 of 5, and verification dropped one of them (Blocker 1) |
| W3 AC-12 | Open | Warning 3 |
| W4 AC-14 | Partly | Test gap is now in `CORE` (`triage.ts:16`) and posts with Suggested tests on #22 to #24, but as duplicate bug reports (Warning 4) |
| W5 AC-15 | Open | Warning 5 |
| W6 AC-23 | Partly | Dotfiles fixed (`codify.ts:5,15`): #22 finding 153 and #24 finding 177 render `` `.env.example` ``. Code-span breakage is wider (Warning 7) |
| W7 AC-32 | Partly | Suppressed on #27, posted on #26 and #29 (Warning 8) |
| W8 AC-34 | Open | Every review since #17 is a fresh `opened` full review (Warning 9) |
| W9 AC-5 residual | Partly | Warning 10 |
| W10 spec drift on access | Fixed | `spec.md` AC-29 to AC-31 and the Access row now require write access (`1baebaf`). The builder made this spec edit, so the user should confirm it |
| W11 SUMMARY overstates | Open | Warning 11 |

## Success criteria

### Reviewers and engine
- **AC-1** VERIFIED. `CORE` gained `tests` (`triage.ts:16`), but only reviewers in a file's `allowed` list are added (`triage.ts:77-84`), so `needs.testsInRepo` (`tests.ts:12`) still gates it. On #22 the triage routes `tests` to both files and `trace.reviewers` shows tests on 1 chunk. F1 has no `tests` entry (no tests in that repo).
- **AC-2** VERIFIED (carried). F4 was not re-run, and `impact.ts` and the Breaking change reviewer are unchanged since `bee8a42`. Breaking change no longer loses its answer: #29 `reviewer:breaking:json` succeeded (556).
- **AC-3** BLOCKER (Blocker 1).
  - Works: null evidence no longer fails a whole group (`verify.ts:20,168`). #21 failed on it (439), and there is no `verify:json` failure in #24 to #29 (507, 572, 580 ok).
  - Works: a rejection needs 8 prose words besides its code (`verify.ts:102-105`). #26's code-only rejection of the F2 swallowed error would now count as unsure, and #27 (202) and #29 (221) posted it.
  - Fails: a rejection is grounded by any 3+ character span found in the shown window, and the flagged code itself qualifies. #28 rejected "Exact float equality to decide final refund status" with the quote `amount: int  # amount in cents` at `app/schemas.py:45`. A grep of the F1 head snapshot in the container for `amount: int` and `amount in cents` returns 0 matches. The real code is `amount: float = Field(gt=0)` (`app/schemas.py:65`) and `def refundable_amount(...) -> float` (`app/routers/refunds.py:25`). The rejection passed `grounded()` because it also quotes `refundable_amount` and `payload.amount == remaining` from the flagged window.
- **AC-4** BLOCKER (Blocker 1). Planted bugs posted on F1:

  | Run | Code | Posted | Missing |
  |---|---|---|---|
  | #20 | before `cea5227` | 4 (139, 140, 138, 145) | race |
  | #21 | before `23af1d7` | 4 (163, 162, 161, 167) | race |
  | #25 | before `9bcabe8` | 5 (180, 182, 181, 186, 189) | none |
  | #28 | HEAD | 3 (209, 210, 207) | race; status transition **rejected by verification** |

  GAPS ("Verification rejected none of them") and SUMMARY ("verification rejected none") are contradicted by `reviews.trace.rejected` on #28. The 4-of-5 variance alone would still need the user's acceptance. A verification drop on fabricated code is a code defect.
- **AC-5** VERIFIED. The F5 fixture holds two committed values (`app/services/ledger.py` lines 4 and 5 at `85758f2`, lengths 32 and 17). Each appears in 0 rows of `findings`, `reviews`, `llm_calls` (tools, error), `learnings`, `repositories.brief` and `pull_requests`. Residual channels: Warning 10.
- **AC-6, AC-7** VERIFIED (carried). The code is unchanged.
- **AC-8** VERIFIED. Posted on #21 (163), #25 (180) and #28 (209). Finding 209 reads "`create_refund` fetches the invoice with `db.get` which ignores the current user".
- **AC-9** VERIFIED. Reliability owns the swallowed `try/catch` on the HEAD runs: #27 (202, `reliability+security`) and #29 (221, `reliability`).
- **AC-10, AC-11** VERIFIED (carried). F2 also gets N+1 findings (#27 203, #29 222).
- **AC-12** WARNING. Fully met on #23 only: placeholder 156, plus 160, which names `formatCents` in `src/services/pricing.ts`. #22 (148) and #24 (172) report only the placeholder.
- **AC-13** WARNING. #22 (153) and #24 (177) report `GIFT_CARD_PROVIDER_URL`, but #23 has no Docs drift finding. Groq rejected its first answer for `line: null` (llm_call 417; `rawFindingSchema.line` is `z.number()`, `findings.ts:8`), and the retried answer was empty. This was 4 of 4 runs in the second pass and is 2 of 3 now.
- **AC-14** WARNING. Each F3 run posts one Test gap finding with folded Suggested tests (152, 158, 174). Each one is a bug report, not a test gap (Warning 4).
- **AC-15** WARNING. Warning 5.
- **AC-16** VERIFIED (carried).

### Ranking
- **AC-17, AC-18** VERIFIED. Reviews #17 to #29 all completed with a risk and a priority.

### GitHub output
- **AC-19 to AC-22, AC-24** VERIFIED (carried). The publishing code is unchanged since `7e2339d`. The #28 check run reads "10 open · 2 critical".
- **AC-23** WARNING. The F1 check passes on HEAD (finding 209), and dotfiles stay whole. Multi-line code spans still break, now more often (Warning 7).

### In the PR
- **AC-25 to AC-31** VERIFIED (carried). Command and learning code is unchanged apart from the reply scrub (`answer.ts:64`, `fix.ts:65-67`). The spec now matches write-only learnings.
- **AC-32** WARNING. Warning 8.
- **AC-33** VERIFIED (carried). **AC-34** WARNING (Warning 9).

### Dashboard
- **AC-35 to AC-41** VERIFIED (carried). `b1ac695` only adds `whitespace-nowrap` to the model cell (`trace.tsx:248`).

### Languages and platform
- **AC-42, AC-43** VERIFIED (carried).

## Edge cases
- EC-3 VERIFIED live on HEAD. Under Groq's TPM limit, #28 shows "8 failed (posted unverified)" and #29 "5 failed", and those findings posted unverified.
- EC-19 VERIFIED. `suppress` still skips critical check findings (`apply.ts:75`).
- Code unchanged, carried as VERIFIED: EC-1, EC-2, EC-4 to EC-18, EC-20 to EC-26.

## Project rule spot checks

This repo has no `docs/CONSTITUTION.md`, guardrails file or cross-cutting invariants doc. The rules come from plan.md, tasks.md and the spec.

| Rule | Command | Output |
|---|---|---|
| Types | `npx tsc --noEmit -p apps/api`; `npx tsc --noEmit -p apps/dashboard` | exit 0; exit 0 |
| Coverage | `scripts/check-task-coverage.mjs` | Not in this repo. `plan.md` and `tasks.md` are unchanged since `7e2339d`. `spec.md` changed only at AC-29 to AC-31 and the Access row |
| No tests, CI or deploy config | `git diff --name-only f0ad389..HEAD`, filtered | No tests and no CI. Three `railway.json` files (Blocker 2) |
| `apps/web` untouched | `git diff --name-only f0ad389..HEAD -- apps/web` | `apps/web/railway.json` (Blocker 2) |
| Dependencies | `git diff 7e2339d..HEAD --stat` on the package files | empty |
| Env only via config | grep `process.env` in `apps/api/src` | `config.ts` only |
| Never approve or fail | added lines in `7e2339d..HEAD` | none |
| Em and en dashes | added lines (apps, README, spec, SUMMARY, GAPS) | 0 |
| Commits | `git log 7e2339d..HEAD --format=%B` | No co-author or attribution lines. `aba50b1` bundles three unrelated fixes |
| Secret value | `ddb.mjs` counts for both F5 values | 0 everywhere |
| Reviewer answers | `llm_calls` with `%:json`; `trace.reviewers[].failed` | #21 to #29: 0 reviewer failures |
| Verification | `trace.rejected`; verify step; snapshot grep | #28's rejection quotes text that is absent from the snapshot |
| Which code ran | `docker inspect` StartedAt; container grep | 00:47:56Z; all fixes present |

Test-strength audit: not applicable. There are no tests, by design.

## Does not change
- "`apps/web` is untouched": **broken** by `63b769a` (`apps/web/railway.json`).
- "No deployment config beyond `docker-compose.yml`": **broken** by `63b769a` (three `railway.json` files and a README deploy section).
- These still hold: never approves; the check never ends `failure`; App permissions, incremental behavior, API fields, models, providers and the dashboard design system are untouched. The README deploy steps match the code: `/api/health` (`server.ts:16`), `DATA_DIR` and `GITHUB_PRIVATE_KEY` (`config.ts:15,24,64`), and the dashboard's `API_URL`.

## Cross-cutting axes
- **Access** (docs only): the spec now matches the code.
- **Failure** (touched):
  - The reviewer fallback now works.
  - A partial verification failure shows in the step detail, but the step status stays `ok` unless nothing was checked (`run.ts:470-475`).
  - A failed Suggested-tests call is only logged (`test-plan.ts:36-37`).
- **Cost** (touched):
  - Test gap now runs on every non-low-risk source file in repos with tests (`triage.ts:16,84`).
  - AI slop reaches the JSON fallback on #25, #26, #27 and #29, at up to 3 extra calls each.
  - `limited()` caps concurrent calls, not tokens (`call.ts:31-42`). Three parallel reviews of about 200K tokens each exceed Groq's 250K TPM.
- **Languages** (touched): the codify change applies to every language. Method chains (TS, Java, Go) now hit it.
- **Theme**: the dashboard change is layout only.
- **Idempotency**: unchanged.
- **Untouched**: billing, i18n, mobile.

## Blockers

1. **Verification drops a real bug on fabricated evidence, and the docs say it never does.**
   - **What and where:** `grounded()` (`apps/api/src/review/verify.ts:76-96`) accepts a rejection when any 3+ character code span appears in the shown window, or when any cited `path:line` has code. The flagged code itself qualifies. `explains()` (`verify.ts:102-105`) counts prose words only.
   - **Evidence:** on #28 (HEAD code), the F1 status-transition bug (`app/routers/refunds.py:104`) was rejected with the quote `amount: int  # amount in cents` at `app/schemas.py:45`. That text is nowhere in the head snapshot. The real code is `amount: float` (`schemas.py:65`) and `-> float` (`refunds.py:25`). The rejection passed on `refundable_amount` and `payload.amount == remaining`, both quoted from the flagged window.
   - **Spec:** AC-3 and AC-4. The challenge round says the verifier "may reject only with cited code", and fabricated code is not cited code.
   - **Rule:**
     - Second-pass Warning 1 named this exact weakness: grounding checks that a quote exists, not that it supports the verdict. It was not fixed.
     - GAPS ("Verification rejected none of them") and SUMMARY ("verification rejected none") are contradicted by `reviews.trace.rejected` on #28. This is the third pass in a row with a written claim that the stored evidence disproves.
   - **Fix direction:**
     - For a rejection, every code span other than a bare `path:line` must appear verbatim in the shown code, or in the snapshot at the path it cites.
     - At least one span must come from outside the flagged lines.
     - A cited `path:line` must contain the quoted text. Anything else counts as unsure.
     - Re-run F1 one PR at a time, to stay under the TPM limit, and check `trace.rejected` against the snapshot. Correct the GAPS and SUMMARY lines.

2. **The branch adds deployment config and touches `apps/web`, which the spec says do not change.**
   - **What and where:** `63b769a` adds `apps/api/railway.json`, `apps/dashboard/railway.json`, `apps/web/railway.json` and a README section, "Deploy on Railway".
   - **Spec:** under "Does not change": "`apps/web` is untouched" and "No tests, no CI, no deployment config beyond `docker-compose.yml`". The intro says "no deployment". Neither SUMMARY nor GAPS records the change.
   - **Rule:** a change to something the spec promised to leave alone is a blocker, even when every criterion passes.
   - **Fix direction:** the user decides; no code work is needed. Either move `63b769a` to its own branch and PR, or amend those two spec lines and note the change in GAPS.

## Warnings
1. **AC-4 variance:** 4, 4, 5 and 3 of 5 on #20, #21, #25 and #28, and the race is missing on 3 of 4. Needs the user's explicit acceptance once Blocker 1 is fixed.
2. **Groq TPM:** parallel reviews exhaust the 250K TPM limit (llm_calls 570, 573, 576, 579). On #28, 8 of 9 candidates posted unverified, and 5 of 7 on #29. The step still shows `ok` (`run.ts:470-475`). Documented in GAPS. Needs the user's acceptance or a token-rate limiter.
3. **AC-12:** fully met on #23 only. #22 and #24 miss the `formatCents` duplicate.
4. **AC-14:**
   - Test gap posts bug reports instead of "No test covers ..." findings, because nothing enforces `tests.ts:16`. #24 finding 174 is High `bug`.
   - Since `a67c793` these findings never merge, so the AppError issue posts 2 or 3 times on lines 26-27: #22 (147, 149, 152), #23 (154, 158), #24 (171, 174).
   - One test suggested in 152 expects an unchecked non-200 response to succeed, and 174's tests nest backticks.
   - A failed Suggested-tests call is only logged (`test-plan.ts:36-37`).
5. **AC-15:** other reviewers still report rule lines (#28 finding 215 is `rules+performance+security+general+slop`; #21 finding 170 is category `security`). Docs drift never merges, so it posts the `console.log` rule line beside Team rules (#27 findings 205 and 206 on line 54).
6. **AC-13:** Docs drift missed `GIFT_CARD_PROVIDER_URL` on #23 after Groq rejected a `line: null` finding (llm_call 417, `findings.ts:8`).
7. **AC-23:** multi-line code spans are not protected (`codify.ts:4`). The new leading-dot token (`codify.ts:5`, `aba50b1`) now wraps `.prepare` and `.get()` inside them, which breaks #27 finding 200's evidence.
8. **AC-32:** suppression depends on title wording (`apply.ts:56-63`). #27 suppressed the missing `await` by learning 2 (similarity 0.75). #29 (219) and #26 (193) posted the same line-69 issue (0.33). `aba50b1` also widened matching across categories, at 0.7.
9. **AC-34:** not exercised live since fix detection began comparing code.
10. **AC-5 residual:**
    - Command replies scrub only the values `findSecret` sees in the prompt (`answer.ts:64`, `fix.ts:65-67`), not code the model read through tools.
    - `llm_calls.error` and the warn log are pattern-only (`call.ts:65,69`), although the `aba50b1` message says "exact secret values".
    - `llm_calls.tools` is pattern-only (`call.ts:150`).
11. **SUMMARY and GAPS overstate:**
    - "verification rejected none" is false (#28).
    - "Reviews 21 to 29 on the latest code" and "reviews 20, 21, 25, 28" on the latest code: only #27 to #29 ran on HEAD.
    - "the rest are listed in GAPS": the AC-3 grounding gap, the AC-14 duplicates, AC-15, the AC-23 code spans, AC-32 and AC-34 are not listed.

Carried observation: the local `data/prguard.db` still holds F5 bytes in free pages. Run `VACUUM` or delete it.

## Next steps
1. The builder fixes Blocker 1 and corrects the claims in Warning 11. Then re-run F1 and F3 one PR at a time on HEAD, checking `trace.rejected` against the snapshot, the `%:json` calls and `trace.reviewers[].failed`.
2. The user decides Blocker 2 (split `63b769a` or amend the spec), the AC-4 variance and the Groq TPM limit (Warnings 1 and 2), and confirms the builder's spec edit for write-access learnings.
3. Re-run the verifier.
4. Then run `/prguard-learn`. Inputs:
   - Blocker 1: a grounding check that accepts the flagged code as proof for rejecting it. A warning left open became a dropped planted bug.
   - The class "written claim contradicted by stored evidence" recurred for a third pass ("verification rejected none", "latest code").
   - Blocker 2: an out-of-scope commit landed on the feature branch with no check against "Does not change".
   - A rule that stops merges (Test gap, Docs drift) without enforcing each reviewer's scope turned into duplicate posts.
