"""The comment-demotion ladder — spec §4.7, §7 E1, AC-17. Pure functions, no I/O.

GitHub's REST API refuses an inline review comment whose line is not part of the diff. The
naive reaction is to drop that finding; this product's whole claim is that it never does.
Instead the finding walks down a four-rung ladder, stopping at the first rung that GitHub will
accept:

1. ``inline_exact``   — the line is inside a hunk on the RIGHT side.
2. ``inline_nearest`` — the nearest in-hunk line within :data:`NEAREST_LINE_MAX_DISTANCE`
   (10, §11.2.14), with :func:`nearest_line_note` prefixed to the body so the reader is told
   where the issue actually is.
3. ``file_level``     — a review comment with ``subject_type: "file"``.
4. ``summary_only``   — a row in the review body's "Findings not attachable to the diff"
   table. **The floor.** There is no rung below it, so demotion can never drop a finding.

Two design decisions carry the invariant, both taken because AC-18 moves findings between
rungs *mid-flight* after a 422:

* Rung assignment is a **pure function over an explicit table** —
  ``{finding_id: RungAssignment}`` — not an in-place mutation of a comment list. Recomputing
  and re-asserting after a retry is then trivial and cannot half-apply.
* :func:`assert_conservation` raises :class:`LadderConservationError` rather than using a bare
  ``assert``, because ``python -O`` strips ``assert`` and this invariant is the product claim.
  It runs in production code (spec §4.7), not only in tests.

Rungs 1 and 2 are answered by ``LineMap.contains`` / ``LineMap.nearest`` (T2, spec §4.7), which
resolve ties to the lower line. This module never re-derives what is in a hunk.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Final, Literal

from prguard.core.types import CanonicalFinding, DeliveryMode, LineMap, Side

PublishedRung = Literal["inline_exact", "inline_nearest", "file_level", "summary_only"]

#: The ladder, highest rung first. Index in this tuple *is* the rung number minus one.
LADDER: Final[tuple[PublishedRung, ...]] = (
    "inline_exact",
    "inline_nearest",
    "file_level",
    "summary_only",
)

#: Spec §11.2.14 — an inclusive bound, so exactly 10 lines away still comments inline.
NEAREST_LINE_MAX_DISTANCE: Final[int] = 10

#: Spec §4.7: RIGHT side only. A finding is about the code as it will be after the merge.
COMMENT_SIDE: Final[Side] = "RIGHT"

#: Spec §4.7 rung 3 — the GitHub field that makes a comment file-level rather than line-level.
FILE_SUBJECT_TYPE: Final[str] = "file"


class LadderConservationError(RuntimeError):
    """A finding was about to be dropped, or a comment invented — spec §4.7, AC-17.

    Raised by :func:`assert_conservation`. Reaching this is a bug in delivery, never a
    condition a caller should handle: the correct response is to fix the assignment table.
    """


@dataclass(frozen=True)
class RungAssignment:
    """Where one finding lands on the ladder, and the line its comment attaches to.

    ``line``/``end_line`` are where the issue *is*; ``anchor_line``/``anchor_start_line`` are
    where GitHub will accept the comment. They differ on rung 2, which is exactly why rung 2
    has to say so in the body.
    """

    finding_id: str
    mode: PublishedRung
    file_path: str
    line: int
    end_line: int
    anchor_line: int | None = None
    anchor_start_line: int | None = None
    side: Side = COMMENT_SIDE

    @property
    def is_inline(self) -> bool:
        """True on rungs 1 and 2 — the comment carries a ``line``."""
        return self.anchor_line is not None

    @property
    def is_relocated(self) -> bool:
        """True when the comment sits on a different line than the issue (rung 2)."""
        return self.mode == "inline_nearest"

    @property
    def delivery_mode(self) -> DeliveryMode:
        """The persisted ``findings.delivery_mode`` value (§5.1)."""
        return self.mode


@dataclass(frozen=True)
class LadderBreakdown:
    """The four rung counts, as `/result.delivery.ladder_breakdown` reports them (§6.3)."""

    inline_exact: int = 0
    inline_nearest: int = 0
    file_level: int = 0
    summary_only: int = 0

    @property
    def total(self) -> int:
        return self.inline_exact + self.inline_nearest + self.file_level + self.summary_only

    def as_dict(self) -> dict[str, int]:
        return {rung: getattr(self, rung) for rung in LADDER}


def nearest_line_note(file_path: str, line: int) -> str:
    """The rung-2 body prefix, spec §4.7 verbatim.

    A relocated comment that does not say where the issue really is is worse than no comment:
    the reader looks at the wrong line and concludes the reviewer is broken.
    """
    return f"> Nearest reviewable line. The issue is at `{file_path}:{line}`."


def assign_rungs(
    findings: Sequence[CanonicalFinding],
    line_maps: Mapping[str, LineMap],
    *,
    max_distance: int = NEAREST_LINE_MAX_DISTANCE,
) -> dict[str, RungAssignment]:
    """Assign every finding the highest rung it qualifies for — spec §4.7, AC-17.

    Pure and total: every finding gets exactly one entry, and a file with no ``LineMap`` (it
    was never in the diff) resolves to ``summary_only`` rather than raising. Order-independent,
    so a caller may hand findings over in any order and get the same table.
    """
    return {
        finding.id: _assign_one(finding, line_maps.get(finding.file_path), max_distance)
        for finding in findings
    }


def ladder_breakdown(assignments: Iterable[RungAssignment]) -> LadderBreakdown:
    """Count the assignment table by rung."""
    counts = dict.fromkeys(LADDER, 0)
    for assignment in assignments:
        counts[assignment.mode] += 1
    return LadderBreakdown(**counts)


def assert_conservation(
    published_finding_ids: Iterable[str],
    assignments: Mapping[str, RungAssignment],
) -> LadderBreakdown:
    """`len(published) == inline_exact + inline_nearest + file_level + summary_only`.

    Spec §4.7 requires this to run in production code. It is checked in both directions —
    a published finding with no rung is a **dropped** finding, and a rung with no published
    finding is a comment we are about to invent — and it is re-checked after a 422 retry
    (AC-18), because that is precisely when findings move between rungs.

    Returns the breakdown so the caller can persist it (§6.3) without recounting.
    """
    published = list(published_finding_ids)
    published_set = set(published)
    assigned_set = set(assignments)

    dropped = sorted(published_set - assigned_set)
    invented = sorted(assigned_set - published_set)
    if dropped or invented:
        raise LadderConservationError(
            "comment ladder lost track of a finding — "
            f"published without a rung: {dropped or 'none'}; "
            f"assigned a rung but not published: {invented or 'none'}"
        )
    if len(published) != len(published_set):
        raise LadderConservationError(
            f"the published finding ids are not unique: {sorted(published)}"
        )

    breakdown = ladder_breakdown(assignments.values())
    if breakdown.total != len(published):
        raise LadderConservationError(
            f"ladder breakdown {breakdown.as_dict()} sums to {breakdown.total}, "
            f"but {len(published)} findings were published"
        )
    return breakdown


def demote(assignment: RungAssignment, line_map: LineMap | None) -> RungAssignment:
    """Move one finding exactly one rung down the ladder — spec §4.7, §7 E2.

    GitHub has just told us this comment's anchor is not in the diff, so rung 1 demotes to the
    nearest *other* commentable line: re-posting the rejected line would simply 422 again.
    When nothing else is close enough the finding skips to ``file_level``; it never stalls on a
    rung that is known to fail.

    ``summary_only`` is returned unchanged. That is the floor, and it is the reason this
    function can never drop a finding.
    """
    if assignment.mode == "summary_only":
        return assignment
    if assignment.mode == "file_level":
        return _to_summary(assignment)
    if assignment.mode == "inline_nearest":
        return _to_file_level(assignment)

    rejected = {line for line in (assignment.anchor_line, assignment.anchor_start_line) if line}
    nearest = _nearest_excluding(line_map, assignment.line, rejected)
    if nearest is None:
        return _to_file_level(assignment)
    return replace(
        assignment, mode="inline_nearest", anchor_line=nearest, anchor_start_line=None
    )


def demote_to_summary(assignment: RungAssignment) -> RungAssignment:
    """Send a finding straight to rung 4 — spec §4.7, "remaining failures demote to summary_only".

    Used when a comment has already failed twice: there is no point trying a middle rung GitHub
    has effectively told us it will refuse, and the body always accepts the row.
    """
    return _to_summary(assignment)


def _assign_one(
    finding: CanonicalFinding, line_map: LineMap | None, max_distance: int
) -> RungAssignment:
    base = RungAssignment(
        finding_id=finding.id,
        mode="summary_only",
        file_path=finding.file_path,
        line=finding.start_line,
        end_line=finding.end_line,
    )
    if line_map is None:
        # The file is not in the diff at all — GitHub will not take any comment on it (E1).
        return base
    if line_map.contains(finding.start_line):
        spans_hunk = finding.end_line > finding.start_line and line_map.contains(finding.end_line)
        return replace(
            base,
            mode="inline_exact",
            anchor_line=finding.end_line if spans_hunk else finding.start_line,
            anchor_start_line=finding.start_line if spans_hunk else None,
        )
    nearest = line_map.nearest(finding.start_line, max_distance)
    if nearest is not None:
        return replace(base, mode="inline_nearest", anchor_line=nearest)
    return replace(base, mode="file_level")


def _to_file_level(assignment: RungAssignment) -> RungAssignment:
    return replace(assignment, mode="file_level", anchor_line=None, anchor_start_line=None)


def _to_summary(assignment: RungAssignment) -> RungAssignment:
    return replace(assignment, mode="summary_only", anchor_line=None, anchor_start_line=None)


def _nearest_excluding(line_map: LineMap | None, line: int, excluded: set[int]) -> int | None:
    """``LineMap.nearest`` with some lines struck out — reuses T2's tie-breaking, not a copy."""
    if line_map is None:
        return None
    remaining = line_map.commentable_lines - excluded
    if not remaining:
        return None
    return replace(line_map, commentable_lines=remaining).nearest(line, NEAREST_LINE_MAX_DISTANCE)


__all__ = [
    "COMMENT_SIDE",
    "FILE_SUBJECT_TYPE",
    "LADDER",
    "NEAREST_LINE_MAX_DISTANCE",
    "LadderBreakdown",
    "LadderConservationError",
    "PublishedRung",
    "RungAssignment",
    "assert_conservation",
    "assign_rungs",
    "demote",
    "demote_to_summary",
    "ladder_breakdown",
    "nearest_line_note",
]
