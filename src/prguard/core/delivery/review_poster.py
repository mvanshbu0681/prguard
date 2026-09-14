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

**Every published finding reaches GitHub somewhere.** :func:`assert_conservation` counts rungs,
and a rung is an intention; :func:`assert_delivery_conservation` counts the *channels* a reader
of the pull request actually sees — a comment in the payload, a row in the body, or a live
comment updated in place — and refuses to let two findings occupy one of them. That second
check exists because a rung count cannot see the one way a published finding vanishes: two
findings sharing a fingerprint (ordinary — ``fingerprint.compute`` is symbol-based, AC-6) both
claiming the same live comment, where the second body overwrites the first.

**Nothing leaves here unredacted** (§7 E26). A "hardcoded credential" finding quotes the
credential; the review body is published to a pull request that may be public and persisted in
``review_runs.review_payload``. Comment and body text therefore goes through
:func:`prguard.core.proof.redact.redact` — the same pattern table the sandbox output uses, so
the two E26 call sites cannot drift apart.
"""

from __future__ import annotations

import re
from collections.abc import Collection, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Final, Literal

from prguard.core.delivery.comment_ladder import (
    COMMENT_SIDE,
    FILE_SUBJECT_TYPE,
    NEAREST_LINE_MAX_DISTANCE,
    LadderBreakdown,
    LadderConservationError,
    RungAssignment,
    assert_conservation,
    assign_rungs,
    demote,
    demote_to_summary,
    nearest_line_note,
)
from prguard.core.delivery.github_client import (
    GitHubClient,
    GitHubError,
    GitHubUnavailableError,
    GitHubValidationError,
)
from prguard.core.proof.redact import redact
from prguard.core.types import CanonicalFinding, LineMap, Side

#: Spec §4.7. The only review event this product will ever send. Not configurable, by design.
REVIEW_EVENT: Final[Literal["COMMENT"]] = "COMMENT"

#: §7 E2 — the review is retried exactly once after a 422 (§11.2.14).
MAX_REVIEW_RETRIES: Final[int] = 1

#: The initial post, the one retry, and a final post of the survivors after they demote to
#: ``summary_only`` (§4.7: "remaining failures demote to summary_only **and post**"). That last
#: call is not a retry of the rejected payload — it is a different, comment-free review body,
#: and it exists because a finding that reached rung 4 is only delivered once the body ships.
MAX_POST_ATTEMPTS: Final[int] = MAX_REVIEW_RETRIES + 2

#: Recorded in ``review_runs.degradations`` when the 422 path was taken (§7 E2).
DEGRADATION_422: Final[str] = "review_422_demoted"

#: Recorded when GitHub refused the post outright and the payload was persisted instead (E17).
DEGRADATION_UNPOSTED: Final[str] = "review_not_posted"

#: Recorded when the review POST came back 5xx. GitHub received it, so it may well have created
#: the review; §4.7 forbids sending it again to find out. The delivery is reported as posted —
#: the honest reading of "GitHub has it" — and this key is what says we could not confirm it.
DEGRADATION_POST_UNCONFIRMED: Final[str] = "review_post_unconfirmed"

#: Recorded when GitHub would not say which of our comments are still live on the PR (E3).
#: Without that list every comment we post might be a duplicate, so the whole review demotes to
#: rung 4 and ships in the body instead. §8.1 S8: a GitHub failure in delivery degrades.
DEGRADATION_COMMENTS_UNREADABLE: Final[str] = "review_comments_unreadable"

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

    ``updates`` is **not** injective: a fingerprint is symbol-based (AC-6), so two findings in
    one function share one, and both then name the same comment id. A comment displays one
    body, so only one of them can be delivered that way — see :func:`updated_finding_ids`,
    which is where that arity is resolved rather than assumed away.
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
    skip_comment_for: Collection[str] = (),
    secrets: Sequence[str] = (),
) -> ReviewPayload:
    """Build the single review payload for a run — spec §4.7, AC-14, E24.

    ``event`` exists only so the governance rule can be *tested*: anything other than
    :data:`REVIEW_EVENT` raises. There is no configuration, no override and no code path that
    reaches GitHub with a different verdict.

    Zero findings is a good outcome, not an empty template to fill (E24): the body says so in
    one line and no comment is manufactured.

    ``skip_comment_for`` names findings already delivered by updating an existing comment
    (E3/AC-7a). They keep their rung — conservation is over the assignment table, not over the
    comments array — they simply are not posted twice.

    ``secrets`` is the literal values E26 redacts by value, on top of the token shapes the
    pattern table already knows. Nothing built here leaves unmasked.
    """
    if event != REVIEW_EVENT:
        raise ReviewEventError(
            f"prguard posts {REVIEW_EVENT} reviews only; refusing to build event {event!r}"
        )

    reused = set(skip_comment_for)
    by_id = {finding.id: finding for finding in findings}
    comments = tuple(
        _build_comment(by_id[finding_id], assignment, secrets)
        for finding_id, assignment in assignments.items()
        if finding_id in by_id and assignment.mode != "summary_only" and finding_id not in reused
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
        secrets=secrets,
    )
    return ReviewPayload(body=body, comments=comments, commit_id=commit_id)


def plan_comment_reuse(
    findings: Sequence[CanonicalFinding],
    existing: Sequence[ExistingComment] | None,
) -> ReusePlan:
    """Decide which findings update an existing comment and which are new — E3, AC-7a.

    A fingerprint that already carries a live comment on this PR is **updated**, never
    re-posted: the same bug reported twice reads as a broken bot. The decision is pure and
    lives here so it is unit-testable; T9 proves it end to end.

    ``existing=None`` means GitHub would not tell us what is live on this PR. Nothing can be
    reused then — there is no comment id to PATCH — so every finding is ``fresh`` and
    :func:`post_review` demotes the review to the body rather than risk posting a duplicate.
    """
    if existing is None:
        return ReusePlan(updates={}, fresh=tuple(finding.id for finding in findings))
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


async def post_review(
    *,
    client: GitHubClient | None,
    owner: str,
    repo: str,
    pr_number: int,
    findings: Sequence[CanonicalFinding],
    line_maps: Mapping[str, LineMap],
    files_reviewed: int,
    commit_id: str | None = None,
    existing_comments: Sequence[ExistingComment] | None = (),
    result_url: str | None = None,
    dry_run: bool = False,
    max_distance: int = NEAREST_LINE_MAX_DISTANCE,
    event: str = REVIEW_EVENT,
    secrets: Sequence[str] = (),
) -> ReviewDelivery:
    """Stage S8 — build the ladder, post exactly one review, degrade rather than fail.

    The sequence, and why each step is where it is:

    1. **Assign rungs and assert conservation** before a single byte goes over the wire. A
       finding that has no rung must fail here, loudly, not silently vanish into a payload.
    2. **Re-read the PR.** Cheap, and the only way to notice it was merged while we were
       thinking (E19). We do not comment on a closed PR.
    3. **Update before posting.** A fingerprint that already has a live comment is updated, not
       re-posted (E3/AC-7a) — and if the update fails, that finding falls back into the review
       so it is still delivered.
    4. **Post once.** On 422, demote what GitHub named, re-assert conservation, retry once;
       then send survivors to rung 4 and post the body. On 403/404/rate limit, stop: the payload
       is persisted and served from ``/result`` (E17), and the run still succeeds. On 5xx,
       stop as well and say so: the POST is not idempotent, GitHub has the request, and
       sending it again is how one hiccup becomes a pull request with every comment twice.

    ``existing_comments=None`` is "GitHub would not say what is already on this PR". Reuse is
    then impossible and any inline comment might be a duplicate, so the whole review demotes to
    rung 4 — every finding still ships, once, in the body — and the delivery is ``degraded``
    with :data:`DEGRADATION_COMMENTS_UNREADABLE` (§8.1 S8, E3/AC-7a).

    ``client=None`` or ``dry_run=True`` builds everything and posts nothing, which is what
    ``GITHUB_DELIVERY_MODE=dry_run`` and a missing token both mean (§4.8, X4).
    """
    if event != REVIEW_EVENT:
        raise ReviewEventError(
            f"prguard posts {REVIEW_EVENT} reviews only; refusing event {event!r}"
        )

    published_ids = [finding.id for finding in findings]
    assignments = assign_rungs(findings, line_maps, max_distance=max_distance)
    comments_unreadable = existing_comments is None
    if comments_unreadable:
        # We cannot tell a finding we have already commented on from a new one, and a re-posted
        # inline comment is the duplicate AC-7a promises never to make. Rung 4 is the floor for
        # exactly this kind of "GitHub will not take a comment": nothing is dropped, it moves.
        assignments = {
            finding_id: demote_to_summary(assignment)
            for finding_id, assignment in assignments.items()
        }
    breakdown = assert_conservation(published_ids, assignments)

    def payload_for(skip: Collection[str] = ()) -> ReviewPayload:
        return build_review_payload(
            findings=findings,
            assignments=assignments,
            files_reviewed=files_reviewed,
            commit_id=commit_id,
            result_url=result_url,
            skip_comment_for=skip,
            secrets=secrets,
        )

    if client is None or dry_run:
        return ReviewDelivery(
            status="dry_run",
            payload=payload_for(),
            ladder_breakdown=breakdown,
            assignments=assignments,
            detail="delivery mode is dry_run" if client else "no GitHub client configured",
        )

    try:
        pull_request = await client.get_pull_request(owner, repo, pr_number)
    except GitHubError as error:
        return _degraded(payload_for(), breakdown, assignments, detail=str(error))

    if _is_closed(pull_request):
        # E19: the analysis is still worth keeping; the conversation is over.
        return ReviewDelivery(
            status="skipped_pr_closed",
            payload=payload_for(),
            ladder_breakdown=breakdown,
            assignments=assignments,
            detail=f"pull request is {pull_request.get('state', 'closed')}",
        )

    reuse = plan_comment_reuse(findings, existing_comments)
    updated, degradations = await _apply_updates(
        client, owner, repo, reuse, findings, assignments, secrets
    )
    if comments_unreadable:
        degradations.append(DEGRADATION_COMMENTS_UNREADABLE)

    def review_for() -> ReviewPayload:
        """The payload, with the findings a live comment already carries left out of it."""
        delivered_by_update = {
            finding_id: reuse.updates[finding_id]
            for finding_id in updated_finding_ids(reuse, updated)
        }
        built = payload_for(skip=delivered_by_update)
        assert_delivery_conservation(published_ids, assignments, built, delivered_by_update)
        return built

    payload = review_for()

    for attempt in range(1, MAX_POST_ATTEMPTS + 1):
        try:
            response = await client.create_review(owner, repo, pr_number, payload.as_payload())
        except GitHubValidationError as invalid:
            moved = _demote_rejected(
                invalid,
                payload,
                assignments,
                line_maps,
                to_summary=attempt > MAX_REVIEW_RETRIES,
            )
            if moved:
                if DEGRADATION_422 not in degradations:
                    degradations.append(DEGRADATION_422)
                # The table just changed under us — AC-18's whole point is that this still
                # holds, and it holds on the way out of the loop as well as around it: the
                # breakdown /result reports has to describe the assignments it ships with.
                breakdown = assert_conservation(published_ids, assignments)
                payload = review_for()
            if not moved or attempt == MAX_POST_ATTEMPTS:
                return _degraded(
                    payload,
                    breakdown,
                    assignments,
                    updated=updated,
                    degradations=degradations,
                    attempts=attempt,
                    detail=str(invalid),
                )
        except GitHubUnavailableError as unavailable:
            return _unconfirmed_or_degraded(
                unavailable,
                payload,
                breakdown,
                assignments,
                updated=updated,
                degradations=degradations,
                attempts=attempt,
            )
        except GitHubError as error:
            return _degraded(
                payload,
                breakdown,
                assignments,
                updated=updated,
                degradations=degradations,
                attempts=attempt,
                detail=str(error),
            )
        else:
            return ReviewDelivery(
                # §8.1 S8: a GitHub failure inside delivery degrades the delivery, even when
                # the review itself went out — the body-only review is the mitigation, not a
                # clean result, and `/result` has to say which one it is looking at.
                status="degraded" if comments_unreadable else "posted",
                payload=payload,
                ladder_breakdown=breakdown,
                assignments=assignments,
                github_review_id=_as_int(response.get("id")),
                updated_comment_ids=tuple(updated),
                degradations=tuple(degradations),
                attempts=attempt,
            )

    raise AssertionError("unreachable: every post attempt returns or degrades")


def updated_finding_ids(reuse: ReusePlan, updated: Sequence[int]) -> tuple[str, ...]:
    """The findings whose existing comment was successfully updated this run (E3).

    ``reuse.updates`` may point several findings at one comment id — two bugs in one function
    share a fingerprint (AC-6) — but a comment shows exactly one body, the last one written to
    it. Crediting every claimant would mark a published finding delivered when it reached
    GitHub nowhere, so only the last claimant of each updated comment counts here; the rest are
    left out and rejoin the review payload, which is where :func:`_apply_updates` puts a
    comment whose final write failed too.
    """
    done = set(updated)
    carried = {
        comment_id: finding_id
        for finding_id, comment_id in reuse.updates.items()
        if comment_id in done
    }
    delivered = set(carried.values())
    return tuple(finding_id for finding_id in reuse.updates if finding_id in delivered)


def assert_delivery_conservation(
    published_finding_ids: Iterable[str],
    assignments: Mapping[str, RungAssignment],
    payload: ReviewPayload,
    delivered_by_update: Mapping[str, int],
) -> None:
    """Every published finding occupies a channel, and no channel carries two — §4.7, AC-17.

    :func:`~prguard.core.delivery.comment_ladder.assert_conservation` counts rungs, which is
    what we *meant* to do with each finding. This counts what a reader of the pull request will
    actually find: a comment in the review payload, a row in the body's summary table, or a
    live comment updated in place. The two are not the same check, and the gap between them is
    a real bug shape — two findings sharing a fingerprint both claim one live comment, the
    second PATCH overwrites the first, and a rung count sees four findings on four rungs while
    one of them reached GitHub nowhere.

    Raises :class:`~prguard.core.delivery.comment_ladder.LadderConservationError`, like its
    sibling: this is the product claim, so it runs in production and never as a bare ``assert``.
    """
    posted = {comment.finding_id for comment in payload.comments}
    channels: dict[tuple[str, str | int], str] = {}
    dropped: list[str] = []
    collisions: list[str] = []
    for finding_id in published_finding_ids:
        assignment = assignments.get(finding_id)
        comment_id = delivered_by_update.get(finding_id)
        if comment_id is not None:
            channel: tuple[str, str | int] = ("live_comment", comment_id)
        elif finding_id in posted:
            channel = ("review_comment", finding_id)
        elif assignment is not None and assignment.mode == "summary_only":
            channel = ("summary_row", finding_id)
        else:
            dropped.append(finding_id)
            continue
        held_by = channels.setdefault(channel, finding_id)
        if held_by != finding_id:
            collisions.append(f"{held_by} and {finding_id} both hold {channel[0]} {channel[1]}")
    if dropped or collisions:
        raise LadderConservationError(
            "a published finding would reach GitHub nowhere — "
            f"delivered through no channel: {sorted(dropped) or 'none'}; "
            f"sharing one channel: {collisions or 'none'}"
        )


async def _apply_updates(
    client: GitHubClient,
    owner: str,
    repo: str,
    reuse: ReusePlan,
    findings: Sequence[CanonicalFinding],
    assignments: Mapping[str, RungAssignment],
    secrets: Sequence[str] = (),
) -> tuple[list[int], list[str]]:
    """PATCH each reused comment. A failure is not fatal — the finding rejoins the review.

    Several findings may name one comment (a shared fingerprint), and they are written in
    ``reuse.updates`` order, so the comment ends up carrying the last of them. A comment is
    therefore reported as updated only while its **last** write succeeded: if that one is
    refused, the comment drops out of ``updated`` entirely and every finding that claimed it
    rejoins the review, exactly as a single refused update already does.
    """
    by_id = {finding.id: finding for finding in findings}
    carried: dict[int, str] = {}
    degradations: list[str] = []
    for finding_id, comment_id in reuse.updates.items():
        finding = by_id.get(finding_id)
        assignment = assignments.get(finding_id)
        if finding is None or assignment is None:
            continue
        try:
            await client.update_review_comment(
                owner, repo, comment_id, _comment_body(finding, assignment, secrets)
            )
        except GitHubError:
            carried.pop(comment_id, None)
            if DEGRADATION_UNPOSTED not in degradations:
                degradations.append(DEGRADATION_UNPOSTED)
        else:
            carried[comment_id] = finding_id
    return list(carried), degradations


def _demote_rejected(
    invalid: GitHubValidationError,
    payload: ReviewPayload,
    assignments: dict[str, RungAssignment],
    line_maps: Mapping[str, LineMap],
    *,
    to_summary: bool,
) -> tuple[str, ...]:
    """Demote the comments GitHub named in a 422 — spec §7 E2. Mutates ``assignments``.

    GitHub names an offending comment by ``path`` and ``line``. When two findings share that
    anchor — which happens exactly when both were relocated onto the same nearest in-hunk line —
    the error cannot say which one it meant, so the one with the **weakest claim** to the anchor
    gives it up: the finding whose real line is furthest from it. The other keeps its inline
    comment; if GitHub refuses again, it follows on the next attempt.

    Returns the finding ids that moved. Empty means the 422 was about something we cannot fix
    by demotion, and the caller must degrade rather than retry an identical request.
    """
    moved: list[str] = []
    for path, line in invalid.rejected_comments:
        comment = _weakest_claim(payload, assignments, path, line)
        if comment is None:
            continue
        assignment = assignments.get(comment.finding_id)
        if assignment is None:
            continue
        assignments[comment.finding_id] = (
            demote_to_summary(assignment)
            if to_summary
            else demote(assignment, line_maps.get(assignment.file_path))
        )
        moved.append(comment.finding_id)
    return tuple(moved)


def _weakest_claim(
    payload: ReviewPayload,
    assignments: Mapping[str, RungAssignment],
    path: str,
    line: int | None,
) -> ReviewComment | None:
    candidates = [
        comment
        for comment in payload.comments
        if comment.path == path and comment.line == line and comment.finding_id in assignments
    ]
    if not candidates:
        return None

    def distance(comment: ReviewComment) -> tuple[int, int, str]:
        assignment = assignments[comment.finding_id]
        anchor = assignment.anchor_line if assignment.anchor_line is not None else assignment.line
        return (abs(assignment.line - anchor), assignment.line, comment.finding_id)

    return max(candidates, key=distance)


def _unconfirmed_or_degraded(
    unavailable: GitHubUnavailableError,
    payload: ReviewPayload,
    breakdown: LadderBreakdown,
    assignments: Mapping[str, RungAssignment],
    *,
    updated: Sequence[int] = (),
    degradations: Sequence[str] = (),
    attempts: int = 0,
) -> ReviewDelivery:
    """What a 5xx on the one review POST means — spec §4.7, §8.1 S8.

    GitHub answered, which means it *received* the review, and its edge is as likely to fail
    after writing the row as before it. The request is not idempotent and §4.7 allows exactly
    one POST per run, so there is no second attempt and no way to find out: the delivery is
    reported as posted — the reading that does not risk publishing the review twice — with
    :data:`DEGRADATION_POST_UNCONFIRMED` saying we could not confirm it, no review id, and the
    payload preserved for ``/result`` either way.

    A transport failure is the other case: nothing got an answer, so nothing was applied, and
    that is an ordinary degraded delivery.
    """
    if unavailable.status is None:
        return _degraded(
            payload,
            breakdown,
            assignments,
            updated=updated,
            degradations=degradations,
            attempts=attempts,
            detail=str(unavailable),
        )
    return ReviewDelivery(
        status="posted",
        payload=payload,
        ladder_breakdown=breakdown,
        assignments=assignments,
        updated_comment_ids=tuple(updated),
        degradations=(*degradations, DEGRADATION_POST_UNCONFIRMED),
        attempts=attempts,
        detail=str(unavailable),
    )


def _degraded(
    payload: ReviewPayload,
    breakdown: LadderBreakdown,
    assignments: Mapping[str, RungAssignment],
    *,
    updated: Sequence[int] = (),
    degradations: Sequence[str] = (),
    attempts: int = 0,
    detail: str = "",
) -> ReviewDelivery:
    """E17: GitHub said no. Keep the payload, degrade the delivery, let the run succeed."""
    recorded = list(degradations)
    if DEGRADATION_UNPOSTED not in recorded:
        recorded.append(DEGRADATION_UNPOSTED)
    return ReviewDelivery(
        status="degraded",
        payload=payload,
        ladder_breakdown=breakdown,
        assignments=assignments,
        updated_comment_ids=tuple(updated),
        degradations=tuple(recorded),
        attempts=attempts,
        detail=detail,
    )


def _is_closed(pull_request: Mapping[str, Any]) -> bool:
    """E19: merged or closed while the run was in flight."""
    state = str(pull_request.get("state", "open")).lower()
    return state != "open" or bool(pull_request.get("merged"))


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _build_comment(
    finding: CanonicalFinding, assignment: RungAssignment, secrets: Sequence[str] = ()
) -> ReviewComment:
    body = _comment_body(finding, assignment, secrets)
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


def _comment_body(
    finding: CanonicalFinding, assignment: RungAssignment, secrets: Sequence[str] = ()
) -> str:
    """One comment's markdown, redacted — E26.

    A finding about a hardcoded credential quotes the credential; this is the last point before
    it would be published to a pull request anyone can read.
    """
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
    return redact("\n\n".join(parts), secrets=secrets)


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
    secrets: Sequence[str] = (),
) -> str:
    """The review body, redacted (E26) — it is published *and* persisted in `review_payload`."""
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
    return redact("\n\n".join(sections), secrets=secrets)


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
    "DEGRADATION_COMMENTS_UNREADABLE",
    "DEGRADATION_POST_UNCONFIRMED",
    "DEGRADATION_UNPOSTED",
    "FINGERPRINT_MARKER",
    "MAX_POST_ATTEMPTS",
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
    "assert_delivery_conservation",
    "build_review_payload",
    "fingerprint_of_comment",
    "plan_comment_reuse",
    "post_review",
]
