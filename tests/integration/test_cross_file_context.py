"""Callers outside the diff, end to end — spec §4.1 S2, §4.4, §8.1.

Traced from a live review of a real pull request. A `None` guard was deleted from
`apply_discount` in `app/billing.py`; three functions call it and break. Two of them live in
`app/orders.py`, which the diff never touches. PRGuard named the one caller that happened to
be inside the diff and rated the finding `low`; a competitor named all three with line numbers
and called it Major.

The chain was a measurement failure, not a scoring one::

    S2 fetched bodies only for paths already in the diff
      → state.sources never held app/orders.py
      → _reference_count(...) = 0
      → derive_inputs(internal_callers=0) → blast_radius 0.0, reachability 0.0
      → severity 0.325, under PROOF_MIN_SCORE 0.35
      → never selected for proof → gate neutral, finding advisory

Each test below pins one link of that chain at the level a run actually exercises it. Nothing
here reaches the network: GitHub is `respx` over the committed corpus.
"""

from __future__ import annotations

import re

import httpx
import pytest
import respx
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from prguard.config import Settings
from prguard.core.related import DEGRADATION_TREE_UNAVAILABLE
from prguard.db import models
from tests.fixtures.loader import repo_tree
from tests.integration.conftest import (
    OWNER,
    REPO,
    contents_response,
    fake_llm,
    make_pipeline,
    mock_delivery,
    mock_pull_request,
    tree_response,
    trigger_review,
)

#: The caller PR 42 never mentions. `preview_discount` and `refund_amount` both reach
#: `apply_discount` through it.
CALLER_OUTSIDE_THE_DIFF = "app/orders.py"

#: The caller that happens to be inside the diff — the only one the old S2 could ever count.
CALLER_INSIDE_THE_DIFF = "app/checkout.py"

#: The symbol PR 42 breaks.
CHANGED_SYMBOL = "apply_discount"


def references_to(symbol: str, path: str) -> int:
    """§4.4's own counting rule, applied to a committed file: whole-word references."""
    body = (repo_tree("buggy_calc", "head") / path).read_text(encoding="utf-8")
    return len(re.findall(rf"\b{re.escape(symbol)}\b", body))


async def findings_of(session: AsyncSession, review_id: str) -> list[models.Finding]:
    rows = await session.execute(
        sa.select(models.Finding)
        .where(models.Finding.review_run_id == review_id)
        .order_by(models.Finding.file_path, models.Finding.start_line)
    )
    return list(rows.scalars())


async def billing_finding(session: AsyncSession, review_id: str) -> models.Finding:
    found = [row for row in await findings_of(session, review_id) if "billing" in row.file_path]
    assert found, "the corpus run always raises the apply_discount finding"
    return found[0]


async def test_a_caller_outside_the_diff_lifts_blast_radius_off_zero(
    settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """§4.4: `blast_radius = min(1.0, caller_count / 10)` over the *fetched* context files.

    `app/orders.py` calls `apply_discount` twice and is not in the diff. Scored over the diff
    alone the finding measures zero callers — which is not a conservative answer, it is the
    wrong one.
    """
    mock_pull_request(github_mock)
    mock_delivery(github_mock)

    review_id = await trigger_review(
        settings,
        session_factory,
        make_pipeline(settings=settings, session_factory=session_factory),
    )

    finding = await billing_finding(session, review_id)
    inputs = finding.severity_inputs or {}
    inside = references_to(CHANGED_SYMBOL, CALLER_INSIDE_THE_DIFF)
    everywhere = inside + references_to(CHANGED_SYMBOL, CALLER_OUTSIDE_THE_DIFF)

    assert inputs.get("blast_radius") == pytest.approx(min(1.0, everywhere / 10)), (
        f"{CHANGED_SYMBOL} is referenced {everywhere} times across the repository and only "
        f"{inside} of those are inside the diff; scoring over the diff alone measures "
        f"{inputs.get('blast_radius')!r}"
    )
    assert inputs["blast_radius"] > min(1.0, inside / 10)
    assert inputs.get("reachability", 0.0) > 0.0


async def test_the_discovered_caller_is_fetched_exactly_once(
    settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """One tree listing and one body per candidate — discovery must not fan out per finding."""
    mock_pull_request(github_mock)
    mock_delivery(github_mock)
    orders = github_mock.get(f"/repos/{OWNER}/{REPO}/contents/{CALLER_OUTSIDE_THE_DIFF}").mock(
        return_value=contents_response("buggy_calc", CALLER_OUTSIDE_THE_DIFF)
    )
    trees = github_mock.get(path__regex=rf"/repos/{OWNER}/{REPO}/git/trees/[0-9a-f]+").mock(
        return_value=tree_response("buggy_calc")
    )

    await trigger_review(
        settings,
        session_factory,
        make_pipeline(settings=settings, session_factory=session_factory),
    )

    assert trees.call_count == 1
    assert orders.call_count == 1


async def test_the_specialists_are_shown_the_caller_as_context_not_as_diff(
    settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """This is what lets a finding say "app/orders.py also passes None" (§4.1 S2).

    The paths are still labelled as context: §6.12 holds a finding's `file_path` to the
    supplied set, and a discovered file is evidence about the diff, not part of it.
    """
    mock_pull_request(github_mock)
    mock_delivery(github_mock)
    llm = fake_llm()

    await trigger_review(
        settings,
        session_factory,
        make_pipeline(settings=settings, session_factory=session_factory, llm=llm),
    )

    prompts = [
        "\n".join(message.content for message in call.messages)
        for call in llm.calls
        if "Reviewer:" in call.system
    ]
    assert prompts, "the specialists ran"
    for prompt in prompts:
        supplied = prompt.split("Files supplied in context")[1].split("\n\n")[0]
        assert CALLER_OUTSIDE_THE_DIFF not in supplied, (
            "a discovered file is not a supplied file; §6.12 would then accept a finding "
            "against a path the author cannot see in this PR"
        )
        assert CALLER_OUTSIDE_THE_DIFF in prompt, "the caller never reached the model at all"
        assert "def preview_discount(order):" in prompt, "its body did not reach the model"


async def test_a_discovered_test_file_closes_the_coverage_gap(
    settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """§4.4 `coverage_gap`: 1.0 means *no test references this file*, and that was a fiction.

    `tests/test_billing.py` exercises `apply_discount` directly. Scoring the finding as
    untested inflated every severity in the corpus by a full 0.15.
    """
    mock_pull_request(github_mock)
    mock_delivery(github_mock)

    review_id = await trigger_review(
        settings,
        session_factory,
        make_pipeline(settings=settings, session_factory=session_factory),
    )

    finding = await billing_finding(session, review_id)
    assert (finding.severity_inputs or {}).get("coverage_gap") == 0.0


async def test_an_unreachable_tree_degrades_the_run_and_never_fails_it(
    settings: Settings,
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    default_tenant: models.Tenant,
    github_mock: respx.Router,
) -> None:
    """§8.1: the search is worth a degradation, never a run. A narrower review still ships."""
    mock_pull_request(github_mock)
    mock_delivery(github_mock)
    github_mock.get(path__regex=rf"/repos/{OWNER}/{REPO}/git/trees/[0-9a-f]+").mock(
        return_value=httpx.Response(403, json={"message": "Resource not accessible by token"})
    )

    review_id = await trigger_review(
        settings,
        session_factory,
        make_pipeline(settings=settings, session_factory=session_factory),
    )

    run = await session.get(models.ReviewRun, review_id)
    assert run is not None
    await session.refresh(run)
    assert run.status == "succeeded", f"{run.error_code}: {run.error_message}"
    assert DEGRADATION_TREE_UNAVAILABLE in run.degradations
    assert await findings_of(session, review_id), "the review still has something to say"
