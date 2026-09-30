# GAPS: Deep review

Running record of decisions, open gaps and learned facts from the autonomous build.

- **decision** The run rule says not to run tests or code. Each slice is checked with `tsc --noEmit`
  only; live runs against the sandbox happen at stage boundaries and at the end, as in the MVP run.
- **fact** The session's app worktree moved to `frontend-build-module-error-a40f13`; work continues in
  `staging-work` on branch `manaskhandelwal/deep-review`, cut from `manaskhandelwal/staging-work`.
