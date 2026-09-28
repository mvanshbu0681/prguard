"""Delivery degrades, it never fails — spec §7 E17/E19/E24, §8.1 S8, AC-24.

The demo repo may well be one we cannot write to (X4, Q3 unresolved), so "GitHub said no" has
to be an ordinary outcome: the payload is preserved in full and served from `/result`, and the
run succeeds. Nothing in this file may raise — an exception escaping S8 would fail a run over a
missing permission, which is exactly the failure mode E17 exists to prevent.
"""

from __future__ import annotations

from typing import Any

import httpx
import respx

from prguard.core.delivery.comment_ladder import assert_conservation
from prguard.core.delivery.review_poster import (
    DEGRADATION_UNPOSTED,
    SUMMARY_SECTION_HEADING,
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


async def test_403_on_review_preserves_payload(
    github_mock: respx.Router,
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
) -> None:
    """AC-24: no write access → `degraded`, and the complete unposted payload survives."""
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    route = github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_403_forbidden"))

    delivery = await deliver(ladder_findings, ladder_line_maps)

    assert route.call_count == 1, "a permissions 403 is an answer; retrying spends rate limit"
    assert delivery.status == "degraded"
    assert delivery.github_review_id is None
    assert DEGRADATION_UNPOSTED in delivery.degradations
    assert "Resource not accessible" in delivery.detail

    # The whole review, exactly as GitHub would have received it, ready for /result.
    payload = delivery.payload.as_payload()
    assert payload["event"] == "COMMENT"
    assert payload["commit_id"] == HEAD_SHA
    assert len(payload["comments"]) == 5
    assert SUMMARY_SECTION_HEADING in payload["body"]


async def test_no_finding_is_lost_when_delivery_degrades(
    github_mock: respx.Router,
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
) -> None:
    """E17 must not become a back door around AC-17."""
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_403_forbidden"))

    delivery = await deliver(ladder_findings, ladder_line_maps)

    breakdown = assert_conservation([f.id for f in ladder_findings], delivery.assignments)
    assert breakdown == delivery.ladder_breakdown
    assert breakdown.total == len(ladder_findings)


async def test_a_404_degrades_rather_than_raising(
    github_mock: respx.Router,
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
) -> None:
    """§8.1: S8 is a degrading stage. A deleted PR must not take the run down with it."""
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_404_not_found"))

    delivery = await deliver(ladder_findings, ladder_line_maps)

    assert delivery.status == "degraded"
    assert delivery.payload.comments


async def test_a_rate_limited_post_degrades(
    github_mock: respx.Router,
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
) -> None:
    """E27 in S8: bounded wait, then degrade — never a run failed over a rate limit."""
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    github_mock.post(REVIEWS_PATH).mock(
        return_value=httpx.Response(
            403,
            headers={
                "date": "Mon, 14 Sep 2026 23:39:35 GMT",
                "x-ratelimit-remaining": "0",
                "x-ratelimit-reset": "9999999999",
            },
            json={"message": "API rate limit exceeded for user ID 583231."},
        )
    )

    delivery = await deliver(ladder_findings, ladder_line_maps)

    assert delivery.status == "degraded"
    assert DEGRADATION_UNPOSTED in delivery.degradations


async def test_a_pr_closed_mid_run_is_skipped_not_posted(
    github_mock: respx.Router,
    ladder_findings: list[CanonicalFinding],
    ladder_line_maps: dict[str, LineMap],
) -> None:
    """E19: complete the analysis, skip the posting, keep the payload, succeed."""
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail_closed"))
    route = github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_created"))

    delivery = await deliver(ladder_findings, ladder_line_maps)

    assert route.call_count == 0, "nobody wants a review on a PR that merged an hour ago"
    assert delivery.status == "skipped_pr_closed"
    assert delivery.ladder_breakdown.total == len(ladder_findings)
    assert delivery.payload.comments, "the analysis is still worth serving from /result"


async def test_zero_findings_is_a_good_outcome(github_mock: respx.Router) -> None:
    """E24: say "nothing found" in one line. Do not manufacture a nitpick to look busy."""
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    route = github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_created"))

    delivery = await deliver([], {})

    assert delivery.status == "posted"
    assert delivery.comments_posted == 0
    assert delivery.ladder_breakdown.as_dict() == {
        "inline_exact": 0,
        "inline_nearest": 0,
        "file_level": 0,
        "summary_only": 0,
    }

    body = delivery.payload.body
    assert "No blocking issues found; 2 files reviewed." in body
    assert SUMMARY_SECTION_HEADING not in body
    assert len(body.splitlines()) <= 6, f"E24 asks for a short body, got:\n{body}"
    assert route.call_count == 1


async def test_a_degraded_zero_finding_run_still_keeps_its_payload(
    github_mock: respx.Router,
) -> None:
    github_mock.get(PR_PATH).mock(return_value=recorded("pr_detail"))
    github_mock.post(REVIEWS_PATH).mock(return_value=recorded("review_403_forbidden"))

    delivery = await deliver([], {})

    assert delivery.status == "degraded"
    assert "No blocking issues found" in delivery.payload.body
