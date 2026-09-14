"""S2 context hygiene: what the model is allowed to see (spec §4.1, §7 E5/E6/E9, AC-26).

Three obligations, and the third is the one people skip:

* **E9 exclusion.** Binary, generated, vendored and lockfile paths never reach a specialist and
  never produce a finding. Each exclusion is reported *with its reason*, because "we ignored
  7 files" without saying which is indistinguishable from a bug.
* **Deterministic compression.** A 47-file PR that will not fit in ``CONTEXT_TOKEN_BUDGET`` is
  reduced the same way every time: excluded classes first, then sensitivity desc, then change
  size asc, then each patch down to its largest hunks. Same input, same selection — including
  when GitHub hands the files back in a different order.
* **Saying so.** ``context_truncated`` and the omitted-file list are part of the result. Never
  silently review 3 of 40 files.

The exclusion sets are asserted from ``tests/fixtures/expectations/context_files.json``, which
is the corpus's own statement of what E9 means, rather than from a list re-typed here.
"""

from __future__ import annotations

import random

import pytest

from prguard.core import context
from prguard.core.types import RiskTier
from tests.fixtures.loader import context_files, github_response, repo_tree

EXCLUDED_REPO = "excluded_files"


def changed_files_from(fixture: str) -> tuple[context.ChangedFile, ...]:
    """Build the S2 input from a recorded ``GET …/pulls/{n}/files`` body."""
    return tuple(
        context.ChangedFile.from_github(entry) for entry in github_response(fixture).body
    )


def committed_changed_files() -> tuple[context.ChangedFile, ...]:
    """The ``excluded_files`` tree, with real bytes so the null-byte sniff has something to do."""
    tree = repo_tree(EXCLUDED_REPO, "head")
    expectations = context_files()["contexts"]["excluded_files_pr"]
    built: list[context.ChangedFile] = []
    for path in expectations["files_changed"]:
        raw = (tree / path).read_bytes()
        built.append(
            context.ChangedFile(
                path=path,
                patch=f"@@ -1,1 +1,2 @@\n context\n+added to {path}\n",
                additions=1,
                deletions=0,
                content=raw,
            )
        )
    return tuple(built)


# ---------------------------------------------------------------------------
# AC-26 — E9 exclusion with a stated reason
# ---------------------------------------------------------------------------


def test_excluded_paths_and_reasons() -> None:
    """Eight files changed, exactly one survives — and each of the seven says why it went."""
    expectations = context_files()
    selection = context.build_context(committed_changed_files(), token_budget=120_000)

    assert dict(selection.excluded_reasons) == expectations["excluded_files"]
    assert selection.supplied_paths == tuple(
        expectations["contexts"]["excluded_files_pr"]["supplied_files"]
    )
    assert selection.files_changed == 8
    assert selection.files_reviewed == 1
    assert selection.files_excluded == 7
    assert selection.truncated is False


def test_excluded_files_are_not_in_the_supplied_context() -> None:
    """E9: "excluded from specialist context and from findings entirely"."""
    selection = context.build_context(committed_changed_files(), token_budget=120_000)
    for path in context_files()["excluded_files"]:
        assert path not in selection.supplied_paths
        assert selection.excluded_reasons[path]


@pytest.mark.parametrize(
    ("path", "expected"), sorted(context_files()["excluded_files"].items())
)
def test_each_committed_exclusion_class(path: str, expected: str) -> None:
    content = (repo_tree(EXCLUDED_REPO, "head") / path).read_bytes()
    assert context.classify(path, content=content) == expected


@pytest.mark.parametrize(
    ("path", "expected"), sorted(context_files()["not_committed"].items())
)
def test_path_only_exclusions_need_no_file(path: str, expected: str) -> None:
    """These three are gitignored, so the classifier must reject them on the name alone."""
    assert context.classify(path) == expected


def test_the_surviving_file_is_classified_as_source() -> None:
    tree = repo_tree(EXCLUDED_REPO, "head")
    assert context.classify("app/service.py", content=(tree / "app/service.py").read_bytes()) == (
        "source"
    )


@pytest.mark.parametrize(
    "path",
    [
        "tests/test_billing.py",
        "tests/conftest.py",
        "app/billing_test.py",
        "src/components/Button.test.ts",
        "spec/models/order_spec.rb",
    ],
)
def test_test_files_are_kept_and_labelled(path: str) -> None:
    """Test files are reviewed, not excluded — test integrity is a whole specialist (§11.2)."""
    assert context.classify(path) == "test"
    assert context.is_excluded("test") is False


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("app/service.py", "source"),
        ("app/proto/order_pb2.py", "generated"),
        ("web/static/bundle.min.js", "generated"),
        ("node_modules/left-pad/index.js", "vendored"),
        ("app/.venv/lib/python3.12/site-packages/x.py", "vendored"),
        ("third_party/retry.py", "vendored"),
        ("poetry.lock", "lockfile"),
        ("yarn.lock", "lockfile"),
        ("Cargo.lock", "lockfile"),
        ("go.sum", "lockfile"),
        ("docs/diagram.svg", "source"),
        ("docs/screenshot.png", "binary"),
        ("fonts/Inter.woff2", "binary"),
    ],
)
def test_classifier_matrix(path: str, expected: str) -> None:
    assert context.classify(path) == expected


def test_a_generated_header_in_the_first_five_lines_is_enough() -> None:
    """E9: ``# Generated by`` / ``@generated`` in the first five lines, name notwithstanding."""
    generated = (
        "#!/usr/bin/env python\n# coding: utf-8\n#\n# Generated by swagger-codegen\n\nx = 1\n"
    )
    assert context.classify("app/client.py", content=generated) == "generated"
    assert context.classify("app/client.py", content="x = 1\n" * 20) == "source"


def test_a_generated_marker_further_down_the_file_does_not_count() -> None:
    late = "\n".join(["x = 1"] * 10 + ["# @generated"]) + "\n"
    assert context.classify("app/client.py", content=late) == "source"


def test_a_null_byte_makes_a_file_binary_whatever_its_extension() -> None:
    assert context.classify("app/data.py", content=b"print('hi')\x00\x00") == "binary"


def test_an_unknown_extension_with_no_content_is_treated_as_binary() -> None:
    """E9: "binary by null-byte sniff or extension allowlist miss" — fail closed."""
    assert context.classify("app/artifact.bin") == "binary"
    assert context.classify("Dockerfile") == "source"
    assert context.classify("Makefile") == "source"


@pytest.mark.parametrize("path", ["dist/bundle.js", "build/artifact.bin", "generated/api.py"])
def test_build_output_directories_are_generated(path: str) -> None:
    assert context.classify(path) == "generated"


# ---------------------------------------------------------------------------
# AC-26 — deterministic compression (E5, E6)
# ---------------------------------------------------------------------------


def test_large_pr_compression_is_deterministic() -> None:
    """Run the selection twice and get the same answer, byte for byte."""
    files = changed_files_from("pr_large_files")
    budget = 200

    first = context.build_context(files, token_budget=budget)
    second = context.build_context(files, token_budget=budget)

    assert first == second
    assert first.supplied_paths == second.supplied_paths
    assert first.truncated is True


def test_compression_does_not_depend_on_the_order_github_returned() -> None:
    """A selection that changed with the input order would not be reproducible at all."""
    files = list(changed_files_from("pr_large_files"))
    shuffled = list(files)
    random.Random(20260914).shuffle(shuffled)
    assert shuffled != files

    assert context.build_context(tuple(files), token_budget=200).supplied_paths == (
        context.build_context(tuple(shuffled), token_budget=200).supplied_paths
    )


def test_compression_orders_by_sensitivity_then_by_change_size() -> None:
    """E5's documented order, written out here independently of the implementation."""
    files = changed_files_from("pr_large_files")
    selection = context.build_context(files, token_budget=120_000)

    surviving = [
        entry for entry in files if not context.is_excluded(context.classify(entry.path))
    ]
    expected = [
        entry.path
        for entry in sorted(
            surviving,
            key=lambda entry: (
                -context.path_sensitivity(entry.path),
                entry.changed_lines,
                entry.path,
            ),
        )
    ]
    assert selection.supplied_paths == tuple(expected)
    # The head of the list is a sensitive path, and specifically the smallest such change.
    assert context.path_sensitivity(selection.supplied_paths[0]) == 1.0
    assert selection.supplied_paths[0] == "app/crypto/signing.py"


def test_excluded_classes_are_dropped_before_the_budget_is_spent() -> None:
    """E5: "drop excluded classes first". A lockfile must never crowd out a source file."""
    files = changed_files_from("pr_large_files")
    selection = context.build_context(files, token_budget=120_000)

    assert selection.files_changed == 47
    assert set(selection.excluded_reasons) == {
        "package-lock.json",
        "uv.lock",
        "vendor/lib.py",
        "app/schema_pb2.py",
        "static/app.min.js",
        "assets/logo.png",
    }
    assert selection.files_reviewed == 41


def test_a_pr_that_fits_is_not_compressed_at_all() -> None:
    """Both files survive. They are still supplied in E5's order — smallest change first, and
    the recorded checkout patch is three changed lines against billing's eight."""
    selection = context.build_context(changed_files_from("pr_42_files"), token_budget=120_000)
    assert selection.truncated is False
    assert selection.omitted_paths == ()
    assert selection.truncated_paths == ()
    assert selection.supplied_paths == ("app/checkout.py", "app/billing.py")


# ---------------------------------------------------------------------------
# AC-26 — truncation is reported (E5, E6)
# ---------------------------------------------------------------------------


def test_truncation_is_reported() -> None:
    """Never silently review 3 of 40 files: say it in the result and name what was dropped."""
    files = changed_files_from("pr_large_files")
    selection = context.build_context(files, token_budget=150)

    assert selection.truncated is True
    assert selection.omitted_paths
    assert selection.estimated_tokens <= 150
    for path in selection.omitted_paths:
        assert selection.excluded_reasons[path] == "budget"
    assert "context_truncated" in selection.degradations
    assert selection.files_reviewed + selection.files_excluded == selection.files_changed


def test_no_file_is_lost_between_the_three_buckets() -> None:
    """Every changed file is either supplied or accounted for, at every budget.

    The S2 counterpart of the delivery ladder's conservation rule: a file may be reviewed or
    it may be excluded with a reason, and there is no third outcome where it quietly vanishes.
    """
    files = changed_files_from("pr_large_files")
    every_path = {entry.path for entry in files}
    for budget in (0, 50, 150, 400, 1_000, 120_000):
        selection = context.build_context(files, token_budget=budget)
        supplied = set(selection.supplied_paths)
        accounted = set(selection.excluded_reasons)
        assert supplied | accounted == every_path
        assert supplied & accounted == set()
        assert selection.files_reviewed + selection.files_excluded == selection.files_changed


def test_a_file_too_large_for_the_budget_is_truncated_to_its_largest_hunks() -> None:
    patch = (
        "@@ -1,2 +1,2 @@\n one\n-two\n+TWO\n"
        + "@@ -40,12 +40,12 @@\n"
        + "".join(f" line {number}\n" for number in range(40, 52))
        + "@@ -90,2 +90,2 @@\n ninety\n-x\n+X\n"
    )
    big = context.ChangedFile(path="app/big.py", patch=patch, additions=3, deletions=3)
    selection = context.build_context(
        (big,), token_budget=context.estimate_tokens(patch) - 10
    )
    (kept,) = selection.files
    assert kept.patch != patch
    assert "@@ -40,12 +40,12 @@" in kept.patch  # the largest hunk survived
    assert selection.truncated is True
    assert selection.truncated_paths == ("app/big.py",)


def test_a_zero_budget_omits_everything_and_says_so() -> None:
    selection = context.build_context(changed_files_from("pr_42_files"), token_budget=0)
    assert selection.files == ()
    assert selection.truncated is True
    assert set(selection.omitted_paths) == {"app/billing.py", "app/checkout.py"}


def test_too_many_files_is_recorded_as_a_degradation() -> None:
    """E6: > MAX_FILES takes the same compression path plus a degradation and a banner line."""
    files = tuple(
        context.ChangedFile(path=f"app/mod_{index:04d}.py", patch="@@ -1,1 +1,1 @@\n-a\n+b\n")
        for index in range(20)
    )
    selection = context.build_context(files, token_budget=120_000, max_files=5)
    assert selection.files_reviewed == 5
    assert "context_max_files_exceeded" in selection.degradations
    assert selection.truncated is True
    assert len(selection.omitted_paths) == 15


# ---------------------------------------------------------------------------
# Path sensitivity and risk tier (§4.4, §11.2 assumption 11)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("app/auth/session.py", 1.0),
        ("app/payments/charge.py", 1.0),
        ("app/billing.py", 1.0),
        ("app/checkout.py", 1.0),
        ("app/crypto/signing.py", 1.0),
        ("migrations/versions/0009_add_promotions.py", 1.0),
        ("app/pii/export.py", 1.0),
        ("infra/terraform/workers.tf", 0.6),
        ("infra/k8s/deployment.yaml", 0.6),
        ("config/settings.py", 0.6),
        (".github/workflows/ci.yml", 0.6),
        ("app/receipts.py", 0.0),
        ("app/search.py", 0.0),
        ("svc/tokens.py", 0.0),
        ("app/db/session.py", 0.0),
        ("README.md", 0.0),
    ],
)
def test_path_sensitivity(path: str, expected: float) -> None:
    """§4.4: auth/payments/crypto/migrations/PII = 1.0, infra/config/CI = 0.6, else 0.0."""
    assert context.path_sensitivity(path) == expected


@pytest.mark.parametrize(
    ("changed_lines", "expected"),
    [(1, "trivial"), (10, "trivial"), (11, "standard"), (200, "standard"), (201, "full")],
)
def test_risk_tier_by_size(changed_lines: int, expected: RiskTier) -> None:
    """§11.2 assumption 11: ≤10 trivial, ≤200 standard, else full."""
    files = (
        context.ChangedFile(path="app/search.py", additions=changed_lines, deletions=0),
    )
    assert context.risk_tier(files) == expected


def test_a_sensitive_path_forces_a_full_review() -> None:
    """§11.2: "Any path matching the sensitivity regexes … forces `full`"."""
    tiny_but_sensitive = (
        context.ChangedFile(path="app/auth/tokens.py", additions=1, deletions=0),
    )
    assert context.risk_tier(tiny_but_sensitive) == "full"


def test_infrastructure_paths_do_not_force_a_full_review() -> None:
    assert context.risk_tier(
        (context.ChangedFile(path="config/logging.yaml", additions=2, deletions=0),)
    ) == "trivial"


def test_risk_tier_of_the_recorded_pull_requests() -> None:
    """PR-42 touches billing and checkout, so it is `full` however small the diff is."""
    selection = context.build_context(changed_files_from("pr_42_files"), token_budget=120_000)
    assert selection.risk_tier == "full"

    excluded = context.build_context(committed_changed_files(), token_budget=120_000)
    assert excluded.risk_tier == "trivial"


def test_risk_tier_ignores_excluded_files() -> None:
    """A 7930-line lockfile must not promote a two-line PR to a full four-specialist review."""
    files = (
        context.ChangedFile(path="app/search.py", additions=2, deletions=0),
        context.ChangedFile(path="package-lock.json", additions=7_930, deletions=0),
    )
    assert context.build_context(files, token_budget=120_000).risk_tier == "trivial"


# ---------------------------------------------------------------------------
# Symbol extraction (§4.1 S2) and language labelling
# ---------------------------------------------------------------------------


def test_symbols_are_extracted_from_the_head_source() -> None:
    source = (repo_tree("buggy_calc", "head") / "app/billing.py").read_text(encoding="utf-8")
    symbols = context.symbols_in(source)
    assert "apply_discount" in symbols
    assert "Promotion" in symbols
    assert "Promotion.__init__" in symbols
    assert "line_total" in symbols


def test_symbol_extraction_never_raises_on_a_broken_file() -> None:
    """E28: a syntax error at head degrades symbol extraction; it does not fail the run."""
    assert context.symbols_in("def f(:\n  print 'py2'\n") == ()


def test_file_context_carries_symbols_and_language() -> None:
    tree = repo_tree("buggy_calc", "head")
    files = (
        context.ChangedFile(
            path="app/billing.py",
            patch=github_response("pr_42_files").body[0]["patch"],
            additions=2,
            deletions=6,
            content=(tree / "app/billing.py").read_text(encoding="utf-8"),
        ),
    )
    (supplied,) = context.build_context(files, token_budget=120_000).files
    assert supplied.language == "python"
    assert "apply_discount" in supplied.symbols
    assert supplied.line_map.contains(41)
    assert supplied.classification == "source"


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("app/billing.py", "python"),
        ("web/app.ts", "typescript"),
        ("web/app.js", "javascript"),
        ("infra/main.tf", "terraform"),
        ("config/app.yaml", "yaml"),
        ("README.md", "markdown"),
        ("Makefile", "unknown"),
    ],
)
def test_language_of(path: str, expected: str) -> None:
    assert context.language_of(path) == expected


def test_build_context_is_pure_and_repeatable() -> None:
    files = changed_files_from("pr_42_files")
    assert context.build_context(files, token_budget=120_000) == context.build_context(
        files, token_budget=120_000
    )
