# buggy_calc_disproven

The same storefront, but the PR under review refactors the `None` guard into
`normalise_rate()` instead of deleting it. A specialist that claims
"`apply_discount` raises `TypeError` when `rate` is `None`" is **wrong here**,
and the generated repro proves it by passing at head as well as base.

Base pass + head pass ⇒ `disproven` (§4.6, spec §7 E12, AC-11): the finding is
clamped to `info`, never posted inline, and counted in
`/v1/accuracy.self_caught_false_positive_rate`.
