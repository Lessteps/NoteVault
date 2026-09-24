"""Index of the vault's practice notes (and of notes that carry concept cards).

Reads only frontmatter for exercises; results are cached per file by mtime and size so
refreshing the Estudio hub costs one stat per note after the first scan.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path

from ..frontmatter_utils import parse_frontmatter
from .discipline_catalog import discipline_for, normalize_skill_code
from .exercise_note import is_practice_frontmatter
from .modes import mode_for

GROUP_FOLDERS = {"ejercicios", "exercises", "demostraciones", "proofs", "practica", "práctica"}

# Exercises without an explicit `skill:` are placed in a skill by what they train.
MODE_SKILLS = {
    "math_general": {"prove": "01", "solve": "02", "explain": "03", "counterexample": "04",
                     "true_false": "04", "find_error": "04"},
}
DRILL_SKILLS = {"arithmetic": "01", "fractions": "02", "powers": "03", "percent": "04",
                "derivatives": "05"}

_CARDS_RE = re.compile(r"^##\s+(tarjetas|cards|flashcards)\s*$", re.I | re.M)
_TRUE = {"true", "yes", "si", "sí", "1"}


@dataclass(frozen=True)
class ExerciseRef:
    path: Path
    rel: str
    note_id: str
    title: str
    subject: str
    discipline: str
    skill: str
    mode: str
    difficulty: int
    concept: str
    chapter: str
    chapter_title: str
    integration: bool = False


@dataclass
class CardNote:
    path: Path
    rel: str
    concept_id: str
    title: str
    subject: str
    frontmatter: dict
    text: str


@dataclass
class VaultScan:
    exercises: list = field(default_factory=list)
    card_notes: list = field(default_factory=list)

    def by_id(self) -> dict:
        return {e.note_id: e for e in self.exercises}


def _int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def is_true(value) -> bool:
    return value is True or str(value or "").strip().lower() in _TRUE


def skill_key(discipline: str, mode: str, skill: str = "", drill: str = "") -> str:
    """The ledger skill of an exercise: explicit `skill:` or one derived from its act."""
    code = normalize_skill_code(skill)
    if code:
        return code
    if discipline == "math_drill":
        return DRILL_SKILLS.get(str(drill or "").lower(), "")
    return MODE_SKILLS.get(discipline, {}).get(mode, "")


def _chapter(path: Path, vault_root: Path) -> tuple[str, str]:
    folder = path.parent
    if folder.name.lower() in GROUP_FOLDERS and folder != vault_root:
        folder = folder.parent
    try:
        key = folder.relative_to(vault_root).as_posix()
    except ValueError:
        key = folder.as_posix()
    return key or ".", folder.name or "Vault"


def _is_integration(fm: dict) -> bool:
    skills = fm.get("skills")
    return (is_true(fm.get("integration"))
            or str(fm.get("meta") or "").strip() == "2"
            or str(fm.get("practice") or "").strip().lower() in ("integracion", "integración")
            or (isinstance(skills, list) and len(skills) >= 2))


def exercise_ref(path: Path, vault_root: Path, fm: dict) -> ExerciseRef:
    path = Path(path)
    discipline = discipline_for(fm).id
    mode = mode_for(fm).id
    chapter, chapter_title = _chapter(path, vault_root)
    try:
        rel = path.relative_to(vault_root).as_posix()
    except ValueError:
        rel = path.as_posix()
    return ExerciseRef(
        path=path,
        rel=rel,
        note_id=str(fm.get("id") or "").strip() or path.stem,
        title=str(fm.get("title") or "").strip() or path.stem,
        subject=str(fm.get("subject") or "general").strip().lower(),
        discipline=discipline,
        skill=skill_key(discipline, mode, fm.get("skill"), fm.get("drill")),
        mode=mode,
        difficulty=max(1, min(5, _int(fm.get("difficulty"), 2))),
        concept=str(fm.get("concept") or "").strip(),
        chapter=chapter,
        chapter_title=chapter_title,
        integration=_is_integration(fm),
    )


_cache: dict = {}


def _read(path: Path):
    try:
        st = path.stat()
    except OSError:
        return None
    stamp = (st.st_mtime_ns, st.st_size)
    hit = _cache.get(path)
    if hit and hit[0] == stamp:
        return hit[1]
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    fm = {}
    if text.startswith("---"):
        try:
            fm, _ = parse_frontmatter(text)
        except Exception:
            fm = {}
    has_cards = bool(_CARDS_RE.search(text))
    entry = (fm if isinstance(fm, dict) else {}, text if has_cards else "")
    _cache[path] = (stamp, entry)
    return entry


def scan_vault(vault_root: Path, paths) -> VaultScan:
    vault_root = Path(vault_root)
    scan = VaultScan()
    for path in paths:
        path = Path(path)
        entry = _read(path)
        if entry is None:
            continue
        fm, text = entry
        if is_practice_frontmatter(fm):
            scan.exercises.append(exercise_ref(path, vault_root, fm))
        elif text:
            try:
                rel = path.relative_to(vault_root).as_posix()
            except ValueError:
                rel = path.as_posix()
            scan.card_notes.append(CardNote(
                path=path, rel=rel,
                concept_id=str(fm.get("id") or "").strip() or path.stem,
                title=str(fm.get("title") or "").strip() or path.stem,
                subject=str(fm.get("subject") or "general").strip().lower(),
                frontmatter=fm, text=text))
    scan.exercises.sort(key=lambda e: e.rel.lower())
    scan.card_notes.sort(key=lambda c: c.rel.lower())
    return scan
