# Verification: deep-review

**Date:** 2026-10-01
**Branch:** `manaskhandelwal/deep-review`, base `f0ad389` (merge-base with `manaskhandelwal/staging-work`), HEAD `bee8a42`
**Status:** BLOCKED

Method: goal-backward from `spec.md`. `SUMMARY.md` was read as a claim only. Each id was checked in the
code, then against the live evidence: scratchpad logs, the local DB `data/prguard.db` (read-only
queries), and `gh api` GET calls on `prguard-sandbox`. The app, builds and test suites were not run.
Where the evidence and SUMMARY disagree, this is stated.

Review ids below are rows in `data/prguard.db`: #1 acme-billing#3 (F1), #4 acme-billing#4 (F5),
#5/#8 acme-store#6/#9 (F6 npm), #6 acme-store#7 (F3), #7 acme-store#8 (F4), #9 acme-billing#5 (F6 PyPI),
#10 acme-gateway#1 (F6 Go), #11 acme-gateway#2 (F7), #12 acme-ledger#1 (F8), #13 acme-store#10 (F9),
#14 acme-store#11 (F2), #15 acme-billing#6 (F1 + rule), #16 acme-billing#6 fix push, #17 acme-gateway#2 `@prguard review`.

## Success criteria

### Reviewers and engine
- **AC-1** WARNING. Routing works: `engine.ts:57-59` filters by route, a missing file or failed call falls back to all candidates (`triage.ts:198-224`), triage recorded on every review #1 to #17. But the record is not "the reviewers it was sent to": it is saved at `run.ts:316`, before Breaking change is re-routed by impact (`run.ts:339-346`) and before Test gap / Breaking change are filtered (`run.ts:354-356`). Review #14 records no file with `breaking`, yet its trace shows Breaking change reviewed 2 files.
- **AC-2** VERIFIED. #7 impact lists `buildQuote` (`src/services/pricing.ts:57`, 2 refs, caller `src/routes/orders.ts`); Breaking change finding 31 names `ordersRouter.post` in `src/routes/orders.ts` (body placement, file not in the diff).
- **AC-3** WARNING. Rejected findings are dropped and listed with reason (`verify.ts:115-120`, `run.ts:442`; #1, #15). Verified badge and Evidence on GitHub (`publish.ts:72,75`, f3b.log) and dashboard (`finding-card.tsx:36-41,72-76`). Gaps: findings with `line === null` are never verified (`verify.ts:64`), so body findings such as Breaking change 31 (high) and Docs drift 40 (medium) post unverified; a bare citation is accepted as confirming evidence (finding 75 evidence is only `` `app/routers/refunds.py`:79-80 ``).
- **AC-4** WARNING. Not demonstrated as claimed. Plan list (plan.md:316): ownership, float money, refund above balance, status transition, swallowed error. #1 (acme-billing#3) has no finding on the status transition (`refunds.py:104`) and its verifier rejected "Mixes cents and dollars in `refundable_amount`" on a bare `app/models.py:82`; #15 has no refundable-amount finding; the Docker run acme-billing#7 has no `refunds.py:104` finding (docker-e2e.log). GAPS/SUMMARY claim 5 of 5 without listing them.
- **AC-5** BLOCKER. GitHub output, logs and API responses are clean for F5 (f5.log shows the kind only; `q8Zr3n` absent from every scratchpad log, `reviews`, `jobs`, `llm_calls`, `learnings`). But the value is stored in the DB: `findings.snippet` of finding 19 (acme-billing#4, `app/services/ledger.py:4`) holds the full `PAYMENT_SIGNING_SECRET = "..."` line, written by `snippetOf` at `run.ts:604` / `tracking.ts:114-125`. Violates the project rule "secrets never leak into ... the DB" and tasks.md slice 18's own check (`rg` the DB). SUMMARY says "value nowhere". Redaction gaps are listed under Warnings.
- **AC-6** VERIFIED. `supply-chain.ts:27-37,47-79`; #8 two Critical malware findings on `package.json` lines with socket.dev links; #10 Go module Critical; #9 `requests@2.19.0` "has 2 known vulnerabilities".
- **AC-7** VERIFIED (code only; no run without the key in the DB). No key: detail "Skipped, no Socket key"; SDK error: "Skipped, Socket unavailable" (`supply-chain.ts:91-98`); nothing is posted.
- **AC-8** VERIFIED. #15 finding 75 reviewer `security+general+reliability+slop`, "Missing ownership check on refund creation".
- **AC-9** BLOCKER. Contradicted by the only run. #14 (acme-store#11): Reliability was routed every file and returned 3 findings (SQL injection, missing `await`, off-by-one), none on the swallowed `try/catch`; that issue appears only as Security low finding 73 "Redeem endpoint masks all errors as success". GAPS admits it; SUMMARY lists AC-9 as closed.
- **AC-10** VERIFIED. #7 finding 35 Performance "N+1 queries in `orderHistory`".
- **AC-11** VERIFIED. #4 Data on the dropped column (24) and REAL/float money (21, 22); `data.ts:4-6` limits it to schema, model, migration and SQL paths; #14 trace shows Data 0 files.
- **AC-12** VERIFIED. #6 finding 44 names `formatCents` in `src/services/pricing.ts`; finding 37 on the placeholder `return true`.
- **AC-13** VERIFIED. #6 finding 40 Docs drift on `GIFT_CARD_PROVIDER_URL` (anchored on `README.md`, body placement).
- **AC-14** BLOCKER. The only Test gap finding (42, acme-store#7) has `details = NULL`: no folded "Suggested tests" (f3b.log:242-265). No Test gap row in the DB has details. `tests.ts` asks for them but nothing enforces it (`findings.ts:86` accepts null, `run.ts:76-85` keeps a details-less finding). "Does not run without test files" holds (`run.ts:348,355`; no `reviewer:tests` calls on acme-billing, acme-gateway, acme-ledger).
- **AC-15** WARNING. Rules reach only Team rules (`context.ts`, `run.ts:361`). Live, the `print` finding 84 is `slop+rules+security` and its comment shows the AI slop badge before Team rules (f1b.log:394); on #14 the `console.log` rule finding is `rules+security+docs`. `slop.ts` tells AI slop to report "style that ignores the brief's conventions", which overlaps Team rules.
- **AC-16** VERIFIED. 12 plugins in `reviewers/index.ts:84`, served by `reviewerInfo`; `enabledPlugins` removes a switched-off plugin from triage candidates, reviewer stats and the checks detail.

### Ranking
- **AC-17** WARNING. `risk.ts` and `run.ts:513-521`, badge and reasons line on GitHub and in the dashboard. The incremental path with nothing reviewable (`run.ts:230-249`) completes a review without setting risk.
- **AC-18** VERIFIED. `priority.ts`; #13 P0 "labelled `hotfix`"; #8, #10 P0 "adds a malicious package"; #4 P0 "commits a secret"; incremental keeps `previous` (`priority.ts:33`); labels re-rank without a model call (`rank.ts`). Reason can be empty when the summary has no impact area (`priority.ts:65-68`).

### GitHub output
- **AC-19** VERIFIED. `publish.ts:71-80` order matches; f5.log, f3b.log; `rg` for emoji labels is clean.
- **AC-20** VERIFIED. `publish.ts:152-202`; f5.log body matches the order.
- **AC-21** VERIFIED. `flow.ts:92-114`; folded `mermaid` block in f5.log.
- **AC-22** VERIFIED (text mode by code only). `badges.ts:136-179`: every image carries width, height, alt; empty `ASSET_BASE_URL` gives bold labels and markdown links. Manifest covers every badge name used (199 entries, none missing).
- **AC-23** VERIFIED. `codify.ts`; finding 75 body has `create_refund`, `db.get`, `get_owned_invoice` in backticks.
- **AC-24** WARNING. Main path: "10 open · 1 critical · 1 fixed" (#16, scenario.log) and the summary mirrors header and table (`publish.ts:205-216`). The incremental no-reviewable path titles the head's check "No new changes" / success while findings are open (`run.ts:245`).

### In the PR
- **AC-25** VERIFIED. 👀 added in the webhook handler before enqueue (`commands/events.ts:33`); SUMMARY: 👀 at 4.3 s; #17 trigger `command`, kind `full`.
- **AC-26** VERIFIED. `answer.ts`; thread reply cites `app/routers/refunds.py:79` (scenario.log; acme-billing#6 comment 4150255898).
- **AC-27** VERIFIED. `fix.ts` validates with `fitReplacement` over the thread's lines; reply 4150257178 is a clean suggestion for `refunds.py:19-22`.
- **AC-28** VERIFIED. Question answered in the conversation (5921474572); help table (5921466896).
- **AC-29** VERIFIED. `ignore.ts`, `dismiss.ts`; finding 82 dismissed, learning 1 (source command), reply with the Learning saved badge, comment 4150248131 `isMinimized: true, resolved`.
- **AC-30** VERIFIED (push path live; close and re-run by code). Finding 85 dismissed at review #16 start, learning 3 (source reaction), comment minimized. Close: `sweep_reactions` job (`review/events.ts:71`); re-run passes `hadEarlier` (`run.ts:227`).
- **AC-31** VERIFIED. `replies.ts`; "This is on purpose" saved learning 2 and replied; "thanks!" got nothing (scenario.log, comment list).
- **AC-32** WARNING. Code path exists (`apply.ts:43-53`, `run.ts:419-422`) but no trace in the DB has a suppressed entry, so it was never shown. Matching relies on the same fingerprint or title Jaccard of at least 0.5 plus equal category (`apply.ts:31-37`), which rarely holds for a differently worded finding on another PR; manual learnings have no title, so they can never suppress.
- **AC-33** VERIFIED. Finding 75 status fixed at `96e0874`, comment 4150248062 minimized resolved with the Fixed badge; #16 since `{fixed:1,new:2,open:10}`, check "10 open · 1 critical · 1 fixed".
- **AC-34** WARNING. The live run does not exercise it: the push edited `refunds.py:107` inside finding 77's range, but GitHub reports the thread `outdated: false` (GraphQL), so the fix check never looked at it (`tracking.ts:86-87` keys on the thread's outdated flag only). The same issue was then posted again as new finding 87 (critical), so the PR carries two open findings for one bug.

### Dashboard
- **AC-35** VERIFIED. `routes/queue.ts` (visible repos, open, non-draft); `queue-board.tsx` four columns, risk-then-age sort, Waiting group; `useQueue` polls 5 s while a review is active, else 30 s.
- **AC-36** VERIFIED. Priority and risk column in `review-table.tsx`; `?priority=` filter (`routes/reviews.ts:124-125`) and Select.
- **AC-37** WARNING (minor). Priority/risk with reasons, reviewer pills, Verified plus Evidence, Copy prompt, hash scroll: present. Status pill only for fixed and dismissed (`finding-card.tsx:42`); open is never labeled, although tasks.md slice 32 planned "Open, Fixed, Dismissed".
- **AC-38** VERIFIED. `trace.tsx` shows steps with duration, triage, impact, calls with model, tokens, tools, funnel, rejected, suppressed; `llm_calls.tools` recorded (`llm/call.ts:140-151,205`).
- **AC-39** VERIFIED. `routes/insights.ts` (visible repos, optional repo, 1 to 90 days); tiles, per-reviewer fix and dismiss rate, severity, verification.
- **AC-40** VERIFIED. `learnings-panel.tsx`; writes need `canEditRepo` (`routes/repos.ts:66` and the PATCH/DELETE handlers), `ownLearning` blocks cross-repo ids.
- **AC-41** VERIFIED. `globals.css` hues equal `scripts/badges/catalog.ts`; no em or en dash in any added line.

### Languages and platform
- **AC-42** VERIFIED. #11 Go: map race (30), ignored `strconv.Atoi` error (20), `defer` in loop (45), off-by-one (50): 4/4. #12 Java: unclosed reader (45), null check (30), overflow (31): 3/4.
- **AC-43** VERIFIED. docker-e2e.log: acme-billing#7 P1/High risk, acme-store#12 two Critical malware findings through Socket, `explain` reply in 5 s, fix push marked Fixed in 17 s.

## Edge cases
- **EC-1** VERIFIED. Unknown names filtered to candidates (`triage.ts:213`); missing file falls back (`triage.ts:208-211`).
- **EC-2** VERIFIED. `impact.ts:66-68` (4+ chars, common list); samples dropped above 200 refs (`impact.ts:154`).
- **EC-3** VERIFIED. Errors caught per group, findings kept (`verify.ts:106-109`); #7 posted all findings unverified after the verifier failed. The trace shows that step as ok "0 checked" (see Warnings).
- **EC-4** VERIFIED. `secrets.ts:21-25`; #4 flagged 1 secret, `PARTNER_API_KEY = "your-api-key-here"` not flagged.
- **EC-5** VERIFIED. Unknown packages are absent from the lookup map, no finding (`supply-chain.ts:99-104`).
- **EC-6** VERIFIED. `manifests.ts:20-23` lowest version; unparsable lines skipped.
- **EC-7** VERIFIED. Only added lines are read (`manifests.ts:25-27`).
- **EC-8** VERIFIED. Manifests classify as config (`noise.ts` MANIFEST); #9 requirements-only PR ran checks and reviewers.
- **EC-9** VERIFIED. `user.type !== "Bot"` on both events (`commands/events.ts:49-51`), people-only 👎 (`reactions.ts:12-19`); no bot loop on acme-billing#6. See Warnings for inline-code mentions.
- **EC-10** VERIFIED (code). `commands/run.ts:78,83-84`.
- **EC-11** VERIFIED. Usage reply outside a thread (5921479317).
- **EC-12** VERIFIED. `parse.ts:29`.
- **EC-13** VERIFIED (code). Command jobs use `cmd:<id>` keys, so `claim()` runs them beside a review; `review` goes through `triggerReview`, which supersedes like a push.
- **EC-14** VERIFIED. `action !== "created"` returns (`commands/events.ts:54,60`).
- **EC-15** VERIFIED (code). Deleted or unmatched code is sent to the fix check as such (`tracking.ts:36-54`); the model decides.
- **EC-16** VERIFIED (code). Force-push gives a full scope (`run.ts:127`); candidates come from GraphQL `isOutdated`.
- **EC-17** WARNING. A failed edit or minimize is logged after the DB update (`tracking.ts:58-70`, `dismiss.ts:51-53`). A deleted comment has no thread, so `threadsOutdated` never returns it and the finding can never be marked fixed (`tracking.ts:86-87`); tasks.md slice 24's "delete a comment by hand, then fix its code" check cannot pass.
- **EC-18** VERIFIED. 30 most recent in prompts (`apply.ts:11`), suppression over all enabled rows (`apply.ts:44`).
- **EC-19** VERIFIED (code, not live). `apply.ts:49` exempts `fromCheck` critical findings, including merged ones (`run.ts:416`).
- **EC-20** WARNING. Node labels are quoted and cleaned (`flow.ts:77-86,108`); edge labels sit unquoted inside `|...|` and keep `[ ] ( ) { }` (`flow.ts:110-111`), which can break the Mermaid parse.
- **EC-21** VERIFIED (code). `priority.ts:66` gives "Ranked from labels and findings."
- **EC-22** VERIFIED. `badges.ts:143-146`; manifest has `-many` badges with alt "20+ ...".
- **EC-23** VERIFIED. Migrations 0001 to 0011 are ADD COLUMN / CREATE TABLE with defaults only; the review page hides priority, risk and trace when empty; #1 has null priority and risk.
- **EC-24** WARNING. Review body: folds, then the not-attached fold, then table rows, under 60,000 (`publish.ts:189-201`). Line comments have no size guard at all (`publish.ts:71-80`), and the last-resort `slice(0, MAX_BODY)` (`publish.ts:201`) can cut markdown.
- **EC-25** VERIFIED. Delivery id dedupe (`webhooks.ts`) plus `enqueueOnce` on `cmd:<commentId>` / `reply:<commentId>`; one reply per command on acme-billing#6.
- **EC-26** VERIFIED. Up to 2 reviewer badges (`badges.ts:165-167`); f5.log comments show two.

## Project rule spot checks (commands run from the repo root)

| Rule | Command | Output |
|---|---|---|
| Types | `npm run typecheck` | `tsc --noEmit` for apps/api and apps/dashboard, exit 0 |
| Coverage | `node C:/Users/manas/Desktop/stuff/code/apps/blueprint/template/scripts/check-task-coverage.mjs --prefix prguard deep-review` | `[coverage] deep-review: every declared id reaches a task or a reasoned deferral.` exit 0 |
| No tests, no CI | `git diff --name-only f0ad389..HEAD \| grep -iE "(\.test\.\|\.spec\.\|/tests?/\|__tests__\|\.github/\|vitest\|jest\|playwright\.config)"` | no match |
| `apps/web` untouched | `git diff --name-only f0ad389..HEAD -- apps/web \| wc -l` | `0` |
| Groq and Gemini only | `git diff f0ad389..HEAD -- apps/api/package.json package.json` | adds `@socketsecurity/sdk` (package lookup, not a model) and dev `playwright-core`; `llm/models.ts` unchanged |
| DB only via repos | `grep -rln "client.ts" apps/api/src/db` and `grep -rn "db/client" apps/api/src` | only `db/repos/*`, plus the pre-existing `migrateDb` import in `index.ts` |
| No approve / request changes | `grep -rn "conclusion\|CheckConclusion\|event:" apps/api/src` | `event: "COMMENT"` (`pr.ts:270`); `CheckConclusion = "success" \| "neutral" \| "cancelled" \| "skipped"` (`pr.ts:25`); `openCheckTitle`/`checkTitle` return success or neutral only |
| No emoji labels | `rg "🛑\|🔴\|🟠\|🟡\|💬" apps/api/src` | no match; other emoji only in code comments |
| No em-dashes in new copy | `git diff f0ad389..HEAD -U0 -- apps scripts README.md .env.example \| grep "^+" \| rg -c "\x{2014}\|\x{2013}"` | no match (exit 1) |
| Commits | `git log f0ad389..HEAD --format=%B \| grep -niE "co-authored\|claude\|generated with\|anthropic"` | no match |
| Secrets in DB and logs | read-only queries via `scratchpad/vq.mjs`; `grep -l q8Zr3n scratchpad/*.log` | logs: none; `findings.snippet` of finding 19 contains the value (BLOCKER); `jobs`, `llm_calls`, `learnings`, `reviews`: 0 rows |
| Access on new routes | read `routes/queue.ts`, `insights.ts`, `repos.ts` | `requireUser` + `visibleRepos`; learnings writes need `canEditRepo`, learning must belong to the repo |
| GitHub state | `gh api graphql` on 6 comment nodes; `gh api repos/.../compare/30e9797...96e0874` | 75, 81, 82, 85 minimized resolved; 77 not outdated although line 107 changed |

Test-strength audit: not applicable, no tests by design.

## Does not change
- `apps/web` untouched: holds (0 files). `main` untouched: work is on the feature branch.
- Never approves or requests changes; check run never `failure`: holds (see table).
- App permissions: no manifest or permission change in the diff; reactions, replies and `minimizeComment` worked live.
- Incremental scope: unchanged except `command` joins `manual` as full (`run.ts:123`). Takeover: unchanged (`run.ts:196-212`). Cancellation: new steps rethrow on abort (`verify.ts:107`, `tracking.ts:104`, `run.ts:163`). Crash recovery: `findPostedReview` now matches the exact review URL (`pr.ts:135-141`), findings inserted once, comment ids linked after. 422 fallback: unchanged (`run.ts:595-600`). Holds.
- API fields: only `ReviewerInfo` was replaced, by a superset; other types gained fields. Holds.
- `MODEL_FAST`/`MODEL_SMART` defaults and providers: unchanged.
- Dashboard design system: new tokens are additive, severity hues changed as allowed; routes kept, `/reviews` still the landing page; sign-in and access code not in the diff. Holds.
- No deployment config beyond `docker-compose.yml`: holds (unchanged).

## Cross-cutting axes
- **Access** (touched): Queue, Insights, learnings read use visible repos; learnings writes need repo admin; commands open to any commenter. Both branches handled. See the design-risk warning on commands creating learnings.
- **Theme** (touched): dashboard stays dark only. Badges on GitHub light and dark: unchecked here (visual; builder reports the preview).
- **Languages** (touched): reviews live on TS, Python, Go, Java; impact patterns for all four (`impact.ts:34-48`); supply chain npm, PyPI, Go live.
- **Failure** (touched): triage, impact, checks, fix tracking, commands fail soft and the review or reply still goes out. Verification failures are traced as ok "0 checked" (#7), not as failed; the summary has no trace step. WARNING.
- **Idempotency** (touched): commands keyed by comment id; `markFixed` checks for an existing Fixed line; learnings guarded by open status in all three callers. Two concurrent dismissals (👎 sweep and `ignore`) can still save two learnings.
- **Cost** (touched): triage, verification and fix checks record usage against the review; verification skips on budget (`verify.ts:84-88`); narrow reviewers use `fast`. Triage has no input cap for very large PRs, but fails soft.
- Untouched: billing, i18n, mobile layout (no related code in the diff).

## Blockers

1. **Secret value stored in the DB.** `run.ts:604` stores `snippetOf(f, anchorFiles)` (`tracking.ts:114-125`) for every finding, including Secrets check findings; finding 19 (acme-billing#4) `findings.snippet` contains the full `PAYMENT_SIGNING_SECRET` line. Rule: "secrets never leak into GitHub output, the DB or logs"; tasks.md slice 18 verify step. Slice 23 added the column after slice 18 was checked, and nothing re-ran the check. Fix direction: never store a snippet for check findings (or store `redactSecrets` output / a hash), and scrub existing rows.
2. **AC-14: Test gap posts without "Suggested tests".** Finding 42 (acme-store#7) has `details` null; no Test gap row has details. `tests.ts` requests details but `findings.ts:86` and `run.ts:76-85` accept a finding without them. Rule: AC-14. Fix direction: require details for `tests` (reject or retry a details-less Test gap finding, or fall back to generated cases), then re-run F3.
3. **AC-9: Reliability misses the swallowed `try/catch` on F2.** Review #14 (acme-store#11): Reliability saw the file and returned 3 other findings; the swallowed error posted only as Security low finding 73. SUMMARY marks AC-9 closed with this PR as evidence. Fix direction: strengthen `reliability.ts` for catch blocks that return success or drop the error, and re-run F2 until Reliability owns the finding.

## Warnings

1. **AC-5 redaction is pattern-based.** `redactSecrets` (`secrets.ts:51-55`) only matches provider shapes and `name = "value"`; a bare value quoted by a model passes. Not redacted at all: `details` (`run.ts:457-463`), flow labels (`run.ts:285`), trace rejected reasons and suppressed titles (`run.ts:421,442`, shown in `trace.tsx:91-100`), `llm_calls.tools` search queries (`llm/call.ts:140-151`), learning text in the `ignore` reply (`ignore.ts:17`). Scrub the exact values the Secrets check found from every model output and stored field.
2. **AC-1: recorded triage differs from actual routing** (`run.ts:316` vs `run.ts:339-356`); review #14.
3. **AC-3: body findings never verified** (`verify.ts:64`); bare citations accepted as evidence (`verify.ts:121`).
4. **AC-4: 5 of 5 not shown in any run** (#1, #15, Docker acme-billing#7); list the five findings per run.
5. **AC-15: other reviewers still report the rule** (finding 84 `slop+rules+security`, AI slop badge first); `slop.ts` overlaps Team rules.
6. **AC-17 / AC-24: incremental no-reviewable path** sets no risk and titles the check "No new changes" / success with findings open (`run.ts:230-249,245`).
7. **AC-32: suppression never demonstrated; matching is weak;** manual learnings can never suppress (`apply.ts:31-37`).
8. **AC-34: not exercised; duplicate open findings.** Thread 77 was not outdated though line 107 changed; finding 87 re-posted the same bug. Detection depends only on GitHub's outdated flag (`tracking.ts:86-87`).
9. **AC-37: open status not labeled** (`finding-card.tsx:42`).
10. **EC-17: deleted comments block fix marking forever** (`tracking.ts:86-87`).
11. **EC-20: edge labels not escaped for brackets** (`flow.ts:110-111`).
12. **EC-24: no size guard on line comments** (`publish.ts:71-80`); last-resort slice can break markdown (`publish.ts:201`).
13. **Failure axis: verification failures traced as ok** (`verify.ts:106-109`, `run.ts:443-450`; #7).
14. **Commands: a mention in inline code triggers a command.** `ownText` strips fences and quotes only (`parse.ts:12-18`), so "try `@prguard review`" starts a review.
15. **Design risk (spec-sanctioned): any commenter, including the PR author, can create learnings** through `ignore`, a reply or 👎 (`ignore.ts`, `replies.ts`, `reactions.ts`), bypassing the admin rule for learnings. A learning can be repo-wide and suppress future model Security findings; only critical check findings are exempt (EC-19). Consider limiting learnings to write-access users, or to non-authors.

Observations, not graded: repeat noise remains (F1 float money posted as 3 findings in #15 and in the Docker run); Team rules reported "File name violates lower-snake-case convention" and "Missing unit tests" at high on the Java PR (#12).

## Next steps
Builder fixes Blockers 1 to 3 and re-runs F3, F2 and F5 (checking the DB for the secret). Re-run the verifier after. Then `/prguard-learn`: Blocker 1 is a cross-slice regression (a later slice broke an earlier slice's verify step with no re-check), and Blockers 2 and 3 are SUMMARY claims that the live evidence contradicts.
