"""The merge gate — spec §4.7, §4.4, §7 E4/E18, AC-15, AC-24.

**The gate is red only on proof.** `failure` iff at least one finding is proven ∧ ≥
`BLOCK_MIN_SEVERITY` ∧ Python ∧ published. Critical-but-unproven is `success`; no sandbox is
`neutral`. Those three sentences are the product's entire claim to being a merge gate rather
than another commenting bot, so they are tested from the finding set inwards, not from a
pre-set `blocking` flag.

The delivery half is a ladder — check run → commit status → dry_run — where rung 1 failing is
**expected** tonight (E18: the Check Runs API refuses a PAT) and must not mark anything
degraded.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
import respx

from prguard.core.delivery.gate import (
    GATE_CONTEXT,
    GateDecision,
    blocking_finding_ids,
    decide,
    deliver_gate,
)
from prguard.core.types import Band, ProofStatus, SeverityInputs, SeverityResult
from tests.delivery.conftest import HEAD_SHA, OWNER, REPO, make_client, make_finding, recorded

CHECK_RUNS_PATH = f"/repos/{OWNER}/{REPO}/check-runs"
STATUSES_PATH = f"/repos/{OWNER}/{REPO}/statuses/{HEAD_SHA}"


def scored(band: Band, score: float = 0.81) -> SeverityResult:
    return SeverityResult(
        score=score,
        band=band,
        inputs=SeverityInputs(1.0, 0.7, 1.0, 1.0, 0.35, 1.0),
        weights={},
    )


def finding(
    *,
    id: str = "f-1",
    band: Band = "critical",
    proof_status: ProofStatus = "proven",
    language: str = "python",
    status: str = "published",
    **overrides: Any,
) -> Any:
    return make_finding(
        id=id,
        severity=scored(band),
        proof_status=proof_status,
        language=language,
        status=status,
        **overrides,
    )


def sent(route: respx.Route, index: int = 0) -> dict[str, Any]:
    body = json.loads(route.calls[index].request.content)
    assert isinstance(body, dict)
    return body


def forbidden(resource: str) -> httpx.Response:
    """A permissions 403 in GitHub's shape. No recorded fixture exists for the statuses path."""
    return httpx.Response(
        403,
        headers={"x-accepted-github-permissions": resource},
        json={"message": "Resource not accessible by personal access token", "status": "403"},
    )


# ---------------------------------------------------------------------------------------
# The decision (AC-15)
# ---------------------------------------------------------------------------------------


def test_red_only_on_proven_finding() -> None:
    """AC-15: proven ∧ ≥high ∧ python ∧ published — all four, or the gate is not red."""
    decision = decide([finding()])

    assert decision.conclusion == "failure"
    assert decision.blocking_finding_ids == ("f-1",)
    assert "passes at base and fails at head" in decision.reason


def test_unproven_critical_does_not_block() -> None:
    """The headline claim: severity alone never turns the gate red."""
    decision = decide(
        [
            finding(proof_status="inconclusive"),
            finding(id="f-2", band="critical", proof_status="not_attempted"),
        ]
    )

    assert decision.conclusion == "success"
    assert decision.blocking_finding_ids == ()


def test_no_sandbox_is_neutral() -> None:
    """E14/AC-13: "we could not check" is neutral, and neutral is not a merge block."""
    decision = decide([finding(proof_status="skipped_no_env")], all_proofs_skipped_for_env=True)

    assert decision.conclusion == "neutral"
    assert decision.blocking_finding_ids == ()


def test_a_degraded_run_is_neutral() -> None:
    decision = decide([finding(proof_status="inconclusive")], degraded=True)

    assert decision.conclusion == "neutral"


def test_a_proven_finding_beats_a_degradation() -> None:
    """A proven bug does not stop mattering because the sandbox was unhappy (§4.7 precedence)."""
    decision = decide([finding()], degraded=True, all_proofs_skipped_for_env=True)

    assert decision.conclusion == "failure"


@pytest.mark.parametrize(
    "override",
    [
        {"proof_status": "disproven"},
        {"band": "medium"},
        {"language": "typescript"},
        {"status": "suppressed"},
    ],
    ids=["disproven", "below-threshold", "not-python", "suppressed"],
)
def test_each_conjunct_is_load_bearing(override: dict[str, Any]) -> None:
    """Drop any one of the four conditions and the gate must go green (§4.4, E25, E29)."""
    assert decide([finding(**override)]).conclusion == "success"


def test_an_unscored_finding_cannot_block() -> None:
    """No severity means no band; a finding with no band has not cleared the threshold."""
    assert decide([make_finding(proof_status="proven", severity=None)]).conclusion == "success"


def test_the_gate_ignores_a_blocking_flag_it_did_not_derive() -> None:
    """`blocking` is set elsewhere; the gate re-derives from the four facts and trusts nothing."""
    liar = finding(id="f-liar", proof_status="not_attempted", blocking=True)

    assert blocking_finding_ids([liar]) == ()
    assert decide([liar]).conclusion == "success"


def test_the_threshold_comes_from_config() -> None:
    """§11.2.5: moving the gate is one config line, never a code change."""
    proven_medium = [finding(band="medium")]

    assert decide(proven_medium).conclusion == "success"
    assert decide(proven_medium, block_min_severity="medium").conclusion == "failure"


def test_zero_findings_is_a_green_gate() -> None:
    """E24: a clean PR passes, and says so."""
    decision = decide([])

    assert decision.conclusion == "success"
    assert decision.context_name == GATE_CONTEXT == "prguard/merge-gate"


# ---------------------------------------------------------------------------------------
# The delivery ladder (AC-24, E18)
# ---------------------------------------------------------------------------------------


async def test_the_check_run_is_tried_first(github_mock: respx.Router) -> None:
    """Rung 1 exists for the GitHub App path, and is used when the token can reach it."""
    route = github_mock.post(CHECK_RUNS_PATH).mock(
        return_value=httpx.Response(201, json={"id": 1, "conclusion": "failure"})
    )
    statuses = github_mock.post(STATUSES_PATH).mock(
        return_value=recorded("commit_status_created")
    )

    async with make_client() as client:
        delivered = await deliver_gate(
            client=client, owner=OWNER, repo=REPO, head_sha=HEAD_SHA, decision=decide([finding()])
        )

    assert delivered.delivery == "check_run"
    assert delivered.delivered is True
    assert statuses.call_count == 0, "the ladder stops at the first rung that works"

    body = sent(route)
    assert body["name"] == GATE_CONTEXT
    assert body["head_sha"] == HEAD_SHA
    assert body["status"] == "completed"
    assert body["conclusion"] == "failure"


async def test_a_pat_falls_from_check_run_to_commit_status(github_mock: respx.Router) -> None:
    """E18: the Check Runs API rejecting a PAT is expected behaviour, not an error."""
    check_runs = github_mock.post(CHECK_RUNS_PATH).mock(
        return_value=recorded("check_run_403_app_only")
    )
    statuses = github_mock.post(STATUSES_PATH).mock(
        return_value=recorded("commit_status_created")
    )

    async with make_client() as client:
        delivered = await deliver_gate(
            client=client, owner=OWNER, repo=REPO, head_sha=HEAD_SHA, decision=decide([finding()])
        )

    assert check_runs.call_count == 1
    assert delivered.delivery == "commit_status"
    assert delivered.delivered is True
    assert delivered.degraded is False, "falling to rung 2 is the expected path, not a degradation"

    body = sent(statuses)
    assert body["state"] == "failure"
    assert body["context"] == GATE_CONTEXT
    assert body["description"] == delivered.reason


async def test_gate_ladder_falls_through_to_dry_run(github_mock: respx.Router) -> None:
    """AC-24: both write rungs refused → dry_run, with `gate.delivery` recording the rung."""
    check_runs = github_mock.post(CHECK_RUNS_PATH).mock(return_value=forbidden("checks=write"))
    statuses = github_mock.post(STATUSES_PATH).mock(return_value=forbidden("statuses=write"))

    async with make_client() as client:
        delivered = await deliver_gate(
            client=client, owner=OWNER, repo=REPO, head_sha=HEAD_SHA, decision=decide([finding()])
        )

    assert check_runs.call_count == 1
    assert statuses.call_count == 1
    assert delivered.delivery == "dry_run"
    assert delivered.delivered is False
    assert delivered.conclusion == "failure", "the verdict survives even when nobody can see it"
    assert "Resource not accessible" in delivered.detail


async def test_a_dry_run_delivery_makes_no_call_at_all(github_mock: respx.Router) -> None:
    check_runs = github_mock.post(CHECK_RUNS_PATH).mock(return_value=httpx.Response(201, json={}))
    statuses = github_mock.post(STATUSES_PATH).mock(return_value=httpx.Response(201, json={}))

    delivered = await deliver_gate(
        client=None, owner=OWNER, repo=REPO, head_sha=HEAD_SHA, decision=decide([])
    )

    assert (check_runs.call_count, statuses.call_count) == (0, 0)
    assert delivered.delivery == "dry_run"


async def test_the_app_rung_can_be_skipped_when_no_app_is_configured(
    github_mock: respx.Router,
) -> None:
    """Without `GITHUB_APP_ID` there is no point spending a call to be told no (§4.8)."""
    check_runs = github_mock.post(CHECK_RUNS_PATH).mock(return_value=httpx.Response(201, json={}))
    statuses = github_mock.post(STATUSES_PATH).mock(
        return_value=recorded("commit_status_created")
    )

    async with make_client() as client:
        delivered = await deliver_gate(
            client=client,
            owner=OWNER,
            repo=REPO,
            head_sha=HEAD_SHA,
            decision=decide([finding()]),
            allow_check_run=False,
        )

    assert check_runs.call_count == 0
    assert statuses.call_count == 1
    assert delivered.delivery == "commit_status"


async def test_a_neutral_gate_is_published_without_claiming_a_pass(
    github_mock: respx.Router,
) -> None:
    """The Commit Status API has no `neutral`, so say it in words that cannot be misread."""
    github_mock.post(CHECK_RUNS_PATH).mock(return_value=forbidden("checks=write"))
    statuses = github_mock.post(STATUSES_PATH).mock(
        return_value=recorded("commit_status_created")
    )

    async with make_client() as client:
        await deliver_gate(
            client=client,
            owner=OWNER,
            repo=REPO,
            head_sha=HEAD_SHA,
            decision=decide([], all_proofs_skipped_for_env=True),
        )

    body = sent(statuses)
    assert body["state"] == "success", "neutral must not block a merge (§4.7)"
    assert "no merge verdict" in body["description"].lower()


async def test_the_gate_is_re_set_even_when_nothing_changed(github_mock: respx.Router) -> None:
    """E4: an identical finding set must still re-set the gate, or a red gate goes stale."""
    github_mock.post(CHECK_RUNS_PATH).mock(return_value=forbidden("checks=write"))
    statuses = github_mock.post(STATUSES_PATH).mock(
        return_value=recorded("commit_status_created")
    )
    decision = decide([finding()])

    async with make_client() as client:
        first = await deliver_gate(
            client=client, owner=OWNER, repo=REPO, head_sha=HEAD_SHA, decision=decision
        )
        second = await deliver_gate(
            client=client, owner=OWNER, repo=REPO, head_sha=HEAD_SHA, decision=decision
        )

    assert statuses.call_count == 2
    assert first.conclusion == second.conclusion == "failure"


async def test_the_result_url_is_published_with_the_status(github_mock: respx.Router) -> None:
    """The gate is only useful if a red check leads somewhere that shows the evidence."""
    github_mock.post(CHECK_RUNS_PATH).mock(return_value=forbidden("checks=write"))
    statuses = github_mock.post(STATUSES_PATH).mock(
        return_value=recorded("commit_status_created")
    )

    async with make_client() as client:
        await deliver_gate(
            client=client,
            owner=OWNER,
            repo=REPO,
            head_sha=HEAD_SHA,
            decision=decide([finding()]),
            result_url="https://prguard.example/reviews/b9f1c2d0",
        )

    assert sent(statuses)["target_url"] == "https://prguard.example/reviews/b9f1c2d0"


async def test_delivery_never_changes_the_verdict(github_mock: respx.Router) -> None:
    """Whatever the ladder does, the conclusion it carries is the one `decide` reached."""
    github_mock.post(CHECK_RUNS_PATH).mock(return_value=httpx.Response(500, json={}))
    github_mock.post(STATUSES_PATH).mock(return_value=httpx.Response(500, json={}))
    decision = decide([finding()])

    async with make_client() as client:
        delivered = await deliver_gate(
            client=client, owner=OWNER, repo=REPO, head_sha=HEAD_SHA, decision=decision
        )

    assert isinstance(delivered, GateDecision)
    assert delivered.conclusion == decision.conclusion == "failure"
    assert delivered.blocking_finding_ids == decision.blocking_finding_ids
    assert delivered.delivery == "dry_run"
