"""The GitHub client — spec §8.1, §7 E27, plan T6.8. Every response here is a recorded one.

Two things are being proven: that a failure becomes a *typed* error the pipeline can degrade
on (403 vs 404 vs 422 vs rate limit are four different decisions), and that the retry policy
is bounded — three attempts, exponential backoff, and a rate-limit wait that never exceeds
`GITHUB_MAX_WAIT`. A reviewer that hangs for an hour waiting on a reset window is a reviewer
nobody turns on twice.

No test here sleeps: the clock is injected.
"""

from __future__ import annotations

from email.utils import parsedate_to_datetime

import httpx
import pytest
import respx

from prguard.core.delivery.github_client import (
    DEFAULT_MAX_WAIT_SECONDS,
    MAX_ATTEMPTS,
    GitHubClient,
    GitHubForbiddenError,
    GitHubNotFoundError,
    GitHubRateLimitError,
    GitHubUnavailableError,
    GitHubValidationError,
)
from tests.delivery.conftest import (
    API_BASE,
    HEAD_SHA,
    OWNER,
    PR_NUMBER,
    REPO,
    SleepRecorder,
    make_client,
    recorded,
)

#: The `date` header on the recorded rate-limit 403 — the clock every wait is measured against.
RECORDED_DATE = "Mon, 14 Sep 2026 23:39:35 GMT"


async def test_get_pull_request_returns_the_recorded_body(github_mock: respx.Router) -> None:
    route = github_mock.get(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}").mock(
        return_value=recorded("pr_detail")
    )

    async with make_client() as client:
        pull_request = await client.get_pull_request(OWNER, REPO, PR_NUMBER)

    assert route.call_count == 1
    assert pull_request["number"] == PR_NUMBER
    assert pull_request["state"] == "open"


async def test_every_request_is_authenticated_and_version_pinned(
    github_mock: respx.Router,
) -> None:
    route = github_mock.get(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}").mock(
        return_value=recorded("pr_detail")
    )

    async with make_client() as client:
        await client.get_pull_request(OWNER, REPO, PR_NUMBER)

    headers = route.calls[0].request.headers
    assert headers["authorization"] == "Bearer ghp_test_token"
    assert headers["accept"] == "application/vnd.github+json"
    assert headers["x-github-api-version"]


async def test_404_maps_to_a_typed_error(github_mock: respx.Router) -> None:
    route = github_mock.get(f"/repos/{OWNER}/{REPO}/pulls/99").mock(
        return_value=recorded("pr_404_not_found")
    )

    async with make_client() as client:
        with pytest.raises(GitHubNotFoundError):
            await client.get_pull_request(OWNER, REPO, 99)

    assert route.call_count == 1, "a 404 is an answer, not a transient failure — never retried"


async def test_403_maps_to_forbidden(github_mock: respx.Router) -> None:
    github_mock.post(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}/reviews").mock(
        return_value=recorded("review_403_forbidden")
    )

    async with make_client() as client:
        with pytest.raises(GitHubForbiddenError) as raised:
            await client.create_review(OWNER, REPO, PR_NUMBER, {"event": "COMMENT"})

    assert not isinstance(raised.value, GitHubRateLimitError), (
        "a permissions 403 carries no x-ratelimit-remaining: 0 and must not look like one"
    )
    assert raised.value.status == 403


async def test_422_carries_the_comments_github_named(github_mock: respx.Router) -> None:
    """The 422 body names the offending comment; that is what makes E2's demotion possible."""
    github_mock.post(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}/reviews").mock(
        return_value=recorded("review_422_out_of_hunk")
    )

    async with make_client() as client:
        with pytest.raises(GitHubValidationError) as raised:
            await client.create_review(OWNER, REPO, PR_NUMBER, {"event": "COMMENT"})

    assert raised.value.rejected_comments == (("app/checkout.py", 91),)


async def test_rate_limit_waits_for_the_reset_then_retries(github_mock: respx.Router) -> None:
    """E27: the recorded 403 says wait 25 s — inside the budget — so the call is retried."""
    sleep = SleepRecorder()
    route = github_mock.get(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}/files").mock(
        side_effect=[recorded("rate_limit_403"), recorded("pr_42_files")]
    )

    async with make_client(sleep) as client:
        files = await client.list_pull_request_files(OWNER, REPO, PR_NUMBER)

    assert route.call_count == 2
    assert sleep.waits == [pytest.approx(25.0, abs=1.0)]
    assert [entry["filename"] for entry in files] == ["app/billing.py", "app/checkout.py"]


def _rate_limited(seconds_ahead: int) -> httpx.Response:
    """A primary-rate-limit 403 whose reset is `seconds_ahead` of its own `date` header."""
    sent_at = parsedate_to_datetime(RECORDED_DATE).timestamp()
    return httpx.Response(
        403,
        headers={
            "date": RECORDED_DATE,
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": str(int(sent_at) + seconds_ahead),
        },
        json={"message": "API rate limit exceeded for user ID 583231."},
    )


async def test_the_reset_header_drives_the_wait_when_no_retry_after_is_sent(
    github_mock: respx.Router,
) -> None:
    """A primary rate limit sends no `retry-after`; the wait comes from GitHub's own clock."""
    sleep = SleepRecorder()
    route = github_mock.get(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}/files").mock(
        side_effect=[_rate_limited(30), recorded("pr_42_files")]
    )

    async with make_client(sleep) as client:
        await client.list_pull_request_files(OWNER, REPO, PR_NUMBER)

    assert route.call_count == 2
    assert sleep.waits == [pytest.approx(30.0, abs=1.0)]


async def test_a_reset_beyond_the_budget_fails_without_waiting(github_mock: respx.Router) -> None:
    """E27: the wait is bounded by GITHUB_MAX_WAIT. Past it, fail the stage immediately."""
    sleep = SleepRecorder()
    route = github_mock.get(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}/files").mock(
        side_effect=[_rate_limited(3600), _rate_limited(3600), _rate_limited(3600)]
    )

    async with make_client(sleep) as client:
        with pytest.raises(GitHubRateLimitError) as raised:
            await client.list_pull_request_files(OWNER, REPO, PR_NUMBER)

    assert route.call_count == 1
    assert sleep.waits == []
    assert raised.value.retry_after is not None
    assert raised.value.retry_after > DEFAULT_MAX_WAIT_SECONDS


async def test_5xx_is_retried_with_growing_backoff(github_mock: respx.Router) -> None:
    sleep = SleepRecorder()
    route = github_mock.get(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}").mock(
        return_value=httpx.Response(502, json={"message": "Server Error"})
    )

    async with make_client(sleep) as client:
        with pytest.raises(GitHubUnavailableError):
            await client.get_pull_request(OWNER, REPO, PR_NUMBER)

    assert route.call_count == MAX_ATTEMPTS == 3
    assert len(sleep.waits) == MAX_ATTEMPTS - 1
    assert sleep.waits == sorted(sleep.waits) and sleep.waits[0] < sleep.waits[-1]


async def test_a_transport_failure_is_retried_then_succeeds(github_mock: respx.Router) -> None:
    sleep = SleepRecorder()
    route = github_mock.get(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}").mock(
        side_effect=[httpx.ConnectError("no route to host"), recorded("pr_detail")]
    )

    async with make_client(sleep) as client:
        pull_request = await client.get_pull_request(OWNER, REPO, PR_NUMBER)

    assert route.call_count == 2
    assert len(sleep.waits) == 1
    assert pull_request["number"] == PR_NUMBER


async def test_jitter_is_applied_to_the_backoff(github_mock: respx.Router) -> None:
    """Fixed backoff synchronises every worker onto the same retry instant; jitter breaks that."""
    sleep = SleepRecorder()
    github_mock.get(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}").mock(
        return_value=httpx.Response(500, json={"message": "Server Error"})
    )

    client = GitHubClient(token="t", sleep=sleep, jitter=lambda: 1.0)
    async with client:
        with pytest.raises(GitHubUnavailableError):
            await client.get_pull_request(OWNER, REPO, PR_NUMBER)

    unjittered = SleepRecorder()
    async with make_client(unjittered) as plain:
        with pytest.raises(GitHubUnavailableError):
            await plain.get_pull_request(OWNER, REPO, PR_NUMBER)

    assert sleep.waits[0] > unjittered.waits[0]


async def test_commit_status_posts_to_the_recorded_path(github_mock: respx.Router) -> None:
    route = github_mock.post(f"/repos/{OWNER}/{REPO}/statuses/{HEAD_SHA}").mock(
        return_value=recorded("commit_status_created")
    )

    async with make_client() as client:
        status = await client.create_commit_status(
            OWNER, REPO, HEAD_SHA, {"state": "failure", "context": "prguard/merge-gate"}
        )

    assert route.call_count == 1
    assert status["context"] == "prguard/merge-gate"


async def test_check_run_403_is_typed_so_the_gate_can_fall_through(
    github_mock: respx.Router,
) -> None:
    """E18: a PAT cannot create a check run. Expected, not an error — but it must be catchable."""
    github_mock.post(f"/repos/{OWNER}/{REPO}/check-runs").mock(
        return_value=recorded("check_run_403_app_only")
    )

    async with make_client() as client:
        with pytest.raises(GitHubForbiddenError):
            await client.create_check_run(OWNER, REPO, {"name": "prguard/merge-gate"})


async def test_list_tree_returns_only_the_blob_paths(github_mock: respx.Router) -> None:
    """S2 discovers callers from this listing; a `tree` entry is a directory, not a caller."""
    route = github_mock.get(f"/repos/{OWNER}/{REPO}/git/trees/{HEAD_SHA}").mock(
        return_value=recorded("git_tree_buggy_calc")
    )

    async with make_client() as client:
        paths = await client.list_tree(OWNER, REPO, ref=HEAD_SHA)

    assert route.call_count == 1
    assert route.calls[0].request.url.params["recursive"] == "1"
    assert "app/orders.py" in paths, "the caller outside the diff must be discoverable"
    assert "app" not in paths and "tests" not in paths, "directories are not files"


async def test_list_tree_is_retried_because_a_read_has_no_side_effect(
    github_mock: respx.Router,
) -> None:
    """Unlike `create_review`, a 502 here proves nothing happened — asking again is free."""
    sleep = SleepRecorder()
    route = github_mock.get(f"/repos/{OWNER}/{REPO}/git/trees/{HEAD_SHA}").mock(
        side_effect=[
            httpx.Response(502, json={"message": "Server Error"}),
            recorded("git_tree_buggy_calc"),
        ]
    )

    async with make_client(sleep) as client:
        paths = await client.list_tree(OWNER, REPO, ref=HEAD_SHA)

    assert route.call_count == 2
    assert len(sleep.waits) == 1
    assert "app/billing.py" in paths


async def test_list_tree_404_is_typed_so_discovery_can_degrade(github_mock: respx.Router) -> None:
    github_mock.get(f"/repos/{OWNER}/{REPO}/git/trees/{HEAD_SHA}").mock(
        return_value=recorded("pr_404_not_found")
    )

    async with make_client() as client:
        with pytest.raises(GitHubNotFoundError):
            await client.list_tree(OWNER, REPO, ref=HEAD_SHA)


async def test_list_tree_survives_a_body_without_a_tree(github_mock: respx.Router) -> None:
    """A shape we did not expect is an empty search, never an exception inside S2 (§8.1)."""
    github_mock.get(f"/repos/{OWNER}/{REPO}/git/trees/{HEAD_SHA}").mock(
        return_value=httpx.Response(200, json={"sha": HEAD_SHA, "truncated": True})
    )

    async with make_client() as client:
        assert await client.list_tree(OWNER, REPO, ref=HEAD_SHA) == ()


async def test_an_unauthenticated_client_sends_no_authorization_header(
    github_mock: respx.Router,
) -> None:
    route = github_mock.get(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}").mock(
        return_value=recorded("pr_detail")
    )

    async with GitHubClient(base_url=API_BASE) as client:
        await client.get_pull_request(OWNER, REPO, PR_NUMBER)

    assert "authorization" not in route.calls[0].request.headers
