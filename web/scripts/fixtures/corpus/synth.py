"""Head-revision source text and unified-diff patches for the non-demo repositories.

The backend computes a finding's identity from the head source (``fingerprint.compute``) and
decides comment placement from the patch (``context.build_context`` → ``LineMap``). Both need
real text, so every file a finding points at is synthesised here: a parseable module whose
symbols sit at known lines, and a GitHub-style ``patch`` fragment whose hunks cover exactly the
lines a run's plan says the diff touched.

Nothing in this module is shown on a surface. The demo pull request is hand-written in
``demo_sources.py``; these files exist so the other runs' fingerprints and ladder rungs are
computed by the backend rather than typed.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from corpus.rng import stream

# ---------------------------------------------------------------------------------------
# Specs
# ---------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Sym:
    """A top-level symbol: ``fn``, ``Class.method`` (Python) or a named block elsewhere."""

    name: str
    lines: int = 12
    params: tuple[str, ...] = ()
    decorator: str | None = None


@dataclass(frozen=True)
class FileSpec:
    path: str
    symbols: tuple[Sym, ...]
    doc: str = ""
    imports: tuple[str, ...] = ()


@dataclass
class SourceFile:
    """A synthesised head file: its text and where each symbol sits (1-based, inclusive)."""

    path: str
    text: str
    spans: dict[str, tuple[int, int]] = field(default_factory=dict)

    @property
    def lines(self) -> list[str]:
        return self.text.splitlines()


# ---------------------------------------------------------------------------------------
# Python
# ---------------------------------------------------------------------------------------

_VERBS = ("load", "fetch", "resolve", "build", "normalise", "select", "apply", "lookup", "read")
_NOUNS = ("rows", "entry", "record", "items", "window", "batch", "result", "payload", "state")
_ATTRS = ("status", "total", "tenant_id", "created_at", "amount", "id", "owner", "items")


def _py_body(name: str, params: tuple[str, ...], count: int, rng: random.Random) -> list[str]:
    """``count`` lines of valid, distinct Python that uses ``params``. Always ends in return."""
    args = [p.split(":")[0].split("=")[0].strip() for p in params]
    args = [a for a in args if a not in ("self", "cls", "*")] or ["value"]
    leaf = name.split(".")[-1].strip("_")
    known = list(args)
    body: list[str] = []
    counter = 0

    def fresh() -> str:
        nonlocal counter
        counter += 1
        return f"{rng.choice(_NOUNS)}_{counter}"

    while len(body) < count - 1:
        room = count - 1 - len(body)
        kind = rng.choice(("assign", "assign", "guard", "loop", "attr", "log", "assign"))
        source = rng.choice(known)
        if kind == "guard" and room >= 2:
            body.append(f"if {source} is None:")
            body.append(f"    return {rng.choice(('None', '[]', '0', 'False', '{}'))}")
        elif kind == "loop" and room >= 3:
            acc = fresh()
            item = f"item_{counter}"
            body.append(f"{acc} = []")
            body.append(f"for {item} in {source} or ():")
            body.append(f"    {acc}.append(_{rng.choice(_VERBS)}_{leaf}({item}))")
            known.append(acc)
        elif kind == "attr":
            body.append(f"{source}.{rng.choice(_ATTRS)} = {rng.choice(known)}")
        elif kind == "log":
            body.append(f'log.info("{leaf}: %s", {source})')
        else:
            target = fresh()
            callee = f"_{rng.choice(_VERBS)}_{rng.choice(_NOUNS)}"
            body.append(f"{target} = {callee}({source}, {rng.randint(1, 90)})")
            known.append(target)
    body.append(f"return {known[-1]}")
    return body


def _python(spec: FileSpec) -> SourceFile:
    rng = stream(f"src:{spec.path}")
    doc = spec.doc or f"{spec.path.rsplit('/', 1)[-1][:-3].replace('_', ' ').capitalize()}."
    head = [f'"""{doc}"""', "", "from __future__ import annotations", "", "import logging"]
    head.extend(spec.imports)
    head.extend(["", "log = logging.getLogger(__name__)"])
    lines = list(head)
    spans: dict[str, tuple[int, int]] = {}
    classes_open: str | None = None
    for sym in spec.symbols:
        owner, _, leaf = sym.name.rpartition(".")
        if owner:
            if owner != classes_open:
                lines.extend(["", "", f"class {owner}:"])
                lines.append(f'    """{owner} for {spec.path.split("/")[-1]}."""')
                classes_open = owner
            lines.append("")
            indent = "    "
            params = ("self", *sym.params)
        else:
            classes_open = None
            lines.extend(["", ""])
            indent = ""
            params = sym.params
        if sym.decorator:
            lines.append(indent + sym.decorator)
        start = len(lines) + 1
        lines.append(f"{indent}def {leaf}({', '.join(params)}):")
        for text in _py_body(sym.name, params, sym.lines, rng):
            lines.append(f"{indent}    {text}")
        spans[sym.name] = (start, len(lines))
    return SourceFile(path=spec.path, text="\n".join(lines) + "\n", spans=spans)


# ---------------------------------------------------------------------------------------
# TypeScript, Terraform, YAML, JSON — the token-stream path of §4.5
# ---------------------------------------------------------------------------------------


def _ts(spec: FileSpec) -> SourceFile:
    rng = stream(f"src:{spec.path}")
    lines = ['import { track } from "../telemetry";', 'import type { Money } from "../money";']
    spans: dict[str, tuple[int, int]] = {}
    for sym in spec.symbols:
        lines.append("")
        start = len(lines) + 1
        params = ", ".join(sym.params) or "input: unknown"
        lines.append(f"export function {sym.name}({params}) {{")
        known = [p.split(":")[0].strip() for p in sym.params] or ["input"]
        for index in range(sym.lines - 2):
            name = f"{rng.choice(_NOUNS)}{index}"
            lines.append(f"  const {name} = {rng.choice(known)}?.{rng.choice(_ATTRS)} ?? {rng.randint(0, 99)};")
            known.append(name)
        lines.append(f"  return {known[-1]};")
        lines.append("}")
        spans[sym.name] = (start, len(lines))
    return SourceFile(path=spec.path, text="\n".join(lines) + "\n", spans=spans)


def _tf(spec: FileSpec) -> SourceFile:
    rng = stream(f"src:{spec.path}")
    lines: list[str] = []
    spans: dict[str, tuple[int, int]] = {}
    for sym in spec.symbols:
        if lines:
            lines.append("")
        kind, _, name = sym.name.partition(".")
        start = len(lines) + 1
        lines.append(f'resource "{kind}" "{name}" {{')
        for index in range(sym.lines - 2):
            key = f"{rng.choice(('tag', 'setting', 'rule', 'option'))}_{index}"
            lines.append(f'  {key} = "{rng.choice(_NOUNS)}-{rng.randint(1, 9)}"')
        lines.append("}")
        spans[sym.name] = (start, len(lines))
    return SourceFile(path=spec.path, text="\n".join(lines) + "\n", spans=spans)


def _yaml(spec: FileSpec) -> SourceFile:
    rng = stream(f"src:{spec.path}")
    lines = ["name: ci", "on:", "  pull_request:", "jobs:"]
    spans: dict[str, tuple[int, int]] = {}
    for sym in spec.symbols:
        start = len(lines) + 1
        lines.append(f"  {sym.name}:")
        lines.append("    runs-on: ubuntu-latest")
        lines.append("    steps:")
        for index in range(sym.lines - 3):
            lines.append(f"      - run: make {rng.choice(_VERBS)}-{index}")
        spans[sym.name] = (start, len(lines))
    return SourceFile(path=spec.path, text="\n".join(lines) + "\n", spans=spans)


def _json(spec: FileSpec) -> SourceFile:
    rng = stream(f"src:{spec.path}")
    lines = ["{"]
    spans: dict[str, tuple[int, int]] = {}
    for position, sym in enumerate(spec.symbols):
        start = len(lines) + 1
        lines.append(f'  "{sym.name}": {{')
        for index in range(sym.lines - 2):
            comma = "," if index < sym.lines - 3 else ""
            lines.append(f'    "{rng.choice(_NOUNS)}_{index}": "{rng.getrandbits(64):016x}"{comma}')
        lines.append("  }" + ("," if position < len(spec.symbols) - 1 else ""))
        spans[sym.name] = (start, len(lines))
    lines.append("}")
    return SourceFile(path=spec.path, text="\n".join(lines) + "\n", spans=spans)


def synthesise(spec: FileSpec) -> SourceFile:
    if spec.path.endswith(".py"):
        return _python(spec)
    if spec.path.endswith((".ts", ".tsx")):
        return _ts(spec)
    if spec.path.endswith(".tf"):
        return _tf(spec)
    if spec.path.endswith((".yml", ".yaml")):
        return _yaml(spec)
    if spec.path.endswith(".json"):
        return _json(spec)
    raise ValueError(f"no synthesiser for {spec.path}")


# ---------------------------------------------------------------------------------------
# Patches — GitHub ``files[].patch`` fragments
# ---------------------------------------------------------------------------------------


def _merge(ranges: list[tuple[int, int]]) -> list[tuple[int, int]]:
    merged: list[tuple[int, int]] = []
    for start, end in sorted(ranges):
        if merged and start <= merged[-1][1] + 1:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def _old_version(line: str) -> str:
    """A plausible pre-image of a changed line — only ever read by the diff parser."""
    stripped = line.rstrip()
    if not stripped.strip():
        return "# removed"
    if stripped.endswith(")"):
        return stripped[:-1] + ", strict=False)"
    return stripped + "  # previous"


def build_patch(text: str, ranges: list[tuple[int, int]], *, added: bool = False) -> tuple[str, int, int]:
    """A patch whose hunks cover exactly ``ranges`` of RIGHT-side lines.

    Each hunk keeps up to three context lines at either end and marks the rest as changed, with
    a removed pre-image line for every second added one. Returns ``(patch, additions,
    deletions)``. ``added=True`` is a new file: one hunk, every line added.
    """
    lines = text.splitlines()
    if added:
        body = "\n".join("+" + line for line in lines)
        return f"@@ -0,0 +1,{len(lines)} @@\n{body}", len(lines), 0

    chunks: list[str] = []
    additions = deletions = 0
    shift = 0
    for start, end in _merge(ranges):
        start = max(1, start)
        end = min(len(lines), end)
        span = lines[start - 1 : end]
        lead = min(3, max(0, (len(span) - 1) // 2))
        tail = min(3, max(0, len(span) - lead - 1))
        core = span[lead : len(span) - tail] or span[lead : lead + 1]
        out: list[str] = [" " + line for line in span[:lead]]
        removed = [_old_version(line) for line in core[::2]]
        out.extend("-" + line for line in removed)
        out.extend("+" + line for line in core)
        out.extend(" " + line for line in span[lead + len(core) :])
        old_len = lead + len(removed) + (len(span) - lead - len(core))
        new_len = len(span)
        old_start = max(1, start + shift)
        header = f"@@ -{old_start},{old_len} +{start},{new_len} @@"
        chunks.append(header + "\n" + "\n".join(out))
        additions += len(core)
        deletions += len(removed)
        shift += len(removed) - len(core)
    return "\n".join(chunks), additions, deletions
