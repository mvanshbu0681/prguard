#!/usr/bin/env python3
"""Generate ``web/public/fixtures`` with the PRGuard backend's own functions (track t2b).

Run from ``web/``::

    PYTHONPATH=<backend-checkout>/src <repo>/.venv/bin/python scripts/fixtures/gen_fixtures.py
    ... gen_fixtures.py --check     # regenerate in memory; exit 1 if any file on disk differs

The backend is imported read-only (bytecode writing is switched off before the first import).
The output is byte-identical on every run: all randomness is ``random.Random`` seeded from
``corpus.backend.SEED`` and all time is relative to ``corpus.backend.NOW``.

Pipeline, in order:

1. ``corpus.simulate`` re-enacts every run in ``catalog.py`` and ``demo_story.py``; every
   decision is made by the backend (severity, fingerprint, suppression, proof classification,
   comment ladder, gate).
2. ``corpus.chain`` numbers and hashes the audit events with ``audit.compute_event_hash`` and
   re-verifies them with ``audit.verify_chain``.
3. ``corpus.emit`` assembles each response with the routes' own helpers and round-trips it
   through the pydantic response models.
4. ``corpus.reports`` computes ``/v1/accuracy`` from raw counts with ``core/accuracy.py``'s
   formulas, and cross-checks it against ``accuracy.compute_report`` run on SQLite.
5. Every binding requirement of the brief is asserted (``check``) before a byte is written.

Where the corpus goes beyond the implementation at ``eeb1be8`` (each is spec-defined behaviour
the implementation leaves out, and ``public/fixtures/README.md`` lists them for consumers):

* coordinator drops are persisted as ``findings`` rows (``status: dropped``) and each finding
  row, dropped or not, has a ``finding.proposed`` event;
* ``finding.proposed`` payloads also carry ``severity_inputs`` (the six measured inputs);
* ``proof_status`` records ``not_applicable`` (a non-Python finding, which no sandbox runs) and
  ``skipped_no_env`` (a candidate in a run with no sandbox), where the implementation leaves
  ``not_attempted``;
* posted review comments carry their GitHub comment id, and a suppression increments the
  fingerprint's ``dismissed_count``;
* churn is measured (the implementation passes ``commits_last_90d=None``), except on the one
  repository whose commits API the deployment cannot read;
* ``review_payload`` follows brand-gaps §E rather than ``review_poster``'s own format;
* ``cost``/``token_usage`` are derived from the calls a run made (live runs report none).
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import argparse  # noqa: E402
import json  # noqa: E402
from collections import Counter  # noqa: E402
from pathlib import Path  # noqa: E402
from typing import Any  # noqa: E402

HERE = Path(__file__).resolve().parent
WEB = HERE.parent.parent
OUT = WEB / "public" / "fixtures"
sys.path.insert(0, str(HERE))

#: plan A10 / manifest ``ids`` — final and binding, copied verbatim from the integrator's stub.
BINDING_IDS: dict[str, Any] = {
    "tenant_id": "7f3c9a21-5b8e-4d6f-9a0c-2e4b6d8f1a3c",
    "demo_review_id": "4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41",
    "proven_finding_id": "a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d",
    "disproven_finding_id": "5d20b7f4-9c1a-4e8b-a6d3-1f7e9b2c4a60",
    "inconclusive_finding_id": "c83e61a9-2d4f-4b7a-9e05-6a1d3f8c2b97",
    "base_sha": "7c41a09e3b5d2f8a1c6e4b9d7f0a2c5e8b3d6f19",
    "head_sha": "9c2d4b1f6a8e3c5d7b9f1a2e4c6d8b0f3a5c7e92",
    "repository": {"owner": "acme", "name": "checkout-service"},
    "pr_number": 4821,
    "repro_test_path": "tests/test_repro_7e3f1a.py",
    "failing_test": "test_charge_uses_account_currency",
    "tamper_demo_seq": 1428,
}

#: The three lines the hero and the OG card quote (brief: binding).
HEAD_TAIL = (
    "E       AttributeError: 'NoneType' object has no attribute 'currency'",
    "tests/test_repro_7e3f1a.py:41: AttributeError",
    "1 failed in 0.39s",
)
BASE_TAIL = "1 passed in 0.42s"
DISPROVEN_TAIL = "1 passed in 0.61s"

#: plan A13 — the proven finding's inputs, valid backend values that score 0.810.
A13_INPUTS = {
    "reachability": 1.0,
    "blast_radius": 0.7,
    "path_sensitivity": 1.0,
    "coverage_gap": 0.5,
    "churn": 0.3,
    "proof_confidence": 1.0,
}

#: brand-gaps §E's summary table for the demo run.
DEMO_TALLY = {
    "raised": 12,
    "dropped": 4,
    "deduplicated": 3,
    "suppressed": 1,
    "proven": 1,
    "disproven": 1,
    "advisory": 2,
}

PROOF_STATUSES = ("not_attempted", "not_applicable", "proven", "disproven", "inconclusive", "skipped_no_env")
DELIVERY_MODES = ("inline_exact", "inline_nearest", "file_level", "summary_only", "not_delivered")
GATE_CONCLUSIONS = ("success", "failure", "neutral")
FINDING_STATUSES = ("proposed", "suppressed", "published", "dropped", "disproven")


def dump(obj: Any) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def last_lines(text: str | None, count: int) -> list[str]:
    return [line for line in (text or "").splitlines() if line.strip()][-count:]


# =======================================================================================
# Generation
# =======================================================================================


def generate() -> tuple[dict[str, Any], dict[str, Any]]:
    from corpus import catalog, chain, demo_story, emit, reports, vectors
    from corpus.backend import BACKEND_COMMIT, NOW, SEED, TENANT_ID
    from corpus.simulate import Simulation

    assert TENANT_ID == BINDING_IDS["tenant_id"]
    assert demo_story.DEMO_REVIEW_ID == BINDING_IDS["demo_review_id"]
    assert demo_story.PROVEN_FINDING_ID == BINDING_IDS["proven_finding_id"]
    assert demo_story.DISPROVEN_FINDING_ID == BINDING_IDS["disproven_finding_id"]
    assert demo_story.INCONCLUSIVE_FINDING_ID == BINDING_IDS["inconclusive_finding_id"]
    assert demo_story.BASE_SHA == BINDING_IDS["base_sha"]
    assert demo_story.HEAD_SHA == BINDING_IDS["head_sha"]
    assert demo_story.PR_NUMBER == BINDING_IDS["pr_number"]

    simulation = Simulation(
        repos=catalog.REPOS,
        templates={**catalog.TEMPLATES, **demo_story.DEMO_TEMPLATES},
        drops={**catalog.DROPS, **demo_story.DEMO_DROPS, **demo_story.DEMO_DUPLICATES},
        runs=(*catalog.RUNS, *demo_story.RUNS),
        revocations=catalog.REVOCATIONS,
        real_changes=demo_story.CHANGED,
        real_trees=demo_story.TREES,
    )
    world = simulation.run()
    events = chain.build(world.events)
    verification = chain.verify(events)

    files: dict[str, Any] = {}
    listing = []
    for run in world.runs:
        status = emit.review_status(run)
        result = emit.review_result(world, run)
        files[f"reviews/{run.row.id}.status.json"] = status
        files[f"reviews/{run.row.id}.result.json"] = result
        listing.append(emit.review_list_item(result, run))
    listing.sort(key=lambda item: (item["created_at"], item["review_id"]), reverse=True)
    files["reviews/index.json"] = {"items": listing}

    rows = [(run, item) for run in world.runs for item in run.findings]
    rows.sort(key=lambda pair: (pair[1].row.created_at, pair[1].row.id), reverse=True)
    files["findings/index.json"] = {"items": [emit.finding(world, run, item) for run, item in rows]}
    files["suppressions/index.json"] = emit.suppressions(world)
    files["audit/events.json"] = {
        "items": emit.audit_items(events),
        "chain": emit.audit_chain(verification),
    }
    files["audit/vectors.json"] = vectors.build()

    counts = reports.raw_counts(world, events)
    report = reports.report_from_counts(counts)
    backend = reports.backend_report(world, events)
    if report != backend:
        raise AssertionError(
            "accuracy: raw-count formulas and accuracy.compute_report disagree:\n"
            f"{json.dumps(report, indent=1)}\n---\n{json.dumps(backend, indent=1)}"
        )
    files["accuracy/report.json"] = report
    files["accuracy/series.json"] = reports.series(world, counts)
    files["cost/summary.json"] = reports.cost_summary(world)
    files["live/demo-run.json"] = reports.live_demo(world, BINDING_IDS["demo_review_id"])

    context = {
        "world": world,
        "events": events,
        "backend_commit": BACKEND_COMMIT,
        "seed": SEED,
        "now": NOW,
        "demo_story": demo_story,
    }
    extra_ids = check(files, context)
    files["manifest.json"] = manifest(files, context, extra_ids)
    return files, context


# =======================================================================================
# The brief, asserted
# =======================================================================================


def check(files: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    from corpus.backend import audit, severity
    from corpus.backend import core_types

    world = context["world"]
    ids = BINDING_IDS
    demo = files[f"reviews/{ids['demo_review_id']}.result.json"]
    demo_status = files[f"reviews/{ids['demo_review_id']}.status.json"]
    by_id = {finding["id"]: finding for finding in demo["findings"]}

    # --- the demo run ------------------------------------------------------------------
    assert demo["status"] == "succeeded" and demo_status["status"] == "succeeded"
    assert demo["risk_tier"] == "full"
    assert demo["repository"]["owner"] == "acme" and demo["repository"]["name"] == "checkout-service"
    assert demo["pull_request"]["number"] == 4821
    assert demo["pull_request"]["title"] == "Resolve account currency at charge time"
    assert demo["pull_request"]["base_sha"] == ids["base_sha"]
    assert demo["pull_request"]["head_sha"] == ids["head_sha"]
    assert demo["timing"]["duration_seconds"] == 41.2, demo["timing"]
    assert demo["gate"]["conclusion"] == "failure" and demo["gate"]["delivery"] == "commit_status"
    assert demo["gate"]["blocking_finding_ids"] == [ids["proven_finding_id"]]
    assert demo["delivery"]["status"] == "posted" and demo["delivery"]["event"] == "COMMENT"
    ladder = demo["delivery"]["ladder_breakdown"]
    assert ladder["inline_nearest"] >= 1 and ladder["file_level"] >= 1, ladder
    run = next(r for r in world.runs if r.row.id == ids["demo_review_id"])
    from corpus.review_body import tally

    assert tally(run) == DEMO_TALLY, tally(run)
    counts = demo["counts"]
    assert counts["proposed"] == 12 and counts["dropped"] == 7 and counts["suppressed"] == 1
    assert counts["disproven"] == 1 and counts["published"] == 3 and counts["blocking"] == 1

    # --- the proven finding --------------------------------------------------------------
    proven = by_id[ids["proven_finding_id"]]
    assert demo["findings"][0]["id"] == ids["proven_finding_id"], "findings[0] is the hero's finding"
    assert proven["category"] == "correctness" and proven["specialist"] == "bugs"
    assert proven["title"] == "charge() dereferences a None currency when the account has no default"
    assert proven["location"]["file_path"] == "app/billing/charge.py"
    assert (proven["location"]["start_line"], proven["location"]["end_line"]) == (41, 44)
    assert proven["location"]["symbol_path"] == "app/billing/charge.py::charge"
    sev = proven["severity"]
    assert sev["inputs"] == A13_INPUTS, sev["inputs"]
    assert sev["score"] == 0.81 and sev["band"] == "critical", sev
    recomputed = severity.compute(core_types.SeverityInputs(**A13_INPUTS))
    assert recomputed.score == sev["score"] and recomputed.band == sev["band"]
    assert sev["explanation"] == severity.explain(core_types.SeverityInputs(**A13_INPUTS))
    contribution = sum(sev["weights"][name] * value for name, value in sev["inputs"].items())
    assert abs(contribution - 0.81) < 0.0005
    pf = proven["proof"]
    assert pf["status"] == "proven" and pf["runner"] == "docker" and pf["isolation"] == "isolated"
    assert pf["baseline_mode"] == "compared"
    assert pf["test_file_path"] == ids["repro_test_path"]
    assert f"def {ids['failing_test']}():" in pf["test_code"]
    assert pf["command"] == "pytest tests/test_repro_7e3f1a.py -q -p no:cacheprovider"
    assert pf["base"]["exit_code"] == 0 and last_lines(pf["base"]["excerpt"], 1) == [BASE_TAIL]
    assert pf["head"]["exit_code"] == 1 and tuple(last_lines(pf["head"]["excerpt"], 3)) == HEAD_TAIL
    assert proven["status"] == "published" and proven["blocking"] is True
    assert proven["delivery"]["mode"] == "inline_exact"
    assert proven["history"]["occurrence_count"] == 2

    # --- the disproven finding -----------------------------------------------------------
    disproven = by_id[ids["disproven_finding_id"]]
    assert disproven["status"] == "disproven" and disproven["blocking"] is False
    assert disproven["proof"]["status"] == "disproven"
    assert last_lines(disproven["proof"]["head"]["excerpt"], 1) == [DISPROVEN_TAIL]
    assert disproven["severity"]["band"] == "info"
    assert severity.DISPROVEN_NOTE in disproven["severity"]["notes"]
    assert disproven["delivery"]["mode"] == "not_delivered"

    # --- the inconclusive finding: a pre-existing failure at base -----------------------------
    inconclusive = by_id[ids["inconclusive_finding_id"]]
    assert inconclusive["proof"]["status"] == "inconclusive"
    assert inconclusive["proof"]["base"]["exit_code"] == 1 and inconclusive["proof"]["head"]["exit_code"] == 1

    # --- the review payload --------------------------------------------------------------
    payload = demo["review_payload"]
    assert payload["event"] == "COMMENT" and payload["commit_id"] == ids["head_sha"]
    first = payload["comments"][0]
    assert first["path"] == "app/billing/charge.py"
    assert "**`proof_status: proven`** · severity **`0.810`** critical" in first["body"]
    for line in HEAD_TAIL:
        assert f"    {line}" in first["body"]
    fp = proven["fingerprint"]
    assert f"`fingerprint {fp[:8]}…{fp[-4:]}`" in first["body"]
    assert "how often we're wrong" in first["body"]
    assert "in 41.2s" in payload["body"] and "**Gate: failing**" in payload["body"]
    for text in (payload["body"], *(c["body"] for c in payload["comments"])):
        assert "APPROVE" not in text and "!" not in text.replace("<!--", ""), text

    # --- the tamper demo -----------------------------------------------------------------
    events = files["audit/events.json"]
    seqs = [item["seq"] for item in events["items"]]
    assert seqs == list(range(1, len(seqs) + 1)), "seq is contiguous from 1"
    assert events["chain"]["verified"] is True and events["chain"]["checked"] == len(seqs)
    tamper = events["items"][ids["tamper_demo_seq"] - 1]
    assert tamper["seq"] == ids["tamper_demo_seq"]
    assert tamper["review_id"] == ids["demo_review_id"], tamper
    assert tamper["event_type"] == "finding.proposed" and tamper["finding_id"] == ids["proven_finding_id"], tamper
    assert tamper["payload"]["severity_score"] == 0.81
    assert 1.0 in tamper["payload"]["severity_inputs"].values()
    assert all(item["tenant_id"] == ids["tenant_id"] for item in events["items"])
    human = Counter(item["event_type"] for item in events["items"] if item["actor_type"] == "human")
    assert human["suppression.created"] >= 16 and human["suppression.revoked"] >= 1
    assert human["override.break_glass"] == 1, human
    # verify_chain over lightweight objects, from the serialised form.
    rebuilt = [_Light(item) for item in events["items"]]
    assert audit.verify_chain(rebuilt, contiguous=True).verified

    # --- suppressions ----------------------------------------------------------------------
    ledger = files["suppressions/index.json"]
    totals = ledger["totals"]
    assert (totals["active"], totals["expired"], totals["revoked"]) == (12, 3, 1), totals
    assert all(item["reason"].strip() for item in ledger["items"])
    assert {item["scope"] for item in ledger["items"]} == {"line", "file", "pattern", "repo", "tenant"}
    demo_suppressed = [f for f in demo["findings"] if f["status"] == "suppressed"]
    assert len(demo_suppressed) == 1 and demo_suppressed[0]["suppression"] is not None
    active_ids = {item["suppression_id"] for item in ledger["items"] if item["active"]}
    assert demo_suppressed[0]["suppression"]["suppression_id"] in active_ids

    # --- coverage of every enum value, and the corpus's size -------------------------------
    findings = files["findings/index.json"]["items"]
    assert len(findings) >= 240, len(findings)
    assert {f["proof"]["status"] for f in findings} >= set(PROOF_STATUSES)
    assert {f["delivery"]["mode"] for f in findings} >= set(DELIVERY_MODES)
    assert {f["status"] for f in findings} >= set(FINDING_STATUSES)
    listing = files["reviews/index.json"]["items"]
    assert {i["gate_conclusion"] for i in listing if i["gate_conclusion"]} >= set(GATE_CONCLUSIONS)
    statuses = Counter(item["status"] for item in listing)
    assert statuses["failed"] >= 2 and statuses["cancelled"] >= 2, statuses
    assert len({(i["repository"]["owner"], i["repository"]["name"]) for i in listing}) == 6

    # --- accuracy: six distinct numbers (plan A6) -------------------------------------------
    report = files["accuracy/report.json"]
    proxies = report["precision_proxies"]
    proof_totals = report["proof"]
    from corpus.backend import accuracy

    six = [
        proxies["execution_verified_precision"]["value"],
        proxies["self_caught_false_positive_rate"]["value"],
        proxies["human_dismissal_rate"]["value"],
        proxies["addressed_rate"]["value"],
        proof_totals["proven_rate"],
        accuracy.ratio(proof_totals["inconclusive"], proof_totals["attempted"]),
    ]
    assert None not in six and len(set(six)) == 6, six
    assert proof_totals["attempted"] == sum(
        proof_totals[k] for k in ("proven", "disproven", "inconclusive", "skipped_no_env")
    )

    # --- cost and the live run --------------------------------------------------------------
    cost = files["cost/summary.json"]
    assert abs(cost["cost_p50_usd"] - 0.98) <= 0.05, cost["cost_p50_usd"]
    live = files["live/demo-run.json"]
    assert sum(stage["duration_ms"] for stage in live["stages"]) == 41_200

    return {
        "superseded_review_id": next(
            r.row.id for r in world.runs if r.spec.key == "co-4821-a"
        ),
        "not_attempted_finding_id": next(
            f["id"] for f in demo["findings"] if f["proof"]["status"] == "not_attempted" and f["status"] == "published"
        ),
        "suppressed_finding_id": demo_suppressed[0]["id"],
        "demo_suppression_id": demo_suppressed[0]["suppression"]["suppression_id"],
        "proven_fingerprint": fp,
        "first_push_sha": context["demo_story"].FIRST_PUSH_SHA,
        "break_glass_seq": next(
            item["seq"] for item in events["items"] if item["event_type"] == "override.break_glass"
        ),
    }


class _Light:
    """The attributes ``audit.verify_chain`` reads, rebuilt from the serialised item."""

    def __init__(self, item: dict[str, Any]) -> None:
        from datetime import datetime

        self.tenant_id = item["tenant_id"]
        self.seq = item["seq"]
        self.event_type = item["event_type"]
        self.actor_type = item["actor_type"]
        self.actor_id = item["actor_id"]
        self.payload = item["payload"]
        self.prev_hash = item["prev_hash"]
        self.event_hash = item["event_hash"]
        self.created_at = datetime.fromisoformat(item["created_at"].replace("Z", "+00:00"))


def manifest(files: dict[str, Any], context: dict[str, Any], extra_ids: dict[str, Any]) -> dict[str, Any]:
    world = context["world"]
    findings = files["findings/index.json"]["items"]
    listing = files["reviews/index.json"]["items"]
    events = files["audit/events.json"]
    totals = files["suppressions/index.json"]["totals"]

    def tally(values: Any) -> dict[str, int]:
        counted = Counter(values)
        return {key: counted[key] for key in sorted(counted)}

    return {
        "generator": {
            "script": "scripts/fixtures/gen_fixtures.py",
            "owner": "t2b",
            "backend_commit": context["backend_commit"],
            "version": 1,
            "seed": context["seed"],
            "now": context["now"].isoformat().replace("+00:00", "Z"),
        },
        "ids": {**BINDING_IDS, **extra_ids},
        "counts": {
            "repositories": len(world.repos),
            "pull_requests": len(world.prs),
            "runs": len(listing),
            "runs_by_status": tally(item["status"] for item in listing),
            "gate_conclusions": tally(item["gate_conclusion"] for item in listing if item["gate_conclusion"]),
            "findings": len(findings),
            "findings_by_status": tally(f["status"] for f in findings),
            "proof_status": tally(f["proof"]["status"] for f in findings),
            "delivery_modes": tally(f["delivery"]["mode"] for f in findings),
            "suppressions": {"total": len(files["suppressions/index.json"]["items"]), **totals},
            "audit_events": len(events["items"]),
            "audit_first_seq": events["chain"]["first_seq"],
            "audit_last_seq": events["chain"]["last_seq"],
            "vectors": len(files["audit/vectors.json"]["items"]),
        },
    }


# =======================================================================================
# Output
# =======================================================================================


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--check", action="store_true", help="fail if the files on disk differ")
    args = parser.parse_args(argv)

    files, context = generate()
    rendered = {path: dump(obj) for path, obj in sorted(files.items())}

    stale = sorted(
        str(path.relative_to(OUT))
        for path in (OUT / "reviews").glob("*.json")
        if str(path.relative_to(OUT)) not in rendered
    )
    changed = [
        path
        for path, text in rendered.items()
        if not (OUT / path).exists() or (OUT / path).read_text(encoding="utf-8") != text
    ]
    if args.check:
        if changed or stale:
            print(f"fixtures differ from the generator: {len(changed)} changed, {len(stale)} stale")
            for path in (changed + stale)[:20]:
                print(f"  {path}")
            return 1
        print(f"fixtures are current ({len(rendered)} files)")
        return 0

    for path in stale:
        (OUT / path).unlink()
    for path in changed:
        target = OUT / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(rendered[path], encoding="utf-8")
    world = context["world"]
    counts = files["manifest.json"]["counts"]
    print(
        f"wrote {len(changed)} of {len(rendered)} files ({len(stale)} stale removed) — "
        f"{counts['runs']} runs, {counts['findings']} findings, {counts['audit_events']} audit events, "
        f"{len(world.suppressions)} suppressions"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
