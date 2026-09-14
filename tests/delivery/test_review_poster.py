"""Posting the one review — spec §4.7, §7 E2, AC-17, AC-18. Every GitHub call is recorded.

The two claims under test:

* **One review per run.** Exactly one `POST …/pulls/{n}/reviews`, `line`/`side`/`start_line`/
  `start_side` only, never `position`.
* **A 422 moves findings between rungs without losing one.** The conservation invariant is
  re-asserted *after* the retry, which is the only moment it could plausibly break.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
import respx

from prguard.core.delivery.comment_ladder import assert_conservation
from prguard.core.delivery.review_poster import (
    DEGRADATION_422,
    MAX_REVIEW_RETRIES,
    ReviewEventError,
    post_review,
)
from prguard.core.types import CanonicalFinding, LineMap
from tests.delivery.conftest import (
    HEAD_SHA,
    OWNER,
    PR_NUMBER,
    REPO,
    make_client,
    recorded,
)

REVIEWS_PATH = f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}/reviews"
PR_PATH = f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}"


def sent_payload(route: respx.Route, index: int = 0) -> dict[str, Any]:
    """The request body of the `index`-th call GitHub actually received."""
    body = json.loads(route.calls[index].request.content)
    assert isinstance(body, dict)
    return body


async def deliver(
    findings: list[CanonicalFinding],
    line_maps: dict[str, LineMap],
    **kwargs: Any,
) -> Any:
    async with make_client() as client:
        return await post_review(
            client=client,
            owner=OWNER,
            repo=REPO,
            pr_number=PR_NUMBER,
            findings=findings,
            line_maps=line_maps,
            files_reviewed=2,
            commit_id=HEAD_SHA,
            **kwargs,
        )


async def test_exactly_one_review_api_call(
    github_mock: respx.Router,
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
    ladder_expectations: dict[str, Any],
) -> None:
    """AC-17: one review, one call, every finding on its rung."""
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    route = github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_created"))

    delivery = await deliver(ladder_findings, ladder_line_maps)

    assert route.call_count == 1
    assert delivery.status == "posted"
    assert delivery.github_review_id == 2938475
    assert delivery.ladder_breakdown.as_dict() == ladder_expectations[
        "expected_ladder_breakdown"
    ]
    assert delivery.ladder_breakdown.total == len(ladder_findings)


async def test_the_review_carries_the_governance_event_and_head_sha(
    github_mock: respx.Router,
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
) -> None:
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    route = github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_created"))

    await deliver(ladder_findings, ladder_line_maps)
    body = sent_payload(route)

    assert body["event"] == "COMMENT"
    assert body["commit_id"] == HEAD_SHA


async def test_comments_use_line_and_side_and_never_position(
    github_mock: respx.Router,
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
) -> None:
    """§4.7: `position` is the deprecated field that made half of GitHub's integrations fragile."""
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    route = github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_created"))

    await deliver(ladder_findings, ladder_line_maps)
    comments = sent_payload(route)["comments"]

    assert comments, "the ladder put five findings on a comment rung"
    for comment in comments:
        assert "position" not in comment
        assert set(comment) <= {
            "path",
            "body",
            "line",
            "side",
            "start_line",
            "start_side",
            "subject_type",
        }
        if "line" in comment:
            assert comment["side"] == "RIGHT"


async def test_file_level_comments_use_the_file_subject_type(
    github_mock: respx.Router,
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
) -> None:
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    route = github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_created"))

    await deliver(ladder_findings, ladder_line_maps)
    comments = sent_payload(route)["comments"]
    file_level = [comment for comment in comments if comment.get("subject_type") == "file"]

    assert len(file_level) == 2
    for comment in file_level:
        assert "line" not in comment


async def test_the_nearest_rung_says_where_the_issue_really_is(
    github_mock: respx.Router,
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
) -> None:
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    route = github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_created"))

    await deliver(ladder_findings, ladder_line_maps)
    bodies = [comment["body"] for comment in sent_payload(route)["comments"]]

    note = "Nearest reviewable line. The issue is at `app/checkout.py:97`."
    assert any(note in body for body in bodies)


async def test_summary_only_findings_appear_in_the_review_body(
    github_mock: respx.Router,
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
) -> None:
    """Rung 4 is still delivery: the finding is in the body, not in a dropped-comments log."""
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    route = github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_created"))

    await deliver(ladder_findings, ladder_line_maps)
    body = sent_payload(route)["body"]

    assert "Findings not attachable to the diff" in body
    assert "`app/receipts.py:13`" in body


async def test_422_demotes_and_retries_once(
    github_mock: respx.Router,
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
    ladder_expectations: dict[str, Any],
) -> None:
    """AC-18: one retry, the named comment demoted one rung, the finding still delivered."""
    expected = ladder_expectations["after_422_retry"]
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    route = github_mock.post(REVIEWS_PATH).mock(
        side_effect=[recorded("review_422_out_of_hunk"), recorded("review_created")]
    )

    delivery = await deliver(ladder_findings, ladder_line_maps)

    assert route.call_count == 1 + MAX_REVIEW_RETRIES == 2
    assert delivery.status == "posted"
    assert delivery.degradations == tuple(expected["degradations"]) == (DEGRADATION_422,)
    assert delivery.ladder_breakdown.as_dict() == expected["expected_ladder_breakdown"]
    for finding_id in expected["rejected_by_github"]:
        assert delivery.assignments[finding_id].mode == "file_level"


async def test_conservation_is_re_asserted_after_the_retry(
    github_mock: respx.Router,
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
) -> None:
    """AC-17 must survive AC-18: findings move between rungs, none leaves the ladder."""
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    github_mock.post(REVIEWS_PATH).mock(
        side_effect=[recorded("review_422_out_of_hunk"), recorded("review_created")]
    )

    delivery = await deliver(ladder_findings, ladder_line_maps)

    breakdown = assert_conservation([f.id for f in ladder_findings], delivery.assignments)
    assert breakdown == delivery.ladder_breakdown
    assert breakdown.total == len(ladder_findings)


async def test_the_retried_review_no_longer_anchors_on_the_rejected_line(
    github_mock: respx.Router,
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
) -> None:
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    route = github_mock.post(REVIEWS_PATH).mock(
        side_effect=[recorded("review_422_out_of_hunk"), recorded("review_created")]
    )

    await deliver(ladder_findings, ladder_line_maps)

    first = sent_payload(route, 0)["comments"]
    second = sent_payload(route, 1)["comments"]
    anchored_at_91 = [c for c in first if c.get("line") == 91]
    retried_at_91 = [c for c in second if c.get("line") == 91]

    assert len(anchored_at_91) == 2, "both nearest-rung findings anchored on line 91"
    assert len(retried_at_91) == 1, "the weakest claim to that anchor gave it up"


async def test_a_second_422_demotes_the_survivor_to_the_summary(
    github_mock: respx.Router,
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
) -> None:
    """§4.7: 'remaining failures demote to summary_only' — still delivered, in the body."""
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    route = github_mock.post(REVIEWS_PATH).mock(
        side_effect=[
            recorded("review_422_out_of_hunk"),
            recorded("review_422_out_of_hunk"),
            recorded("review_created"),
        ]
    )

    delivery = await deliver(ladder_findings, ladder_line_maps)

    assert route.call_count == 3, "one retry, then a final post of the demoted survivors"
    assert delivery.status == "posted"
    assert delivery.ladder_breakdown.total == len(ladder_findings)
    assert delivery.ladder_breakdown.inline_nearest == 0
    assert not [c for c in sent_payload(route, 2)["comments"] if c.get("line") == 91]


async def test_an_unrepairable_422_degrades_instead_of_dropping_the_review(
    github_mock: respx.Router,
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
) -> None:
    """A 422 naming nothing we posted cannot be repaired by demotion — so persist and degrade."""
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    route = github_mock.post(REVIEWS_PATH).mock(
        return_value=httpx_422_about_something_else()
    )

    delivery = await deliver(ladder_findings, ladder_line_maps)

    assert route.call_count == 1
    assert delivery.status == "degraded"
    assert delivery.payload.comments, "the payload we could not post is preserved in full"
    assert delivery.ladder_breakdown.total == len(ladder_findings)


def httpx_422_about_something_else() -> Any:
    import httpx

    return httpx.Response(
        422,
        json={
            "message": "Validation Failed",
            "errors": [{"resource": "PullRequestReview", "field": "body", "code": "missing"}],
        },
    )


async def test_zero_findings_still_posts_exactly_one_review(github_mock: respx.Router) -> None:
    """E24: a clean PR gets a short, honest review — and no manufactured nitpick."""
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    route = github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_created"))

    delivery = await deliver([], {})

    assert route.call_count == 1
    body = sent_payload(route)
    assert body["comments"] == []
    assert "No blocking issues found; 2 files reviewed." in body["body"]
    assert delivery.ladder_breakdown.total == 0
    assert delivery.comments_posted == 0


async def test_a_dry_run_makes_no_write_call_at_all(
    github_mock: respx.Router,
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
) -> None:
    """`GITHUB_DELIVERY_MODE=dry_run` (§4.8): build the payload, post nothing."""
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    route = github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_created"))

    delivery = await deliver(ladder_findings, ladder_line_maps, dry_run=True)

    assert route.call_count == 0
    assert delivery.status == "dry_run"
    assert delivery.payload.as_payload()["event"] == "COMMENT"
    assert delivery.ladder_breakdown.total == len(ladder_findings)


async def test_delivery_without_a_client_is_a_dry_run(
    ladder_findings: list[CanonicalFinding], ladder_line_maps: dict[str, LineMap]
) -> None:
    """No `GITHUB_TOKEN` is not an error: the payload is still built and served (E17/X4)."""
    from prguard.core.delivery.review_poster import post_review as post

    delivery = await post(
        client=None,
        owner=OWNER,
        repo=REPO,
        pr_number=PR_NUMBER,
        findings=ladder_findings,
        line_maps=ladder_line_maps,
        files_reviewed=2,
        commit_id=HEAD_SHA,
    )

    assert delivery.status == "dry_run"
    assert delivery.ladder_breakdown.total == len(ladder_findings)


async def test_the_poster_cannot_be_talked_into_another_event(
    ladder_findings: list[CanonicalFinding], ladder_line_maps: dict[str, LineMap]
) -> None:
    with pytest.raises(ReviewEventError):
        await deliver(ladder_findings, ladder_line_maps, event="REQUEST_CHANGES")
