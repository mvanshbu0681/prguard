# Verification: deep-review (fifth pass)

**Date:** 2026-10-01
**Branch:** `manaskhandelwal/deep-review`, base `f0ad389`, HEAD `4c2cc8f` (fourth pass was at `100b09b`)
**Status:** PASSED-WITH-WARNINGS (0 blockers, 14 warnings). This holds only if the user explicitly accepts the
items marked "user" below. W1 and W2 are one-line fixes and should land before merge.

Method: goal-backward from `spec.md`. `SUMMARY.md` and `GAPS.md` were read as claims only. I read every commit in
`100b09b..HEAD` in full (`9dded49`, `dfaf48e`, `3a851a7`, `6cc5354`, `4c2cc8f`). Evidence comes from:
- the code and `tsc`
- read-only queries on the Docker DB
- `docker inspect`, `docker logs` and a read-only `grep` inside the container
- `gh api` GET calls
- reading the repo snapshots in the scratchpad

No tests, builds, app runs or product code were run. Secret checks report counts only.

Which code ran (UTC): `6cc5354` was committed at 01:37:21. The image was created at 01:37:27 and the container
started at 01:37:30. The container's `verify.ts` and `rate.ts` contain the new rules. Review 40 (F5, acme-billing#24)
was created at 01:37:43, so it ran on HEAD code. Reviews 37 to 39 (01:33:12) and 34 to 36 (01:29:19) fit the
builder's account (`3a851a7` at 01:32:50, `9dded49` at 01:28:54), but that container is gone. The missing `unsure` key
in their traces matches pre-`6cc5354` code.

## Previous blocker and warnings

| Fourth-pass item | Now | Evidence |
|---|---|---|
| B1: rejection impossible with a cited `path:line` | **Fixed in code; partly confirmed live** | Replay below: 9 of 12 reject, 3 stay unsure as intended. #40 rejected `utcnow` with a grounded reason, and `unsure` is `[]`. But #39, on the same rule, posted `utcnow` as a Critical (W3). Two new holes: W1, W2 |
| W1 AC-4 | Open | #34 4 of 5, #38 3 of 5 (W5) |
| W2 AC-14 | Partly | #37 posted Test gap with Suggested tests. Case fix correct (`findings.ts:81-82`). Scope not enforced (W6) |
| W3 AC-12 | Open | #37 missed `formatCents` (W7) |
| W4 AC-15 | Open, understated in GAPS | W8 |
| W5 AC-23, W6 AC-32, W7 AC-34 | Open, listed | W10, W11, W12 |
| W8 token accounting | Fixed | `rate.ts:136-142`: real usage re-dated at finish. Failed attempts keep the estimate, which is conservative |
| W9 shared budget | Partly | `acquire()` is abortable (`rate.ts:86-105,126-130`). Sharing remains (W13) |
| W10 AC-5 residual | Open, listed | W14 |
| W11 docs | Partly | `spec.md:10` fixed. SUMMARY's F3 line fixed. "rest listed" fixed. New and remaining overstatements (W4) |

## Blocker 1 replay (re-derived by reading `verify.ts:115-166` against the snapshots)

| Review | Outcome | Why |
|---|---|---|
| 6, 10, 15b, 20, 25a (`utcnow`) | reject | `def utcnow() -> datetime:` is real at `app/models.py:11` in both heads, outside the flagged line. Prose is 6 or more words |
| 9 (`findById`) | reject | Real at `src/db/products.ts:39`, a different file. `await` appears in the window (`discounts.ts:50`) |
| 15a, 25b (`__future__`) | reject | `from __future__ import annotations` is real at line 1 |
| 21 (negative amount) | reject | `RefundCreate` and `amount: float = Field(gt=0)` are real at `app/schemas.py:63-65`. The citation is unbackticked |
| 7 | unsure | The span holds a literal `\n`, so it is not real. Prose is 0 words (the only word is the path) |
| 26 | unsure | Prose is 0 words, and the citation sits inside the flagged range |
| 28 | unsure | `class RefundCreate(BaseModel): amount: int ...` is invented |
| 40 (live, HEAD) | reject | Same shape as #10. Trace `rejected[0].line` = 81 |

This matches GAPS. The 9 rejections are correct: `utcnow`, `findById` and the forward reference are false positives,
and `Field(gt=0)` blocks negative amounts.

## Success criteria

### Reviewers and engine
- **AC-1, AC-2, AC-6 to AC-11, AC-13, AC-16** VERIFIED (carried; code unchanged). On HEAD-era runs:
  - AC-8: #34 268 and #38 299
  - AC-9: #34 269
  - AC-11: #40 321 (drop) and 320 (float money)
- **AC-3** WARNING (W1 to W3):
  - #40 rejected 1 finding. It is not posted (no comment on `models.py:81` in the PR #24 comments) and the trace lists
    it with its reason.
  - Confirmed findings carry Verified and Evidence on GitHub (4 of 7 #40 comments).
  - In #34 to #40, 42 findings are verified and 0 lack evidence.
- **AC-4** WARNING (W5). **AC-12** WARNING (W7). **AC-14** WARNING (W6). **AC-15** WARNING (W8).
- **AC-5** VERIFIED:
  - The F5 secret (length 32) is in 0 rows of every text column of all 13 tables.
  - It is in 0 lines of the current container log.
  - It is in 0 PR Guard bodies on acme-billing#21, #23 and #24 (review comments, reviews, issue comments, check
    output). The only GitHub hits are GitHub's own `diff_hunk`.
  - `secret-scan.mjs` reports "LEAK" rows. They are the placeholder `PARTNER_API_KEY` (line 5, placeholder=true) in
    308 and 324, not the secret.

### Ranking, GitHub output, in the PR, dashboard, platform
- **AC-17, AC-18** VERIFIED. #34 to #40 all have priority and risk, and F5 is P0.
- **AC-19 to AC-22, AC-24** VERIFIED (carried). The #40 check run is "7 open · 2 critical", neutral.
- **AC-23** WARNING (W10). **AC-32** WARNING (W11). **AC-34** WARNING (W12).
- **AC-25 to AC-31, AC-33** VERIFIED (carried). A question on acme-billing#23 was answered in 4 s on HEAD (log 01:44).
- **AC-35 to AC-37, AC-39 to AC-43** VERIFIED (carried). Nothing changed in the dashboard or `apps/web`.
- **AC-38** VERIFIED. The trace shows `rejected` with its reason (`trace.tsx:91-93`). `unsure` is stored (`run.ts:474`)
  but not displayed, which the spec does not require.

## Edge cases
- **EC-3** VERIFIED. A failed or missing verdict is kept unverified (`verify.ts:222-235,253-254`). A rejection that does
  not hold up is kept and traced (`verify.ts:249`).
- **EC-4** WARNING (W9). The Secrets check honors it. AI slop does not.
- **EC-13** WARNING (W13). **EC-19** VERIFIED (carried). The rest are VERIFIED (carried; code unchanged).

## New commits, adversarial pass
- **`CITATION`** (`verify.ts:116`): the `:line` part is optional, so the regex matches any `a.b` token (W1).
- **`citedElsewhere`** (`verify.ts:145-146,154`): "elsewhere" is judged by the cited line number, but the text it
  checks spans ±3 lines (W2).
- **`explains`** dropped from 8 words to 4 (`verify.ts:162-166`). The spans now cross newlines, which removes more
  prose, so the rule only gets stricter. It is not the weak point; grounding is.
- **`rate.ts`**:
  - The abort path zeroes the reservation and never calls `release()` without an `acquire()`.
  - `turn` removes its abort listener before resolving, so the cancel and wake-up cannot race.
  - The re-dated spend is pushed last, which keeps the window oldest-first for `reserve()` (`rate.ts:59`).
- **`findings.ts:81-82`**: `AppError` and `API` keep their case. "Redeem's" stays capitalized, which is cosmetic.
- **Trace**: `rejected` gains `line` and `unsure` is new. Both are scrubbed (`run.ts:473-474`) and are added fields only.

## Project rule spot checks and commands run

No `docs/CONSTITUTION.md`, guardrails or invariants doc exists in this repo. The rules come from `plan.md`, `tasks.md`
and the spec.

| Rule | Command | Output |
|---|---|---|
| Types | `npx tsc --noEmit -p apps/api`; `-p apps/dashboard` | exit 0; exit 0 |
| Which code ran | `docker inspect` (container, image); `git log --format="%h %cI"`; container `grep` | image 01:37:27Z after `6cc5354` 01:37:21Z; 9 rule matches in container `verify.ts` |
| Scope | `git diff --name-only 100b09b..HEAD` | `apps/api` (5 files) and plan docs only. No `apps/web`, dashboard or package changes |
| Coverage | `scripts/check-task-coverage.mjs` | Not in this repo. `plan.md` and `tasks.md` unchanged |
| Env only via config | Grep `process.env` in `apps/api/src` | `config.ts` only |
| Never approve or fail | added lines; `gh api` reviews and check runs | 0 added; review `COMMENTED`, check `neutral` |
| Em and en dashes | added lines in `100b09b..HEAD` | 0 |
| Commits | `git log 100b09b..HEAD --format=%B` | 0 attribution lines. `dfaf48e` bundles three unrelated fixes |
| Live runs | `ddb.mjs` on reviews (funnel, steps, rejected, unsure), findings, llm_calls | as cited |
| Secrets | `secret-scan.mjs docker`, `secret-kind.mjs`, all-table count, log count, `gh api` bodies | 0 for the real secret |

Test-strength audit: not applicable. There are no tests, by design.

## Does not change
All hold:
- `apps/web` untouched apart from `railway.json`
- never approves; the check never concludes `failure`
- App permissions, models and providers, dashboard design system, no tests and no CI
- API fields only gain (`rejected[].line`, `unsure`)
- incremental scope, takeover, cancellation and crash recovery: a cancelled review now leaves the slot queue, which
  only shortens a wait

## Cross-cutting axes
- **Failure** (touched): abort in `acquire()` is rethrown as the signal's reason and maps to cancel, as before.
  Verification fails soft.
- **Cost** (touched): spend is held from reservation until 60 s after the call finishes. That is safe against 429s
  and costs throughput in bursts.
- **Languages** (touched): `CITATION` applies to every language. Go and Java `pkg.Func` and `obj.field` spans are
  exempt too (W1).
- **Idempotency, Access**: unchanged by these commits.
- **Theme**: untouched (no dashboard change).
- **Untouched**: billing, i18n, mobile.

## GAPS "Open items": honesty and who decides

| Item | Honest? | Who decides |
|---|---|---|
| AC-4 partial | Yes (tally 4,4,5,3,4,4,3 checks out) | User: model variance under the spec's fixed models |
| Test gap variance | Yes, but omits that #37's Test gap restates the `AppError` bug | User |
| AC-12 | Ambiguous "(23, 37 missed it)". Met 1 of 5 F3 runs (#23) | User |
| AC-15 | Understated: slop also posts rule findings unmerged (273, 293) | Code fix or user |
| AC-23 | Yes | Code defect: fix or accept as a known bug |
| AC-32 | Yes | Design limit: fix or accept |
| AC-34 | Yes | Evidence gap: needs one live run, not acceptance |
| Shared token budget | Yes | User: trade-off of the requested queue |
| AC-5 residual | Yes | Fix or accept; AC-5 as written holds |
| EC-4 adjacent | Yes, but omits that 308 is Verified and the command reply repeats it | User, or a slop prompt rule |

None is a blocker if the user accepts it. The AC-4, AC-12, AC-14 and AC-15 text is unmet as written, so acceptance
has to be explicit.

## Blockers

None.

## Warnings

1. **Citation exemption too broad** (`verify.ts:116,125`).
   - **Problem:** `CITATION` makes `:line` optional, so every dotted identifier (`RefundCreate.amount`, `db.get`,
     `pkg.Func`) is dropped from the quotes and never checked for realness. This partly reopens the third-pass
     blocker class: a rejection resting on invented code.
   - **Counterexample** on the #28 finding (float-equality planted bug, `refunds.py:104`): "`RefundCreate.amount` is an
     `int`, so the comparison is exact" rejects.
     - The invented span is exempt.
     - `int` is "real" as a substring of `print(` at line 109, outside the flagged line.
     - Without the exemption it stays unsure.
   - **Rule:** the fourth-pass direction required `:\d+`.
   - **Fix:** exempt only `path:line`, or a bare path with a `/` or a known file extension.
2. **Adjacent-citation loophole** (`verify.ts:145-146,154`).
   - **Problem:** a citation one to three lines past the flagged range counts as "elsewhere", but its ±3 text contains
     the flagged code. With 4 words of prose, quoting the flagged code back (the #26 class, the AC-9 planted bug)
     then rejects. #26 stays unsure only because its prose is 0 words and its range is exact.
   - **Fix:** in `citedElsewhere`, match quotes against the cited lines with the flagged lines removed.
3. **Thin and partly negative live evidence for B1.**
   - On the final rule, #37 to #40 rejected 1 finding in total.
   - #39 (F5, same rule as HEAD, "8 checked, 4 confirmed, 0 rejected") posted the `utcnow` false positive as a
     Critical (307, counted in "12 open · 2 critical"). The cause is unknowable: `unsure` was not traced yet. #36 posted
     it too (280).
   - F2 (`findById`, comma) was never re-run on the final rule.
4. **Docs overstate.**
   - GAPS cites #40's rejection, omits #36 and #39, and says "reviews 30 to 36 rejected 0" when #37 to #39 also
     rejected 0.
   - `SUMMARY.md:38` "4 of 5 planted bugs per run and verification drops none": the tally is 3 to 5, and #28 dropped one.
   - `SUMMARY.md:39` "placeholder key not flagged": finding 308 flags it.
   - `SUMMARY.md:75` omits the third- and fourth-pass blockers.
   - `SUMMARY.md:85` "scrubbed from everything" contradicts GAPS' AC-5 residual.
   - `dfaf48e` is unrecorded in GAPS.
5. **AC-4:** #34 posted 4 of 5 and #38 3 of 5. Refund above balance is missing in both, and float-equality is missing
   in #38. User.
6. **AC-14:** #37's Test gap (297) restates the line-26 `AppError` issue, which also posts as 288 (Team rules) and
   293 (AI slop): three findings for one issue. #32 posted none. User.
7. **AC-12:** met on 1 of 5 F3 runs. #37 reports the placeholder (290) but not the `formatCents` duplicate. User.
8. **AC-15:** beyond the merged `print` lines, AI slop posts rule violations on its own: 273 (#34, "breaks money
   handling rule") and 293 (#37). That is against its prompt (`slop.ts:19`). Fix or user.
9. **EC-4:** AI slop reported the placeholder `PARTNER_API_KEY` as "Hard-coded partner API key" (308, High,
   Verified). The `@prguard` reply on acme-billing#23 (01:44:33) calls it a committed secret. The Secrets check is
   correct. User or a prompt rule.
10. **AC-23:** nested code spans still break evidence (`codify.ts`, unchanged). Code defect: fix or accept.
11. **AC-32:** suppression still depends on title wording (unchanged). Fix or accept.
12. **AC-34:** not exercised live since review 8. Needs a run.
13. **Shared token budget:** commands and indexing wait in the reviews' per-model window (`rate.ts:12`), and the hold
    now runs until 60 s after finish. User.
14. **AC-5 residual:** exact-value scrubbing still covers only secrets on added lines. Tool reads and command replies
    are pattern-only (`run.ts:222-228`). Fix or accept.

Carried observation: the local `data/prguard.db` still exists. At the last check it held F5 bytes in free pages.
Delete it or run `VACUUM`.

## Next steps
1. The builder fixes W1 (narrow `CITATION`) and W2 (drop flagged lines from cited text), then re-replays the 12
   stored rejections plus #40. The same 9 must reject. Add the two counterexamples above to the replay set, as
   unsure.
2. Re-run F5 and F2 on HEAD two or three times and read `trace.unsure`. If `utcnow` or `findById` land in `unsure` with
   a correct reason, the rule still drops good rejections, and that is a blocker.
3. Correct the W4 claims in GAPS and SUMMARY.
4. The user explicitly accepts or rejects the "user" items: W5, W6, W7, W9, W13, and the fix-or-accept items W8, W10,
   W11, W14.
5. Run `/prguard-learn`. Inputs:
   - **Fix-direction drift, both ways.** Pass 4's fix dropped an exemption the direction named. Pass 5's fix
     broadened one: `:line` became optional. In both cases the replay set contained only known cases, so it could not
     show the new hole. Rule to learn: a filter change must be replayed on adversarial variants (an invented dotted
     name, an off-by-one citation), not only on stored rows.
   - **Claims class, fifth recurrence.** The docs now cite the one run that worked (#40) and leave out the ones that
     did not (#36, #39). Rule to learn: report every run on the changed code, with the denominator.
   - **Keep:** adding `trace.unsure` before the evidence was needed is the right instinct. Ship diagnostics with the
     fix, not after.
