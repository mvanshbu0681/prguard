# GAPS: Deep review

Running record of decisions, open gaps and learned facts from the autonomous build.

- **decision** The run rule says not to run tests or code. Each slice is checked with `tsc --noEmit`
  only; live runs against the sandbox happen at stage boundaries and at the end, as in the MVP run.
- **decision** Before triage and the other engine steps landed in `run.ts`, the reviewer loop moved to
  `review/engine.ts` (per-reviewer file sets and chunks), so `run.ts` stays the orchestration only.
- **decision** The line caps (`place()`) now run after verification, so a rejected finding frees its slot.
- **decision** Model-written text (titles, bodies, evidence, suggestions, summary) passes through
  `redactSecrets` before it is posted or stored, so a reviewer quoting a secret cannot leak it (AC-5).
- **fact** The local `data/prguard.db` predated the single `0000_init` migration and failed to migrate;
  it was moved to `data/old-mvp/` and the API started on a fresh database (briefs rebuilt at boot).
- **fact** Stage 3 checkpoint, F1 (`acme-billing#3`): 24 s, 4 files, triage 585 ms, 7 reviewers, 22 raw
  findings, 7 posted, 6 verified, 1 rejected; all 5 planted bugs posted (AC-4); 142K tokens, 19 calls.
- **decision** From that run: a rejection now needs an 8+ word sentence citing code (one was rejected
  on a bare `app/models.py:82`), and findings on overlapping lines that share a non-generic title word
  merge (the ownership bug was posted twice, by Security and Team rules).
- **fact** Groq still intermittently rejects the forced final tool call ("Tool choice is required");
  the existing retry covers it at the cost of one extra call.
- **decision** To build in parallel, the remaining dashboard work (finding cards, trace, Queue, Insights,
  Learnings panel, nav) went to one agent working only in `apps/dashboard` against contract types
  committed first (`954b6a2`), while the backend slices continued. So slices 23, 25 and 32 to 35 landed
  as an API commit plus a dashboard commit instead of one commit each.
- **fact** Stage 4 to 6 checkpoint (acme-store#4 to #6, acme-billing#4): F5 flagged the secret (never
  echoed), the NOT NULL column, the dropped column and float money; F6 flagged `toga-ai` as malware.
  Triage hurt recall: it skipped AI slop and Docs drift on F3, and sent Performance and Breaking
  change to the wrong files on F4.
- **decision** Triage now only prunes reviewers on low-risk files: Bug, Team rules, Security,
  Reliability, AI slop and Performance always run on other source files; Docs drift is forced on
  files that add env vars, flags or routes; Breaking change goes exactly to the files that define a
  symbol with callers outside the PR (from impact analysis). Triage still sets risk and decides
  Test gap.
- **fact** Dedupe merged `toga-ai` and `@whalent/agent` (adjacent lines, both "known malware"), so one
  malware package was never posted. Two findings from checks now merge only when identical.
- **decision** Security no longer reports new dependencies (the Supply chain check does), and Test gap
  titles read "No test covers <behavior>" so it stops reporting bugs.
- **fact** Re-run after the triage change: F3 (acme-store#7) posted AI slop on the placeholder
  `return true` and the `formatCents` duplicate, Test gap "No test covers redeem error handling", and
  Docs drift on `GIFT_CARD_PROVIDER_URL` (anchored on `README.md`, so it went to the review body);
  F4 (acme-store#8) posted the N+1 query and a Breaking change finding naming `src/routes/orders.ts`
  (body, since that file is not in the diff); F6 posted both npm malware packages, the Go malware
  module and the `requests` CVEs; F7 (Go) 4 of 4 planted bugs; F8 (Java) 3 of 4 (missed
  `BigDecimal.equals`); F9 ranked P0 from its `hotfix` label; F2 posted the swallowed error, under
  the Security badge rather than Reliability.
- **decision** Docs drift no longer applies to dependency manifests (it attached itself to Socket
  findings), and every reviewer is told never to post a finding that says nothing is wrong (Docs
  drift posted "No new environment variables needed").
- **decision** Dedupe treats plural and singular title words as one and merges near-identical titles
  anywhere in a file (the float-money issue was posted three times on the refunds PR).
- **fact** Team rules copied the diff's `82 | ` prefix into a suggestion; committing it would break
  the file. Suggestions (and `@prguard fix`) now drop that prefix when every line carries it.
- **fact** Commands on acme-billing#6: `help` in 4 s, `explain` and a question answered with
  `path:line` citations, `fix` a clean suggestion, `ignore` saved a learning and collapsed the comment,
  `explain` outside a thread got the usage reply, a plain "this is on purpose" reply saved a learning.
- **gap** The Grammarly browser extension triggers a Next.js hydration warning in dev (attributes it
  adds to `<body>`); not an app bug.
- **fact** The session's app worktree moved to `frontend-build-module-error-a40f13`; work continues in
  `staging-work` on branch `manaskhandelwal/deep-review`, cut from `manaskhandelwal/staging-work`.
- **fact** Verification (first pass) was BLOCKED on three items: a secret line stored as a finding
  snippet, Test gap posting without "Suggested tests", and Reliability missing the swallowed error.
- **decision** The Secrets check returns the exact values it found; they are scrubbed from every
  field a model writes or PR Guard stores (titles, bodies, evidence, suggestions, details, summary,
  flow, priority reason, trace, tool arguments, learning text). Check findings store no snippet;
  migration `0012` clears old ones.
- **decision** A Test gap finding without "Suggested tests" gets them from one fast call, and Test
  gap and Docs drift findings never merge into another reviewer's finding.
- **decision** Learnings come only from people with write access (`ignore`, intentional replies, 👎);
  a hand-written learning suppresses by its words within its path.
- **decision** Fix detection also looks at the code: a finding whose saved lines changed (or whose
  comment is gone) is checked even when GitHub does not mark its thread outdated. Repeats of an open
  finding are matched anywhere in the file, so the same bug is not posted twice.
- **fact** The honest verification trace exposed a Groq limit: a forced answer call that names one
  tool rejects the model's stray search calls. The forced call now lists every tool (searches reply
  "answer now") with a required tool choice, and a JSON-mode call is the last resort.
- **fact** Re-runs on Docker (2026-10-01): F2 Reliability owns the swallowed error; F3 Test gap
  posted with suggested tests (one later run produced no Test gap finding at all: model variance);
  F5 Secrets finding has no snippet and the secret value is in no table; an `ignore` learning
  suppressed the same finding on a fresh F2 PR; a fix push marked the swallowed error Fixed in 22 s
  and it was not re-posted.
- **decision** Dedupe no longer merges findings in one file because they share a word from the file's
  own name (`refund` in `refunds.py`): that merged five reviewers' findings into one `print` finding.
  The Bug reviewer now looks for state set by a float comparison and limits that can be exceeded.
- **fact** Verification (second pass) was BLOCKED on one item: reviewers still lost answers because
  the JSON-mode fallback sent optional keys, which Groq rejects. Fixed: the fallback sends every key
  as required and nullable and tells the model tools are gone; a verdict with null evidence no longer
  fails its group. In reviews 21 to 29 (Docker, each built from the commit current at the time; only
  27 to 29 had every fix) no reviewer lost its answer (trace `failed` is 0 for every reviewer in all
  nine), checked with a query over `reviews.trace` and `llm_calls`.
- **decision** Test gap joined the core reviewers (it still needs tests in the repository): triage
  had left it out of F3. It posted with "Suggested tests" on reviews 22, 23 and 24.
- **fact** Review 26 dropped the F2 swallowed error on a "rejection" that only quoted the code back.
  A rejection now needs 8 words of prose besides the code it quotes; reviews 27 and 29 posted it.
- **fact** Groq's limit for `gpt-oss-120b` is 250K tokens per minute. Three ~200K-token reviews at
  once exhausted it: reviews 28 and 29 posted most findings unverified. Fixed (`085501a`): at most
  `REVIEW_CONCURRENCY` (2) reviews run at once and later PRs wait in the queue with a "Queued" check;
  every model call reserves its estimated tokens in a per-model one-minute window
  (`LLM_TOKENS_PER_MINUTE`, 200K) and waits for room; a 429 waits for Groq's reset and tries again.
  Burst check (reviews 30 to 33, four PRs opened at once on the latest code): two started at once,
  the other two showed "Queued" for about 200 s and then ran; 95 model calls, 0 rate-limit errors,
  no verification group failed, no reviewer lost its answer.
- **gap** AC-4 holds only in part. F1 posted 4, 4, 5 and 3 of the 5 planted bugs (reviews 20, 21,
  25, 28); ownership, float money and the swallowed error are posted every time, the over-refund
  race and the float-equality status come and go with `gpt-oss-120b`. The spec keeps the current
  models.
- **fact** Verification (third pass) was BLOCKED on review 28: the float-equality status bug was
  rejected on code that does not exist in the repository. A rejection now needs every quote to be
  real (in the code shown or at a cited `path:line`, and every citation must exist) and at least
  one quote from outside the flagged lines (`f9210f3`). The third pass also flagged the Railway
  config against the spec's "Does not change"; the spec now records it as the user's request.
- **decision** Learnings from `ignore`, replies and 👎 need write access; spec AC-29 to AC-31 and the
  Access row now say so.
- **fact** Verification (fourth pass) was BLOCKED: the third pass's rule treated a backticked
  `path:line` citation as a code quote, so no rejection could hold (reviews 30 to 36 rejected 0, and
  `utcnow`, synchronous `findById` and "missing comma" false positives were posted). Fixed
  (`9dded49`, `3a851a7`): citations are citations, a citation outside the flagged lines that holds a
  quote counts as counter-evidence, and the reason needs 4 words of its own instead of 8. Replayed
  on the 12 stored rejections (snapshots copied from the container): the 9 correct ones reject,
  review 26 (flagged code quoted back) and review 28 (invented code) stay unsure, and review 7 stays
  unsure because its multi-line quote does not match the file exactly. Live, review 40 (F5) rejected
  the `utcnow` false positive with a grounded reason. The trace now also keeps rejections that did
  not hold up (`unsure`, `6cc5354`), with the finding's line.
- **fact** F1 tally including later runs: 4, 4, 5, 3, 4, 4, 3 of 5 (reviews 20, 21, 25, 28, 30,
  34, 38). Ownership, float money and the swallowed error post every time.
- **fact** Not every run on the fourth-pass rule rejected: reviews 36 and 39 still posted the
  `utcnow` false positive as Critical, and reviews 37 to 39 rejected nothing; only review 40 did.
- **decision** Fifth pass (PASSED-WITH-WARNINGS) found two loopholes, fixed in `d13dc55`: a dotted
  name (`RefundCreate.amount`) no longer passes as a citation, a citation within three lines of the
  flagged code no longer counts as evidence from elsewhere, and a single word (`int`) counts only
  where a citation pins it down. AI slop's prompt leaves committed keys to the Secrets check. Also
  `dfaf48e`: token usage counts from when a call finishes, a cancelled review leaves the call line,
  and Test gap titles keep identifier case. Replayed on 17 cases (12 stored rejections, review 40,
  4 adversarial variants): all as expected.
- **fact** Final runs on `d13dc55` (reviews 41 to 44): F5 rejected the `utcnow` false positive on
  both runs (42, 44) with grounded reasons; F2 rejected a false "named-parameter mismatch" (43) and
  kept one thin rejection as unsure (41); the swallowed error posted on both F2 runs; no reviewer
  lost its answer; the real F5 secret is in no stored row. AI slop still reported the planted
  placeholder key once (finding 324) despite the new prompt line.

## Open items (need the user's call or a later pass)

- **AC-4 partial** (above): the over-refund race and the float-equality status come and go.
- **Test gap variance:** on some F3 runs it posts nothing (review 32); when it posts, it carries
  "Suggested tests" (reviews 22, 23, 24, 37).
- **AC-12:** the `formatCents` duplicate is reported on some F3 runs only (23, 37 missed it).
- **AC-15:** Bug, Security and AI slop still report the `print` and `console.log` rule lines; they
  merge into the Team rules finding, which shows its badge first.
- **AC-23:** a code span nested inside another breaks evidence formatting (finding 251).
- **AC-32:** suppression depends on how the model words the title (suppressed on 27 and 31, posted
  on 26 and 29).
- **AC-34:** fix detection by comparing code was shown once (review 8); not re-run since.
- **Shared token budget:** `@prguard` replies wait in the same per-model window as reviews, so in a
  burst a reply can take about a minute; reviews in a burst take longer but none fail.
- **AC-5 residual:** exact secret values are scrubbed when they are on added lines of the PR; a
  secret the model reads through its file tools, or quotes in a command reply, is caught by pattern
  only.
- **EC-4 adjacent:** AI slop reported the planted placeholder key on F5 (finding 308, "Hard-coded
  partner API key"); the Secrets check correctly ignores it. The real secret is in no stored row.
