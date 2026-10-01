# Verification: deep-review (second pass)

**Date:** 2026-10-01
**Branch:** `manaskhandelwal/deep-review`, base `f0ad389`, HEAD `7e2339d` (first pass was at `bee8a42`)
**Status:** BLOCKED

Method: goal-backward from `spec.md`. `SUMMARY.md` and `GAPS.md` were read as claims only. I read all 11 commits in
`bee8a42..HEAD` in full. Evidence comes from the code, `tsc`, read-only queries on the Docker DB
(`prguard-deep-api-1:/data/prguard.db`) and `gh api` GET calls on `prguard-sandbox`. No tests, builds, app runs or
product scripts were run. Where the DB and SUMMARY disagree, this report says so. Secret values were never
printed: the secret checks report row counts only.

Review ids are Docker DB rows. I worked out which code each run used from the container start time
(`00:21:55Z`, 10 s after `57bddf6`) and the commit times. The container source contains `fileWords`, `OWN_KIND`,
the JSON-mode fallback and `withSuggestedTests`.
- HEAD code: #14 acme-store#19 (F3), #15 acme-billing#11 (F1), #16 acme-billing#12 (F1).
- Intermediate fix commits: #4, #12, #13 acme-store#13/#17/#18 (F3); #5, #9 acme-store#14/#16 (F2); #6
  acme-billing#8 (F5); #7 acme-store#15 (F2, suppression); #8 acme-store#14 fix push; #10, #11 acme-billing#9/#10 (F1).
- Before the fixes: #1 to #3 (the earlier Docker run, acme-billing#7 and acme-store#12).

## Previous blockers and warnings

| Previous item | Now | Evidence |
|---|---|---|
| B1 secret line stored as a snippet | Fixed | No snippet is stored for check findings (`run.ts:634`). Model text is scrubbed of the exact values the check found (`run.ts:433`, `secrets.ts:77`). Migration `0012` clears old rows. #6 finding 23 has a null `snippet`, and no row holds the value (AC-5) |
| B2 Test gap without "Suggested tests" | Fixed | `test-plan.ts`, `run.ts:389`. Findings 19 (#4) and 89 (#14) carry them, and they are folded on acme-store#19 |
| B3 Reliability misses the swallowed catch | Fixed | `reliability.ts:12`. Reliability alone owns it on #5 (34), #7 (41) and #9 (47) |
| W1 redaction is pattern-based | Partly | Exact values are now scrubbed inside the review pipeline. Command replies and `llm_calls.error` are not (Warning 9) |
| W2 AC-1 triage record | Fixed | `run.ts:360-366`. The #13 and #14 triage matches `trace.reviewers` |
| W3 AC-3 body findings, bare citations | Fixed, new gap | `verify.ts:53-61,75-95,119`. Evidence can now land on the wrong finding (Warning 1) |
| W4 AC-4 5 of 5 never shown | Open, documented | Warning 2 |
| W5 AC-15 rule overlap | Partly | Team rules badge now shows first (`findings.ts:372`, `slop.ts:19`). Other reviewers still report the line (Warning 5) |
| W6 AC-17/AC-24 no-change path | Fixed (code only) | `run.ts:236-258` |
| W7 AC-32 never shown, weak matching | Partly | Shown on #7. Missed on #9 because of a category mismatch (Warning 7) |
| W8 AC-34 detection, duplicate re-post | Partly | Detection from changed code works live: finding 34 was fixed even though its thread is `isOutdated: false`, and #8 did not re-post it. AC-34 itself is not exercised (Warning 8) |
| W9 AC-37 open status | Fixed | `finding-card.tsx:42`, `pills.tsx:94` |
| W10 EC-17 deleted comments | Fixed (code only) | `tracking.ts:122-128` |
| W11 EC-20 edge labels | Fixed | `flow.ts` quotes `\|"label"\|`. The acme-store#19 diagram renders |
| W12 EC-24 comment size | Fixed (code only) | `publish.ts:33-43,108-127` |
| W13 verification failures traced as ok | Fixed | `run.ts:465-476`. #8 "Failed, 2 posted unverified" (status `failed`); #4 "2 failed" |
| W14 inline-code mentions | Fixed (code only) | `parse.ts` `maskInlineCode` |
| W15 any commenter creates learnings | Fixed | `canWrite` (`pr.ts:134-154`) in `ignore.ts:10`, `replies.ts:36` and `reactions.ts:23`. Spec not updated (Warning 10) |

## Success criteria

### Reviewers and engine
- **AC-1** VERIFIED. The triage record is saved after the Breaking change re-route and lists only reviewers that ran (`run.ts:360-366`). On #13, `tests` is recorded for one file and `trace.reviewers` shows tests on 1 file. On #14 both show 2 files. No run records `breaking` without running it.
- **AC-2** VERIFIED (carried). The impact and Breaking change code is unchanged since `bee8a42`, and F4 was not re-run. Breaking change lost its answer on #5 and #7 (Blocker 1 class).
- **AC-3** WARNING. Medium-or-higher file-level findings are now verified (`verify.ts:119`, `codeFor` at 53-61). Evidence must quote shown code or cite an existing `path:line` (`grounded`, 75-95), and failed calls are counted (160, 170). On F1, the evidence for 96 and 102 quotes `invoice = db.get(Invoice, invoice_id)`. Gap: on #14, Test gap finding 89 is marked Verified but its Evidence is about the SSRF on line 28, while the SSRF finding 90 posted unverified. The verdict indexes were shifted in the `verify:json` answer (llm_call 299), and `grounded` only checks that the quote exists in the window, not that it supports this finding.
- **AC-4** WARNING. In every post-fix F1 run, verification rejected no planted bug; it rejected only the `utcnow` and forward-reference false positives on #10 and #15. Planted bugs posted per run:

  | Run | Posted | Missing |
  |---|---|---|
  | #10 | 4 of 5 (50, 51, 52, 56) | status transition |
  | #11 | 3 of 5 (67, 68, 69) | over-refund, status (ran before `57bddf6`) |
  | #15 | 4 of 5 (93, 94, 96, 97) | status |
  | #16 | 4 of 5 (102, 103, 104, status 109) | over-refund race |

  GAPS is honest. The SUMMARY "Docker" paragraph still claims "all 5 planted bugs" for acme-billing#7, but that run (#1) has neither the status transition nor the race. Judgment: not a blocker on its own, because the property AC-4 protects (verification keeps real bugs) holds. The literal criterion is unmet and needs the user's explicit acceptance. Measure it again after Blocker 1, since AI slop failed on #10 and Docs drift on #15.
- **AC-5** VERIFIED. On acme-billing#8, the comment on `app/services/ledger.py:4` is Critical, carries the Security badge (plus Reliability) and names only the kind of secret. I took a 6-character fragment of the committed value (present once in the fixture file at `85758f2`). It appears 0 times in the PR's review comments, review bodies and issue comments. In the DB it appears in 0 rows across `findings`, `reviews` (summary, walkthrough, flow, trace, reasons, triage, impact, note), `llm_calls` (tools, error), `learnings`, `jobs`, `pull_requests` and `repositories.brief`. Logs: the container that ran #6 was replaced; the current log (369 lines) has 0 hits, and the check never logs matched text. Remaining channels: Warning 9.
- **AC-6, AC-7** VERIFIED (carried). `supply-chain.ts` and `manifests.ts` are unchanged.
- **AC-8** VERIFIED. The ownership finding posts on all four post-fix F1 runs (51, 67, 96, 102), with the Security badge first.
- **AC-9** VERIFIED. The Reliability prompt now reads every `catch`/`except`/`rescue`/`if err != nil` block (`reliability.ts:12`). The swallowed error posts as Reliability alone on #5, #7 and #9. The prompt has not changed since.
- **AC-10** VERIFIED (carried). F2 also gets Performance N+1 findings (42 on #7, 49 on #9).
- **AC-11** VERIFIED. On #6, Data reports the dropped column (25), money stored as `REAL` (24) and `NOT NULL` with no default (26).
- **AC-12** WARNING. Fully met on #4 (17 placeholder; 21 names `formatCents` in `src/services/pricing.ts`) and on #13 (79, 85). #12 has the placeholder only. #14, the only F3 run on HEAD code, has no AI slop finding: the reviewer failed (`trace.reviewers` slop `failed: 1`; Blocker 1).
- **AC-13** VERIFIED. Docs drift reports `GIFT_CARD_PROVIDER_URL` on all four F3 runs (22, 66, 84, 92).
- **AC-14** WARNING. The previous blocker is fixed. On #14 the comment shows a folded "Suggested tests" with 3 cases, and finding 19 on #4 has them too. Remaining gaps:
  - #13 produced no Test gap finding at all (model variance, as GAPS says).
  - #12 merged it into Security (before `a67c793`).
  - If the extra call fails, it is only logged (`test-plan.ts:36-38`) and the finding posts without tests.

  Not running on repos without tests: unchanged.
- **AC-15** WARNING. Team rules now owns shared findings: the badge row on acme-billing#12 reads `[Low] [Team rules] [Bug]`. But Bug, Security and AI slop still report the `print` line: finding 112 is `rules+general+security+slop`, and on #15 Security posted a separate finding 101 on the same line.
- **AC-16** VERIFIED (carried).

### Ranking
- **AC-17** VERIFIED. Every completed review in #4 to #16 has a risk. On the no-change path, risk and priority carry over from the last completed review (`run.ts:236-253`; code only).
- **AC-18** VERIFIED (carried). #6 is P0 "commits a secret".

### GitHub output
- **AC-19** VERIFIED. The comment order is unchanged and now has a size guard (`publish.ts:108-127`). acme-store#19 comments match the order.
- **AC-20** VERIFIED. The acme-store#19 body has the logo, P3 and Medium risk badges, summary, reasons line, counts, table, key changes, flow, limits note and button, in that order.
- **AC-21** VERIFIED. acme-store#19 has a folded `mermaid` block with quoted edge labels.
- **AC-22** VERIFIED (carried).
- **AC-23** WARNING (minor). The F1 check passes: the body of 102 has `` `create_refund` `` and `` `db.get` ``. But `codify` splits dotfile paths, because `TOKEN` cannot start with a dot (`codify.ts:5`); finding 92 renders ".`env.example`". A template literal quoted inside a code span also breaks the evidence of finding 89.
- **AC-24** VERIFIED. While findings are open, the no-change path uses `openCheckTitle` (`run.ts:255-258`). Main path on #8: "7 open · 1 critical · 1 fixed".

### In the PR
- **AC-25 to AC-28** VERIFIED (carried). The `parse.ts` change keeps arguments: `@prguard ignore` followed by a reason in backticks was parsed with its reason on acme-store#14.
- **AC-29** VERIFIED. On acme-store#14, finding 33 was ignored by a writer. This saved learning 2 (source `command`), the bot replied with the Learning saved badge, and the comment is minimized `resolved`. Non-writers now get a refusal (`ignore.ts:10-12`; see Warning 10).
- **AC-30, AC-31** VERIFIED (code). Both are now limited to write access (`reactions.ts:13-27`, `replies.ts:33-39`). The previous pass's live evidence still holds.
- **AC-32** WARNING. Shown live: the #7 trace `suppressed` lists the missing-`await` finding with learning 2. But on #9 (a fresh PR in the same repo, learning still on), Reliability posted the same issue as finding 46. Suppression needs an equal category (`apply.ts:58-61`), and 46 is `error-handling` while the learning is `bug`. Matching uses titles, not the learning's condition: the learning says "when the called function is synchronous", while 46's verified evidence shows the function is `async`. Hand-written learnings can now match (`apply.ts:43-59`), but this was not shown live.
- **AC-33** VERIFIED. On acme-store#14, finding 34 was marked fixed at `5d3f03a` although GraphQL reports its thread `isOutdated: false`, so the code comparison caught it (`tracking.ts:122-128`). Its comment has the Fixed badge and is minimized `resolved`. #8 `since` = {fixed 1, new 2, open 7}, and the issue was not re-posted.
- **AC-34** WARNING. Not exercised live since the detection change (#8: "1 changed, 1 fixed"). In the code, changed lines become candidates and the fix check decides (`tracking.ts:20-25,139-143`).

### Dashboard
- **AC-35, AC-36, AC-38 to AC-41** VERIFIED (carried). Only `finding-card.tsx` changed in the dashboard.
- **AC-37** VERIFIED. The status pill renders for every status (`finding-card.tsx:42`), and `pills.tsx:94` labels `open` as "Open".

### Languages and platform
- **AC-42** VERIFIED (carried). **AC-43** VERIFIED (carried). The re-runs used the Docker stack.

## Edge cases
- Changed and VERIFIED:
  - EC-3: live on #8 and #4.
  - EC-17: code only, `tracking.ts:122-128`.
  - EC-20: live on acme-store#19.
  - EC-24: code only, `publish.ts:11-43,121-127`.
  - EC-26: #6 finding 23 shows the Security and Reliability badges.
  - EC-9, EC-11, EC-12: masking inline code does not change the author or thread checks.
- Code unchanged, carried as VERIFIED: EC-1, EC-2, EC-4 to EC-8, EC-10, EC-13 to EC-16, EC-18, EC-19, EC-21 to EC-23, EC-25.

## Project rule spot checks

This repo has no `docs/CONSTITUTION.md`, `.claude/rules/*guardrails*.md` or `docs/conventions/cross-cutting-invariants.md`. The rules applied come from the plan.md "Project rules check" section, the tasks.md "Rules for every slice" section and the spec's axes.

| Rule | Command | Output |
|---|---|---|
| Types | `npx tsc --noEmit -p apps/api`; `npx tsc --noEmit -p apps/dashboard` | exit 0; exit 0 |
| Coverage | `node scripts/check-task-coverage.mjs deep-review` | Not run: no such script in this repo (`scripts/` has only `badges/`). `git diff bee8a42..HEAD -- spec.md plan.md tasks.md` is empty, so the first pass's coverage result (exit 0) still applies |
| No tests, no CI | grep test/CI patterns over `git diff --name-only f0ad389..HEAD` | no match |
| `apps/web` untouched | `git diff --name-only f0ad389..HEAD -- apps/web` | 0 files |
| Dependencies | `git diff bee8a42..HEAD -- package.json apps/*/package.json` | empty |
| DB only via repos | grep `db/client` and `drizzle-orm` outside `db/` | only the existing `migrateDb` import in `index.ts` |
| Env only via config | grep `process.env` outside `config.ts` | none |
| Never approve or fail | grep `failure`, `APPROVE`, `REQUEST_CHANGES` | none; `openCheckTitle` returns success or neutral (`publish.ts:275-283`) |
| Emoji labels, em/en dashes | added lines in `bee8a42..HEAD` (apps, SUMMARY, GAPS) | 0, 0 |
| Commits | `git log bee8a42..HEAD --format=%B` grep for co-author and attribution trailers | no match |
| Secret value | `ddb.mjs` counts, `gh api` bodies, `docker logs` count | 0 everywhere (AC-5) |
| Reviewer answers | `llm_calls` where `purpose like '%:json'`; `trace.reviewers[].failed` | 4 of 4 `reviewer:*:json` calls failed on the schema; reviewers failed on #5, #7, #9, #10, #14, #15 |
| GitHub state | GraphQL on acme-store#14 threads and comment nodes | 34: `isOutdated: false`, minimized `resolved`, Fixed badge; 33: minimized `resolved` |

Test-strength audit: not applicable; there are no tests by design.

## Does not change
- `apps/web` untouched: holds. Never approves, check never `failure`: holds.
- App permissions: `canWrite` calls `GET .../collaborators/{user}/permission`, which needs only metadata read. It worked live for learning 2.
- Incremental behavior: only the no-change branch changed (risk carry-over, open-count title), as the first pass asked. Scope, takeover, cancellation, crash recovery and the 422 fallback are untouched by this diff.
- API fields: `contracts.ts` is untouched. Models, providers and the dashboard design system are unchanged.

## Cross-cutting axes
- **Access** (touched): learnings from GitHub now need write access. Writers get a learning; non-writers get a refusal (`ignore`) or a logged no-op (reply, 👎). Learnings in the dashboard still need admin. The spec text is not updated (Warning 10).
- **Theme**: unchanged.
- **Languages** (touched): the Reliability prompt names catch forms for TS, Python, Ruby and Go.
- **Failure** (touched): verification failures are now traced. A reviewer failure shows the GitHub note "Part of this pull request could not be reviewed" and per-call Failed rows in the trace. But the reviewer JSON fallback can never succeed (Blocker 1), and a failed Suggested-tests call is not traced (Warning 4).
- **Idempotency**: unchanged. A concurrent 👎 sweep and `ignore` can still save two learnings (carried).
- **Cost** (touched): forced calls (up to 3 steps, twice) and the JSON fallback all record usage against the review (`call.ts:44-71`).
- **Untouched**: billing, i18n, mobile (no related code in the diff).

## Blockers

1. **Reviewers still lose their answers; the JSON-mode fallback cannot succeed for reviewers.**
   - **What and where:** `b5a9b8f` added `structured({ ...meta, schema })` as the last resort in `agent()` (`llm/call.ts:257-262`). For reviewers the schema is `submitSchema` (`review/findings.ts:6-19`, passed at `reviewing.ts:78`), whose `end_line`, `category`, `suggestion`, `confidence` and `details` are `.nullish()`. Groq's strict `response_format` rejects it ("The following properties must be listed in `required`: category, confidence, details, end_line, suggestion").
   - **Evidence:** every `reviewer:*:json` call in the DB failed (4 of 4: AI slop on #14, llm_calls 264 and 269; Docs drift on #15). `verify:json`, whose schema has no optional keys, succeeded.
   - **Effect:** on HEAD code, 2 of 3 reviews lost a reviewer (#14 AI slop, #15 Docs drift). Across all 13 post-fix reviews, 6 did (#5, #7, #9, #10, #14, #15). On #14, the only HEAD-code F3 run, AI slop posted nothing, so AC-12 fails there.
   - **Rule:** a fix the executor missed is a BLOCKER. GAPS says "No reviewer or verifier lost its answer in the re-runs"; `llm_calls` and `trace.reviewers[].failed` contradict it. This is the same class as the first pass's Blockers 2 and 3: a written claim the stored evidence disproves.
   - **Fix direction:** send the JSON-mode call a strict-compatible schema (every key required, optional ones `.nullable()`) or use non-strict JSON mode, and keep `submitSchema` for parsing. Re-run F3 and F1 on HEAD. Confirm that no `reviewer:*:json` call fails and no `trace.reviewers` entry has `failed > 0`. Correct the GAPS line.

## Warnings

1. **AC-3:** a Verified badge can carry another finding's evidence (#14 finding 89 shows the SSRF evidence of unverified finding 90). `grounded` (`verify.ts:75-95`) checks that the quote exists, not that it supports the finding.
2. **AC-4:** 4 of 5 planted bugs on 3 of 4 post-fix F1 runs (3 of 5 on #11), and verification drops none. The SUMMARY "Docker" paragraph still claims "all 5" for acme-billing#7 (#1 has no status-transition finding). Needs the user's explicit acceptance.
3. **AC-12:** met on #4 and #13, partial on #12, nothing on #14 (Blocker 1).
4. **AC-14:** Suggested tests are now guaranteed when a Test gap finding exists. The finding itself is missing on #13, and a failed Suggested-tests call is only logged (`test-plan.ts:36-38`).
5. **AC-15:** Bug, Security and AI slop still report the `print` rule line (finding 112 merged; #15 finding 101 separate).
6. **AC-23:** `codify` splits dotfile paths (`codify.ts:5`; finding 92 ".`env.example`"), and a quoted template literal breaks the evidence code span of finding 89.
7. **AC-32:** suppression requires the same category and similar titles, and ignores the learning's condition. Suppressed on #7, posted again by Reliability on #9 (`apply.ts:56-62`).
8. **AC-34:** not exercised live since fix detection began comparing code (#8 checked only the one fixed finding).
9. **AC-5 residual:** command replies (`answer.ts:63`, `fix.ts:64-65`) and `llm_calls.tools` (`call.ts:150`) use pattern-only redaction, and `llm_calls.error` and the logged `problem` (`call.ts:65,263`) are not redacted at all. A bare secret value echoed in `@prguard explain` would post.
10. **Spec drift on access:** learnings from `ignore`, replies and 👎 now need write access (`pr.ts:134-154`). Spec AC-29 to AC-31 and the Access row still say commands are open to anyone, and SUMMARY's Deviations section does not list the change.
11. **SUMMARY overstates:** "All three blockers and the warnings were fixed". Warnings 4, 5, 7 and 8 and part of Warning 1 from the first pass remain open.

Observations, not graded:
- The local `data/prguard.db` (git-ignored) has 12 of 13 migrations applied (no `0012`). No live row holds the F5 value, but the raw file still contains its bytes once in free pages. Delete it or run `VACUUM`.
- Fix commits `ddd3d67` and `42f106b` each bundle 3 to 5 unrelated fixes.
- Repeat suppression is now file-wide for open and dismissed findings (`findings.ts:317-325`). A second, distinct issue with the same title words in that file is not posted while the first is open.
- The body of Test gap finding 89 reads like a bug report with a fix, not a missing test.

## Next steps
1. Builder fixes Blocker 1, re-runs F3 and F1 on HEAD, and checks `llm_calls` (`%:json`) and `trace.reviewers[].failed`. Correct the GAPS line and the SUMMARY "Docker" and "After the first verification" claims.
2. The user decides AC-4 and AC-14 variance: amend the spec (for example AC-4: "verification rejects none of the planted bugs; at least 4 of 5 posted") or accept them as gaps. Update spec.md for write-only learnings (Warning 10).
3. Re-run the verifier.
4. Then run `/prguard-learn`. Inputs:
   - Blocker 1 is a fallback that shipped as a fix without ever being checked against the provider's schema rules.
   - The "no reviewer lost its answer" claim was written without querying `llm_calls` or the trace.
   - The first pass's defect class (written claims contradicted by stored evidence) recurred.
