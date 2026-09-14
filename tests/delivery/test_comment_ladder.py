"""The comment-demotion ladder — spec §4.7, §7 E1, AC-17.

The whole point of this file: **a finding is never silently dropped.** Every case the recorded
corpus pins is asserted here, both rungs either side of the ≤10 boundary included, and the
conservation invariant is exercised in both directions — it holds for a correct assignment and
it *raises* for an incomplete one. An invariant that cannot fail is not an invariant.
"""

from __future__ import annotations

from typing import Any

import pytest

from prguard.core.delivery.comment_ladder import (
    LADDER,
    NEAREST_LINE_MAX_DISTANCE,
    LadderConservationError,
    PublishedRung,
    RungAssignment,
    assert_conservation,
    assign_rungs,
    demote,
    ladder_breakdown,
    nearest_line_note,
)
from prguard.core.types import CanonicalFinding, LineMap
from tests.delivery.conftest import make_finding


def test_ladder_assigns_highest_valid_rung(
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
    ladder_expectations: dict[str, Any],
) -> None:
    """AC-17: each finding lands on the highest rung it qualifies for, at the pinned anchor."""
    assignments = assign_rungs(ladder_findings, ladder_line_maps)

    for case in ladder_expectations["findings"]:
        assignment = assignments[case["id"]]
        assert assignment.mode == case["expected_rung"], case["why"]
        assert assignment.anchor_line == case["anchor_line"], case["why"]


def test_no_finding_is_dropped(
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
    ladder_expectations: dict[str, Any],
) -> None:
    """AC-17: `len(published) == inline_exact + inline_nearest + file_level + summary_only`."""
    assignments = assign_rungs(ladder_findings, ladder_line_maps)
    breakdown = assert_conservation([f.id for f in ladder_findings], assignments)

    assert breakdown.as_dict() == ladder_expectations["expected_ladder_breakdown"]
    assert breakdown.total == len(ladder_findings)
    assert set(assignments) == {f.id for f in ladder_findings}


def test_conservation_raises_when_a_finding_has_no_rung(
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
) -> None:
    """The runtime assertion lives in production code and it really fires (§7 E1)."""
    assignments = assign_rungs(ladder_findings, ladder_line_maps)
    dropped = ladder_findings[-1].id
    del assignments[dropped]

    with pytest.raises(LadderConservationError) as raised:
        assert_conservation([f.id for f in ladder_findings], assignments)

    assert dropped in str(raised.value)


def test_conservation_raises_on_an_unpublished_extra_assignment(
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
) -> None:
    """Conservation runs both ways: a comment for a finding nobody published is also a bug."""
    assignments = assign_rungs(ladder_findings, ladder_line_maps)

    with pytest.raises(LadderConservationError) as raised:
        assert_conservation([f.id for f in ladder_findings[:-1]], assignments)

    assert ladder_findings[-1].id in str(raised.value)


def test_every_rung_is_exercised_by_the_corpus(
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
) -> None:
    """A ladder test that never reaches rung 4 proves nothing about E1."""
    modes = {a.mode for a in assign_rungs(ladder_findings, ladder_line_maps).values()}
    assert modes == set(LADDER)


@pytest.mark.parametrize(
    ("distance", "expected"),
    [(NEAREST_LINE_MAX_DISTANCE, "inline_nearest"), (NEAREST_LINE_MAX_DISTANCE + 1, "file_level")],
)
def test_nearest_bound_is_inclusive(distance: int, expected: str) -> None:
    """§11.2.14: ≤10 lines stays inline; the eleventh line demotes."""
    line_map = LineMap(file_path="app/checkout.py", commentable_lines=frozenset({91}))
    finding = make_finding(
        file_path="app/checkout.py", start_line=91 + distance, end_line=91 + distance
    )

    assignment = assign_rungs([finding], {"app/checkout.py": line_map})[finding.id]

    assert assignment.mode == expected


def test_a_file_missing_from_the_diff_goes_to_the_summary(
    ladder_line_maps: dict[str, LineMap],
) -> None:
    """Rung 4: GitHub refuses a comment on a file the PR never touched — still delivered."""
    finding = make_finding(file_path="app/receipts.py", start_line=13, end_line=13)

    assignment = assign_rungs([finding], ladder_line_maps)[finding.id]

    assert assignment.mode == "summary_only"
    assert assignment.anchor_line is None


def test_a_changed_file_with_no_commentable_lines_goes_to_file_level() -> None:
    """Rung 3 is reachable even when the file is in the diff but nothing in it is anchorable."""
    finding = make_finding(file_path="app/billing.py", start_line=41, end_line=41)

    assignment = assign_rungs([finding], {"app/billing.py": LineMap(file_path="app/billing.py")})

    assert assignment[finding.id].mode == "file_level"


def test_a_multi_line_finding_inside_a_hunk_spans_the_range() -> None:
    """`start_line`/`start_side` carry the range — `position` is never used (§4.7)."""
    line_map = LineMap(file_path="app/billing.py", commentable_lines=frozenset({41, 42, 43}))
    finding = make_finding(start_line=41, end_line=43)

    assignment = assign_rungs([finding], {"app/billing.py": line_map})[finding.id]

    assert assignment.mode == "inline_exact"
    assert assignment.anchor_start_line == 41
    assert assignment.anchor_line == 43


def test_a_multi_line_finding_whose_end_left_the_hunk_anchors_on_its_start() -> None:
    line_map = LineMap(file_path="app/billing.py", commentable_lines=frozenset({41, 42}))
    finding = make_finding(start_line=41, end_line=99)

    assignment = assign_rungs([finding], {"app/billing.py": line_map})[finding.id]

    assert assignment.mode == "inline_exact"
    assert assignment.anchor_start_line is None
    assert assignment.anchor_line == 41


def test_assignment_is_deterministic(
    ladder_findings: list[CanonicalFinding], ladder_line_maps: dict[str, LineMap]
) -> None:
    """Order must not change a rung: ties resolve to the lower line, deterministically."""
    forwards = assign_rungs(ladder_findings, ladder_line_maps)
    backwards = assign_rungs(list(reversed(ladder_findings)), ladder_line_maps)

    assert forwards == backwards


def test_the_nearest_note_names_the_real_line() -> None:
    """§4.7 prescribes this prefix verbatim; a reader must be told where the issue really is."""
    note = nearest_line_note("app/checkout.py", 97)

    assert note == "> Nearest reviewable line. The issue is at `app/checkout.py:97`."


@pytest.mark.parametrize(
    ("mode", "expected"),
    [
        ("inline_exact", "inline_nearest"),
        ("inline_nearest", "file_level"),
        ("file_level", "summary_only"),
    ],
)
def test_demotion_walks_exactly_one_rung(mode: PublishedRung, expected: PublishedRung) -> None:
    line_map = LineMap(file_path="app/checkout.py", commentable_lines=frozenset({88, 91}))
    assignment = RungAssignment(
        finding_id="f-1",
        mode=mode,
        file_path="app/checkout.py",
        line=88,
        end_line=88,
        anchor_line=88 if mode.startswith("inline") else None,
    )

    assert demote(assignment, line_map).mode == expected


def test_demotion_from_inline_exact_re_anchors_away_from_the_rejected_line() -> None:
    """Rung 1 → rung 2 means a *different* anchor; re-posting the same line would 422 again."""
    line_map = LineMap(file_path="app/checkout.py", commentable_lines=frozenset({88, 91}))
    finding = make_finding(file_path="app/checkout.py", start_line=88, end_line=88)
    assignment = assign_rungs([finding], {"app/checkout.py": line_map})[finding.id]

    demoted = demote(assignment, line_map)

    assert demoted.mode == "inline_nearest"
    assert demoted.anchor_line == 91


def test_demotion_skips_a_rung_when_no_other_line_is_close_enough() -> None:
    line_map = LineMap(file_path="app/checkout.py", commentable_lines=frozenset({88}))
    finding = make_finding(file_path="app/checkout.py", start_line=88, end_line=88)
    assignment = assign_rungs([finding], {"app/checkout.py": line_map})[finding.id]

    demoted = demote(assignment, line_map)

    assert demoted.mode == "file_level"
    assert demoted.anchor_line is None


def test_summary_only_is_the_floor_of_the_ladder() -> None:
    """There is no rung below rung 4 — demoting a summary row can never drop the finding."""
    finding = make_finding(file_path="app/receipts.py", start_line=13, end_line=13)
    assignment = assign_rungs([finding], {})[finding.id]

    assert demote(assignment, None) == assignment


def test_breakdown_counts_only_the_four_published_rungs(
    ladder_findings: list[CanonicalFinding], ladder_line_maps: dict[str, LineMap]
) -> None:
    breakdown = ladder_breakdown(assign_rungs(ladder_findings, ladder_line_maps).values())

    assert sorted(breakdown.as_dict()) == sorted(LADDER)
    assert breakdown.total == sum(breakdown.as_dict().values())
