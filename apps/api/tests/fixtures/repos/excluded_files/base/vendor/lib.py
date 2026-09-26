"""Vendored third-party helper — excluded by path, not by content (E9).

Copied verbatim from an upstream project; nobody on this team reviews it, so
findings raised against it are noise by construction.
"""


def slugify(value):
    keep = [character.lower() if character.isalnum() else "-" for character in value]
    return "".join(keep).strip("-")


def chunked(items, size):
    for index in range(0, len(items), size):
        yield items[index : index + size]
