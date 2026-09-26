"""Unified-diff parsing — the one module that knows what a patch looks like (spec §4.1 S2).

Pure by the §4.3 layering rule: text in, value objects out, no I/O and no ``prguard.api`` or
database import anywhere in the chain. Two shapes of input arrive from GitHub and both are
handled here so nothing downstream has to care which one it got:

* the whole ``application/vnd.github.v3.diff`` body (``diff --git`` headers and all), and
* the per-file ``files[].patch`` fragment, which starts at ``@@`` with no file headers.

The output that matters is :class:`~prguard.core.types.LineMap`: *is ``path:line`` on the RIGHT
side inside a hunk, and what is the nearest line that is?* Those two questions are rungs 1 and 2
of the delivery ladder (§4.7), so a wrong answer here silently demotes a comment.

**Hunk headers are never matched as strings.** ``difflib`` writes ``@@ -36,12 +36,8 @@`` and
GitHub appends the enclosing function to the very same header; ``unidiff`` reads both and the
trailer is kept verbatim as :attr:`~prguard.core.types.Hunk.section_header`.

A malformed patch degrades to an empty line map rather than raising: spec §8.1 requires that a
bad byte from GitHub never crashes a worker, and a file with no commentable lines is already a
well-defined state (it demotes to the file-level rung).
"""

from __future__ import annotations

import re
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from unidiff.errors import UnidiffParseError
from unidiff.patch import PatchSet

from prguard.core.types import FileChangeStatus, Hunk, LineMap

#: Markers GitHub and git use instead of a patch when a file has no textual diff.
_BINARY_MARKERS = ("Binary files", "GIT binary patch")

_DEV_NULL = "/dev/null"

#: ``@@ -36,12 +36,8 @@`` with an optional trailer — GitHub puts the enclosing function there.
_HUNK_HEADER = re.compile(
    r"^@@ -(?P<old_start>\d+)(?:,(?P<old_count>\d+))? "
    r"\+(?P<new_start>\d+)(?:,(?P<new_count>\d+))? @@(?P<section>.*)$"
)


@dataclass(frozen=True)
class DiffFile:
    """One changed file, as the diff describes it. ``path`` is always the **head** path."""

    path: str
    change_status: FileChangeStatus
    line_map: LineMap
    patch: str = ""
    previous_path: str | None = None
    additions: int = 0
    deletions: int = 0
    added_lines: tuple[int, ...] = ()
    is_binary: bool = False

    @property
    def hunks(self) -> tuple[Hunk, ...]:
        return self.line_map.hunks

    @property
    def changed_lines(self) -> int:
        """Additions plus deletions — the size input to risk tiering and compression (§4.1)."""
        return self.additions + self.deletions


@dataclass(frozen=True)
class DiffIndex:
    """Every changed file in one PR, keyed by head path.

    :meth:`line_map` answers for *any* path, including one that is not in the diff at all —
    that returns an empty map rather than ``None``, because "not in the diff" is a normal
    answer the ladder acts on (rung 4, spec §4.7 / E1) and not an error.
    """

    files: tuple[DiffFile, ...] = ()

    @property
    def paths(self) -> tuple[str, ...]:
        return tuple(changed.path for changed in self.files)

    def get(self, path: str) -> DiffFile | None:
        for changed in self.files:
            if changed.path == path:
                return changed
        return None

    def line_map(self, path: str) -> LineMap:
        changed = self.get(path)
        return changed.line_map if changed is not None else LineMap(file_path=path)

    def line_maps(self) -> Mapping[str, LineMap]:
        return {changed.path: changed.line_map for changed in self.files}

    def __iter__(self) -> Iterator[DiffFile]:
        return iter(self.files)

    def __len__(self) -> int:
        return len(self.files)


def parse_diff(diff_text: str) -> DiffIndex:
    """Parse a whole unified diff into a :class:`DiffIndex`."""
    patch_set = _read(diff_text)
    if patch_set is None:
        return DiffIndex()
    return DiffIndex(files=tuple(_from_patched_file(patched) for patched in patch_set))


def parse_patch(
    patch: str | None,
    *,
    path: str,
    change_status: FileChangeStatus = "modified",
    previous_path: str | None = None,
) -> DiffFile:
    """Parse one GitHub ``files[].patch`` fragment for ``path``.

    ``patch`` is ``None`` for a binary file — GitHub simply omits the key — and may also be a
    ``Binary files … differ`` marker. Both yield an empty line map flagged ``is_binary``.
    """
    is_binary = patch is None or any(marker in patch for marker in _BINARY_MARKERS)
    if patch is None or not patch.strip() or is_binary:
        return DiffFile(
            path=path,
            change_status=change_status,
            line_map=LineMap(file_path=path),
            patch=patch or "",
            previous_path=previous_path,
            is_binary=is_binary,
        )

    patch_set = _read(_with_file_headers(patch, path=path, previous_path=previous_path))
    if patch_set is None or len(patch_set) == 0:
        return _scan_fragment(
            patch, path=path, change_status=change_status, previous_path=previous_path
        )

    parsed = _from_patched_file(patch_set[0], path=path, previous_path=previous_path)
    # The caller's `status` from the GitHub payload is authoritative: a fragment carries no
    # /dev/null header, so the parser cannot tell "added" from "modified" on its own.
    return DiffFile(
        path=parsed.path,
        change_status=change_status,
        line_map=parsed.line_map,
        patch=patch,
        previous_path=previous_path,
        additions=parsed.additions,
        deletions=parsed.deletions,
        added_lines=parsed.added_lines,
    )


def index_github_files(files: Sequence[Mapping[str, Any]]) -> DiffIndex:
    """Build a :class:`DiffIndex` from a recorded ``GET …/pulls/{n}/files`` body."""
    return DiffIndex(
        files=tuple(
            parse_patch(
                entry.get("patch"),
                path=str(entry["filename"]),
                change_status=_change_status(str(entry.get("status", "modified"))),
                previous_path=entry.get("previous_filename"),
            )
            for entry in files
        )
    )


def line_map_for(patch: str | None, *, path: str) -> LineMap:
    """The RIGHT-side line map for one patch fragment — the ladder's only real question."""
    return parse_patch(patch, path=path).line_map


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _read(text: str) -> PatchSet | None:
    """Parse ``text``, or return ``None`` when it is not a diff we can read (§8.1)."""
    try:
        return PatchSet(text)
    except (UnidiffParseError, ValueError, IndexError):
        return None


def _scan_fragment(
    patch: str,
    *,
    path: str,
    change_status: FileChangeStatus,
    previous_path: str | None,
) -> DiffFile:
    """Recover the RIGHT-side lines of a fragment ``unidiff`` refused to parse.

    ``unidiff`` is strict: a hunk whose body is shorter or longer than its header claims is a
    parse error. That is the correct default, but it is not a reason to drop a whole file's
    comments on the floor — the line numbers of the lines that *are* present are still exactly
    what GitHub will accept. So geometry is read from the header (what the producer claimed)
    while ``right_lines`` is walked from the body (what is actually there), and the two are
    allowed to disagree.
    """
    hunks: list[Hunk] = []
    added: list[int] = []
    deletions = 0
    current: dict[str, Any] | None = None
    cursor = 0

    def close() -> None:
        if current is not None:
            hunks.append(
                Hunk(
                    old_start=current["old_start"],
                    old_count=current["old_count"],
                    new_start=current["new_start"],
                    new_count=current["new_count"],
                    section_header=current["section"],
                    right_lines=tuple(current["right_lines"]),
                )
            )

    for raw in patch.splitlines():
        header = _HUNK_HEADER.match(raw)
        if header is not None:
            close()
            cursor = int(header["new_start"])
            current = {
                "old_start": int(header["old_start"]),
                "old_count": int(header["old_count"] or 1),
                "new_start": cursor,
                "new_count": int(header["new_count"] or 1),
                "section": header["section"],
                "right_lines": [],
            }
            continue
        if current is None or raw.startswith("\\"):
            continue
        if raw.startswith("-"):
            deletions += 1
            continue
        if raw.startswith("+"):
            added.append(cursor)
        elif not raw.startswith(" ") and raw != "":
            current = None  # no longer inside a hunk body
            continue
        current["right_lines"].append(cursor)
        cursor += 1
    close()

    commentable = frozenset(line for hunk in hunks for line in hunk.right_lines)
    return DiffFile(
        path=path,
        change_status=change_status,
        line_map=LineMap(file_path=path, hunks=tuple(hunks), commentable_lines=commentable),
        patch=patch,
        previous_path=previous_path,
        additions=len(added),
        deletions=deletions,
        added_lines=tuple(sorted(added)),
    )


def _with_file_headers(patch: str, *, path: str, previous_path: str | None) -> str:
    """Give a bare ``@@`` fragment the ``---``/``+++`` header ``unidiff`` requires."""
    source = previous_path or path
    body = patch if patch.endswith("\n") else patch + "\n"
    return f"--- a/{source}\n+++ b/{path}\n{body}"


def _from_patched_file(
    patched: Any, *, path: str | None = None, previous_path: str | None = None
) -> DiffFile:
    head_path = path or _head_path(patched)
    hunks: list[Hunk] = []
    added: list[int] = []
    for raw in patched:
        right_lines = tuple(
            line.target_line_no for line in raw if line.target_line_no is not None
        )
        added.extend(line.target_line_no for line in raw if line.is_added)
        hunks.append(
            Hunk(
                old_start=raw.source_start,
                old_count=raw.source_length,
                new_start=raw.target_start,
                new_count=raw.target_length,
                section_header=raw.section_header or "",
                right_lines=right_lines,
            )
        )
    commentable = frozenset(line for hunk in hunks for line in hunk.right_lines)
    return DiffFile(
        path=head_path,
        change_status=_status_of(patched),
        line_map=LineMap(
            file_path=head_path, hunks=tuple(hunks), commentable_lines=commentable
        ),
        patch=str(patched),
        previous_path=previous_path or _previous_path(patched),
        additions=patched.added,
        deletions=patched.removed,
        added_lines=tuple(sorted(added)),
    )


def _head_path(patched: Any) -> str:
    target = str(patched.target_file)
    if target == _DEV_NULL:
        return _strip_prefix(str(patched.source_file))
    return _strip_prefix(target)


def _previous_path(patched: Any) -> str | None:
    if not patched.is_rename:
        return None
    return _strip_prefix(str(patched.source_file))


def _strip_prefix(path: str) -> str:
    """Drop git's ``a/``/``b/`` prefixes; leave a path that has neither alone."""
    if path.startswith(("a/", "b/")):
        return path[2:]
    return path


def _status_of(patched: Any) -> FileChangeStatus:
    if patched.is_rename:
        return "renamed"
    if patched.is_added_file:
        return "added"
    if patched.is_removed_file:
        return "removed"
    return "modified"


def _change_status(status: str) -> FileChangeStatus:
    """Normalise GitHub's ``files[].status``; ``copied``/``changed`` read as ``modified``."""
    if status in ("added", "modified", "removed", "renamed"):
        return status  # type: ignore[return-value]
    return "modified"


__all__ = [
    "DiffFile",
    "DiffIndex",
    "index_github_files",
    "line_map_for",
    "parse_diff",
    "parse_patch",
]
