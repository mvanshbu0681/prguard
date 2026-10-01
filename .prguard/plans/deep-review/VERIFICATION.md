# Verification: deep-review (fourth pass)

**Date:** 2026-10-01
**Branch:** `manaskhandelwal/deep-review`, base `f0ad389`, HEAD `100b09b` (third pass was at `1baebaf`)
**Status:** BLOCKED (1 blocker, 11 warnings)

Method: goal-backward from `spec.md`. `SUMMARY.md` and `GAPS.md` were read as claims only. I read every commit in
`1baebaf..HEAD` in full (`085501a`, `f9210f3`, `9ab6cb4`, `55203fd`, `100b09b`). Evidence comes from the code, `tsc`,
read-only queries on the Docker DB, `docker inspect` and `docker logs`, and `gh api` GET calls on `prguard-sandbox`. No
tests, builds, app runs or product scripts were run. Secret checks report counts only.

Which code ran (UTC): `55203fd` committed 01:07:52, image built 01:08:00, container started 01:08:03. `100b09b` is docs
only. Reviews 30 to 33 were created 01:08:26 to 01:08:27, so all four ran on HEAD code: 30 is F1 (acme-billing#19),
31 is F2 (acme-store#28), 32 is F3 (acme-store#29), 33 is F5 (acme-billing#18).

## Previous blockers and warnings

| Third-pass item | Now | Evidence |
|---|---|---|
| B1 rejection on fabricated code | Fixed for that case, over-corrected | `rejectionGrounded()` (`verify.ts:128-145`) stops #28's invented quote, and also stops nearly every legitimate rejection (Blocker 1) |
| B2 Railway config vs "Does not change" | Resolved | `9ab6cb4` records it in the spec as the user's request. `spec.md:10` still says "no deployment" (Warning 11) |
| W1 AC-4 variance | Open | #30 posted 4 of 5 (Warning 1) |
| W2 Groq TPM | Fixed | `085501a`: review cap plus per-model token window. Burst #30 to #33: 0 rate-limit errors, 0 failed verification groups |
| W3 AC-12 | Open | Warning 3 |
| W4 AC-14 | Open | #32 has no Test gap finding (Warning 2) |
| W5 AC-15 | Partly | Docs drift stays out now; other reviewers still report rule lines (Warning 4) |
| W6 AC-13 | Fixed | `line` is nullish (`findings.ts:8`); #32 posted 252 and the file-level 253 |
| W7 AC-23 | Partly | Multi-line spans are protected (`codify.ts:4`); nested backticks still break (Warning 5) |
| W8 AC-32 | Partly | #31 suppressed the line-69 `await` by learning 2 (Warning 6) |
| W9 AC-34 | Open | Not exercised (Warning 7) |
| W10 AC-5 residual | Partly | `record()` scrubs this review's exact values from `tools`, `error` and the warn log (`call.ts:39-56`). Warning 10 |
| W11 SUMMARY and GAPS | Partly | "verification rejected none" and "latest code" corrected. New and remaining overstatements (Warning 11) |

## Success criteria

### Reviewers and engine
- **AC-1** VERIFIED. #32 routes `tests` (1 chunk); `data` gets 0 chunks on #31 and #32.
- **AC-2** VERIFIED (carried). Impact and Breaking change code unchanged.
- **AC-3** BLOCKER (Blocker 1). Confirmation still works: 25 of 30 checked findings in #30 to #33 carry a Verified badge
  and evidence. Rejection no longer works: 0 of 30 rejected.
- **AC-4** WARNING. #30: ownership (225), swallowed error (226), float money (227, 229, 230), float-equality status (235,
  verified with real quotes from `app/schemas.py:63-66` and `app/routers/refunds.py:104`). Refund above balance is
  missing (no finding mentions balance, exceed, race or concurrency). History on F1: 4, 4, 5, 3, 4. Nothing was dropped
  by verification this time.
- **AC-5** VERIFIED. #33 finding 254 is Critical on `app/services/ledger.py:4`. Count scan for both F5 values (lengths 32
  and 17): 0 rows in findings (title, body, evidence, suggestion, snippet, details), reviews (summary, trace, flow,
  walkthrough, priority_reason), llm_calls (tools, error) and learnings. Logs and `pull_requests` were not rescanned.
- **AC-6, AC-7, AC-10, AC-16** VERIFIED (carried; code unchanged).
- **AC-8** VERIFIED. #30 finding 225: "The `create_refund` endpoint fetches the invoice with `db.get` ...".
- **AC-9** VERIFIED. #31 finding 241 (Reliability, verified).
- **AC-11** VERIFIED. #33: 255 (drop column), 258 (float money).
- **AC-12** WARNING (Warning 3). **AC-13** VERIFIED (one run). **AC-14** WARNING (Warning 2). **AC-15** WARNING (Warning 4).

### Ranking, GitHub output, in the PR, dashboard, platform
- **AC-17, AC-18** VERIFIED. #30 to #33 completed with risk and priority; #33 is P0.
- **AC-19 to AC-22, AC-24** VERIFIED (carried). Check titles: "12 open · 2 critical", "9 open · 2 critical",
  "8 open · 3 high", "8 open · 4 critical". Two of those criticals are false positives (Blocker 1).
- **AC-23** WARNING (Warning 5). The F1 check passes (225).
- **AC-25** VERIFIED (carried). 👀 is still immediate; a review may now wait under a "Queued" check, as the user asked.
- **AC-26 to AC-31, AC-33** VERIFIED (carried). **AC-32** WARNING (Warning 6). **AC-34** WARNING (Warning 7).
- **AC-35 to AC-43** VERIFIED (carried). No dashboard or `apps/web` change since `1baebaf`.

## Edge cases
- **EC-3** VERIFIED in code: any failed group now marks the step `failed` (`run.ts:486`). Not exercised live (no failures in the burst).
- **EC-13** WARNING. Command jobs pass the review cap (`jobs.ts:48`), but their model calls share the token window (Warning 9).
- **EC-19** VERIFIED (carried). The rest are carried as VERIFIED: the code is unchanged.

## Queue and rate limiter (`085501a`), adversarial pass
- **Claim** (`jobs.ts:40-53`): one `UPDATE ... WHERE id = (subquery)`, atomic in SQLite. The cap applies only to
  `review_pr` (`jobs.ts:48`), so commands, replies, indexing and sweeps skip past blocked reviews. Reviews run oldest
  first. `REVIEW_CONCURRENCY` must be a positive int (`config.ts:9`), and the default 2 of 4 workers leaves 2 free.
- **No stuck "Queued" check.** Every exit closes it:
  - superseded (`lifecycle.ts:47-48`)
  - PR closed or draft (`events.ts:78-79`)
  - repo switched off (`lifecycle.ts:96-100`; "removed" skips GitHub, as before)
  - cancelled before start (`run.ts:177-179`, then `closeReview`)
  - failed or abandoned (`run.ts:709,720`)
- **Abort:** token waits are abortable (`rate.ts:19-31,48,59`). `acquire()` is not (`rate.ts:86-89`), but the call then
  gets the aborted signal and fails at once, and `run.ts:698` maps it to a cancel.
- **Crash recovery:** heartbeats run on their own timer (`worker.ts:76`), so a token wait does not look like a dead worker.
- **Deadlock:** none. The request is clamped to the budget (`rate.ts:43`), so an empty window always admits a call.
- **Live:** #30 and #31 started 01:08:28 and 01:08:30. #32 and #33 started 01:11:51 and 01:11:54 (GitHub `started_at`),
  as the first two finished. Other counts:
  - 95 model calls, 0 with a rate-limit error
  - 0 "rate limited, waiting" log lines
  - every reviewer `failed` 0, every verify step `ok`
  - cost: #30 and #31 each took 3 min 22 s, against about 40 s for #27 to #29 run alone
- **Accounting:** Warning 8. **Shared budget:** Warning 9.

## Project rule spot checks and commands run

This repo has no `docs/CONSTITUTION.md`, guardrails file or cross-cutting invariants doc. The rules come from
`plan.md`, `tasks.md` and the spec.

| Rule | Command | Output |
|---|---|---|
| Types | `npx tsc --noEmit -p apps/api`; `npx tsc --noEmit -p apps/dashboard` | exit 0; exit 0 |
| Which code ran | `docker inspect` (container, image); `git log --format="%h %cI"` | image 01:08:00Z after `55203fd` 01:07:52Z |
| Coverage | `scripts/check-task-coverage.mjs` | Not in this repo. `plan.md` and `tasks.md` unchanged since `1baebaf` |
| No tests, no CI | `git diff --name-only f0ad389..HEAD`, filtered | only product files (`tests.ts`, `test-plan.ts`, a badge) |
| `apps/web`, dashboard | `git diff --name-only 1baebaf..HEAD -- apps/web apps/dashboard` | empty |
| Dependencies | `git diff --stat 1baebaf..HEAD` on package files | empty |
| Env only via config | grep `process.env` outside `config.ts` | 0 |
| Never approve or fail | added lines in `1baebaf..HEAD` | 0 |
| Em and en dashes | added lines (apps, README, `.env.example`, spec, SUMMARY, GAPS) | 0 |
| Commits | `git log 1baebaf..HEAD --format=%B` | 0 attribution lines. `55203fd` bundles five unrelated fixes |
| Secret values | `secret-scan.mjs docker` (counts via `ddb.mjs`) | 2 values, 0 rows |
| Burst | `ddb.mjs` on reviews, trace, findings, llm_calls; `gh api` check runs; `docker logs` grep | as above |
| Rejections | `ddb.mjs` on `trace.rejected` (all reviews); `gh api` contents at the PR heads | Blocker 1 |

Test-strength audit: not applicable. There are no tests, by design.

## Does not change
- `apps/web` untouched apart from `railway.json`; deployment config as amended: hold.
- Never approves; check never concludes `failure`; App permissions; API fields; models and providers; dashboard
  design system; no tests and no CI: hold.
- Incremental scope, takeover, cancellation, crash recovery and the 422 fallback: hold. The queue only adds a wait
  before a review starts. Takeover and cancel paths are unchanged, and recovered jobs keep their ids, so they run first.

## Cross-cutting axes
- **Failure** (touched): a 429 now waits; after 6 waits it throws into the existing fail-soft paths. A partial
  verification failure now shows as `failed`.
- **Cost** (touched): spend is unchanged, but each agent call reserves 3 times its estimate (`call.ts:200`), which
  lowers throughput under load.
- **Access** (touched): the token window and the review cap are shared by every installation. One repository's burst
  delays everyone's reviews and replies. Fine for one deployment; the spec does not mention it.
- **Idempotency** (touched): the claim is atomic; commands are still keyed by comment id.
- **Languages** (touched): the `codify` change applies to every language.
- **Theme**: untouched (no dashboard change).
- **Untouched**: billing, i18n, mobile.

## Blockers

1. **Verification can no longer reject a finding written the way its own prompt asks, so known false positives post again.**
   - **What and where:**
     - `rejectionGrounded()` (`apps/api/src/review/verify.ts:128-145`) counts every backticked span as a code quote
       (`quotesIn`, `verify.ts:114-121`). Each one must appear in the shown code or in a cited window (`verify.ts:142-143`).
     - A backticked `path:line` is never in code: `codeOnly` keeps only gutter lines (`verify.ts:99-111`), and
       `readFile` puts the path in a header.
     - The verifier prompt asks for exactly that format: "quoted in backticks and cited as `path:line`" (`verify.ts:26`).
   - **Replay on stored rejections:** I replayed the rule on the 12 rejections in `reviews.trace.rejected` (#6 to #28).
     - 10 cite a backticked `path:line`, and all 10 now count as unsure.
     - 8 of those 10 were correct:
       - `utcnow` is defined at `app/models.py:11` on both F1 and F5 heads (#6, #10, #15, #20, #25)
       - `findById` is synchronous at `src/db/products.ts:39` (#9)
       - the `__future__` forward reference (#15, #25)
     - For the `utcnow` rejections on #6, #15 and #25, the citation span is the only reason they fail.
   - **Live on HEAD:** #30 to #33 checked 30 findings and rejected 0, with no failed group. Four false positives posted
     as line comments:
     - 228 High, `utcnow` (acme-billing#19, `app/models.py:84`)
     - 256 Critical, `utcnow` (acme-billing#18, `app/models.py:81`)
     - 240 High, "missing await" on the synchronous `findById` (acme-store#28, `src/routes/discounts.ts:62`)
     - 238 Critical, "missing comma" (acme-store#28). `src/db/client.ts:41` and `:52` both end in a backtick and a comma.
     - Two of these are false Criticals, counted in the check titles.
   - **Spec:** AC-3 and FR-5 (rejected findings are not posted). The challenge round says the verifier "may reject only
     with cited code", and names verification as the mitigation for reviewer noise. The rule now accepts only uncited
     rejections.
   - **Rule:**
     - The third-pass fix direction said "every code span other than a bare `path:line`". The exemption was dropped.
     - The new filter was checked only against the failing case (#28), never replayed on stored positives.
     - GAPS and SUMMARY describe the rule ("rejections now need real counter-evidence") but not its outcome: 0
       rejections across the burst.
   - **Fix direction:**
     - Treat spans that are only a citation (`^[\w@./-]+\.\w+:\d+(-\d+)?$`) as citations, not quotes.
     - Keep the rest: every other quote must be real, every citation must exist, and at least one real quote must come
       from outside the flagged lines.
     - Replay the 12 stored rejections: #26 and #28 must stay unsure, and the `utcnow` and `findById` ones must reject.
     - Re-run F1, F2 and F5, and check `trace.rejected` and the posted comments.

## Warnings
1. **AC-4:** #30 posted 4 of 5 (refund above balance missing). F1 history is 4, 4, 5, 3, 4. Needs the user's explicit acceptance.
2. **AC-14:** #32 has no Test gap finding: `tests` ran on 1 chunk, and its `:final` answer was 39 tokens. The "No test
   covers" rename (`findings.ts:78-79`) is unexercised live, lowercases a leading identifier (`AppError` becomes
   `appError`), and does not enforce scope. Model variance needs the user's acceptance.
3. **AC-12:** #32 reports the placeholder (246) but not the `formatCents` duplicate. Fully met on 1 of 4 F3 runs (#23).
4. **AC-15:** other reviewers still report rule lines: #30 finding 236 is `rules+slop+reliability+security+general`, and
   #32 finding 247 is `rules+general+slop`. Docs drift now stays out (#31 243).
5. **AC-23:** nested backticks still break evidence. #32 finding 251 reads `` `${`PROVIDER_URL`}` `` and
   `` `src/services/gift-cards.ts`:28 `` (`codify.ts:4,61-70`).
6. **AC-32:** suppression depends on title wording. Suppressed on #27 and #31; posted on #26 and #29.
7. **AC-34:** not exercised live since fix detection began comparing code.
8. **Token accounting** (`rate.ts:108-114`):
   - A call reserves before it gets a concurrency slot, and the reservation is dated then.
   - If it waits over 60 s for a slot, or runs over 60 s, its real usage lands on a spend already dropped from the
     window, so bursts can exceed the budget. The 429 wait catches it.
   - Failed attempts keep their estimate.
9. **Shared budget:**
   - Commands and indexing share the per-model window with reviews (`rate.ts:12`), so an `@prguard` reply can wait
     about a minute during a burst.
   - `acquire()` ignores the abort signal (`rate.ts:86-89`).
   - Burst reviews take about 5 times longer.
   - Needs the user's acceptance.
10. **AC-5 residual:** exact-value scrubbing covers only secrets on added lines (`run.ts:222-228`). Secrets read through
    tools, and command replies (`answer.ts:64`, `fix.ts:65-67`), stay pattern-only.
11. **Docs overstate:**
    - SUMMARY "the rest are listed in GAPS" is still false. AC-12, the AC-14 duplicates, AC-15, AC-23, AC-32 and AC-34
      are absent.
    - SUMMARY "F3: Test gap posts with Suggested tests" is untrue on the only HEAD F3 run (#32).
    - GAPS AC-4 omits #30.
    - Neither file says #30 to #33 rejected nothing.
    - `spec.md:10` still says "no deployment".

Carried observation: the local `data/prguard.db` held F5 bytes in free pages at the last check. Run `VACUUM` or delete it.

## Next steps
1. The builder fixes Blocker 1 and replays the 12 stored rejections. Then it re-runs F1, F2 and F5 on HEAD and checks
   two things:
   - `trace.rejected` against the PR heads
   - that the `utcnow`, `findById` and comma findings are gone and the planted bugs remain
   It also corrects the claims in Warning 11.
2. The user decides on the AC-4 and AC-14 variance (Warnings 1 and 2) and the queue's throughput and shared budget
   (Warning 9).
3. Re-run the verifier.
4. Then run `/prguard-learn`. Inputs:
   - Blocker 1: a fix tightened a filter after checking only the failing case and was never replayed on stored
     positives, so it switched the feature off. The fix direction's explicit exemption (`path:line`) was dropped.
   - The claims class recurred in a new form: the docs describe what a rule requires, not what it did (0 rejections).
   - The queue and rate limiter shipped with live burst evidence and closed a warning cleanly. That is the pattern to keep.
