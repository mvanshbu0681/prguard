"""Reviewer-authored repros for track T6 (review round 1). Not part of the builder's suite.

Each test here failed on the reviewed commit and names the finding it reproduces: F1/R4 a
published finding reaching GitHub nowhere, F2 a stale `ladder_breakdown`, F3/R3 a 502 turning
one review into several, F4/R6 a secret published verbatim to a public pull request.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import respx

from prguard.core.delivery.comment_ladder import assert_conservation, ladder_breakdown
from prguard.core.delivery.review_poster import ExistingComment, post_review
from prguard.core.types import CanonicalFinding, LineMap
from tests.delivery.conftest import (
    HEAD_SHA,
    OWNER,
    PR_NUMBER,
    REPO,
    make_client,
    make_finding,
    recorded,
)

REVIEWS_PATH = f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}/reviews"
PR_PATH = f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}"


def invalid(path: str, line: int) -> httpx.Response:
    return httpx.Response(422, json={"message": "Validation Failed", "errors": [
        {"resource": "PullRequestReviewComment", "code": "custom", "field": "line",
         "path": path, "line": line, "message": "line must be part of the diff"}]})


async def deliver(
    findings: list[CanonicalFinding], line_maps: dict[str, LineMap], **kw: Any
) -> Any:
    async with make_client() as client:
        return await post_review(
            client=client, owner=OWNER, repo=REPO, pr_number=PR_NUMBER,
            findings=findings, line_maps=line_maps, files_reviewed=2,
            commit_id=HEAD_SHA, **kw,
        )


async def test_F1_two_findings_sharing_a_fingerprint_lose_one(github_mock: respx.Router) -> None:
    """F1 (P1). Two findings in one symbol share a fingerprint (fingerprint.compute, AC-6).

    On re-review both map to the same live comment id: the second PATCH overwrites the first
    and BOTH are excluded from the review payload. One published finding reaches GitHub
    nowhere, while `assert_conservation` still passes and status is "posted".
    """
    fp = "7d04eb65e727da7c"
    a = make_finding(id="f-a", fingerprint=fp, start_line=41, end_line=41, title="BUG A")
    b = make_finding(id="f-b", fingerprint=fp, start_line=42, end_line=42, title="BUG B")
    lm = {"app/billing.py": LineMap("app/billing.py", commentable_lines=frozenset({41, 42}))}

    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    patch = github_mock.patch(f"/repos/{OWNER}/{REPO}/pulls/comments/777").mock(
        return_value=httpx.Response(200, json={"id": 777}))
    reviews = github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_created"))

    d = await deliver([a, b], lm, existing_comments=[
        ExistingComment(comment_id=777, path="app/billing.py", fingerprint=fp, line=41)])

    # The rung table alone cannot see this drop — it passed while a finding was overwritten.
    assert_conservation(["f-a", "f-b"], d.assignments)
    assert d.status == "posted"
    assert patch.call_count == 2  # both findings PATCH the SAME comment 777
    wire = json.loads(reviews.calls[0].request.content)
    everything = json.dumps(wire) + json.dumps(
        [json.loads(c.request.content) for c in patch.calls[-1:]])
    lost = [t for t in ("BUG A", "BUG B") if t not in everything]
    assert not lost, f"published findings that reached GitHub nowhere: {lost}"


async def test_F2_ladder_breakdown_goes_stale_after_a_third_422(github_mock: respx.Router) -> None:
    """F2 (P2). `_demote_rejected` mutates `assignments` on the final attempt, but the
    breakdown returned to /result was computed one attempt earlier."""
    f1 = make_finding(id="f-1", start_line=41, end_line=41, fingerprint="1" * 16)
    f2 = make_finding(id="f-2", start_line=43, end_line=43, fingerprint="2" * 16)
    lm = {"app/billing.py": LineMap("app/billing.py", commentable_lines=frozenset({41, 42, 43}))}

    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    github_mock.post(REVIEWS_PATH).mock(side_effect=[
        invalid("app/billing.py", 41), invalid("app/billing.py", 42),
        invalid("app/billing.py", 43)])

    d = await deliver([f1, f2], lm)

    assert d.ladder_breakdown.as_dict() == ladder_breakdown(d.assignments.values()).as_dict()


async def test_F3_a_502_makes_more_than_one_review_post(github_mock: respx.Router) -> None:
    """F3 (P1). Spec 4.7 / AC-17: exactly one POST .../pulls/{n}/reviews per run.

    GitHubClient._request retries 5xx, and POST /reviews is not idempotent: a 502 returned
    after GitHub created the review posts the whole review twice.
    """
    f = make_finding(id="f-1", start_line=41, end_line=41)
    lm = {"app/billing.py": LineMap("app/billing.py", commentable_lines=frozenset({41}))}
    bad = httpx.Response(502, json={"message": "Bad gateway"})

    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    route = github_mock.post(REVIEWS_PATH).mock(
        side_effect=[bad, recorded("review_created")])

    d = await deliver([f], lm)

    assert d.status == "posted"
    assert route.call_count == 1, f"expected one review POST, GitHub received {route.call_count}"


async def test_F4_a_secret_in_a_finding_body_is_posted_unredacted(
    github_mock: respx.Router,
) -> None:
    """F4 (P2). Spec 7 E26 names delivery/review_poster.py as a redactor site for review bodies."""
    leak = "ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    f = make_finding(id="f-leak", start_line=41, end_line=41,
                     body_markdown=f"The hard-coded token `{leak}` is used as a default.")
    lm = {"app/billing.py": LineMap("app/billing.py", commentable_lines=frozenset({41}))}

    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    route = github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_created"))

    await deliver([f], lm)

    assert leak not in json.dumps(json.loads(route.calls[0].request.content))
