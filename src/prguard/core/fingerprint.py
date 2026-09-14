"""M3 — the semantic fingerprint (spec §4.5). Pure functions, no I/O (§4.3).

```
fingerprint = sha256("v1|" + category + "|" + rule_key + "|" + symbol_path + "|" + shape_hash)
```

A fingerprint is a finding's *identity across runs*. It is what lets a re-review update the
comment it already posted instead of posting a second one (E3), what a suppression is written
against (§6.6), and what an outcome is attributed to (§5.1). So it has to survive everything
that is not the bug — a rebase moving the file, a rename of a local, a reworded title — and it
has to change the moment the flagged code does. Two of those pull in opposite directions, which
is why the normalisation below is specific rather than clever:

* **``symbol_path``** names *where* — ``pkg/mod.py::Class.func``, resolved out of the head AST
  and carrying **no line number**. Non-Python, unparsable, or module-level code falls back to
  ``path::#<line // 50>``, a bucket coarse enough that ordinary drift lands in the same one.
* **``shape_hash``** names *what* — the enclosing function reparsed with docstrings dropped,
  identifiers rewritten to positional placeholders in order of first appearance, and literals
  replaced by their type token. Imported module aliases, attribute names, keyword-argument
  names and builtins are **preserved**: ``json.dumps`` and ``pickle.dumps`` are not the same
  code, and a normalisation that says they are would merge unrelated findings.

Nothing here raises. E28 (a syntax error at head, or a Python 2 file) and a file that could not
be fetched at all both degrade to the bucket path — a coarser identity is a survivable loss, an
exception in S6 is not.
"""

from __future__ import annotations

import ast
import builtins
import hashlib
import re
from dataclasses import dataclass

from prguard.core.types import Category

#: Bump when the normalisation changes in a way that must invalidate stored identities.
FINGERPRINT_VERSION = "v1"

#: §4.5: the coarse fallback bucket, ``line // 50``.
BUCKET_SIZE = 50

#: Extensions the ``ast`` path applies to; everything else takes the token-stream path.
PYTHON_SUFFIXES = (".py", ".pyi")

#: §4.5: the non-Python shape is taken from the enclosing ±10 lines.
NON_PYTHON_WINDOW = 10

#: Literal type tokens (§4.5). Bool is checked before int — ``True`` is an ``int`` in Python.
_LITERAL_TOKENS: tuple[tuple[type, str], ...] = (
    (bool, "<bool>"),
    (int, "<int>"),
    (float, "<float>"),
    (complex, "<complex>"),
    (str, "<str>"),
    (bytes, "<bytes>"),
)

_PLACEHOLDER_PREFIX = "v"

_NON_ALNUM = re.compile(r"[^a-z0-9]+")

#: One source token: identifier, number, quoted string, or any single other character.
_TOKEN = re.compile(r"[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|\"[^\"]*\"|'[^']*'|`[^`]*`|\S")
_NUMBER = re.compile(r"^\d+(?:\.\d+)?$")
_QUOTED = re.compile(r"^[\"'`].*[\"'`]$", re.DOTALL)

_BUILTIN_NAMES = frozenset(dir(builtins))


@dataclass(frozen=True)
class Fingerprint:
    """The identity of a finding, plus the two parts a dashboard and the ledger store."""

    value: str
    symbol_path: str
    shape_hash: str


def compute(
    *,
    category: Category,
    rule_key: str,
    file_path: str,
    line: int,
    source: str | None = None,
) -> Fingerprint:
    """The §4.5 fingerprint for a finding at ``file_path:line`` in ``source``.

    ``source`` is the file's content **at head**. ``None`` means it could not be fetched, which
    degrades the identity to the bucket path rather than failing the finding.
    """
    resolved_symbol = symbol_path_for(file_path=file_path, line=line, source=source)
    shape = shape_hash_for(file_path=file_path, line=line, source=source)
    parts = (
        FINGERPRINT_VERSION,
        category,
        normalise_rule_key(rule_key),
        resolved_symbol,
        shape,
    )
    return Fingerprint(
        value=_sha256("|".join(parts)),
        symbol_path=resolved_symbol,
        shape_hash=shape,
    )


def normalise_rule_key(rule_key: str) -> str:
    """§4.5: lowercase, non-alphanumerics collapsed to a single ``_``, edges trimmed."""
    return _NON_ALNUM.sub("_", rule_key.strip().lower()).strip("_")


def symbol_path_for(*, file_path: str, line: int, source: str | None = None) -> str:
    """``pkg/mod.py::Class.func`` from the head AST, or ``pkg/mod.ext::#<line // 50>``.

    Never contains a line number in the symbol form — that is the whole point of §4.5: a
    fingerprint that moved when the file moved would make E3's comment reuse impossible.
    """
    chain = _enclosing_chain(file_path=file_path, line=line, source=source)
    if chain is None:
        return f"{file_path}::#{_bucket(line)}"
    return f"{file_path}::{'.'.join(chain)}"


def shape_hash_for(*, file_path: str, line: int, source: str | None = None) -> str:
    """sha256 of the normalised enclosing function (§4.5), or of the ±10-line token stream."""
    if source is None:
        return _sha256(f"{file_path}::#{_bucket(line)}")

    tree = _parse(file_path=file_path, source=source)
    if tree is not None:
        enclosing = _enclosing_function(tree, line)
        if enclosing is not None:
            return _sha256(_normalised_source(enclosing, tree))
    return _sha256(_token_stream(source, line))


# ---------------------------------------------------------------------------
# Python path — ast normalisation
# ---------------------------------------------------------------------------


def _parse(*, file_path: str, source: str) -> ast.Module | None:
    """Parse ``source`` as Python, or ``None`` for a non-Python or unparsable file (E28)."""
    if not file_path.endswith(PYTHON_SUFFIXES):
        return None
    try:
        return ast.parse(source)
    except (SyntaxError, ValueError, RecursionError):
        return None


def _enclosing_chain(*, file_path: str, line: int, source: str | None) -> list[str] | None:
    """The ``Class.func`` chain containing ``line``, or ``None`` when there is not one."""
    if source is None:
        return None
    tree = _parse(file_path=file_path, source=source)
    if tree is None:
        return None
    chain = [node.name for node in _ancestors(tree, line)]
    return chain or None


#: A ``class``/``def``/``async def`` — the node kinds a symbol path is built from.
Definition = ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef


def _ancestors(tree: ast.Module, line: int) -> list[Definition]:
    """Definitions enclosing ``line``, outermost first."""
    found: list[Definition] = []
    node: ast.AST = tree
    while True:
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef) and _spans(
                child, line
            ):
                found.append(child)
                node = child
                break
        else:
            return found


def _enclosing_function(
    tree: ast.Module, line: int
) -> ast.FunctionDef | ast.AsyncFunctionDef | None:
    """The innermost ``def`` containing ``line``. Module-level code has none (§4.5 fallback)."""
    innermost: ast.FunctionDef | ast.AsyncFunctionDef | None = None
    for node in _ancestors(tree, line):
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            innermost = node
    return innermost


def _spans(node: ast.AST, line: int) -> bool:
    start = getattr(node, "lineno", None)
    end = getattr(node, "end_lineno", None) or start
    return start is not None and end is not None and start <= line <= end


def _normalised_source(
    function: ast.FunctionDef | ast.AsyncFunctionDef, module: ast.Module
) -> str:
    """The §4.5 normal form of one function: no docstrings, placeholder names, typed literals."""
    normaliser = _Normaliser(preserved=_preserved_names(module))
    rewritten = normaliser.visit(_stripped(function))
    ast.fix_missing_locations(rewritten)
    return ast.unparse(rewritten)


def _stripped(function: ast.FunctionDef | ast.AsyncFunctionDef) -> ast.AST:
    """A copy of ``function`` with every docstring removed, including nested ones."""
    copy = ast.parse(ast.unparse(function)).body[0]
    for node in ast.walk(copy):
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef | ast.Module):
            body = getattr(node, "body", [])
            if body and _is_docstring(body[0]):
                node.body = body[1:] or [ast.Pass()]
    return copy


def _is_docstring(node: ast.stmt) -> bool:
    return (
        isinstance(node, ast.Expr)
        and isinstance(node.value, ast.Constant)
        and isinstance(node.value.value, str)
    )


def _preserved_names(module: ast.Module) -> frozenset[str]:
    """Identifiers that carry meaning and must survive: imports and builtins (§4.5).

    ``json.dumps`` and ``pickle.dumps`` differ only in an imported alias; rewriting both to
    ``v0.dumps`` would merge two unrelated findings into one identity.
    """
    imported: set[str] = set()
    for node in ast.walk(module):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imported.add(alias.asname or alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                imported.add(alias.asname or alias.name)
            if node.module:
                imported.add(node.module.split(".")[0])
    return frozenset(imported | _BUILTIN_NAMES)


class _Normaliser(ast.NodeTransformer):
    """Rewrite identifiers to ``v0, v1, …`` by first appearance and literals to type tokens.

    Attribute names, keyword-argument names and anything in ``preserved`` are left alone, so
    the shape keeps the part of the code that says what it *does*.
    """

    def __init__(self, *, preserved: frozenset[str]) -> None:
        self._preserved = preserved
        self._aliases: dict[str, str] = {}

    def _placeholder(self, name: str) -> str:
        if name in self._preserved:
            return name
        if name not in self._aliases:
            self._aliases[name] = f"{_PLACEHOLDER_PREFIX}{len(self._aliases)}"
        return self._aliases[name]

    def visit_FunctionDef(self, node: ast.FunctionDef) -> ast.AST:
        node.name = self._placeholder(node.name)
        node.decorator_list = [self.visit(item) for item in node.decorator_list]
        self.generic_visit(node)
        return node

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> ast.AST:
        node.name = self._placeholder(node.name)
        node.decorator_list = [self.visit(item) for item in node.decorator_list]
        self.generic_visit(node)
        return node

    def visit_ClassDef(self, node: ast.ClassDef) -> ast.AST:
        node.name = self._placeholder(node.name)
        self.generic_visit(node)
        return node

    def visit_arg(self, node: ast.arg) -> ast.AST:
        node.arg = self._placeholder(node.arg)
        self.generic_visit(node)
        return node

    def visit_Name(self, node: ast.Name) -> ast.AST:
        node.id = self._placeholder(node.id)
        return node

    def visit_Constant(self, node: ast.Constant) -> ast.AST:
        return ast.Name(id=_literal_token(node.value), ctx=ast.Load())

    def visit_ExceptHandler(self, node: ast.ExceptHandler) -> ast.AST:
        if node.name is not None:
            node.name = self._placeholder(node.name)
        self.generic_visit(node)
        return node

    def visit_Global(self, node: ast.Global) -> ast.AST:
        node.names = [self._placeholder(name) for name in node.names]
        return node

    def visit_Nonlocal(self, node: ast.Nonlocal) -> ast.AST:
        node.names = [self._placeholder(name) for name in node.names]
        return node


def _literal_token(value: object) -> str:
    if value is None:
        return "<none>"
    if value is Ellipsis:
        return "<ellipsis>"
    for kind, token in _LITERAL_TOKENS:
        if isinstance(value, kind):
            return token
    return "<literal>"


# ---------------------------------------------------------------------------
# Non-Python path — whitespace-normalised token stream of the enclosing ±10 lines
# ---------------------------------------------------------------------------


def _token_stream(source: str, line: int) -> str:
    """§4.5: the ±10-line window, literals masked, whitespace collapsed."""
    lines = source.splitlines()
    if not lines:
        return ""
    centre = min(max(line, 1), len(lines))
    window = lines[max(0, centre - 1 - NON_PYTHON_WINDOW) : centre + NON_PYTHON_WINDOW]
    tokens = [_mask(token) for token in _TOKEN.findall("\n".join(window))]
    return " ".join(tokens)


def _mask(token: str) -> str:
    if _NUMBER.match(token):
        return "<num>"
    if _QUOTED.match(token):
        return "<str>"
    return token


# ---------------------------------------------------------------------------
# Shared
# ---------------------------------------------------------------------------


def _bucket(line: int) -> int:
    return max(0, line) // BUCKET_SIZE


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


__all__ = [
    "BUCKET_SIZE",
    "FINGERPRINT_VERSION",
    "Fingerprint",
    "compute",
    "normalise_rule_key",
    "shape_hash_for",
    "symbol_path_for",
]
