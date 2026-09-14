"""S8 delivery — one review per run, and the AI never approves. Spec §4.7, §7 E1/E2/E17/E19/E24.

**The governance rule this module exists to enforce:** every review this product posts carries
``event: "COMMENT"``. A reviewer that can sign a PR off is a reviewer a team stops reading; a
reviewer that can veto one is a reviewer a team routes around. The merge verdict is published
separately, as a status check, by :mod:`prguard.core.delivery.gate` — and only on proof. The
two mutating review events are not spellable anywhere under ``src/`` (AC-14 guards this).

**The delivery rule:** exactly one ``POST /repos/{o}/{r}/pulls/{n}/reviews`` per run, carrying
every published finding on the highest ladder rung it qualifies for
(:mod:`prguard.core.delivery.comment_ladder`). When GitHub rejects the batch with a 422 the
offending comments are demoted one rung and the whole review is retried **once**; survivors
demote to ``summary_only``, which moves them into the review body, so a finding that cannot be
attached anywhere still ships. The conservation invariant is re-asserted after every such
move, because a 422 is precisely the moment a finding could be lost.

**Delivery degrades, it never fails.** 403 (no write access — the common case for a repo we do
not own), 404 and an unrecoverable 422 all end as ``degraded``: the exact payload we would have
posted is returned for persistence in ``review_runs.review_payload`` and served by ``/result``
(E17). A PR that closed mid-run is ``skipped_pr_closed`` (E19). In both cases the run succeeds.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Final, Literal

from prguard.core.delivery.comment_ladder import (
    COMMENT_SIDE,
    FILE_SUBJECT_TYPE,
    LadderBreakdown,
    RungAssignment,
    nearest_line_note,
)
from prguard.core.types import CanonicalFinding, Side

#: Spec §4.7. The only review event this product will ever send. Not configurable, by design.
REVIEW_EVENT: Final[Literal["COMMENT"]] = "COMMENT"

#: §7 E2 — the review is retried exactly once after a 422 (§11.2.14).
MAX_REVIEW_RETRIES: Final[int] = 1

#: Recorded in ``review_runs.degradations`` when the 422 path was taken (§7 E2).
DEGRADATION_422: Final[str] = "review_422_demoted"

#: Recorded when GitHub refused the post outright and the payload was persisted instead (E17).
DEGRADATION_UNPOSTED: Final[str] = "review_not_posted"

#: How a comment carries its finding's identity across runs (E3/AC-7a). GitHub renders nothing
#: for an HTML comment, so the marker is invisible to humans and exact for us.
FINGERPRINT_MARKER: Final[str] = "<!-- prguard:fingerprint={fingerprint} -->"
_FINGERPRINT_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"<!--\s*prguard:fingerprint=([0-9a-fA-F]+)\s*-->"
)

#: Spec §4.7 rung 4 — the section of the body that catches everything GitHub will not anchor.
SUMMARY_SECTION_HEADING: Final[str] = "### Findings not attachable to the diff"

DeliveryStatus = Literal["posted", "degraded", "dry_run", "skipped_pr_closed"]

_PROOF_CLAIM: Final[Mapping[str, str]] = {
    "proven": "proven: the generated repro passes at base and fails at head.",
    "disproven": "disproven: the generated repro passed at head, so this is on the record as "
    "a false positive.",
    "inconclusive": "advisory: the generated repro was inconclusive.",
    "skipped_no_env": "advisory: no sandbox was available to test this.",
}
_DEFAULT_CLAIM: Final[str] = "advisory."


class ReviewEventError(ValueError):
    """Something tried to build a review with an event other than :data:`REVIEW_EVENT`."""


@dataclass(frozen=True)
class ReviewComment:
    """One review comment, in the shape GitHub's API takes — plus who it belongs to.

    ``finding_id`` and ``fingerprint`` are ours and are **not** sent: :meth:`as_payload` emits
    only the wire fields. Spec §4.7 permits ``line``/``side``/``start_line``/``start_side``
    and forbids ``position`` — the deprecated field that made half of GitHub's review
    integrations fragile.
    """

    path: str
    body: str
    finding_id: str
    fingerprint: str | None = None
    line: int | None = None
    side: Side | None = None
    start_line: int | None = None
    start_side: Side | None = None
    subject_type: str | None = None

    def as_payload(self) -> dict[str, Any]:
        """The comment as GitHub receives it."""
        payload: dict[str, Any] = {"path": self.path, "body": self.body}
        if self.line is not None:
            payload["line"] = self.line
            payload["side"] = self.side or COMMENT_SIDE
        if self.start_line is not None:
            payload["start_line"] = self.start_line
            payload["start_side"] = self.start_side or COMMENT_SIDE
        if self.subject_type is not None:
            payload["subject_type"] = self.subject_type
        return payload


@dataclass(frozen=True)
class ReviewPayload:
    """The one review a run posts — or, when delivery degrades, the one it would have posted."""

    body: str
    comments: tuple[ReviewComment, ...] = ()
    commit_id: str | None = None
    event: Literal["COMMENT"] = REVIEW_EVENT

    def as_payload(self) -> dict[str, Any]:
        """The request body for ``POST …/pulls/{n}/reviews``, JSON-serialisable as-is."""
        payload: dict[str, Any] = {"event": self.event, "body": self.body}
        if self.commit_id is not None:
            payload["commit_id"] = self.commit_id
        payload["comments"] = [comment.as_payload() for comment in self.comments]
        return payload

    def comment_for(self, path: str, line: int | None) -> ReviewComment | None:
        """The comment GitHub named in a 422 error, matched by path and anchor line."""
        for comment in self.comments:
            if comment.path == path and comment.line == line:
                return comment
        return None


@dataclass(frozen=True)
class ReviewDelivery:
    """What S8 did, in the shape ``/result.delivery`` reports it (§6.3).

    ``payload`` is always populated, posted or not — that is what makes E17 survivable: the
    demo runs off ``/result`` when the token cannot write.
    """

    status: DeliveryStatus
    payload: ReviewPayload
    ladder_breakdown: LadderBreakdown
    assignments: Mapping[str, RungAssignment]
    github_review_id: int | None = None
    updated_comment_ids: tuple[int, ...] = ()
    degradations: tuple[str, ...] = ()
    attempts: int = 0
    detail: str = ""
    event: Literal["COMMENT"] = REVIEW_EVENT

    @property
    def comments_posted(self) -> int:
        """Inline plus file-level comments actually sent (``summary_only`` rows are body text)."""
        return 0 if self.status != "posted" else len(self.payload.comments)


@dataclass(frozen=True)
class ExistingComment:
    """A review comment this product left on the PR in an earlier run (E3/AC-7a)."""

    comment_id: int
    path: str
    fingerprint: str | None
    line: int | None = None


@dataclass(frozen=True)
class ReusePlan:
    """Which comments to update rather than re-post — spec §7 E3, AC-7a.

    ``updates`` maps a finding id to the live comment id carrying the same fingerprint;
    ``fresh`` is everything genuinely new. Together they partition the published findings, so
    re-review adds zero duplicates without ever silently skipping a finding.
    """

    updates: Mapping[str, int] = field(default_factory=dict)
    fresh: tuple[str, ...] = ()


def fingerprint_of_comment(body: str) -> str | None:
    """Read the fingerprint marker back out of a comment body. ``None`` if it is not ours."""
    match = _FINGERPRINT_PATTERN.search(body)
    return match.group(1) if match else None


def build_review_payload(
    *,
    findings: Sequence[CanonicalFinding],
    assignments: Mapping[str, RungAssignment],
    files_reviewed: int,
    commit_id: str | None = None,
    event: str = REVIEW_EVENT,
    result_url: str | None = None,
) -> ReviewPayload:
    """Build the single review payload for a run — spec §4.7, AC-14, E24.

    ``event`` exists only so the governance rule can be *tested*: anything other than
    :data:`REVIEW_EVENT` raises. There is no configuration, no override and no code path that
    reaches GitHub with a different verdict.

    Zero findings is a good outcome, not an empty template to fill (E24): the body says so in
    one line and no comment is manufactured.
    """
    if event != REVIEW_EVENT:
        raise ReviewEventError(
            f"prguard posts {REVIEW_EVENT} reviews only; refusing to build event {event!r}"
        )

    by_id = {finding.id: finding for finding in findings}
    comments = tuple(
        _build_comment(by_id[finding_id], assignment)
        for finding_id, assignment in assignments.items()
        if finding_id in by_id and assignment.mode != "summary_only"
    )
    summary_rows = [
        (by_id[finding_id], assignment)
        for finding_id, assignment in assignments.items()
        if finding_id in by_id and assignment.mode == "summary_only"
    ]
    body = _build_body(
        findings=findings,
        summary_rows=summary_rows,
        files_reviewed=files_reviewed,
        result_url=result_url,
    )
    return ReviewPayload(body=body, comments=comments, commit_id=commit_id)


def plan_comment_reuse(
    findings: Sequence[CanonicalFinding],
    existing: Sequence[ExistingComment],
) -> ReusePlan:
    """Decide which findings update an existing comment and which are new — E3, AC-7a.

    A fingerprint that already carries a live comment on this PR is **updated**, never
    re-posted: the same bug reported twice reads as a broken bot. The decision is pure and
    lives here so it is unit-testable; T9 proves it end to end.
    """
    live = {
        comment.fingerprint: comment.comment_id
        for comment in existing
        if comment.fingerprint is not None
    }
    updates: dict[str, int] = {}
    fresh: list[str] = []
    for finding in findings:
        comment_id = live.get(finding.fingerprint) if finding.fingerprint else None
        if comment_id is None:
            fresh.append(finding.id)
        else:
            updates[finding.id] = comment_id
    return ReusePlan(updates=updates, fresh=tuple(fresh))


def _build_comment(finding: CanonicalFinding, assignment: RungAssignment) -> ReviewComment:
    body = _comment_body(finding, assignment)
    if assignment.mode == "file_level":
        return ReviewComment(
            path=assignment.file_path,
            body=body,
            finding_id=finding.id,
            fingerprint=finding.fingerprint,
            subject_type=FILE_SUBJECT_TYPE,
        )
    return ReviewComment(
        path=assignment.file_path,
        body=body,
        finding_id=finding.id,
        fingerprint=finding.fingerprint,
        line=assignment.anchor_line,
        side=assignment.side,
        start_line=assignment.anchor_start_line,
        start_side=assignment.side if assignment.anchor_start_line is not None else None,
    )


def _comment_body(finding: CanonicalFinding, assignment: RungAssignment) -> str:
    parts: list[str] = []
    if assignment.is_relocated:
        parts.append(nearest_line_note(assignment.file_path, assignment.line))
    parts.append(f"**{finding.title}** — {_claim(finding)}")
    if finding.body_markdown:
        parts.append(finding.body_markdown)
    if assignment.mode == "file_level":
        parts.append(f"_Reported at `{assignment.file_path}:{assignment.line}`._")
    if finding.fingerprint:
        parts.append(FINGERPRINT_MARKER.format(fingerprint=finding.fingerprint))
    return "\n\n".join(parts)


def _claim(finding: CanonicalFinding) -> str:
    return _PROOF_CLAIM.get(finding.proof_status, _DEFAULT_CLAIM)


def _band(finding: CanonicalFinding) -> str:
    return finding.severity.band if finding.severity is not None else "unscored"


def _build_body(
    *,
    findings: Sequence[CanonicalFinding],
    summary_rows: Sequence[tuple[CanonicalFinding, RungAssignment]],
    files_reviewed: int,
    result_url: str | None,
) -> str:
    if not findings:
        # E24: a clean PR is a valid, good outcome. Say it in one line and stop.
        return "\n\n".join(
            [
                "## prguard",
                f"No blocking issues found; {files_reviewed} files reviewed.",
                _footer(result_url),
            ]
        )

    proven = sum(1 for finding in findings if finding.proof_status == "proven")
    blocking = sum(1 for finding in findings if finding.blocking)
    sections = [
        f"## prguard — {_plural(len(findings), 'finding')}, {proven} proven",
        f"{_plural(blocking, 'finding')} can block this merge; "
        f"{files_reviewed} files reviewed.",
    ]
    if summary_rows:
        sections.append(_summary_table(summary_rows))
    sections.append(_footer(result_url))
    return "\n\n".join(sections)


def _summary_table(rows: Sequence[tuple[CanonicalFinding, RungAssignment]]) -> str:
    lines = [
        SUMMARY_SECTION_HEADING,
        "",
        "GitHub will not anchor a comment on these lines, so they are reported here rather "
        "than dropped.",
        "",
        "| Finding | Location | Severity |",
        "| --- | --- | --- |",
    ]
    for finding, assignment in rows:
        location = f"`{assignment.file_path}:{assignment.line}`"
        lines.append(f"| {_escape_cell(finding.title)} | {location} | {_band(finding)} |")
    return "\n".join(lines)


def _footer(result_url: str | None) -> str:
    text = (
        "_prguard comments; it never records a merge verdict through a review. "
        "The gate is a separate status check (`prguard/merge-gate`) and is red only for a "
        "finding with a repro that passes at base and fails at head._"
    )
    if result_url:
        text = f"{text}\n\n[Full result and evidence]({result_url})"
    return text


def _escape_cell(text: str) -> str:
    return text.replace("|", r"\|")


def _plural(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


__all__ = [
    "DEGRADATION_422",
    "DEGRADATION_UNPOSTED",
    "FINGERPRINT_MARKER",
    "MAX_REVIEW_RETRIES",
    "REVIEW_EVENT",
    "SUMMARY_SECTION_HEADING",
    "DeliveryStatus",
    "ExistingComment",
    "ReusePlan",
    "ReviewComment",
    "ReviewDelivery",
    "ReviewEventError",
    "ReviewPayload",
    "build_review_payload",
    "fingerprint_of_comment",
    "plan_comment_reuse",
]
