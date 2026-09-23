"""pytest's ``-q`` terminal output, reproduced byte for byte.

Every captured run in the corpus is text that pytest 8/9 on Python 3.12 would print for the
repro test in question, at an 80-column non-TTY terminal, which is what a ``docker run``
without ``-t`` gives it. The layout rules below were read off real pytest 9.1.1 runs and are
re-checked against live pytest by ``scripts/fixtures/check_pytest_text.py``.

Rules that matter, because a fake terminal is the first thing an engineer spots:

* the progress line is the outcome characters, then ``[100%]`` right-justified to column 79;
* section rules are ``TerminalWriter.sep``: ``N = (80 - len(title) - 2) // 2`` fill characters
  either side, plus one more on the right when it still fits in 80;
* the failing entry prints its function from ``def`` to the end of the failing statement,
  marks the failing line with ``>``, and puts carets under the sub-expression that raised —
  except for a plain ``assert``, where pytest's rewriting explains the values instead;
* the short test summary truncates its message to 80 columns with ``...``;
* the elapsed time is ``in N.NNs``.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

WIDTH = 80


def sep(char: str, title: str | None = None) -> str:
    """``_pytest._io.TerminalWriter.sep`` at an 80-column terminal."""
    if title is not None:
        count = max((WIDTH - len(title) - 2) // (2 * len(char)), 1)
        fill = char * count
        line = f"{fill} {title} {fill}"
    else:
        line = char * (WIDTH // len(char))
    if len(line) + len(char.rstrip()) <= WIDTH:
        line += char.rstrip()
    return line


def progress(outcomes: str) -> str:
    """``F`` / ``.`` / ``s`` characters, then ``[100%]`` right-justified (79 columns)."""
    fill = WIDTH - len(outcomes) - 1
    return outcomes + "[100%]".rjust(fill)


def summary(counts: Sequence[tuple[int, str]], seconds: float) -> str:
    """The ``-q`` summary line: ``1 failed in 0.39s`` (no ``=`` rule in quiet mode)."""
    parts = ", ".join(f"{count} {word}" for count, word in counts)
    return f"{parts} in {seconds:.2f}s"


def short_summary_line(word: str, nodeid: str, message: str | None) -> str:
    """``FAILED tests/x.py::test_y - AssertionError: ...`` trimmed to 80 columns."""
    line = f"{word} {nodeid}"
    if message is None:
        return line
    first = message.split("\n", 1)[0]
    available = WIDTH - len(line)
    fmt_width = len(" - ")
    if fmt_width + 3 > available:
        return line
    if fmt_width + len(first) > available:
        available -= 3
        first = first[:available]
        while fmt_width + len(first) > available:
            first = first[:-1]
        first += "..."
    return f"{line} - {first}"


@dataclass(frozen=True)
class Failure:
    """One failing test, described the way pytest will print it.

    ``source`` is the test function from ``def`` to the end of the failing statement, exactly
    as written in the repro (four-space indented body). ``failing_index`` is the index of the
    failing line inside ``source``. ``caret`` names the sub-expression that raised when the
    error is not an ``assert`` rewrite; pytest underlines it with ``^``. ``explanation`` is the
    ``E`` block without the ``E``/indent prefix, first line first.
    """

    test_path: str
    test_name: str
    source: tuple[str, ...]
    failing_index: int
    lineno: int
    exception: str
    explanation: tuple[str, ...]
    caret: str | None = None


def _failure_block(failure: Failure) -> list[str]:
    lines = [sep("_", failure.test_name), ""]
    for index, text in enumerate(failure.source):
        if index == failure.failing_index:
            lines.append(">   " + text)
            if failure.caret is not None:
                column = text.index(failure.caret)
                lines.append(" " * (4 + column) + "^" * len(failure.caret))
        else:
            lines.append("    " + text)
    failing = failure.source[failure.failing_index]
    indent = len(failing) - len(failing.lstrip(" ")) + 4
    for text in failure.explanation:
        lines.append("E" + " " * (indent - 1) + text if text else "E" + " " * (indent - 1))
    lines.append("")
    lines.append(f"{failure.test_path}:{failure.lineno}: {failure.exception}")
    return lines


def failed_run(failure: Failure, seconds: float, *, short_summary: bool) -> str:
    """A single failing test. ``short_summary=False`` is a repository configured ``-rN``."""
    lines = [progress("F"), sep("=", "FAILURES"), *_failure_block(failure)]
    if short_summary:
        lines.append(sep("=", "short test summary info"))
        message = failure.explanation[0] if failure.explanation else failure.exception
        lines.append(
            short_summary_line("FAILED", f"{failure.test_path}::{failure.test_name}", message)
        )
    lines.append(summary([(1, "failed")], seconds))
    return "\n".join(lines)


def passed_run(seconds: float, count: int = 1) -> str:
    return "\n".join([progress("." * count), summary([(count, "passed")], seconds)])


@dataclass(frozen=True)
class CollectionError:
    """An import error while collecting the repro — E8: the test never ran."""

    test_path: str
    import_lineno: int
    import_line: str
    error: str
    workspace: str = "/ws"
    importlib_path: str = "/usr/local/lib/python3.12/importlib/__init__.py"


def collection_error_run(error: CollectionError, seconds: float) -> str:
    importer = "return _bootstrap._gcd_import(name[level:], package, level)"
    lines = [
        "",
        sep("=", "ERRORS"),
        sep("_", f"ERROR collecting {error.test_path}"),
        f"ImportError while importing test module '{error.workspace}/{error.test_path}'.",
        "Hint: make sure your test modules/packages have valid Python names.",
        "Traceback:",
        f"{error.importlib_path}:90: in import_module",
        f"    {importer}",
        "    " + " " * importer.index("_bootstrap") + "^" * len(importer[importer.index("_bootstrap"):]),
        f"{error.test_path}:{error.import_lineno}: in <module>",
        f"    {error.import_line}",
        f"E   {error.error}",
        sep("=", "short test summary info"),
        f"ERROR {error.test_path}",
        sep("!", "Interrupted: 1 error during collection"),
        summary([(1, "error")], seconds),
    ]
    return "\n".join(lines)


def skipped_module_run(seconds: float) -> str:
    """``pytest.importorskip`` at module level: nothing collected, exit code 5."""
    return "\n".join(["", summary([(1, "skipped")], seconds)])


def timeout_stderr(runner: str, seconds: int = 90) -> str:
    """What each runner appends when it kills a repro at ``PROOF_TIMEOUT`` (E11)."""
    if runner == "docker":
        return f"docker kill after {seconds}s (PROOF_TIMEOUT)"
    return f"killed after {seconds}s (PROOF_TIMEOUT)"
