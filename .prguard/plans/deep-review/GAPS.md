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
