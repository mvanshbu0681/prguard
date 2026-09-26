"""Re-review updates, it does not repeat itself — spec §7 E3, AC-7a.

A force-push re-review that re-posts the same bug reads as a broken bot, and the second copy
teaches the team to mute the integration. So a fingerprint that already carries a live comment
on this PR is **updated**; its ladder rung does not change and no new comment is created.

The decision is a pure function (`plan_comment_reuse`) tested here on its own, plus one
end-to-end pass over the recorded comments so the fingerprint marker is proven to round-trip
through a real GitHub body. T9 proves the whole force-push flow.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import respx

from prguard.core.delivery.comment_ladder import assert_conservation
from prguard.core.delivery.review_poster import (
    FINGERPRINT_MARKER,
    ExistingComment,
    fingerprint_of_comment,
    plan_comment_reuse,
    post_review,
)
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
from tests.fixtures.loader import github_response

REVIEWS_PATH = f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}/reviews"
PR_PATH = f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}"

#: The fingerprints run 1 left behind, per `github/pr_review_comments_existing.json`.
BILLING_FINGERPRINT = "4c1f9b5e7a2d8c30"
BILLING_COMMENT_ID = 1188402931
CHECKOUT_FINGERPRINT = "9d3a7c21e0b45f68"


def existing_comments() -> list[ExistingComment]:
    """The recorded comments, parsed the way production parses them."""
    return [
        ExistingComment(
            comment_id=comment["id"],
            path=comment["path"],
            line=comment["line"],
            fingerprint=fingerprint_of_comment(comment["body"]),
        )
        for comment in github_response("pr_review_comments_existing").body
    ]


def billing_line_map() -> dict[str, LineMap]:
    return {"app/billing.py": LineMap("app/billing.py", commentable_lines=frozenset({40, 41, 42}))}


async def deliver(
    findings: list[CanonicalFinding], line_maps: dict[str, LineMap], **kwargs: Any
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


def test_the_fingerprint_marker_round_trips_through_a_recorded_body() -> None:
    """The marker is the join key across runs; if it does not parse, E3 silently stops working."""
    parsed = [comment.fingerprint for comment in existing_comments()]

    assert parsed == [BILLING_FINGERPRINT, CHECKOUT_FINGERPRINT]
    assert fingerprint_of_comment(FINGERPRINT_MARKER.format(fingerprint="abc123")) == "abc123"
    assert fingerprint_of_comment("a human's comment about naming") is None


def test_plan_comment_reuse_partitions_every_finding() -> None:
    """Nothing may fall between "update" and "post" — that would be a dropped finding."""
    known = make_finding(id="f-known", fingerprint=BILLING_FINGERPRINT)
    novel = make_finding(id="f-novel", fingerprint="ffffffffffffffff")
    unfingerprinted = make_finding(id="f-raw", fingerprint=None)

    plan = plan_comment_reuse([known, novel, unfingerprinted], existing_comments())

    assert plan.updates == {"f-known": BILLING_COMMENT_ID}
    assert plan.fresh == ("f-novel", "f-raw")
    assert set(plan.updates) | set(plan.fresh) == {"f-known", "f-novel", "f-raw"}
    assert not set(plan.updates) & set(plan.fresh)


def test_a_comment_that_is_not_ours_is_never_reused() -> None:
    """A human's review comment carries no marker and must not be overwritten."""
    finding = make_finding(fingerprint=None)
    human = ExistingComment(comment_id=99, path="app/billing.py", fingerprint=None, line=41)

    plan = plan_comment_reuse([finding], [human])

    assert plan.updates == {}
    assert plan.fresh == (finding.id,)


async def test_a_matching_fingerprint_is_updated_not_reposted(github_mock: respx.Router) -> None:
    """AC-7a: zero duplicate comments on a re-review of the same bug."""
    finding = make_finding(id="f-known", fingerprint=BILLING_FINGERPRINT)
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    patch = github_mock.patch(f"/repos/{OWNER}/{REPO}/pulls/comments/{BILLING_COMMENT_ID}").mock(
        return_value=httpx.Response(200, json={"id": BILLING_COMMENT_ID})
    )
    reviews = github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_created"))

    delivery = await deliver(
        [finding], billing_line_map(), existing_comments=existing_comments()
    )

    assert patch.call_count == 1
    assert reviews.call_count == 1, "still exactly one review per run"
    assert delivery.payload.comments == (), "the finding was delivered by update, not by repost"
    assert delivery.updated_comment_ids == (BILLING_COMMENT_ID,)


async def test_reuse_leaves_the_delivery_mode_alone(github_mock: respx.Router) -> None:
    """E3: `delivery_mode` unchanged. An updated comment did not change rungs."""
    finding = make_finding(id="f-known", fingerprint=BILLING_FINGERPRINT)
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    github_mock.patch(f"/repos/{OWNER}/{REPO}/pulls/comments/{BILLING_COMMENT_ID}").mock(
        return_value=httpx.Response(200, json={"id": BILLING_COMMENT_ID})
    )
    github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_created"))

    delivery = await deliver(
        [finding], billing_line_map(), existing_comments=existing_comments()
    )

    assert delivery.assignments["f-known"].mode == "inline_exact"
    assert delivery.ladder_breakdown.inline_exact == 1


async def test_conservation_counts_updated_findings_too(github_mock: respx.Router) -> None:
    """A finding delivered by update is still a delivered finding (AC-17 + AC-7a together)."""
    known = make_finding(id="f-known", fingerprint=BILLING_FINGERPRINT)
    novel = make_finding(id="f-novel", start_line=40, end_line=40, fingerprint="0" * 16)
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    github_mock.patch(f"/repos/{OWNER}/{REPO}/pulls/comments/{BILLING_COMMENT_ID}").mock(
        return_value=httpx.Response(200, json={"id": BILLING_COMMENT_ID})
    )
    route = github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_created"))

    delivery = await deliver(
        [known, novel], billing_line_map(), existing_comments=existing_comments()
    )

    breakdown = assert_conservation(["f-known", "f-novel"], delivery.assignments)
    assert breakdown.total == 2
    assert [c.finding_id for c in delivery.payload.comments] == ["f-novel"]
    assert route.call_count == 1


async def test_a_failed_update_falls_back_into_the_review(github_mock: respx.Router) -> None:
    """If the PATCH is refused the finding rejoins the review — never lost to a failed update."""
    finding = make_finding(id="f-known", fingerprint=BILLING_FINGERPRINT)
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    github_mock.patch(f"/repos/{OWNER}/{REPO}/pulls/comments/{BILLING_COMMENT_ID}").mock(
        return_value=recorded("review_403_forbidden")
    )
    route = github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_created"))

    delivery = await deliver(
        [finding], billing_line_map(), existing_comments=existing_comments()
    )

    assert delivery.updated_comment_ids == ()
    assert [c.finding_id for c in delivery.payload.comments] == ["f-known"]
    assert route.call_count == 1


async def test_the_updated_body_carries_the_fingerprint_forward(
    github_mock: respx.Router,
) -> None:
    """The next run has to be able to find this comment again."""
    finding = make_finding(id="f-known", fingerprint=BILLING_FINGERPRINT)
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    patch = github_mock.patch(f"/repos/{OWNER}/{REPO}/pulls/comments/{BILLING_COMMENT_ID}").mock(
        return_value=httpx.Response(200, json={"id": BILLING_COMMENT_ID})
    )
    github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_created"))

    await deliver([finding], billing_line_map(), existing_comments=existing_comments())

    body = json.loads(patch.calls[0].request.content)["body"]
    assert fingerprint_of_comment(body) == BILLING_FINGERPRINT
    assert finding.title in body
