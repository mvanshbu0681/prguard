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
- **fact** The session's app worktree moved to `frontend-build-module-error-a40f13`; work continues in
  `staging-work` on branch `manaskhandelwal/deep-review`, cut from `manaskhandelwal/staging-work`.
