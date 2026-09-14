"""The governance mechanic — spec §4.7, AC-14. **The AI never approves.**

This is the product's non-negotiable claim, so it is asserted two ways that cannot both rot:
behaviourally (every review payload we can construct carries `event: "COMMENT"`) and
structurally (the two mutating review events are not spellable anywhere under `src/`).

The source guard carries its own positive control. A walker that silently scans nothing would
otherwise "pass" forever, which is the failure mode that makes governance tests worthless.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from prguard.core.delivery.comment_ladder import assign_rungs
from prguard.core.delivery.review_poster import REVIEW_EVENT, build_review_payload
from prguard.core.types import CanonicalFinding, LineMap
from tests.delivery.conftest import HEAD_SHA, make_finding

SRC = Path(__file__).resolve().parents[2] / "src"

#: The two review events that would let an AI sign off on, or veto, a human's code.
FORBIDDEN_EVENTS = ("APPROVE", "REQUEST_CHANGES")

#: Proof the scanner is reading real content: the one event this product is allowed to send.
SENTINEL_EVENT = "COMMENT"


def _source_files() -> list[Path]:
    return sorted(
        path
        for path in SRC.rglob("*")
        if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc"
    )


def _read(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return None


def test_review_event_is_always_comment(
    ladder_findings: list[CanonicalFinding], ladder_line_maps: dict[str, LineMap]
) -> None:
    """AC-14: the event is COMMENT for a zero-finding run and for an all-blocking run alike."""
    empty = build_review_payload(
        findings=[], assignments={}, files_reviewed=5, commit_id=HEAD_SHA
    )

    blocking = [
        make_finding(
            id=finding.id,
            file_path=finding.file_path,
            start_line=finding.start_line,
            end_line=finding.end_line,
            blocking=True,
            proof_status="proven",
        )
        for finding in ladder_findings
    ]
    loud = build_review_payload(
        findings=blocking,
        assignments=assign_rungs(blocking, ladder_line_maps),
        files_reviewed=2,
        commit_id=HEAD_SHA,
    )

    assert empty.event == REVIEW_EVENT == "COMMENT"
    assert loud.event == "COMMENT"
    assert empty.as_payload()["event"] == "COMMENT"
    assert loud.as_payload()["event"] == "COMMENT"


def test_review_event_type_admits_nothing_else() -> None:
    """The payload refuses to carry any other event even when one is forced on it."""
    with pytest.raises(ValueError, match="COMMENT"):
        build_review_payload(
            findings=[], assignments={}, files_reviewed=1, commit_id=HEAD_SHA, event="APPROVE"
        )


def test_source_contains_no_approve_path() -> None:
    """AC-14: the two mutating review events appear nowhere under `src/`."""
    files = _source_files()
    scanned: list[Path] = []
    offenders: list[str] = []

    for path in files:
        text = _read(path)
        if text is None:
            continue
        scanned.append(path)
        for literal in FORBIDDEN_EVENTS:
            if literal in text:
                line = next(
                    number
                    for number, content in enumerate(text.splitlines(), start=1)
                    if literal in content
                )
                offenders.append(f"{path.relative_to(SRC)}:{line} contains {literal!r}")

    assert not offenders, "the AI must never be able to approve: " + "; ".join(offenders)

    # Positive controls — a guard that scanned nothing must not be able to pass.
    assert len(scanned) >= 20, f"only scanned {len(scanned)} files under {SRC}"
    assert any(SENTINEL_EVENT in (_read(path) or "") for path in scanned), (
        f"no source file mentions {SENTINEL_EVENT!r} — the scanner is not reading file contents"
    )


def test_the_source_guard_would_catch_a_regression(tmp_path: Path) -> None:
    """The guard's own logic, aimed at a file that *does* contain the literal."""
    planted = tmp_path / "regression.py"
    planted.write_text('EVENT = "APPROVE"\n', encoding="utf-8")

    text = _read(planted)

    assert text is not None
    assert any(literal in text for literal in FORBIDDEN_EVENTS)
