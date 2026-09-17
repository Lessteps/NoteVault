"""
NoteVault Frontmatter Utilities
Robust YAML frontmatter parsing, serialization, and structured property validation.
"""

import re
from typing import Any

FRONTMATTER_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n?", re.S)

VALID_SUBJECTS = ("mathematics", "programming", "english", "general")
VALID_TYPES = (
    "concept", "topic", "chapter", "skill", "method", "formula",
    "definition", "theorem", "example", "exercise", "flashcard",
    "error", "project", "vocabulary", "grammar", "note"
)
VALID_STATUSES = ("learning", "reviewing", "mastered", "pending")


def parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """
    Split YAML frontmatter from markdown body and parse types cleanly.
    Returns (properties_dict, body_text).
    """
    m = FRONTMATTER_RE.match(text or "")
    if not m:
        return {}, text or ""

    fm_text = m.group(1)
    body = (text or "")[m.end():]
    data: dict[str, Any] = {}

    for line in fm_text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip()

        # Parse boolean
        if val.lower() in ("true", "yes"):
            data[key] = True
        elif val.lower() in ("false", "no"):
            data[key] = False
        # Parse inline list [a, b, c]
        elif val.startswith("[") and val.endswith("]"):
            items = [x.strip().strip("\"'") for x in val[1:-1].split(",") if x.strip()]
            data[key] = items
        # Parse int or float
        elif re.match(r"^-?\d+$", val):
            data[key] = int(val)
        elif re.match(r"^-?\d+\.\d+$", val):
            data[key] = float(val)
        else:
            # String with stripped quotes
            data[key] = val.strip("\"'")

    return data, body


def dump_frontmatter(data: dict[str, Any]) -> str:
    """Format dictionary into YAML frontmatter string including delimiters."""
    if not data:
        return ""
    lines = ["---"]
    for k, v in data.items():
        if isinstance(v, bool):
            lines.append(f"{k}: {'true' if v else 'false'}")
        elif isinstance(v, (int, float)):
            lines.append(f"{k}: {v}")
        elif isinstance(v, (list, tuple, set)):
            items_str = ", ".join(f'"{str(x)}"' if isinstance(x, str) else str(x) for x in v)
            lines.append(f"{k}: [{items_str}]")
        else:
            v_str = str(v).replace("\n", " ").strip()
            if ":" in v_str or "#" in v_str or '"' in v_str or "'" in v_str:
                clean = v_str.replace('"', '\\"')
                lines.append(f'{k}: "{clean}"')
            else:
                lines.append(f"{k}: {v_str}")
    lines.append("---")
    return "\n".join(lines) + "\n"


def update_frontmatter(full_text: str, updates: dict[str, Any]) -> str:
    """Update or inject frontmatter properties into a markdown document."""
    current, body = parse_frontmatter(full_text)
    current.update(updates)
    # Filter out None values
    clean = {k: v for k, v in current.items() if v is not None}
    if not clean:
        return body
    return dump_frontmatter(clean) + body


def sanitize_properties(props: dict[str, Any]) -> dict[str, Any]:
    """Validate and clean structured note properties."""
    out = dict(props)
    if "mastery" in out:
        try:
            val = float(out["mastery"])
            out["mastery"] = round(max(0.0, min(1.0, val)), 2)
        except (ValueError, TypeError):
            out["mastery"] = 0.0

    if "difficulty" in out:
        try:
            val = int(out["difficulty"])
            out["difficulty"] = max(1, min(5, val))
        except (ValueError, TypeError):
            out["difficulty"] = 1

    if "goal_level" in out:
        try:
            val = int(out["goal_level"])
            out["goal_level"] = max(1, min(4, val))
        except (ValueError, TypeError):
            out["goal_level"] = 1

    if "tags" in out and isinstance(out["tags"], str):
        out["tags"] = [out["tags"]]

    return out
