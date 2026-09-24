"""Parse a practice note (frontmatter `type: exercise`) into an ExerciseNote."""

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from ..frontmatter_utils import parse_frontmatter
from .discipline_catalog import discipline_for, normalize_skill_code
from .modes import mode_for

_SECTION_KEYS = {
    "enunciado": "statement", "statement": "statement",
    "codigo": "code", "code": "code",
    "pistas": "hints", "hints": "hints",
    "solucion": "solution", "solution": "solution",
    "rubrica": "rubric", "rubric": "rubric",
    "errores tipicos": "typical_errors", "typical errors": "typical_errors",
    "senal de dominio": "mastery_signal", "mastery signal": "mastery_signal",
}

_FENCE_RE = re.compile(r"^\s*(```|~~~)")
_CODE_BLOCK_RE = re.compile(r"^(```|~~~)[ \t]*([\w+#.-]*)[^\n]*\n(.*?)^\1[ \t]*$", re.S | re.M)
_BULLET_RE = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+(.*)$")
_CHECKBOX_RE = re.compile(r"^\s*[-*+]\s+\[[ xX]\]\s*(?:\(\d+\)\s*)?(.*)$")
_TYPICAL_RE = re.compile(r"^\s*[-*+]\s+\*\*\s*([^*]+?)\s*:?\s*\*\*\s*:?\s*(.*)$")


@dataclass
class ExerciseNote:
    path: Path | None
    note_id: str
    title: str
    frontmatter: dict
    subject: str
    discipline: str
    skill: str
    mode: str
    difficulty: int
    minutes: int
    timer: str
    assistance: str
    level: str
    statement: str = ""
    code: str = ""
    code_lang: str = ""
    hints: list[str] = field(default_factory=list)
    solution: str = ""
    rubric: list[str] = field(default_factory=list)
    typical_errors: list[tuple[str, str]] = field(default_factory=list)
    mastery_signal: str = ""
    drill: str = ""
    items: int = 20


def is_practice_frontmatter(fm: dict) -> bool:
    return isinstance(fm, dict) and str(fm.get("type") or "").strip().lower() == "exercise"


def _fold(text: str) -> str:
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return " ".join(plain.lower().split())


def _split_headings(text: str, marker: str) -> tuple[list[str], list[tuple[str, str]]]:
    """(lines before the first heading, [(heading, content), ...]) ignoring fenced code."""
    head: list[str] = []
    parts: list[tuple[str, list[str]]] = []
    in_fence = False
    for line in text.splitlines():
        if _FENCE_RE.match(line):
            in_fence = not in_fence
        elif not in_fence and line.startswith(marker):
            parts.append((line[len(marker):].strip(), []))
            continue
        (parts[-1][1] if parts else head).append(line)
    return head, [(title, "\n".join(lines).strip()) for title, lines in parts]


def _int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _parse_hints(text: str) -> list[str]:
    head, subs = _split_headings(text, "### ")
    if subs:
        return [body for _, body in subs if body]
    hints: list[str] = []
    for line in head:
        m = _BULLET_RE.match(line)
        if m:
            hints.append(m.group(1).strip())
        elif line.strip() and hints:
            hints[-1] += "\n" + line.strip()
    if not hints and text.strip():
        hints.append(text.strip())
    return hints


def _parse_rubric(text: str) -> list[str]:
    items = [m.group(1).strip() for m in map(_CHECKBOX_RE.match, text.splitlines()) if m]
    if items:
        return items
    return [m.group(1).strip() for m in map(_BULLET_RE.match, text.splitlines()) if m]


def _parse_typical_errors(text: str) -> list[tuple[str, str]]:
    out = []
    for line in text.splitlines():
        m = _TYPICAL_RE.match(line)
        if m:
            out.append((m.group(1).strip().lower(), m.group(2).strip()))
        else:
            b = _BULLET_RE.match(line)
            if b:
                out.append(("", b.group(1).strip()))
    return out


def parse_exercise(text: str, path: Path | None = None) -> ExerciseNote:
    fm, body = parse_frontmatter(text or "")
    head, parts = _split_headings(body, "## ")
    sections: dict[str, str] = {}
    for title, content in parts:
        key = _SECTION_KEYS.get(_fold(title))
        if key and key not in sections:
            sections[key] = content

    h1 = next((line[2:].strip() for line in head if line.startswith("# ")), "")
    stem = Path(path).stem if path else ""
    code, code_lang = sections.get("code", ""), ""
    block = _CODE_BLOCK_RE.search(code)
    if block:
        code_lang, code = block.group(2).lower(), block.group(3).rstrip("\n")

    level = str(fm.get("level") or "").strip().upper()
    assistance = str(fm.get("assistance") or "helper").strip().lower()
    timer = fm.get("timer")
    return ExerciseNote(
        path=Path(path) if path else None,
        note_id=str(fm.get("id") or "").strip() or stem,
        title=str(fm.get("title") or "").strip() or h1 or stem,
        frontmatter=fm,
        subject=str(fm.get("subject") or "general").strip().lower(),
        discipline=discipline_for(fm).id,
        skill=normalize_skill_code(fm.get("skill")),
        mode=mode_for(fm).id,
        difficulty=max(1, min(5, _int(fm.get("difficulty"), 2))),
        minutes=max(0, _int(fm.get("minutes"), 0)),
        timer="off" if timer is False else str(timer if timer is not None else "").strip(),
        assistance=assistance if assistance in ("helper", "nohelp") else "helper",
        level=level,
        statement=sections.get("statement", ""),
        code=code,
        code_lang=code_lang,
        hints=_parse_hints(sections.get("hints", "")),
        solution=sections.get("solution", ""),
        rubric=_parse_rubric(sections.get("rubric", "")),
        typical_errors=_parse_typical_errors(sections.get("typical_errors", "")),
        mastery_signal=sections.get("mastery_signal", ""),
        drill=str(fm.get("drill") or "").strip().lower(),
        items=max(1, _int(fm.get("items"), 20)),
    )
