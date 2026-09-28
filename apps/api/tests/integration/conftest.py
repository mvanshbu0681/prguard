"""Integration fixtures — the whole pipeline, wired to the offline corpus.

Root `tests/conftest.py` is frozen (plan §9.3 rule 2), so everything wave 3 needs lives here.
Nothing below reaches the network or the Docker daemon: GitHub is `respx` replaying T3's
recorded responses, the model is `FakeLLMClient` reading T3's recorded completions, and the
sandbox is the subprocess runner over a committed fixture repo (§9.1, X7).
"""

from __future__ import annotations

import base64
from collections.abc import AsyncIterator, Iterator, Mapping, Sequence
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from prguard.api.deps import get_db_session, get_job_queue, get_settings_dep
from prguard.config import Settings
from prguard.core.delivery.github_client import GitHubClient
from prguard.core.pipeline import Pipeline, PipelineDeps
from prguard.core.proof.deps import NullInstaller
from prguard.core.proof.runner import SandboxSelection
from prguard.core.proof.subprocess_runner import SubprocessRunner
from prguard.core.proof.workspace import LocalPathSource
from prguard.core.queue import SyncJobQueue
from prguard.db import models
from prguard.llm.client import FakeLLMClient
from prguard.main import create_app
from tests.conftest import RowFactory
from tests.fixtures.loader import github_response, llm_fixture, repo_tree

OWNER = "octocat"
REPO = "hello-world"
PR_NUMBER = 42
API_BASE = "https://api.github.com"
HEAD_SHA = "9a1e3c7f0b2d4e6a8c1f3b5d7e9a0c2e4f6a8b1d"
BASE_SHA = "1f0b2c3d4e5f60718293a4b5c6d7e8f901234567"
#: The head SHA of the force-pushed revision (`pr_detail_force_push`).
FORCE_PUSH_SHA = "3c5e7a9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c"

PR_URL = f"https://github.com/{OWNER}/{REPO}/pull/{PR_NUMBER}"

#: Nothing here waits on a real clock: §9.4 budgets the whole suite at 120 s.
TEST_PROOF_TIMEOUT_SECONDS = 30

#: T8's prompt markers → T3's recorded completions. Each prompt carries exactly one of them,
#: so four specialists running under `asyncio.gather` still resolve deterministically.
FIXTURE_ROUTES: dict[str, str] = {
    "Reviewer: bugs": "specialist_bugs_valid",
    "Reviewer: security": "specialist_bugs_empty",
    "Reviewer: tests": "specialist_tests_hallucinated_path",
    "Reviewer: quality": "specialist_bugs_empty",
    "Coordinator": "coordinator_valid",
    "proof_generator:": "proof_generator_billing_none_rate",
}


def recorded(name: str) -> httpx.Response:
    """Replay a recorded GitHub response as an httpx response, headers and all."""
    fixture = github_response(name)
    return httpx.Response(fixture.status, headers=fixture.headers, json=fixture.body)


def contents_response(tree: str, path: str, ref: str = "head") -> httpx.Response:
    """A `GET /contents/{path}` body built from a committed fixture tree.

    The corpus records `app/billing.py` and `app/checkout.py` at head 1 only; the force-push
    revision has no recorded body, so it is assembled here from `repos/buggy_calc_drift`,
    which is the same committed data the recorded one was generated from.
    """
    raw = (repo_tree(tree, ref) / path).read_bytes()
    return httpx.Response(
        200,
        json={
            "name": path.rsplit("/", 1)[-1],
            "path": path,
            "sha": "0" * 40,
            "size": len(raw),
            "type": "file",
            "encoding": "base64",
            "content": base64.b64encode(raw).decode("ascii"),
        },
    )


def tree_response(tree: str, ref: str = "head") -> httpx.Response:
    """A `GET /git/trees/{ref}?recursive=1` body built from a committed fixture tree.

    Generated rather than recorded so a drifted revision (`buggy_calc_drift`) lists its own
    files: S2's caller discovery is only as honest as the listing it is given, and a listing
    that describes a different tree would make these tests agree with nothing.
    """
    root = repo_tree(tree, ref)
    entries = [
        {
            "path": str(item.relative_to(root)),
            "mode": "040000" if item.is_dir() else "100644",
            "type": "tree" if item.is_dir() else "blob",
            "sha": "0" * 40,
        }
        for item in sorted(root.rglob("*"))
        if "__pycache__" not in item.parts
    ]
    return httpx.Response(200, json={"sha": "0" * 40, "tree": entries, "truncated": False})


def recorded_routes() -> dict[str, str]:
    """Each marker mapped to the raw text the provider returned, replayed verbatim.

    `response_text` rather than the fixture file: a recorded malformed response has to arrive
    malformed, and the file around it is our bookkeeping, not the model's answer.
    """
    return {marker: llm_fixture(name).response_text for marker, name in FIXTURE_ROUTES.items()}


def fake_llm(overrides: Mapping[str, str] | None = None) -> FakeLLMClient:
    """T3's recorded completions, addressed by T8's prompt markers."""
    routes: dict[str, str] = recorded_routes()
    routes.update(overrides or {})
    return FakeLLMClient(routes=routes)


def local_workspace_source(name: str = "buggy_calc") -> LocalPathSource:
    """A workspace source that answers the run's real SHAs from a committed tree."""
    return LocalPathSource(
        trees={
            HEAD_SHA: repo_tree(name, "head"),
            BASE_SHA: repo_tree(name, "base"),
            FORCE_PUSH_SHA: repo_tree(name, "head"),
        }
    )


def make_settings(settings: Settings, **overrides: Any) -> Settings:
    """A re-validated variant of the test settings — a bad override fails loudly."""
    return Settings(**{**settings.model_dump(), **overrides})


def make_pipeline(
    *,
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    llm: FakeLLMClient | None = None,
    github: GitHubClient | None = None,
    workspace_source: Any | None = None,
    sandbox: SandboxSelection | None = None,
    **deps: Any,
) -> Pipeline:
    """The real pipeline, with every outside edge pointed at the offline corpus."""
    return Pipeline(
        settings=settings,
        session_factory=session_factory,
        deps=PipelineDeps(
            llm_client=llm if llm is not None else fake_llm(),
            github_client=github if github is not None else make_github_client(),
            workspace_source=(
                workspace_source if workspace_source is not None else local_workspace_source()
            ),
            sandbox=sandbox
            if sandbox is not None
            else SandboxSelection(
                runner=SubprocessRunner(timeout_seconds=TEST_PROOF_TIMEOUT_SECONDS),
                degradations=("sandbox_degraded",),
                reason="docker unavailable; running locally with rlimits (isolation=degraded)",
            ),
            # The fixture repos carry a manifest; installing it would need the network, which
            # E8/E10 already cover in the proof suite.
            installer=NullInstaller(),
            **deps,
        ),
    )


def app_for(
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    queue: Any,
) -> AsyncClient:
    """The real app, with the real routers, over the test database and ``queue``."""
    app = create_app(settings=settings, job_queue=queue)

    async def _session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as db_session:
            yield db_session

    app.dependency_overrides[get_db_session] = _session
    app.dependency_overrides[get_job_queue] = lambda: queue
    app.dependency_overrides[get_settings_dep] = lambda: settings
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")


async def trigger_review(
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    pipeline: Pipeline,
    *,
    pr_url: str = PR_URL,
    force: bool = False,
    headers: Mapping[str, str] | None = None,
) -> str:
    """Drive a run through the real API door with an inline queue; return the run id.

    `SyncJobQueue` runs the pipeline inside `POST /v1/reviews` rather than in a worker task,
    which is the only reason these tests are deterministic — the door and the machine are
    otherwise exactly the ones production uses (G6).
    """
    queue = SyncJobQueue(pipeline.run)
    body: dict[str, Any] = {"pr_url": pr_url}
    if force:
        # E21: without a head SHA the API door deduplicates against any run still in flight,
        # so a test that wants a *second* run has to say so explicitly.
        body["options"] = {"force": True}
    async with app_for(settings, session_factory, queue) as client:
        response = await client.post(
            "/v1/reviews", json=body, headers=dict(headers or {})
        )
    assert response.status_code == 202, response.text
    return str(response.json()["review_id"])


def make_github_client(**kwargs: Any) -> GitHubClient:
    """A client whose clock is fake — no integration test ever really sleeps."""

    async def _no_sleep(seconds: float) -> None:
        return None

    return GitHubClient(
        token="ghp_test_token",
        base_url=API_BASE,
        sleep=_no_sleep,
        jitter=lambda: 0.0,
        **kwargs,
    )


def mock_pull_request(
    router: respx.Router,
    *,
    detail: str = "pr_detail",
    files: str = "pr_42_files",
    tree: str = "buggy_calc",
    ref: str = "head",
    contents: Sequence[str] = ("app/billing.py", "app/checkout.py"),
) -> None:
    """Register the S1/S2 reads for one revision of the fixture PR.

    That includes the repository tree and a body for every committed file the diff does *not*
    contain: S2 discovers the callers outside the diff from the tree and then fetches them, so
    a run against this fixture makes those reads whether or not a given test cares about them.
    The diff's own paths stay under `contents`, which is what lets a test make one of them 404.
    """
    router.get(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}").mock(return_value=recorded(detail))
    router.get(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}/files").mock(
        return_value=recorded(files)
    )
    for path in contents:
        router.get(f"/repos/{OWNER}/{REPO}/contents/{path}").mock(
            return_value=contents_response(tree, path, ref)
        )
    router.get(path__regex=rf"/repos/{OWNER}/{REPO}/git/trees/[0-9a-f]+").mock(
        return_value=tree_response(tree, ref)
    )
    changed = {str(entry["filename"]) for entry in github_response(files).body}
    root = repo_tree(tree, ref)
    for item in sorted(root.rglob("*")):
        path = str(item.relative_to(root))
        if not item.is_file() or "__pycache__" in item.parts or path in changed:
            continue
        router.get(f"/repos/{OWNER}/{REPO}/contents/{path}").mock(
            return_value=contents_response(tree, path, ref)
        )


def mock_delivery(router: respx.Router) -> dict[str, respx.Route]:
    """Register the S8 writes: existing comments, the one review, and the gate ladder."""
    return {
        "comments": router.get(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}/comments").mock(
            return_value=httpx.Response(200, json=[])
        ),
        "review": router.post(f"/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}/reviews").mock(
            return_value=recorded("review_created")
        ),
        "check_run": router.post(f"/repos/{OWNER}/{REPO}/check-runs").mock(
            return_value=recorded("check_run_403_app_only")
        ),
        "status": router.post(f"/repos/{OWNER}/{REPO}/statuses/{HEAD_SHA}").mock(
            return_value=recorded("commit_status_created")
        ),
    }


@pytest.fixture
def github_mock() -> Iterator[respx.Router]:
    """A respx router over the GitHub API base; routes are registered per test."""
    with respx.mock(base_url=API_BASE, assert_all_called=False) as router:
        yield router


@pytest.fixture
def workspace_root(tmp_path: Path) -> Path:
    return tmp_path / "workspaces"


@pytest.fixture
def settings(settings: Settings) -> Settings:
    """The root test settings plus a write token.

    §4.8's `GITHUB_DELIVERY_MODE=auto` means "post if we can", and "can" is a token. Without
    one every integration run would exercise the dry-run path and nothing here would prove
    that a review is ever actually sent.
    """
    return make_settings(settings, GITHUB_TOKEN="ghp_test_token")


@pytest.fixture
async def repository(rows: RowFactory, default_tenant: models.Tenant) -> models.Repository:
    """`octocat/hello-world` — the repository every recorded fixture describes."""
    return await rows.repository(default_tenant)


@pytest.fixture
async def pull_request(
    rows: RowFactory, default_tenant: models.Tenant, repository: models.Repository
) -> models.PullRequest:
    """PR 42 with no head SHA yet: the API door resolves nothing on the request path."""
    return await rows.pull_request(default_tenant, repository, head_sha=None, base_sha=None)
