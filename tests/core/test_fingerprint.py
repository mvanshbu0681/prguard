"""M3 — the semantic fingerprint (spec §4.5, AC-6).

Four properties have to hold **at the same time**, which is what makes this subtle: too
aggressive a normalisation and two different bugs collide, too literal a one and the same bug
gets a new identity every time someone adds an import above it.

* stable across line drift — ``buggy_calc_drift`` is the committed proof: T3 put the identical
  bug exactly forty lines lower in the same file for this test and nothing else;
* stable across a local-variable rename;
* stable across rewording the finding's title, body and rule-key spelling;
* **different** when the flagged expression itself changes.

Plus E28: a file that does not parse falls back to the coarse line bucket and never raises.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from prguard.core import fingerprint
from prguard.core.types import Category
from tests.fixtures.loader import repo_tree

#: ``apply_discount`` is at line 38 in ``buggy_calc`` and line 78 in ``buggy_calc_drift``;
#: the flagged expression is the third line of each.
BUG_LINE = 41
DRIFTED_BUG_LINE = 81
LINE_DRIFT = 40

CATEGORY: Category = "correctness"
RULE_KEY = "unguarded_none_arithmetic"
BILLING = "app/billing.py"


def billing_source(repo: str = "buggy_calc", ref: str = "head") -> str:
    return (repo_tree(repo, ref) / BILLING).read_text(encoding="utf-8")


def fingerprint_of(source: str, line: int, *, rule_key: str = RULE_KEY) -> fingerprint.Fingerprint:
    return fingerprint.compute(
        category=CATEGORY,
        rule_key=rule_key,
        file_path=BILLING,
        line=line,
        source=source,
    )


def test_the_drift_fixture_really_does_move_the_bug_forty_lines() -> None:
    """Guard the guard: if T3's fixture stops drifting, the AC-6 test below goes vacuous."""
    straight = billing_source().splitlines()
    drifted = billing_source("buggy_calc_drift").splitlines()
    expression = "    discounted = price * (1 - rate)"
    assert straight[BUG_LINE - 1] == expression
    assert drifted[DRIFTED_BUG_LINE - 1] == expression
    assert DRIFTED_BUG_LINE - BUG_LINE == LINE_DRIFT


# ---------------------------------------------------------------------------
# AC-6 — the four required properties
# ---------------------------------------------------------------------------


def test_stable_under_line_drift() -> None:
    """The same bug forty lines lower is the same bug."""
    straight = fingerprint_of(billing_source(), BUG_LINE)
    drifted = fingerprint_of(billing_source("buggy_calc_drift"), DRIFTED_BUG_LINE)
    assert straight.value == drifted.value
    assert straight.symbol_path == drifted.symbol_path == "app/billing.py::apply_discount"
    assert straight.shape_hash == drifted.shape_hash


def test_stable_under_local_rename() -> None:
    """``discounted`` → ``net`` renames a local. The logic is untouched, so the identity is."""
    original = billing_source()
    renamed = original.replace("discounted", "net")
    assert "net = price * (1 - rate)" in renamed
    assert fingerprint_of(original, BUG_LINE).value == fingerprint_of(renamed, BUG_LINE).value


def test_two_different_renames_of_the_same_local_agree() -> None:
    source = billing_source()
    first = fingerprint_of(source.replace("discounted", "net"), BUG_LINE)
    second = fingerprint_of(source.replace("discounted", "after_promo"), BUG_LINE)
    assert first.value == second.value


def test_stable_under_rewording() -> None:
    """Title and body are not fingerprint inputs, and the rule key is normalised first."""
    source = billing_source()
    spelled_out = fingerprint_of(source, BUG_LINE, rule_key="Unguarded None Arithmetic")
    slugged = fingerprint_of(source, BUG_LINE, rule_key="unguarded-none--arithmetic")
    assert spelled_out.value == slugged.value == fingerprint_of(source, BUG_LINE).value


def test_changes_when_logic_changes() -> None:
    """Base guards the ``None``; head does not. Same file, same symbol, different bug."""
    guarded = fingerprint_of(billing_source(ref="base"), 43)
    unguarded = fingerprint_of(billing_source(), BUG_LINE)
    assert guarded.symbol_path == unguarded.symbol_path
    assert guarded.shape_hash != unguarded.shape_hash
    assert guarded.value != unguarded.value


def test_changing_the_flagged_expression_changes_the_shape() -> None:
    source = billing_source()
    patched = source.replace("price * (1 - rate)", "price * (1.0 - rate)")
    assert fingerprint_of(source, BUG_LINE).value != fingerprint_of(patched, BUG_LINE).value


def test_an_unrelated_edit_elsewhere_in_the_file_does_not_move_the_identity() -> None:
    source = billing_source()
    edited = source.replace(
        "def tax_for(amount, tax_rate):", "def tax_for(amount, tax_rate, rounding=None):"
    )
    assert fingerprint_of(source, BUG_LINE).value == fingerprint_of(edited, BUG_LINE).value


# ---------------------------------------------------------------------------
# symbol_path (§4.5) — "contains no line numbers"
# ---------------------------------------------------------------------------


def test_symbol_path_carries_no_line_number() -> None:
    symbol_path = fingerprint_of(billing_source(), BUG_LINE).symbol_path
    assert symbol_path == "app/billing.py::apply_discount"
    assert not any(character.isdigit() for character in symbol_path)


def test_symbol_path_of_a_method_names_its_class() -> None:
    source = "\n".join(
        [
            "class Promotion:",
            "    def rate_for(self, order):",
            "        return order.total * self.rate",
            "",
        ]
    )
    resolved = fingerprint.symbol_path_for(file_path="app/promo.py", line=3, source=source)
    assert resolved == "app/promo.py::Promotion.rate_for"


def test_symbol_path_of_a_nested_function_names_the_whole_chain() -> None:
    source = "\n".join(
        [
            "def outer(value):",
            "    def inner(other):",
            "        return other + 1",
            "    return inner(value)",
            "",
        ]
    )
    resolved = fingerprint.symbol_path_for(file_path="app/x.py", line=3, source=source)
    assert resolved == "app/x.py::outer.inner"


@pytest.mark.parametrize(
    ("line", "expected"),
    [(1, "#0"), (49, "#0"), (50, "#1"), (99, "#1"), (100, "#2"), (413, "#8")],
)
def test_non_python_files_use_the_coarse_line_bucket(line: int, expected: str) -> None:
    """§4.5: ``path/to/file.ext::#<line // 50>`` — coarse, so small drift changes nothing."""
    resolved = fingerprint.symbol_path_for(
        file_path="static/app.js", line=line, source="// javascript\n"
    )
    assert resolved == f"static/app.js::{expected}"


def test_module_level_python_code_falls_back_to_the_bucket() -> None:
    source = "API_KEY = 'hunter2'\n"
    resolved = fingerprint.symbol_path_for(file_path="app/settings.py", line=1, source=source)
    assert resolved == "app/settings.py::#0"


# ---------------------------------------------------------------------------
# shape_hash (§4.5) — normalisation that keeps meaning
# ---------------------------------------------------------------------------


def test_docstrings_and_comments_do_not_affect_the_shape() -> None:
    plain = "def f(a):\n    return a + 1\n"
    documented = 'def f(a):\n    """Explain at length."""\n    # and a comment\n    return a + 1\n'
    assert fingerprint.shape_hash_for(
        file_path="app/x.py", line=2, source=plain
    ) == fingerprint.shape_hash_for(file_path="app/x.py", line=4, source=documented)


def test_literals_are_replaced_by_type_tokens_not_erased() -> None:
    integer = "def f():\n    return 1\n"
    text = "def f():\n    return 'one'\n"
    none = "def f():\n    return None\n"
    hashes = {
        fingerprint.shape_hash_for(file_path="app/x.py", line=2, source=source)
        for source in (integer, text, none)
    }
    assert len(hashes) == 3


def test_the_same_literal_type_with_a_different_value_is_the_same_shape() -> None:
    first = "def f():\n    return 1\n"
    second = "def f():\n    return 99\n"
    assert fingerprint.shape_hash_for(
        file_path="app/x.py", line=2, source=first
    ) == fingerprint.shape_hash_for(file_path="app/x.py", line=2, source=second)


def test_imported_module_names_are_preserved() -> None:
    """§4.5: attribute names of imported modules survive normalisation — ``json`` is not ``v0``."""
    as_json = "import json\n\n\ndef f(payload):\n    return json.dumps(payload)\n"
    as_pickle = "import pickle\n\n\ndef f(payload):\n    return pickle.dumps(payload)\n"
    assert fingerprint.shape_hash_for(
        file_path="app/x.py", line=5, source=as_json
    ) != fingerprint.shape_hash_for(file_path="app/x.py", line=5, source=as_pickle)


def test_attribute_names_survive_normalisation() -> None:
    rate = "def f(promo):\n    return promo.rate\n"
    code = "def f(promo):\n    return promo.code\n"
    assert fingerprint.shape_hash_for(
        file_path="app/x.py", line=2, source=rate
    ) != fingerprint.shape_hash_for(file_path="app/x.py", line=2, source=code)


def test_distinct_builtin_calls_do_not_collide() -> None:
    rounded = "def f(x):\n    return round(x)\n"
    absolute = "def f(x):\n    return abs(x)\n"
    assert fingerprint.shape_hash_for(
        file_path="app/x.py", line=2, source=rounded
    ) != fingerprint.shape_hash_for(file_path="app/x.py", line=2, source=absolute)


def test_non_python_shape_masks_literals_and_whitespace() -> None:
    spaced = 'const limit = 10;\nif (x > limit) { throw new Error("nope"); }\n'
    respaced = 'const   limit =    10;\nif (x > limit) {   throw new Error("nope"); }\n'
    relabelled = 'const limit = 25;\nif (x > limit) { throw new Error("other"); }\n'
    baseline = fingerprint.shape_hash_for(file_path="app/x.js", line=2, source=spaced)
    assert baseline == fingerprint.shape_hash_for(file_path="app/x.js", line=2, source=respaced)
    assert baseline == fingerprint.shape_hash_for(file_path="app/x.js", line=2, source=relabelled)


# ---------------------------------------------------------------------------
# The composed fingerprint (§4.5)
# ---------------------------------------------------------------------------


def test_fingerprint_is_the_documented_sha256_of_the_five_parts() -> None:
    import hashlib

    source = billing_source()
    computed = fingerprint_of(source, BUG_LINE)
    expected = hashlib.sha256(
        "|".join(
            ["v1", CATEGORY, RULE_KEY, computed.symbol_path, computed.shape_hash]
        ).encode("utf-8")
    ).hexdigest()
    assert computed.value == expected
    assert len(computed.value) == 64


def test_category_is_part_of_the_identity() -> None:
    source = billing_source()
    as_correctness = fingerprint.compute(
        category="correctness", rule_key=RULE_KEY, file_path=BILLING, line=BUG_LINE, source=source
    )
    as_security = fingerprint.compute(
        category="security", rule_key=RULE_KEY, file_path=BILLING, line=BUG_LINE, source=source
    )
    assert as_correctness.value != as_security.value


def test_rule_key_is_part_of_the_identity() -> None:
    source = billing_source()
    assert (
        fingerprint_of(source, BUG_LINE).value
        != fingerprint_of(source, BUG_LINE, rule_key="bare_except").value
    )


def test_the_same_bug_in_a_different_file_is_a_different_finding() -> None:
    source = billing_source()
    here = fingerprint.compute(
        category=CATEGORY, rule_key=RULE_KEY, file_path=BILLING, line=BUG_LINE, source=source
    )
    there = fingerprint.compute(
        category=CATEGORY,
        rule_key=RULE_KEY,
        file_path="app/other.py",
        line=BUG_LINE,
        source=source,
    )
    assert here.value != there.value


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("unguarded_none_arithmetic", "unguarded_none_arithmetic"),
        ("Unguarded None Arithmetic", "unguarded_none_arithmetic"),
        ("unguarded-none--arithmetic", "unguarded_none_arithmetic"),
        ("  SQL Injection!  ", "sql_injection"),
        ("CWE-89/sql", "cwe_89_sql"),
        ("", ""),
    ],
)
def test_normalise_rule_key(raw: str, expected: str) -> None:
    """§4.5: lowercase, non-alphanumerics collapsed to ``_``."""
    assert fingerprint.normalise_rule_key(raw) == expected


def test_compute_is_pure_and_repeatable() -> None:
    source = billing_source()
    assert fingerprint_of(source, BUG_LINE) == fingerprint_of(source, BUG_LINE)


# ---------------------------------------------------------------------------
# E28 — degrade, never raise
# ---------------------------------------------------------------------------


def test_unparsable_python_falls_back_to_the_bucket_and_never_raises() -> None:
    """E28: a syntax error at head, or Python 2. Identity degrades; the run continues."""
    broken = "def f(:\n    print 'python 2 says hello'\n"
    computed = fingerprint.compute(
        category=CATEGORY, rule_key=RULE_KEY, file_path="app/legacy.py", line=2, source=broken
    )
    assert computed.symbol_path == "app/legacy.py::#0"
    assert len(computed.value) == 64


def test_missing_source_falls_back_to_the_bucket() -> None:
    """The file could not be fetched (§8.1 S2 degradation). Still a usable identity."""
    computed = fingerprint.compute(
        category=CATEGORY, rule_key=RULE_KEY, file_path=BILLING, line=BUG_LINE, source=None
    )
    assert computed.symbol_path == "app/billing.py::#0"
    assert computed.shape_hash


@pytest.mark.parametrize("line", [-5, 0, 1, 10_000])
def test_absurd_line_numbers_never_raise(line: int) -> None:
    computed = fingerprint.compute(
        category=CATEGORY,
        rule_key=RULE_KEY,
        file_path=BILLING,
        line=line,
        source=billing_source(),
    )
    assert len(computed.value) == 64


def test_every_committed_python_fixture_fingerprints_without_raising() -> None:
    """A broad sweep: the corpus is the closest thing to real source we have offline."""
    roots = [
        repo_tree(name, ref)
        for name in ("buggy_calc", "excluded_files")
        for ref in ("base", "head")
    ]
    files = [path for root in roots for path in sorted(Path(root).rglob("*.py"))]
    assert files
    for path in files:
        source = path.read_text(encoding="utf-8", errors="replace")
        for line in range(1, len(source.splitlines()) + 1):
            computed = fingerprint.compute(
                category=CATEGORY,
                rule_key=RULE_KEY,
                file_path=path.name,
                line=line,
                source=source,
            )
            assert len(computed.value) == 64
