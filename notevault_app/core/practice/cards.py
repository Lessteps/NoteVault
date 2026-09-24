"""Concept cards: the `## Tarjetas` section of concept notes, indexed as SRS items.

Format (docs/knowledge_base/templates/concept.md):

    ## Tarjetas
    ### T1 · definicion
    **P:** question
    **R:** answer

The theory notes will be restructured, so all format knowledge lives in parse_cards();
anything it does not recognise is skipped. A concept's cards only enter the SRS queue
once the concept is studied: frontmatter `estudiado: true` (or `studied: true`), or any
attempt on an exercise whose `concept:` is that note's id.
"""

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from ..study_srs_manager import StudySRSManager, generate_srs_id
from .exercise_index import CardNote, is_true

ENTITY_TYPE = "card"
NEW_CARDS_PER_DAY = 10

_SECTION_NAMES = {"tarjetas", "cards", "flashcards"}
_HEAD_RE = re.compile(r"^\s*T?\s*(\d+)\s*(?:[·\-—–:|.]\s*(.*))?$", re.I)
_MARK_RE = re.compile(
    r"^\s*(?:[-*+]\s+)?(?:\*\*|__)?\s*(P|Q|R|A|Pregunta|Respuesta|Question|Answer)\s*"
    r"(?:\*\*|__)?\s*[:：]\s*(?:\*\*|__)?\s*(.*)$", re.I)
_FENCE_RE = re.compile(r"^\s*(```|~~~)")
_QUESTION = {"p", "q", "pregunta", "question"}


@dataclass(frozen=True)
class Card:
    number: int
    kind: str
    question: str
    answer: str


def _fold(text: str) -> str:
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return " ".join(plain.lower().split())


def _cards_section(text: str) -> list[str]:
    lines, inside, fence = [], False, False
    for line in (text or "").splitlines():
        if _FENCE_RE.match(line):
            fence = not fence
        if not fence and line.startswith("## ") and not line.startswith("### "):
            if inside:
                break
            inside = _fold(line[3:]) in _SECTION_NAMES
            continue
        if not fence and line.startswith("# ") and inside:
            break
        if inside:
            lines.append(line)
    return lines


def parse_cards(text: str) -> list[Card]:
    cards: list[Card] = []
    blocks: list[tuple[str, list[str]]] = []
    for line in _cards_section(text):
        if line.startswith("### "):
            blocks.append((line[4:].strip(), []))
        elif blocks:
            blocks[-1][1].append(line)
    for ordinal, (heading, body) in enumerate(blocks, 1):
        m = _HEAD_RE.match(heading)
        number = int(m.group(1)) if m else ordinal
        kind = " ".join(((m.group(2) or "") if m else heading).lower().split())
        parts: dict[str, list[str]] = {}
        current = None
        for line in body:
            mark = _MARK_RE.match(line)
            if mark:
                current = "q" if mark.group(1).lower() in _QUESTION else "a"
                parts.setdefault(current, []).append(mark.group(2).rstrip("* ").strip())
            elif current and line.strip():
                parts[current].append(line.strip())
        question = "\n".join(parts.get("q", [])).strip()
        answer = "\n".join(parts.get("a", [])).strip()
        if question:
            cards.append(Card(number, kind, question, answer))
    return cards


def card_entity_id(concept_id: str, number: int) -> str:
    return f"{concept_id}#T{number}"


def split_entity_id(entity_id: str) -> tuple[str, int]:
    concept, _, tail = str(entity_id).rpartition("#T")
    try:
        return concept, int(tail)
    except ValueError:
        return str(entity_id), 0


def is_studied(note: CardNote, exercises: list, attempted_ids: set) -> bool:
    fm = note.frontmatter or {}
    if is_true(fm.get("estudiado")) or is_true(fm.get("studied")):
        return True
    return any(e.concept == note.concept_id and e.note_id in attempted_ids for e in exercises)


def index_cards(vault_root: Path, card_notes: list, exercises: list = (),
                attempted_ids: set = frozenset(), srs: StudySRSManager | None = None) -> list[dict]:
    """Register the cards of every studied concept note; return their SRS items."""
    srs = srs or StudySRSManager(vault_root)
    existing = {i["id"]: i for i in srs.all_items()}
    items = []
    for note in card_notes:
        if not is_studied(note, list(exercises), set(attempted_ids)):
            continue
        difficulty = note.frontmatter.get("difficulty") if note.frontmatter else None
        try:
            difficulty = max(1, min(5, int(difficulty)))
        except (TypeError, ValueError):
            difficulty = 2
        for card in parse_cards(note.text):
            entity_id = card_entity_id(note.concept_id, card.number)
            known = existing.get(generate_srs_id(note.subject, ENTITY_TYPE, entity_id))
            items.append(known or srs.register_item(
                entity_id=entity_id, entity_type=ENTITY_TYPE, subject=note.subject,
                topic=note.concept_id, source_note=note.rel, difficulty=difficulty))
    return items


def load_card(vault_root: Path, item: dict) -> Card | None:
    """The current content of a card SRS item, read from its concept note."""
    _, number = split_entity_id(item.get("entity_id", ""))
    path = Path(vault_root) / str(item.get("source_note") or "")
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    return next((c for c in parse_cards(text) if c.number == number), None)
