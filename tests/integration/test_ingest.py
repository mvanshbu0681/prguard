"""S1 — spec §4.1, §7 E16/E27, §8.1. Every failure arrives as a run-level error code.

S1 is the only stage where GitHub being unhelpful is fatal, so the mapping from "what the API
said" to "what the run reports" is the whole of this file. Four HTTP outcomes mean four
different things to a human reading `GET /v1/reviews/{id}`, and collapsing any two of them
sends someone to check the wrong thing.
"""

from __future__ import annotations

import base64

import httpx
import pytest
import respx

from prguard.core.context import ChangedFile
from prguard.core.ingest import (
    ERROR_EMPTY_DIFF,
    ERROR_GITHUB_UNAVAILABLE,
    ERROR_PR_NOT_FOUND,
    ERROR_REPO_FORBIDDEN,
    IngestError,
    fetch_file_bodies,
    ingest,
    unified_diff,
)
from tests.fixtures.loader import repo_tree
from tests.integration.conftest import (
    BASE_SHA,
    HEAD_SHA,
    OWNER,
    PR_NUMBER,
    REPO,
    contents_response,
    make_github_client,
    recorded,
)

PULLS = f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}"


async def test_ingest_resolves_the_pull_request_and_its_diff(
    github_mock: respx.Router,
) -> None:
    github_mock.get(PULLS).mock(return_value=recorded("pr_detail"))
    github_mock.get(f"{PULLS}/files").mock(return_value=recorded("pr_42_files"))

    async with make_github_client() as client:
        snapshot = await ingest(client, owner=OWNER, repo=REPO, number=PR_NUMBER)

    assert (snapshot.head_sha, snapshot.base_sha) == (HEAD_SHA, BASE_SHA)
    assert snapshot.slug == f"{OWNER}/{REPO}"
    assert snapshot.title == "Tighten discount handling"
    assert snapshot.author_login == "octocat"
    assert snapshot.state == "open"
    assert snapshot.is_draft is False
    assert snapshot.is_closed is False
    assert snapshot.default_branch == "main"
    assert [changed.path for changed in snapshot.files] == [
        "app/billing.py",
        "app/checkout.py",
    ]
    assert "diff --git a/app/billing.py b/app/billing.py" in snapshot.diff
    assert "+++ b/app/checkout.py" in snapshot.diff
    assert "@@ -36,12 +36,8 @@" in snapshot.diff


@pytest.mark.parametrize(
    ("fixture", "code"),
    [
        ("pr_404_not_found", ERROR_PR_NOT_FOUND),
        ("review_403_forbidden", ERROR_REPO_FORBIDDEN),
        ("rate_limit_403", ERROR_GITHUB_UNAVAILABLE),
    ],
)
async def test_a_github_failure_becomes_the_right_run_error_code(
    github_mock: respx.Router, fixture: str, code: str
) -> None:
    """E16/E27: private, missing and rate-limited are three different answers."""
    github_mock.get(PULLS).mock(return_value=recorded(fixture))

    async with make_github_client() as client:
        with pytest.raises(IngestError) as raised:
            await ingest(client, owner=OWNER, repo=REPO, number=PR_NUMBER)

    assert raised.value.code == code
    assert f"{OWNER}/{REPO}#{PR_NUMBER}" in raised.value.message


async def test_a_pull_request_with_no_patch_anywhere_is_fatal(
    github_mock: respx.Router,
) -> None:
    """§4.1 S1's second fatal condition: reviewing nothing would be a claim about nothing."""
    github_mock.get(PULLS).mock(return_value=recorded("pr_detail"))
    github_mock.get(f"{PULLS}/files").mock(
        return_value=httpx.Response(
            200,
            json=[{"filename": "logo.png", "status": "modified", "additions": 0}],
        )
    )

    async with make_github_client() as client:
        with pytest.raises(IngestError) as raised:
            await ingest(client, owner=OWNER, repo=REPO, number=PR_NUMBER)

    assert raised.value.code == ERROR_EMPTY_DIFF


async def test_a_merged_pull_request_is_reported_closed(github_mock: respx.Router) -> None:
    """E19 is noticed at S1 and re-checked at S8; both readings come from this flag."""
    github_mock.get(PULLS).mock(return_value=recorded("pr_detail_closed"))
    github_mock.get(f"{PULLS}/files").mock(return_value=recorded("pr_42_files"))

    async with make_github_client() as client:
        snapshot = await ingest(client, owner=OWNER, repo=REPO, number=PR_NUMBER)

    assert snapshot.is_closed is True


async def test_file_bodies_are_fetched_and_a_failure_only_costs_that_file(
    github_mock: respx.Router,
) -> None:
    """§8.1 S2: degrading. One unreadable file leaves context and says so."""
    github_mock.get(f"/repos/{OWNER}/{REPO}/contents/app/billing.py").mock(
        return_value=contents_response("buggy_calc", "app/billing.py")
    )
    github_mock.get(f"/repos/{OWNER}/{REPO}/contents/app/missing.py").mock(
        return_value=recorded("file_contents_404")
    )

    async with make_github_client() as client:
        fetched = await fetch_file_bodies(
            client,
            owner=OWNER,
            repo=REPO,
            paths=["app/billing.py", "app/missing.py"],
            ref=HEAD_SHA,
        )

    assert list(fetched.contents) == ["app/billing.py"]
    assert fetched.contents["app/billing.py"].startswith('"""Billing arithmetic')
    assert list(fetched.failures) == ["app/missing.py"]
    assert fetched.degradations == ("context_file_unfetchable",)


async def test_file_bodies_without_a_client_are_all_failures() -> None:
    """No client is not a crash: every path is reported unfetchable, and S2 carries on."""
    fetched = await fetch_file_bodies(
        None, owner=OWNER, repo=REPO, paths=["app/billing.py"], ref=HEAD_SHA
    )

    assert fetched.contents == {}
    assert list(fetched.failures) == ["app/billing.py"]


async def test_the_recorded_body_decodes_to_the_committed_file(
    github_mock: respx.Router,
) -> None:
    """The corpus records base64; the client is what turns it back into source."""
    recorded_body = recorded("file_contents_billing")
    github_mock.get(f"/repos/{OWNER}/{REPO}/contents/app/billing.py").mock(
        return_value=recorded_body
    )

    async with make_github_client() as client:
        body = await client.get_file_contents(
            OWNER, REPO, "app/billing.py", ref=HEAD_SHA
        )

    expected = (repo_tree("buggy_calc", "head") / "app/billing.py").read_text()
    assert body == expected
    assert base64.b64encode(expected.encode()).decode()


def test_the_unified_diff_carries_the_headers_github_leaves_out() -> None:
    """A model shown a bare hunk cannot tell which file it is in."""
    diff = unified_diff(
        [
            ChangedFile(
                path="app/new.py",
                change_status="added",
                patch="@@ -0,0 +1 @@\n+x = 1",
            ),
            ChangedFile(
                path="app/gone.py",
                change_status="removed",
                patch="@@ -1 +0,0 @@\n-x = 1",
            ),
            ChangedFile(path="logo.png", change_status="modified", patch=""),
        ]
    )

    assert "diff --git a/app/new.py b/app/new.py\n--- /dev/null\n+++ b/app/new.py\n" in diff
    assert "diff --git a/app/gone.py b/app/gone.py\n--- a/app/gone.py\n+++ /dev/null\n" in diff
    assert "logo.png" not in diff, "a binary file has no patch and contributes nothing"
    assert diff.endswith("\n")
