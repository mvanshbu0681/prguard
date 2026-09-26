"""T4 review probe 3, promoted to a permanent pin — AC-25 on the *captured* prompt.

The corpus records a filename carrying U+202E (`pr_files_prompt_injection`), which is the
half of E15 no prompt can defend: `context_header` renders the supplied paths into the
trusted preamble, so whatever the GitHub files API hands back is what the model reads. The
only place to assert that is the prompt we actually sent.
"""

from __future__ import annotations

import base64

import httpx
import respx
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from prguard.config import Settings
from prguard.db import models
from tests.fixtures.loader import github_response
from tests.integration.conftest import (
    fake_llm,
    make_pipeline,
    make_settings,
    mock_delivery,
    mock_pull_request,
    trigger_review,
)

BIDI = "‮"


async def test_probe_captured_prompt_has_no_control_characters(
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    settings: Settings,
    github_mock: respx.Router,
) -> None:
    hostile = str(github_response("pr_files_prompt_injection").body[0]["filename"])
    assert BIDI in hostile, "guard: the recorded filename really does carry U+202E"

    posting = make_settings(settings, GITHUB_TOKEN="ghp_test_token")
    mock_pull_request(
        github_mock,
        detail="pr_detail_prompt_injection",
        files="pr_files_prompt_injection",
        contents=(),
    )
    for path in (hostile, "docs/README.md"):
        github_mock.get(f"/repos/octocat/hello-world/contents/{path}").mock(
            return_value=httpx.Response(
                200,
                json={
                    "name": path.rsplit("/", 1)[-1],
                    "path": path,
                    "sha": "0" * 40,
                    "size": 20,
                    "type": "file",
                    "encoding": "base64",
                    "content": base64.b64encode(b"def f(a):\n    return a\n").decode(),
                },
            )
        )
    mock_delivery(github_mock)
    github_mock.post(url__regex=r".*/statuses/.*").mock(
        return_value=httpx.Response(201, json={"id": 1, "state": "success"})
    )

    llm = fake_llm()
    review_id = await trigger_review(
        posting,
        session_factory,
        make_pipeline(settings=posting, session_factory=session_factory, llm=llm),
    )
    run = await session.get(models.ReviewRun, review_id)
    assert run is not None
    await session.refresh(run)
    assert run.status == "succeeded", f"{run.error_code}: {run.error_message}"

    specialist_prompts = [call.prompt for call in llm.calls]
    assert specialist_prompts, "no specialist prompt was captured"
    dirty = [prompt for prompt in specialist_prompts if BIDI in prompt]
    assert not dirty, (
        f"AC-25: a control character reached the model in {len(dirty)} of "
        f"{len(specialist_prompts)} prompts.\noffending line: "
        f"{next(line for line in dirty[0].splitlines() if BIDI in line)!r}\n"
        f"inside the TRUSTED preamble: {BIDI in dirty[0].split('<untrusted_content')[0]}"
    )
