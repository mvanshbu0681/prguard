"""Unified-diff parsing and the RIGHT-side line map (spec §4.1 S2, §4.7 rungs 1-2).

``core/diff.py`` is the only module that knows what a patch looks like. Everything
downstream — the comment ladder (T6), context compression, fingerprint line lookup — asks it
questions instead of re-parsing. So the contract is asserted here against the **recorded**
GitHub responses rather than hand-written strings: ``tests/fixtures/expectations/ladder_rungs.json``
states the RIGHT-side lines the corpus expects, and if the parser and the corpus ever disagree
one of them is wrong.

Hunk headers are never asserted on as strings: difflib writes ``@@ -36,12 +36,8 @@`` and GitHub
appends the enclosing function to the same header. Both are legal and ``unidiff`` reads both.
"""

from __future__ import annotations

import pytest

from prguard.core import diff
from prguard.core.types import LineMap
from tests.fixtures.loader import github_diff, github_response, ladder_rungs

PR_42_PATHS = ("app/billing.py", "app/checkout.py")


@pytest.fixture
def pr_42_index() -> diff.DiffIndex:
    """The recorded PR-42 unified diff, parsed."""
    return diff.parse_diff(github_diff("pr_42"))


# ---------------------------------------------------------------------------
# Parsing a whole unified diff
# ---------------------------------------------------------------------------


def test_parse_diff_finds_every_changed_file(pr_42_index: diff.DiffIndex) -> None:
    assert pr_42_index.paths == PR_42_PATHS


def test_parse_diff_records_change_status_and_counts(pr_42_index: diff.DiffIndex) -> None:
    billing = pr_42_index.get("app/billing.py")
    assert billing is not None
    assert billing.change_status == "modified"
    assert billing.additions == 2
    assert billing.deletions == 6
    assert billing.previous_path is None


def test_parse_diff_hunk_geometry_matches_the_header(pr_42_index: diff.DiffIndex) -> None:
    """``@@ -36,12 +36,8 @@`` — old side 36/12, new side 36/8, whatever trails the header."""
    billing = pr_42_index.get("app/billing.py")
    assert billing is not None
    (hunk,) = billing.hunks
    assert (hunk.old_start, hunk.old_count) == (36, 12)
    assert (hunk.new_start, hunk.new_count) == (36, 8)


# ---------------------------------------------------------------------------
# LineMap — the question T6's ladder asks (spec §4.7 rungs 1 and 2)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("path", PR_42_PATHS)
def test_commentable_lines_match_the_recorded_expectations(
    pr_42_index: diff.DiffIndex, path: str
) -> None:
    expected = ladder_rungs()["in_hunk_right_side_lines"][path]
    assert sorted(pr_42_index.line_map(path).commentable_lines) == expected


def test_commentable_lines_include_context_lines_not_just_additions(
    pr_42_index: diff.DiffIndex,
) -> None:
    """GitHub accepts a comment anywhere in the hunk, so context lines count (rung 1)."""
    billing = pr_42_index.get("app/billing.py")
    assert billing is not None
    assert billing.added_lines == (39, 40)
    assert billing.line_map.contains(38) is True  # a context line inside the hunk


def test_deleted_lines_are_not_commentable(pr_42_index: diff.DiffIndex) -> None:
    """Left-side-only lines have no RIGHT-side number; they can never anchor a comment."""
    line_map = pr_42_index.line_map("app/billing.py")
    assert line_map.contains(44) is False
    assert line_map.contains(35) is False


def test_line_map_of_a_file_outside_the_diff_is_empty(pr_42_index: diff.DiffIndex) -> None:
    """Rung 4 exists because of this case — ``app/receipts.py`` is not in the diff at all."""
    line_map = pr_42_index.line_map("app/receipts.py")
    assert isinstance(line_map, LineMap)
    assert line_map.file_path == "app/receipts.py"
    assert line_map.commentable_lines == frozenset()
    assert line_map.nearest(13, 10) is None


def test_nearest_answers_the_ladder_boundary_cases(pr_42_index: diff.DiffIndex) -> None:
    """The recorded ±10 boundary: 101 is exactly 10 away and stays inline, 102 demotes."""
    line_map = pr_42_index.line_map("app/checkout.py")
    assert line_map.nearest(97, 10) == 91
    assert line_map.nearest(101, 10) == 91
    assert line_map.nearest(102, 10) is None
    assert line_map.nearest(140, 10) is None


# ---------------------------------------------------------------------------
# GitHub `files[].patch` fragments — no `diff --git` header, header may carry a function name
# ---------------------------------------------------------------------------


def test_parse_patch_accepts_a_github_fragment() -> None:
    recorded = github_response("pr_42_files").body[0]
    parsed = diff.parse_patch(recorded["patch"], path=recorded["filename"])
    assert parsed.path == "app/billing.py"
    assert (
        sorted(parsed.line_map.commentable_lines)
        == ladder_rungs()["in_hunk_right_side_lines"]["app/billing.py"]
    )


def test_parse_patch_reads_a_header_that_carries_the_enclosing_function() -> None:
    """GitHub writes ``@@ -10,7 +10,9 @@ def slugify(value):``. The trailer is not geometry.

    This recorded fragment also has a header whose counts do not agree with its body, which
    ``unidiff`` rejects outright. The map follows the body — those are the lines GitHub would
    actually accept a comment on — while the geometry keeps what the header claimed.
    """
    recorded = github_response("pr_files_prompt_injection").body[0]
    parsed = diff.parse_patch(recorded["patch"], path="app/utils.py")
    (hunk,) = parsed.hunks
    assert (hunk.new_start, hunk.new_count) == (10, 9)
    assert hunk.section_header.strip() == "def slugify(value):"
    assert sorted(parsed.line_map.commentable_lines) == [10, 11, 12, 13, 14, 15, 16]
    assert parsed.added_lines == (13, 14, 15)


def test_index_of_recorded_files_response_covers_every_file() -> None:
    files = github_response("pr_42_files").body
    index = diff.index_github_files(files)
    assert index.paths == PR_42_PATHS
    for entry in files:
        assert index.line_map(entry["filename"]).commentable_lines


# ---------------------------------------------------------------------------
# Degenerate input — a parser that raises takes the whole run down with it
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("patch", [None, "", "   ", "Binary files a/x.png and b/x.png differ\n"])
def test_missing_or_binary_patch_yields_an_empty_line_map(patch: str | None) -> None:
    parsed = diff.parse_patch(patch, path="assets/logo.png")
    assert parsed.hunks == ()
    assert parsed.line_map.commentable_lines == frozenset()
    assert parsed.is_binary is (patch is None or "Binary files" in patch)


def test_unparsable_patch_degrades_to_an_empty_line_map() -> None:
    """A malformed patch is a degraded file, never an exception (§8.1: never crash a worker)."""
    parsed = diff.parse_patch("@@ this is not a hunk header @@\nnonsense\n", path="app/x.py")
    assert parsed.hunks == ()
    assert parsed.line_map.commentable_lines == frozenset()


def test_added_file_is_reported_as_added() -> None:
    patch = "@@ -0,0 +1,3 @@\n+one\n+two\n+three\n"
    parsed = diff.parse_patch(patch, path="app/new.py", change_status="added")
    assert parsed.change_status == "added"
    assert sorted(parsed.line_map.commentable_lines) == [1, 2, 3]


def test_rename_keeps_the_previous_path() -> None:
    text = (
        "diff --git a/app/old.py b/app/new.py\n"
        "similarity index 92%\n"
        "rename from app/old.py\n"
        "rename to app/new.py\n"
        "--- a/app/old.py\n"
        "+++ b/app/new.py\n"
        "@@ -1,2 +1,2 @@\n"
        " keep\n"
        "-was\n"
        "+now\n"
    )
    (renamed,) = diff.parse_diff(text).files
    assert renamed.path == "app/new.py"
    assert renamed.previous_path == "app/old.py"
    assert renamed.change_status == "renamed"


def test_multiple_hunks_are_all_commentable() -> None:
    patch = "@@ -1,2 +1,2 @@\n keep\n-was\n+now\n@@ -20,2 +20,3 @@\n context\n+added\n more\n"
    parsed = diff.parse_patch(patch, path="app/x.py")
    assert len(parsed.hunks) == 2
    assert sorted(parsed.line_map.commentable_lines) == [1, 2, 20, 21, 22]


def test_parsing_is_pure_and_repeatable() -> None:
    text = github_diff("pr_42")
    first = diff.parse_diff(text)
    second = diff.parse_diff(text)
    assert first == second
