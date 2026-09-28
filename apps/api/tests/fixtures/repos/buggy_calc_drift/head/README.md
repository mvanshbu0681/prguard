# buggy_calc

A two-file storefront used as the proof-runner's fixture repo (spec §8 X12).

`base/` is the tree before PR #42, `head/` the tree after. PR #42 drops the
`rate is None` guard from `apply_discount`, so a repro that asserts the
documented no-op behaviour passes at base and raises `TypeError` at head —
the single combination §4.6 classifies as `proven`.
