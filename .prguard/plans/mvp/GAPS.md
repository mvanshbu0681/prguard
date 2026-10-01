# GAPS: PR Guard MVP

Running record of decisions, open gaps and learned facts from the autonomous build.

- **fact** Groq rejects JSON-schema output combined with tools (`json mode cannot be combined with tool/function calling`). Reviewers answer through a `submit_findings` tool; a forced final call covers loops that end without it.
- **fact** Groq intermittently rejects `toolChoice: "required"` with gpt-oss (`Tool choice is required, but model did not call a tool`). The loop uses `auto`; the forced final call guarantees an answer.
- **decision** The dashboard `package.json` and the root lockfile landed in slice 1 so npm workspaces install once (the dashboard agent never ran `npm install`). `contracts.ts` landed in slice 5, ahead of slice 13.
- **decision** `ROLE=all|api|worker` landed with the worker in slice 4, not slice 11.
- **fact** Two jobs for the same PR could run at once. The claim query now skips any queued job whose key already has a running job, so a PR's reviews run in order and a push after a finished review is reviewed incrementally.
- **decision** A cancellation requested while a review is already publishing does not stop it; the review completes and the next one runs incrementally.
- **decision** Incremental reviews render only windows of ±6 lines around the new lines, and keep only findings that touch a new line. Repeats are matched by fingerprint, by title similarity, or by same file + nearby line + same category.
- **decision** Model suggestions that repeat the lines right after the cited range are widened to cover them, so "Commit suggestion" produces correct code; a suggestion identical to the current code is dropped.
- **decision** The general reviewer runs at most 4 tool steps: every step resends the diff, and 6 steps cost ~150K tokens on a 45K-character PR. Budget estimates are `(chunk tokens + 2.5K) × steps`, reserved while a chunk is in flight.
- **fact** A crash between posting a review to GitHub and saving its id caused a double post on retry. The review id is now saved right after posting, and a retried job first looks for a bot review whose body links to this review before posting.
- **gap** The 422 fallback (GitHub rejecting a line comment, retried with everything in the body) is implemented but was not triggered live: every anchored line was accepted.
- **gap** AC-16 (switching a role to `google:<model>`) is wired through `@ai-sdk/google` but not exercised: no Gemini key.
- **decision** The dedupe rule treats two findings on overlapping lines as one when they share a category, two title words, or a title similarity ≥ 0.34. It merges reviewer names (`general+security`).
- **decision** The dashboard was built by a parallel agent in one go; slices 14–20 were committed by path, and the repo detail page was staged panel by panel (brief, then rules, then reviewers) so each commit builds.
- **fact** TanStack Query pauses interval polling in an unfocused tab, which left "Scanning" on screen after a rescan finished. `refetchIntervalInBackground` is on; polling only runs while something is active.
- **decision** Reviews where no reviewer ran (docs only, nothing reviewable, reviewers switched off) say so and do not claim "No issues found"; their check run reads "Summary posted".
- **fact** The GitHub App JWT client cannot call `GET /users/{login}`; the dev sign-in uses an installation client.
- **decision** `docker-compose.yml` runs the API with `NODE_ENV=production` by default; `API_NODE_ENV=development DEV_LOGIN=1 docker compose up` enables the dev sign-in for browser automation.
- **gap** A manual re-run of an already-reviewed PR drops findings that were already posted, so it often reports "No new issues since the last review."
- **gap** Recovery after a crash can reprocess a job; publishing is guarded, but LLM calls of the interrupted attempt are spent twice.

## After the first verification (BLOCKED on B1)

- **fact** B1: webhooks for two quick pushes can be handled out of order, and "last enqueued = newest" was wrong. A review that finds the PR has moved on now takes over the live head unless another open review covers it (or it was already reviewed). A takeover creates its check run only when it publishes, because a pre-created one could outlive it and show "Superseded" on the newest commit. Re-checked live: two pushes about a second apart leave the newest commit reviewed with a single check run. A redelivered webhook is deduplicated by its delivery id, so the stale-event path (a late webhook for an older head) is covered by code trace, not by a live run.
- **fact** B2 (found by the second verification): deciding org admin through `GET /user/memberships/orgs/{org}` needs the App's Members permission, which it does not have; the failure was swallowed and nobody could save org rules, hidden by the dev sign-in that grants admin. Admin is now derived from repository permissions (the account owner, or admin on every repo of an installation that covers all repositories) and was checked with a real GitHub sign-in.
- **decision** Late or repeated `synchronize` events for a head that is already reviewed or being reviewed are ignored; late `closed`/`converted_to_draft` events are checked against the live PR before cancelling.
- **decision** Suggestions: indentation is restored from the replaced line, a suggestion that shrinks a range must be a pure deletion, and ranges widen only on meaningful lines. Checked live on a fresh refunds PR: all five suggestions commit to valid code.
- **gap** Only one GitHub account was available, so the non-admin collaborator view (per-repo access, disabled controls) is covered by code and the dev route, not by a second real account.
- **decision** Access is per repository: sign-in records the repos GitHub lists for the user and whether they are repo admin/maintain; installation admins (the account owner, or admin on every repo of an all-repositories installation) see every repo of the installation. Only admins change settings; the UI disables controls for others. Access still refreshes only at sign-in (sessions now last 7 days).
- **decision** Installs start at `/api/auth/install` with an OAuth `state`; a callback without our state never signs anyone in (installs started on github.com are recorded by webhook, and the user signs in normally).
- **decision** A failed summary no longer fails the review; reviews that cannot run are closed as failed on GitHub (including jobs abandoned by a dead worker); leftover model calls are aborted when a review ends; the budget counts per attempt.
- **decision** Suggestions that rewrite lines past their cited range are widened when those lines are in the same hunk, otherwise dropped; dedupe no longer merges by category alone or by fingerprint far apart.
- **gap** W1 (Gemini unverified, no key) and W10 (re-run hides already-posted findings) remain as noted above. The summary call is bounded by its own diff budget but is not counted against the review budget before it runs.
