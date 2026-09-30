# Verification: mvp (re-check after fixes)

**Date:** 2026-10-01
**Commit verified:** `5a90cec` (HEAD of `manaskhandelwal/staging-work`). The earlier pass below verified `1095e88` (fixes `6516e34..1095e88` on top of `9ecbe47`).
**Status:** PASSED-WITH-WARNINGS. There are no blockers: B2 is fixed and was confirmed with a real OAuth sign-in. The earlier pass was BLOCKED on B2.

## Re-check after 5a90cec

Scope: B2, N1–N4 and W2 from the `1095e88` pass, plus the standing checks. The project has no tests by design, so none were written or run.

Evidence sources:
- The Docker stack running `5a90cec`. The api container started at 20:07:51 UTC, and its `src/` contains `adminOfAll` and `reindent`.
- Read-only DB queries and read-only GitHub API calls.
- `docker compose logs api`.
- A script that applied each posted suggestion to the file at the PR head, followed by `ast.parse`.

| Item | Status | Evidence |
|---|---|---|
| B2 | FIXED | Code: `auth.ts:50-67`. Live: see "B2: FIXED in 5a90cec" below. |
| N1 | FIXED (push path) | `events.ts:52-53`: a `synchronize` for a head equal to `lastReviewedSha`, or for a head that already has a queued or running review, returns before the ack. A takeover moves `headSha` first, so B's late webhook during or after the takeover adds nothing. Residual: see N6. |
| N2 | FIXED | `lifecycle.ts:86-88`: when `checkRunId` is null, `failReview` creates a completed `neutral` "Review failed" run on `headSha`. A takeover that is cancelled still leaves no run, by design: the newer push brings its own review, and a closed or draft PR needs none. |
| N3 | FIXED, residual | See the note below this table. |
| N4 | FIXED | `run.ts:286-303`: the `limits` messages (summary failed, chunks failed, not reviewed with its reason) are joined. They are used only when a deep review ran. |
| W2 | FIXED, residual nits | Live: acme-billing#2 "Refunds (suggestion check)", review `5371430273` on `30e9797`. Details are in the W2 notes. |

**N3 note.**
- **Fixed.**
  - A stale event for an already-reviewed head stands down and removes its 👀 (`run.ts:156-160`). Its check run on the old commit closes as "Superseded".
  - A late `closed` or `converted_to_draft` cancels only if the live PR really is closed or a draft (`events.ts:58-64`). The close reason comes from the live PR.
- **Residual.**
  - The stale payload still overwrites `pull_requests.head_sha`, `state` and `draft` (`events.ts:26-40`) before the new early returns, and nothing corrects the row until the next event or review.
  - No reader uses those fields without refreshing first: `triggerReview` gets a fresh payload, the rerun route refreshes from the live PR, and `serialize.ts` shows only number, title, url and author. The stale values are therefore invisible.

**B2 adversarial trace** (warnings, not blockers).
- **N5, access frozen at sign-in.** Admin is computed once at sign-in and stored in `user_installations.admin`. `scopeFor` then grants every active repo of that installation, including repos added later.
  - For a true org owner, or with an org base permission of Admin, that is right.
  - It is wrong for a user who had admin or maintain on every repo only through explicit grants, or on every *selected* repo of a "selected repositories" installation.
  - Such a user is treated as org admin. They can edit org rules, which apply to every repo, including future ones.
  - Until their next sign-in, they also see, and can edit, repos added after sign-in. That includes private repos they cannot open on GitHub: summaries, findings and code excerpts.
  - `maintain` counts as admin here too.
  - The sandbox installation is "all", so this path was not exercised.
  - Cheap options:
    - Compute `adminOfAll` in `scopeFor` from `user_repositories` against the current `listActive`. This fails closed on new repos until the next sign-in.
    - Or apply the rule only when `repository_selection === "all"`.
  - Either way, record the choice in GAPS.md.
- **Admin on all but one repo.** The installation admin flag is false, and the user falls back to per-repo access. This is correct and conservative.
- **Personal account.** Admin only when the installation account's login equals the user's login. Collaborators on a personal repo never get admin, so they get per-repo access. This is correct.
- **Installation with 0 active repos.** It is never admin unless the user is the account owner (`all.length > 0`). This is an edge case that fails closed.
- **Not live.** The non-admin collaborator path: the org has one member, `manaskhandelwal`, role `admin`, recorded as a gap in GAPS.md. The dev route still hardcodes `admin: true` (`auth.ts:134`), which is dev-only.

**New warnings.**
- **N5:** org admin as defined above.
- **N6 (AC-8, not a regression; already present before `5a90cec`).**
  - What happens:
    - A PR is reopened, or marked ready for review, on an already-reviewed head.
    - That still triggers a review.
    - `resolveScope` returns an empty incremental scope.
    - The review adds a new check run, "No new changes" `success`.
  - Being newest, that run replaces the visible "N findings · M high" (`neutral`).
  - Fix: skip `reopened` and `ready_for_review` when `lastReviewedSha === head`, or carry the previous title over.
- **N7 (docs).**
  - GAPS.md still says admin is decided by "org admin (membership)" in the access decision line. That contradicts the B2 line above it.
  - SUMMARY.md says suggestions "never delete lines silently (checked live)". That overstates it: see the W2 residual.

## Checks run

Re-run on `5a90cec` unless marked otherwise.

| Check | Result |
|---|---|
| `npm run typecheck -w apps/api` | exit 0 |
| `npm run typecheck -w apps/dashboard` | exit 0 |
| `node .../check-task-coverage.mjs --prefix prguard mvp` | `every declared id reaches a task or a reasoned deferral.` exit 0 |
| `git diff origin/staging --stat -- apps/web` | empty |
| `git merge-base --is-ancestor HEAD origin/main` | exit 1: the branch is not in main |
| grep `APPROVE\|REQUEST_CHANGES\|"failure"\|action_required` in `apps/api/src` | 0 hits |
| Fix commit `5a90cec`: author and attribution | Manas Khandelwal; 0 co-authored/claude/generated hits |
| Logs: real OAuth sign-in | `[20:08:32] signed in user: "manaskhandelwal" installations: 1`. Only `/callback` logs this; the dev route does not. |
| DB: `sessions` | A row created at 20:08:32.347, matching the sign-in |
| DB: `user_installations` | `{installation_id: 166488648, admin: 1}` |
| DB: `user_repositories` | 4 rows, all `admin: 1`: pg-scratch, acme-store, acme-billing, pg-new-muoi18t0. The dev route writes 0 rows here. |
| DB: `installations.rules` | `"Money is integer cents, never floats."`, `updated_at` 20:08:56.746. Only `setRules` sets it, via PATCH gated by `adminInstallationIds`. |
| `gh api orgs/prguard-sandbox/memberships/manaskhandelwal` | `role: admin, state: active`; the org has 1 member and 4 repos, matching the DB |
| acme-billing#2 check run `110075800464` | `completed`, `neutral`, "7 findings · 3 high", `details_url` `/reviews/10`; no reactions left on the PR |
| Earlier pass (`1095e88`): curl auth, install and 404 routes; App permissions (no `members`) | Unchanged code, not re-run; results as before |

## B1: FIXED

**Code.** `run.ts:153-169` handles a review that finds the PR has moved on.
- It stands down only when the live head is already covered: another queued or running review has it as its head, or `pr.lastReviewedSha` equals it. Since `5a90cec`, the second case also removes its 👀.
- Otherwise it takes the live head over. It closes its own check run as Superseded, moves `headSha`, and sets `checkRunId: null`.
- `completeCheck` (`run.ts:86-89`) then creates a completed check run on the new head when the review publishes (`pr.ts` `createCompletedCheckRun`).
- A takeover that is itself superseded leaves nothing behind on the newer commit.

The ack is still awaited before `enqueue` (`lifecycle.ts:36-47`), but that no longer matters: any surviving job reviews the live head.

**Live evidence: pg-scratch #22.** A=`8c1bdbd`, B=`f440011`.
- Logs: A's webhook arrived at 19:50:14 and review 5 started. B's webhook arrived at 19:50:17. At 19:50:18 review 5 logged `review moved to the latest push` (the takeover ran). At 19:50:20 B's enqueue cancelled job 9, and job 10 (review 6) reviewed B.
- Check runs on B (`filter=all`): exactly one, `110068380628`, `success`, "2 findings · 2 medium", `details_url` `/reviews/6`. It has no leftover Superseded run.
- Check run on A: `110068357762`, `cancelled`, "Superseded".
- Review `5371225043` was posted on `f440011`, headed `new commits a37dd0a..f440011`, so it covers both pushes. No 👀 is left on the PR.

**What the live run did not prove.**
- The redelivery of A's webhook was logged as `duplicate webhook ignored` (delivery `27385fb0…`, 19:50:31). A GitHub redelivery reuses the delivery GUID, so it exercised EC-9, not stale ordering. The `lastReviewedSha` branch never ran live.
- The original failure order was not reproduced live: B's job enqueued first and then cancelled by A's enqueue. The webhooks arrived 3 s apart, not ~1 s.
- GAPS.md now says this correctly: the stale-event path is covered by code trace, not by a live run.

**Adversarial orderings (code trace).**
- **B enqueued before A (original B1).** Rb is closed as Superseded. Ja sees live B with no open review for it, takes it over, reviews B, and creates a newer completed check run on B. GitHub shows the most recently *created* run: PR #21, from a pre-`1095e88` image, still shows its later takeover run "Superseded" over the completed one. The result is correct at HEAD.
- **Three pushes in any order.** Every enqueue cancels the queued job and flags the running one, so the last enqueued job survives. At start it either finds the live head covered or takes it over. A late webhook for an older head can cancel an in-flight review of the newest head, but the replacement takes that head over. The end state is correct; only tokens are wasted.
- **Takeover while the covering review is running.** This cannot happen concurrently, because `claim` never runs two jobs for one key. The live run shows the sequential form (the takeover is superseded by B's own review) working.
- **Closed PR.** The live state is checked before the takeover (`run.ts:148`). A close during a takeover cancels it with reason `closed` and removes 👀.
- **B's webhook after A's takeover already published.** Fixed in `5a90cec`: it is ignored (N1).
- **A stale webhook for an already-reviewed head.** Fixed in `5a90cec`: the 👀 is removed (N3).
- **A takeover that fails.** Fixed in `5a90cec`: a neutral check run is created (N2).

## Previous findings

| Id | Status | Evidence |
|---|---|---|
| B1 | FIXED | See above. |
| W1 (AC-16 Gemini unexercised) | ACCEPTED-AS-GAP | GAPS.md: "AC-16 … not exercised: no Gemini key" and the W1 line. |
| W2 (suggestions corrupt code) | FIXED in `5a90cec` (residual nits) | See the W2 notes below the table. |
| W3 (oversize hunk cut silently) | FIXED | `diff.ts:102-115,144-147`: a cut hunk adds the path to `notReviewed`, so the review is partial and says so. Nit: the footer labels every such path "not reviewed (budget)" (`publish.ts`), and a single cut piece is sized as the whole file (`diff.ts:150`), which overstates its budget estimate. |
| W4 (lockfile-only gets no summary) | FIXED | `run.ts:283` writes a deterministic summary ("This pull request changes only lock files (…)"), with the note at `:296-297` and check "Summary posted". |
| W5 (dedupe over-merges) | FIXED | `findings.ts`: a fingerprint match needs ≤20 lines distance, and the category-only rule is gone. `isRepeat` needs ≤40 lines distance for fingerprint or similar-title matches. |
| W6 (a) summary failure fatal | FIXED | `run.ts:212-225`: the review posts without the summary. |
| W6 (b) leaked model calls | FIXED | `run.ts:420-424`: `abort.abort()` in `finally`. |
| W6 (c) usage not reset per attempt | FIXED | `run.ts:209,248`: a per-attempt baseline. |
| W6 (d) summary and tool loops not budget-gated | ACCEPTED-AS-GAP | New GAPS.md line: "The summary call … is not counted against the review budget before it runs." |
| W7 (findings dropped silently) | FIXED | Unresolved paths go to the body (`findings.ts:74-75`). Incremental drops are counted and logged (`run.ts:280`). |
| W8 (login CSRF via install callback) | FIXED | `auth.ts:77-81` starts installs with state. `:89-93` always requires state, and a stateless install callback never signs anyone in. Verified by curl in the earlier pass. |
| W9 (org rules crowd out repo rules) | FIXED | `context.ts:13` caps each set on its own. Residual: each set is still silently cut at ~5.2K chars of the 10K the API accepts. |
| W10 (re-run hides posted findings) | ACCEPTED-AS-GAP | GAPS.md lists it. |
| W11 (reviews stuck open) | FIXED | Abandoned jobs call `failReview` or mark the brief failed (`worker.ts:31-44`, `jobs.ts:100-108`, `run.ts:427`, `index-repo.ts`). Ack failures no longer stop the enqueue (`lifecycle.ts:36-45`). `installationClient` is inside the try (`run.ts:402-403`). Residual: a crash between `reviewsRepo.create` and `enqueue` (`lifecycle.ts:27-47`) leaves an orphan `queued` review. `run.ts:154` and `events.ts:53` would count that orphan as covering its head. |
| W12 (access per installation) | FIXED | `session.ts:24-41`: visible repos are the repos of installations the user administers plus their own repos from `listInstallationReposForAuthenticatedUser`. Writes are gated in `repos.ts:36,50` and `installations.ts:16`, and the UI disables the controls. Every `:id` route goes through `accessibleRepo`/`visibleReview`. B2 is fixed; see N5 for the admin definition. |
| W13 (smee URL logged) | FIXED | `relay.ts:16` no longer logs `source`. |
| W14 (snapshot cap never fires) | FIXED | `snapshot.ts:51-58,79-84`: a byte-counting `Transform` in the pipeline returns `null` on `TooLarge`, so `index-repo.ts:79` can now fire. |
| W15 (access goes stale) | ACCEPTED-AS-GAP | GAPS.md decision: access refreshes only at sign-in. Sessions dropped to 7 days (`config.ts:40`). N5 is the sharper form of this. |
| W16 (OP-1 migration regression) | FIXED | Only `0000_init.sql` remains, the journal has 1 entry, and the live DB has 1 migration row. |
| W17 (deliveries grow; crash loses event) | FIXED (prune); residual | `index.ts:23` prunes rows older than 14 days every 6 h. `webhooks.ts:43-48` forgets a delivery whose handler throws. A process crash between the dedupe row and the handler still loses the event. |

**W2 notes (re-checked on `5a90cec`).**
- **Code.** `findings.ts:121-170`.
  - `reindent` restores the replaced first line's leading whitespace when the suggestion has less.
  - A suggestion shorter than its range is kept only if it is a pure deletion, meaning its lines are an in-order subsequence of the range. Otherwise it is dropped and the comment stays.
  - Widening counts only "meaningful" lines: at least 6 characters, with a run of 3 or more word characters.
- **Live.** acme-billing#2, review `5371430273` (DB review 10, head `30e9797`), has 7 inline comments, 5 of them with suggestions.
- **Applying them.** I applied each suggestion to the file at the head, alone and all together, and ran `ast.parse`. All 8 resulting files parse, and the indentation is correct in every suggestion:
  - `models.py` 82: `amount: Mapped[int] = mapped_column(Integer)`. `Integer` is already imported.
  - `schemas.py` 65: `amount: int = Field(gt=0)  # amount in cents`.
  - `refunds.py` 106-108: `except Exception as e:` / `db.rollback()` / `raise HTTPException(...) from e`. Line 108 was a blank separator, and the model's own range included it. Blank lines never widen.
  - `refunds.py` 109: `print` → `logger.info`. `logger` is defined at line 12.
  - `refunds.py` 19-22: 4 lines become 5, fixing the mutable default. The docstring on line 20 is removed. The code stays valid, and GitHub's suggested-change diff shows the removal in red.
- **Shrinking suggestions are now dropped.** The findings at `refunds.py` 79-82 (ownership check) and 27-28 carry no suggestion. The old `1095e88` run broke code at exactly 79-82, by deleting `if invoice.status not in REFUNDABLE_STATUSES:`.
- **Residual nits.**
  - Widening still skips lines in between that do not match: `findings.ts:154` sets `widenTo = last + k` without checking lines `last+1..last+k-1`. If the model cited only line 19, the docstring at line 20 was swallowed this way. The raw range is not stored, so the live case cannot tell which happened.
  - `reindent` cannot repair a multi-line suggestion flattened to column 0, where nested lines lost their relative indentation. The pure-deletion check compares trimmed text, so it does not catch that either.
  - Neither case was observed in this run.

## New from the regression pass

### Blocker

**B2: FIXED in 5a90cec.** The problem was that after a real sign-in, nobody could save org rules (an AC-13 regression from commit `38d2c73`).

**The fix.** `auth.ts:50-67` no longer calls `GET /user/memberships/orgs/{org}`. A user administers an installation when either:
- the account login equals theirs, or
- every active repo of the installation, from the local DB (`repositoriesRepo.listActive([installation.id])`), is in their `listInstallationReposForAuthenticatedUser` list with `admin` or `maintain`.

`adoptInstallation` runs before `readAccess`, so a new installation's repos are in the DB when this is computed.

**Live proof (real OAuth, not the dev route).**
- The sign-in at 20:08:32 wrote `user_installations.admin = 1`.
- It also wrote 4 `user_repositories` rows, all with admin. The dev route writes none.
- The dashboard then saved org rules at 20:08:56. `PATCH /api/installations/:id` returns 403 unless the installation is in `adminInstallationIds`.
- The next review, acme-billing#2 at 20:09:21, produced two `rules`-category findings:
  - "Refund amount stored as Float violates money rule"
  - "Refund schema uses float for money"
- The repo rules are empty, and `context.ts:21` adds the "Team rules … category `rules`" section only when rules exist. So the org rule reached the reviewer, and AC-13 works end to end.

**Remaining.** See N5 in the re-check section (the admin definition and access frozen at sign-in).

The original analysis is kept for the record:
- **Where.** `auth.ts:50-54` decided org admin with `GET /user/memberships/orgs/{org}`.
  - GitHub lists that endpoint under *Organization permissions for "Members"* for user access tokens.
  - The installed App (`pr-guard-beta`) has no `members` permission.
  - The call therefore failed, `.catch(() => null)` swallowed it, and every org user got `admin: false`.
- **Why it was missed.** The dev sign-in hardcodes `admin: true`, and the stack logged 0 `signed in` events at the time.
- **Constraint.** The spec's "Does not change" keeps the App's permissions as configured. The fix honours it.

### Warnings

- **N1 (AC-8): FIXED in `5a90cec` for the push path** (`events.ts:52-53`). The same symptom remains on reopen or ready-for-review; see N6.
  - Original: when B's own webhook arrived after a takeover review of B had published, review B created a new in-progress check run on B, found `lastReviewedSha === headSha`, and completed it "No new changes" `success`. That replaced "N findings · 1 high" (`neutral`).
- **N2 (EC-11): FIXED in `5a90cec`** (`lifecycle.ts:86-88`).
  - Original: a takeover that failed had no check run to close. In the original B1 ordering, B's only check run read "Superseded" for good.
  - A cancelled takeover still creates no run, which is intended.
- **N3: FIXED in `5a90cec`**, with the residual stale `pull_requests` row described in the N3 note.
  - Original:
    - A delayed webhook for an older head left 👀 on the PR.
    - The same payload overwrote `pull_requests.head_sha`.
    - A stale `closed` or `converted_to_draft` cancelled the live review.
- **N4 (EC-13): FIXED in `5a90cec`** (`run.ts:286-303`).
  - Original: when the summary failed and a chunk failed in the same review, the note mentioned only the summary.

## AC / EC spot-check (unchanged unless noted)

- **AC-1:** review 10 on acme-billing#2 was acknowledged at 20:09:23, 2 s after the webhook at 20:09:21.
- **AC-2, AC-8:** see #22 above. acme-billing#2 also shows "7 findings · 3 high" `neutral` with `details_url`, and 👀 was removed. N6 is a cosmetic residual on reopen.
- **AC-6:** the incremental heading on #22 reads `a37dd0a..f440011`.
- **AC-7:** the grep finds 0 hits on `5a90cec`.
- **AC-13:** VERIFIED on `5a90cec`, with a real sign-in, an org rules save and a `rules` finding on the next review. Repo rules still work for repo admins.
- **AC-17:** reviews 7 and 8 ran concurrently (19:51:17–19:51:39 and 19:51:21–19:51:42).
- **AC-18:** VERIFIED. The running job 9 was cancelled when B was enqueued, job 10 started, and A's check run was closed "Superseded".
- **AC-20:** the stack runs from `5a90cec`.
- **AC-21:** unchanged.
- **EC-2:** docs-only review 9 has note "Documentation only…". Lockfile-only is fixed (W4).
- **EC-9:** live, the redelivery was ignored.
- **EC-10, EC-11:** fixed per W11. Failed takeovers are now covered (N2).
- **EC-13:** the note now lists partial coverage alongside a failed summary (N4).
- **EC-14:** `scopeFor` filters to active installations and `listActive` repos.
- **Other AC/EC:** unchanged code paths. The previous report's evidence stands.
- **Does not change:**
  - `apps/web`: empty diff, PASS.
  - `main`: PASS.
  - App settings: PASS. The B2 fix needs no new permission.

## Next steps

1. Optional, before shipping to orgs with "selected repositories" installations: address N5.
   - Compute installation admin at request time from `user_repositories` against the current repo list, or apply the rule only for `repository_selection: "all"`.
   - Record the definition in GAPS.md.
2. Cosmetic items:
   - N6: skip `reopened` and `ready_for_review` for an already-reviewed head.
   - W2 residual: require each skipped line to match when widening, or stop at the first unmatched line.
3. Fix the docs (N7): the "(membership)" wording in GAPS.md, and "never delete lines silently" in SUMMARY.md.
4. Then run `/prguard-learn`, with these lessons:
   - B2: a permission-dependent API call whose failure is swallowed and fails closed, masked by a dev path that hardcodes the privileged answer. Verify privileged paths with the real flow.
   - B1: fixed by taking over the live head instead of trusting enqueue order.
