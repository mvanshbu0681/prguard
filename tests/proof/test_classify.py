"""The §4.6 classification table, exhaustively — plan §8 Cluster B.

This file is the guard on the product's entire claim: *a finding with a red test attached
cannot be a false positive*. That holds only while ``proven`` is unreachable except by the one
documented path, so the table is enumerated here in full (400 combinations) rather than
sampled, and the ``proven`` rows are written out by hand and compared as a set.

Seven of spec §7's edge cases collapse into this one table — E7, E8, E10, E11, E12, E13, E14 —
so they are asserted here, against the shapes ``tests/fixtures/expectations/proof_matrix.json``
already pinned, before a single process is spawned.

If a change makes one of these fail, the change is wrong. There is no version of this product
in which a bad repro is allowed to read `proven`.
"""

from __future__ import annotations

import itertools

import pytest

from prguard.core.proof.runner import (
    PROOF_CONFIDENCE,
    RunState,
    classify,
    classify_outcome,
    proof_confidence,
    run_state,
)
from prguard.core.types import ProofOutcomeKind, ProofStatus, RunResult
from tests.fixtures.loader import proof_matrix

SIGNAL = "TypeError"

#: base state, head state, signal present, deps ok, require baseline, base applicable.
Combination = tuple["RunState", "RunState", bool, bool, bool, bool]

#: Every base/head state the runner can observe. ``not_run`` is "no process was started".
ALL_STATES: tuple[RunState, ...] = ("pass", "fail", "timeout", "error", "not_run")

#: Corpus vocabulary → the §5.1 ``proof_artifacts.outcome`` enum that is actually persisted.
#: The corpus names the *reason* precisely; the column has six values, so several reasons share
#: ``error``. ``classify_outcome`` therefore returns both.
CORPUS_OUTCOME_TO_ENUM: dict[str, ProofOutcomeKind] = {
    "failed_as_predicted": "failing_as_expected",
    "passed_unexpectedly": "passed_unexpectedly",
    "pre_existing_failure": "pre_existing_failure",
    "timeout": "timeout",
    "skipped_no_env": "skipped_no_env",
    "baseline_failed": "error",
    "collection_error": "error",
    "deps_install_failed": "error",
}


def result_for(state: RunState, *, signal_present: bool = False) -> RunResult | None:
    """A ``RunResult`` that a real sandbox would produce for ``state``.

    The table is driven through ``classify`` with real result objects rather than through the
    state vocabulary directly, so exit-code interpretation is inside the guard and not beside
    it.
    """
    body = f"E   {SIGNAL}: unsupported operand type(s)\n" if signal_present else "E   oh dear\n"
    if state == "not_run":
        return None
    if state == "pass":
        return RunResult(exit_code=0, stdout="1 passed in 0.01s\n")
    if state == "fail":
        return RunResult(exit_code=1, stdout=body + "1 failed in 0.01s\n")
    if state == "timeout":
        return RunResult(exit_code=124, stdout=body, timed_out=True)
    return RunResult(exit_code=2, stdout="ERROR collecting .prguard_proof/test_x.py\n" + body)


def every_combination() -> list[Combination]:
    """base × head × signal × deps_ok × require_baseline × base_applicable — all 400 of them."""
    flags = (True, False)
    return list(itertools.product(ALL_STATES, ALL_STATES, flags, flags, flags, flags))


#: Enumerated once; every table test walks the same list so none of them can drift to a subset.
COMBINATIONS: list[Combination] = every_combination()


def baseline_is_clean(base: RunState, *, require_baseline: bool, base_applicable: bool) -> bool:
    """The only two baselines §4.6 accepts: it ran and passed, or there was none to run.

    Written out independently of the implementation — if this and ``runner.py`` ever disagree,
    the test is the one that is right, because this is the sentence the spec actually contains.
    """
    if base == "pass":
        return True
    if base != "not_run":
        return False
    return not base_applicable or not require_baseline


# ---------------------------------------------------------------------------------------
# The guard
# ---------------------------------------------------------------------------------------


def test_only_one_path_yields_proven() -> None:
    """`proven` iff baseline clean AND head failed AND signal present AND deps installed.

    Plan §8 Cluster B, restated as an equality between two sets rather than a sample: the
    combinations that actually return ``proven`` must be exactly the combinations the rule
    admits. Anything else — a new state, a reordered branch, a stray `or` — breaks this.
    """
    observed: set[Combination] = set()
    admitted: set[Combination] = set()

    for base, head, signal_present, deps_ok, require_baseline, base_applicable in COMBINATIONS:
        status = classify(
            result_for(base),
            result_for(head, signal_present=signal_present),
            SIGNAL,
            deps_ok,
            require_baseline=require_baseline,
            base_applicable=base_applicable,
        )
        combination = (base, head, signal_present, deps_ok, require_baseline, base_applicable)
        if status == "proven":
            observed.add(combination)
        if (
            head == "fail"
            and signal_present
            and deps_ok
            and baseline_is_clean(
                base, require_baseline=require_baseline, base_applicable=base_applicable
            )
        ):
            admitted.add(combination)

    assert observed == admitted
    assert len(admitted) == 7, "4 base-passed rows + 3 no-baseline-required rows"


def test_every_combination_returns_a_known_status() -> None:
    """No combination, however absurd, raises or invents a status outside the §4.6 vocabulary."""
    allowed: set[ProofStatus] = {"proven", "disproven", "inconclusive", "not_attempted"}
    for base, head, signal_present, deps_ok, require_baseline, base_applicable in COMBINATIONS:
        status = classify(
            result_for(base),
            result_for(head, signal_present=signal_present),
            SIGNAL,
            deps_ok,
            require_baseline=require_baseline,
            base_applicable=base_applicable,
        )
        assert status in allowed, (base, head, signal_present, deps_ok)


def test_a_failed_install_can_never_prove_anything() -> None:
    """E10: every input matches the `proven` row except ``deps_ok`` — and it is still advisory.

    The corpus keeps this as ``inconclusive_dependency_install_failed`` precisely because the
    conjunct is easy to drop and impossible to notice once dropped.
    """
    for require_baseline, base_applicable in itertools.product((True, False), repeat=2):
        status = classify(
            result_for("pass"),
            result_for("fail", signal_present=True),
            SIGNAL,
            False,
            require_baseline=require_baseline,
            base_applicable=base_applicable,
        )
        assert status == "inconclusive"


def test_missing_signal_is_never_proven() -> None:
    """A head failure that does not carry the predicted signal proves nothing about the claim."""
    assert (
        classify(result_for("pass"), result_for("fail", signal_present=False), SIGNAL, True)
        == "inconclusive"
    )


@pytest.mark.parametrize("signal", ["", "   ", "typeerror"])
def test_an_unusable_signal_is_never_proven(signal: str) -> None:
    """An empty, blank or wrongly-cased signal cannot match: exception names are case-sensitive."""
    assert (
        classify(result_for("pass"), result_for("fail", signal_present=True), signal, True)
        == "inconclusive"
    )


def test_the_signal_is_looked_for_in_the_head_output_only() -> None:
    """A signal present at base but absent at head is not evidence — it is the opposite."""
    base = RunResult(exit_code=0, stdout=f"{SIGNAL} mentioned harmlessly here\n")
    head = RunResult(exit_code=1, stdout="AssertionError: 100.0 != 90.0\n")
    assert classify(base, head, SIGNAL, True) == "inconclusive"


def test_signal_found_on_stderr_counts() -> None:
    """pytest writes to stdout, a bare interpreter to stderr; both are the head's output."""
    head = RunResult(exit_code=1, stdout="", stderr=f"{SIGNAL}: bad operand\n")
    assert classify(result_for("pass"), head, SIGNAL, True) == "proven"


def test_an_observed_baseline_failure_outranks_base_applicable() -> None:
    """A baseline that really ran and really failed wins over any claim that it was moot.

    ``base_applicable=False`` says "the file is new, there was nothing to run". If a baseline
    result exists anyway the caller contradicted itself, and the safe reading of a contradiction
    is the one that cannot manufacture a proof.
    """
    status = classify(
        result_for("fail"),
        result_for("fail", signal_present=True),
        SIGNAL,
        True,
        base_applicable=False,
    )
    assert status == "inconclusive"


def test_require_baseline_is_what_makes_a_missing_baseline_fatal() -> None:
    """§4.6: with `PROOF_REQUIRE_BASELINE=true` (the default and the shipped config) a head-only
    run can never be `proven`; flipping it to false is the documented demo-latency escape hatch.
    """
    head = result_for("fail", signal_present=True)
    assert classify(None, head, SIGNAL, True, require_baseline=True) == "inconclusive"
    assert classify(None, head, SIGNAL, True, require_baseline=False) == "proven"


def test_nothing_executed_is_not_attempted() -> None:
    """E14: no sandbox ⇒ nothing ran ⇒ `not_attempted`, which is advisory, not a verdict."""
    assert classify(None, None, SIGNAL, True) == "not_attempted"
    assert classify(result_for("pass"), None, SIGNAL, True) == "not_attempted"


# ---------------------------------------------------------------------------------------
# The documented rows, one test each, named for the edge case they belong to
# ---------------------------------------------------------------------------------------


def test_base_passes_head_fails_with_signal_is_proven() -> None:
    assert (
        classify(result_for("pass"), result_for("fail", signal_present=True), SIGNAL, True)
        == "proven"
    )


def test_new_file_has_no_baseline_to_compare_and_can_still_prove() -> None:
    """§4.6 row 1's parenthetical: a file that did not exist at base ⇒ `not_applicable`."""
    status = classify(
        None,
        result_for("fail", signal_present=True),
        SIGNAL,
        True,
        base_applicable=False,
    )
    assert status == "proven"


def test_passing_at_both_refs_is_disproven() -> None:
    """E12: we checked and we were wrong."""
    assert classify(result_for("pass"), result_for("pass"), SIGNAL, True) == "disproven"


def test_failing_at_both_refs_is_inconclusive() -> None:
    """E13: red before the PR, red after it — not this PR's fault."""
    assert (
        classify(result_for("fail"), result_for("fail", signal_present=True), SIGNAL, True)
        == "inconclusive"
    )


def test_inverted_repro_is_inconclusive() -> None:
    """The adversarial shape: a repro that asserts the bug fails at base and passes at head.

    §4.6's table has no row for it, the corpus resolves it to `inconclusive`, and what matters
    is only that it is not `proven` — an implementation that reads this as a proof has inverted
    the product's claim.
    """
    assert classify(result_for("fail"), result_for("pass"), SIGNAL, True) == "inconclusive"


@pytest.mark.parametrize("head", ["timeout", "error"])
def test_timeout_and_collection_error_are_inconclusive(head: RunState) -> None:
    """E11 and E8: the sandbox failing to answer is not an answer."""
    status = classify(
        result_for("pass"), result_for(head, signal_present=True), SIGNAL, True
    )
    assert status == "inconclusive"


# ---------------------------------------------------------------------------------------
# Exit-code interpretation
# ---------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("exit_code", "expected"),
    [
        (0, "pass"),
        (1, "fail"),
        (2, "error"),
        (3, "error"),
        (4, "error"),
        (5, "error"),
        (-9, "error"),
        (127, "error"),
    ],
)
def test_pytest_exit_codes_map_to_states(exit_code: int, expected: RunState) -> None:
    """pytest reserves 0/1 for "ran and answered"; everything else means it never answered."""
    assert run_state(RunResult(exit_code=exit_code)) == expected


def test_a_timed_out_run_is_a_timeout_whatever_its_exit_code() -> None:
    assert run_state(RunResult(exit_code=0, timed_out=True)) == "timeout"


@pytest.mark.parametrize(
    "marker",
    [
        "ERROR collecting .prguard_proof/test_x.py",
        "!!!! Interrupted: 1 error during collection !!!!",
        "INTERNALERROR> Traceback",
        "ModuleNotFoundError: No module named 'requests'",
    ],
)
def test_collection_failures_are_errors_even_when_the_exit_code_says_failed(marker: str) -> None:
    """E8: an import that never resolved says nothing about the finding, so it cannot be a fail.

    Deliberately conservative — a PR that genuinely deletes an imported module is reported as
    `inconclusive` rather than `proven`. Proving less is the designed failure mode (R3); proving
    wrong is the one that is not survivable.
    """
    assert run_state(RunResult(exit_code=1, stdout=marker)) == "error"


def test_nothing_is_not_run() -> None:
    assert run_state(None) == "not_run"


# ---------------------------------------------------------------------------------------
# Outcome, baseline mode and the persisted reason
# ---------------------------------------------------------------------------------------


def test_outcome_status_always_comes_from_classify() -> None:
    """One decision function. ``classify_outcome`` decorates it; it never re-decides."""
    for base, head, signal_present, deps_ok, require_baseline, base_applicable in COMBINATIONS:
        base_result = result_for(base)
        head_result = result_for(head, signal_present=signal_present)
        verdict = classify_outcome(
            base_result,
            head_result,
            SIGNAL,
            deps_ok,
            require_baseline=require_baseline,
            base_applicable=base_applicable,
        )
        assert verdict.status == classify(
            base_result,
            head_result,
            SIGNAL,
            deps_ok,
            require_baseline=require_baseline,
            base_applicable=base_applicable,
        )


@pytest.mark.parametrize(
    ("base", "head", "signal_present", "deps_ok", "reason"),
    [
        ("pass", "fail", True, True, "failed_as_predicted"),
        ("pass", "pass", False, True, "passed_unexpectedly"),
        ("fail", "fail", True, True, "pre_existing_failure"),
        ("fail", "pass", False, True, "baseline_failed"),
        ("pass", "timeout", False, True, "timeout"),
        ("pass", "error", False, True, "collection_error"),
        ("pass", "fail", True, False, "deps_install_failed"),
        ("pass", "fail", False, True, "signal_absent"),
        ("not_run", "fail", True, True, "baseline_missing"),
        ("not_run", "not_run", False, True, "skipped_no_env"),
    ],
)
def test_reason_names_what_actually_happened(
    base: RunState, head: RunState, signal_present: bool, deps_ok: bool, reason: str
) -> None:
    """The reason string is the corpus vocabulary, so an artifact says *why*, not just *what*."""
    verdict = classify_outcome(
        result_for(base), result_for(head, signal_present=signal_present), SIGNAL, deps_ok
    )
    assert verdict.reason == reason


@pytest.mark.parametrize(
    ("base", "base_applicable", "require_baseline", "expected"),
    [
        ("pass", True, True, "compared"),
        ("fail", True, True, "compared"),
        ("not_run", False, True, "not_applicable"),
        ("not_run", True, False, "skipped"),
        ("not_run", True, True, "skipped"),
    ],
)
def test_baseline_mode_records_what_the_baseline_did(
    base: RunState, base_applicable: bool, require_baseline: bool, expected: str
) -> None:
    verdict = classify_outcome(
        result_for(base),
        result_for("fail", signal_present=True),
        SIGNAL,
        True,
        require_baseline=require_baseline,
        base_applicable=base_applicable,
    )
    assert verdict.baseline_mode == expected


def test_proof_confidence_is_the_documented_three_valued_input() -> None:
    """§4.4: 1.0 proven, 0.0 disproven, 0.5 for every shade of "we do not know"."""
    assert proof_confidence("proven") == 1.0
    assert proof_confidence("disproven") == 0.0
    for status in ("inconclusive", "not_attempted", "not_applicable", "skipped_no_env"):
        assert proof_confidence(status) == 0.5
    assert set(PROOF_CONFIDENCE) == {
        "proven",
        "disproven",
        "inconclusive",
        "not_attempted",
        "not_applicable",
        "skipped_no_env",
    }


# ---------------------------------------------------------------------------------------
# The corpus is the third opinion: T3 recorded these rows before this module existed
# ---------------------------------------------------------------------------------------


def test_every_recorded_corpus_case_classifies_as_recorded() -> None:
    """`tests/fixtures/expectations/proof_matrix.json` is the §4.6 table as data (plan §10 T3).

    It was derived from the spec independently of this implementation, so agreeing with it is
    evidence rather than tautology.
    """
    cases = proof_matrix()["cases"]
    assert len(cases) >= 9
    for case in cases:
        base_state = case["base_outcome"]
        head_state = case["head_outcome"]
        verdict = classify_outcome(
            result_for("not_run" if base_state == "not_applicable" else base_state),
            result_for(head_state, signal_present=case["signal_present"]),
            SIGNAL,
            case["deps_ok"],
            base_applicable=base_state != "not_applicable",
        )
        assert verdict.status == case["expected_proof_status"], case["id"]
        assert verdict.reason == case["expected_outcome"], case["id"]
        assert verdict.outcome == CORPUS_OUTCOME_TO_ENUM[case["expected_outcome"]], case["id"]


def test_the_corpus_contains_exactly_one_proven_row() -> None:
    """If a second one ever appears, someone widened the only claim this product makes."""
    cases = proof_matrix()["cases"]
    proven = [case for case in cases if case["expected_proof_status"] == "proven"]
    assert [case["id"] for case in proven] == ["proven_billing_none_rate"]
