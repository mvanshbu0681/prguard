# SUMMARY: Deep review

All 37 slices in [tasks.md](tasks.md) are built on `manaskhandelwal/deep-review` (cut from
`manaskhandelwal/staging-work`). Every slice was checked with `tsc --noEmit`; live runs against the
`prguard-sandbox` org happened at stage boundaries and at the end (real webhooks through smee, real
Groq and Socket calls, real GitHub reviews). No tests were written.

## What exists now

- **Engine** (`apps/api/src/review`): triage (`triage.ts`), impact analysis (`impact.ts`), per-reviewer
  routing and chunking (`engine.ts`), rule-based checks beside the models, verification
  (`verify.ts`), learnings suppression, caps after verification, risk (`risk.ts`) and priority
  (`priority.ts`, re-ranked on label changes by `rank.ts`), fix tracking (`tracking.ts`), and a trace
  of every step (`trace.ts`).
- **Plugins**: 10 model reviewers (Bug, Security, Reliability, Breaking change, Performance, Data, AI
  slop, Team rules, Docs drift, Test gap) and 2 checks (Secrets, Supply chain through the Socket
  SDK), each one file, each toggleable per repository.
- **GitHub output**: image badges from `prguard-sandbox/prguard-assets@v1` (199 PNGs, text fallback),
  line comments with evidence, extras and a prompt for AI agents, review bodies with priority, risk,
  counts, a findings table, key changes, a Mermaid change-flow diagram and buttons into the
  dashboard; code in backticks everywhere; secrets redacted from anything a model writes.
- **In the PR**: `@prguard help | review | explain | fix | ignore | <question>`; learnings from
  `ignore`, 👎 and replies saying the code is intentional; fixed findings collapsed with a Fixed badge
  and counted in the check run ("3 open · 1 high · 2 fixed").
- **Dashboard**: Queue (P0 to P3 columns, Waiting), Insights (reviews, median time, tokens, per
  reviewer fixed/dismissed/open, severity, verification), review trace, finding cards with
  verification, status, evidence, copy prompt and comment link, Learnings panel, priority and risk on
  reviews with a priority filter, badge palette shared with GitHub.

## Spec ids closed

| Slice | Ids | Evidence |
|---|---|---|
| 1 to 5 | AC-19 to AC-23, EC-20, EC-22, EC-24 | acme-billing#3: badges, table, diagram, backticks on GitHub |
| 6 | AC-15, EC-26 | acme-billing#6: `print` finding carries the Team rules badge; merged findings show two badges |
| 7 to 13 | AC-8 to AC-14 | acme-billing#6 (ownership), acme-store#11 (swallowed error), #8 (N+1), acme-billing#4 (data), acme-store#7 (slop, docs, test gap) |
| 14 to 16 | AC-1, AC-2, EC-1, EC-2 | triage and impact recorded on every review; acme-store#8 Breaking change names `src/routes/orders.ts` |
| 17 | AC-3, AC-4, EC-3 | verified findings carry evidence; rejections cite code; all 5 refunds bugs posted |
| 18 | AC-5, EC-4 | acme-billing#4: Critical secret on its line, value nowhere; placeholder key not flagged |
| 19 | AC-6, AC-7, EC-5 to EC-8 | acme-store#9 (2 npm malware), acme-billing#5 (`requests` CVEs), acme-gateway#1 (Go malware) |
| 20 | AC-16, AC-41 | 12 plugins in the Reviewers panel; dashboard hues match the badges |
| 21, 22 | AC-17, AC-18, AC-36, EC-21, EC-23 | risk and priority on every review; acme-store#10 P0 from `hotfix` |
| 23, 24 | AC-24, AC-33, AC-34, EC-15 to EC-17 | see "Fix tracking" below |
| 25 to 31 | AC-25 to AC-32, AC-40, EC-9 to EC-14, EC-18, EC-19, EC-25 | commands on acme-billing#6; learnings in the repo panel |
| 32 to 35 | AC-35, AC-37 to AC-39 | Queue, Insights, review page checked in Chrome |
| 36 | AC-42 | acme-gateway#2 (Go) 4 of 4, acme-ledger#1 (Java) 3 of 4 planted bugs |
| 37 | AC-43 | see "Docker" below |

## Fix tracking and commands (acme-billing#6, local run)

- `@prguard help` answered in 4 s; `explain` and a question answered with `path:line` citations in
  about 9 s; `fix` replied with a clean suggestion; `ignore` saved a learning, replied with the
  Learning saved badge and collapsed the comment; `explain` outside a thread got the usage reply; a
  plain "this is on purpose" reply saved a learning; "thanks!" got no reply.
- A 👎 on one comment, then a push that fixed the ownership check and edited (without fixing) the
  swallowed error: the ownership comment gained the Fixed badge and collapsed, the swallowed error
  stayed open, the 👎 finding was dismissed with a learning, and the check run read
  "10 open · 1 critical · 1 fixed" (`since` = 1 fixed, 2 new, 10 open).
- `@prguard review` on acme-gateway#2: 👀 after 4.3 s, a full review started at 8 s.

## Docker (clean volume)

`API_NODE_ENV=development DEV_LOGIN=1 docker compose -p prguard-deep up --build -d` on a new volume:
briefs for all 7 sandbox repos (including the new Go and Java ones) at boot; a fresh refunds PR
(acme-billing#7) got P1, High risk and all 5 planted bugs; a fresh deps PR (acme-store#12) got both
malware packages as Critical and P0 (Socket through the container's env); `explain` replied in 5 s;
a fix push was marked Fixed in 17 s. Dashboard (production build): Repositories, repo page with
Learnings (a manual learning added and deleted) and all 12 plugins, Queue, Insights and the review
page checked in Chrome.

## Deviations from the plan

See [GAPS.md](GAPS.md). The main ones: the reviewer loop moved to `engine.ts`; caps run after
verification; triage only prunes reviewers on low-risk files (six core reviewers always run on other
source files, Breaking change is routed by impact, Docs drift by new config surface); check findings
never merge with each other; slices 23, 25 and 32 to 35 landed as an API commit and a dashboard
commit because a parallel agent built the dashboard views.
