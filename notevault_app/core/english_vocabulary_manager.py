"""
NoteVault English Vocabulary Manager
Manages structured vocabulary entities, CEFR levels, collocations, and 6 practice modes.
Stores individual words in .notevault/estudio/vocabulario/<word_id>.json.
"""

from pathlib import Path
from typing import Any, Optional

from . import store, vault_format

PRACTICE_MODES = (
    "en_to_meaning",
    "meaning_to_en",
    "sentence_to_word",
    "ipa_to_word",
    "word_to_sentence",
    "cloze",
)

CEFR_LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2")


def sanitize_vocab_item(raw: dict[str, Any], fallback_word: str = "") -> dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    word = str(raw.get("word") or fallback_word or "").strip()
    clean_id = store.slug(word) or "vocab_item"

    examples = raw.get("examples", [])
    if isinstance(examples, str):
        examples = [examples]
    elif not isinstance(examples, list):
        examples = []

    collocations = raw.get("collocations", [])
    if isinstance(collocations, str):
        collocations = [collocations]
    elif not isinstance(collocations, list):
        collocations = []

    synonyms = raw.get("synonyms", [])
    if isinstance(synonyms, str):
        synonyms = [synonyms]
    elif not isinstance(synonyms, list):
        synonyms = []

    level = str(raw.get("level") or "B1").upper().strip()
    if level not in CEFR_LEVELS:
        level = "B1"

    mastery = float(raw.get("mastery") or 0.0)
    mastery = round(max(0.0, min(1.0, mastery)), 2)

    return {
        "id": clean_id,
        "word": word,
        "meaning": str(raw.get("meaning") or "").strip(),
        "part_of_speech": str(raw.get("part_of_speech") or "noun").strip().lower(),
        "pronunciation": str(raw.get("pronunciation") or "").strip(),
        "examples": [str(e) for e in examples],
        "collocations": [str(c) for c in collocations],
        "synonyms": [str(s) for s in synonyms],
        "topic": str(raw.get("topic") or "general").strip().lower(),
        "level": level,
        "mastery": mastery,
        "source_note": str(raw.get("source_note") or ""),
    }


class EnglishVocabularyManager:
    def __init__(self, vault_root: Path):
        self.vault_root = Path(vault_root)
        self.dir = self.vault_root / ".notevault" / "estudio" / "vocabulario"
        self.dir.mkdir(parents=True, exist_ok=True)
        self._cache: Optional[dict[str, dict[str, Any]]] = None
        self._stamp = None

    def _path(self, vocab_id: str) -> Path:
        return self.dir / f"{vocab_id}.json"

    def _dir_stamp(self):
        try:
            files = sorted(self.dir.glob("*.json"))
            return tuple((f.name, f.stat().st_mtime_ns) for f in files)
        except OSError:
            return ()

    def all_words(self, level: Optional[str] = None, topic: Optional[str] = None) -> list[dict[str, Any]]:
        stamp = self._dir_stamp()
        if self._cache is None or stamp != self._stamp:
            out = {}
            for name, _ in stamp:
                p = self.dir / name
                if vault_format.is_sync_conflict(name):
                    continue
                data = store.load_json(p)
                if isinstance(data, dict):
                    clean = sanitize_vocab_item(data, p.stem)
                    out[clean["id"]] = clean
            self._cache, self._stamp = out, stamp

        items = list(self._cache.values())
        if level:
            l_up = level.upper()
            items = [w for w in items if w["level"] == l_up]
        if topic:
            t_low = topic.lower()
            items = [w for w in items if w["topic"] == t_low]
        items.sort(key=lambda w: w["word"].lower())
        return [dict(w) for w in items]

    def get(self, word_id: str) -> Optional[dict[str, Any]]:
        self.all_words()
        clean_id = store.slug(word_id)
        return self._cache.get(clean_id) if self._cache else None

    def add_word(self, word: str, meaning: str, part_of_speech: str = "noun",
                 level: str = "B1", topic: str = "general", pronunciation: str = "",
                 examples: Optional[list[str]] = None, collocations: Optional[list[str]] = None,
                 synonyms: Optional[list[str]] = None, source_note: str = "") -> dict[str, Any]:
        data = {
            "word": word,
            "meaning": meaning,
            "part_of_speech": part_of_speech,
            "level": level,
            "topic": topic,
            "pronunciation": pronunciation,
            "examples": examples or [],
            "collocations": collocations or [],
            "synonyms": synonyms or [],
            "source_note": source_note,
            "mastery": 0.0,
        }
        clean = sanitize_vocab_item(data, word)
        store.write_json(self._path(clean["id"]), clean)
        self._cache = None
        return clean

    def generate_practice_exercise(self, word_id: str, mode: str = "en_to_meaning") -> Optional[dict[str, Any]]:
        """Generate structured exercise specification for given vocabulary mode."""
        item = self.get(word_id)
        if not item:
            return None

        if mode == "en_to_meaning":
            return {
                "type": "short_answer",
                "subject": "english",
                "topic": "vocabulary",
                "prompt": f"¿Cuál es el significado o traducción de la palabra '{item['word']}' ({item['part_of_speech']})?",
                "expected_solution": item["meaning"],
            }
        elif mode == "meaning_to_en":
            return {
                "type": "short_answer",
                "subject": "english",
                "topic": "vocabulary",
                "prompt": f"¿Qué palabra en inglés corresponde a: '{item['meaning']}'?",
                "expected_solution": item["word"],
            }
        elif mode == "cloze" and item["examples"]:
            ex_sentence = item["examples"][0]
            # Replace target word in sentence with blank
            blanked = ex_sentence.replace(item["word"], "_______").replace(item["word"].capitalize(), "_______")
            return {
                "type": "short_answer",
                "subject": "english",
                "topic": "cloze",
                "prompt": f"Completa la oración con la palabra adecuada:\n\n\"{blanked}\"",
                "expected_solution": item["word"],
            }
        else: # default recall
            return {
                "type": "recall",
                "subject": "english",
                "topic": "vocabulary",
                "prompt": f"Define y utiliza la palabra '{item['word']}' en una oración en inglés.",
                "expected_solution": item["meaning"],
            }
