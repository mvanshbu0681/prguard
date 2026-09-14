"""Runs the corpus self-check as part of the ordinary suite.

`python3 tests/fixtures/verify_corpus.py` is this track's VERIFY subset, but a fixture is
only useful if the builder who breaks it finds out immediately. Half a second of `pytest`
buys that: edit a patch, a line number or an expectation inconsistently and your own test
run says so, instead of integration finding it later.

The script itself stays stdlib-only and independently runnable — this is a caller, not a
reimplementation.
"""

from tests.fixtures import verify_corpus


def test_fixture_corpus_is_intact() -> None:
    assert verify_corpus.main() == 0, (
        "the offline fixture corpus is inconsistent — run "
        "`python3 tests/fixtures/verify_corpus.py` for the full report"
    )


def test_only_one_path_yields_proven() -> None:
    """The §4.6 invariant, asserted against the corpus's own classifier.

    T5 owns the real `proof/runner.classify`. This guards the *fixture* copy, so the
    expectation table in `expectations/proof_matrix.json` is never validated by a rule that
    has itself drifted.
    """
    bases = ["pass", "fail", "not_applicable"]
    heads = ["pass", "fail", "timeout", "error"]
    proven = [
        (base, head, signal, deps)
        for base in bases
        for head in heads
        for signal in (True, False)
        for deps in (True, False)
        if verify_corpus.classify(base, head, signal, deps) == "proven"
    ]
    assert proven == [
        ("pass", "fail", True, True),
        ("not_applicable", "fail", True, True),
    ], f"unexpected paths to `proven`: {proven}"
