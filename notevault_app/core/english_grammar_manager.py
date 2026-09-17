"""
NoteVault English Grammar Manager
Manages English grammatical structures, rules, exceptions, and targeted exercises.
Stores individual grammar rules in .notevault/estudio/gramatica/<rule_id>.json.
"""

from pathlib import Path
from typing import Any, Optional

from . import store, vault_format

GRAMMAR_EXERCISE_TYPES = (
    "fill_blank", "correction", "transformation", "error_detection",
    "sentence_ordering", "translation", "open_response", "context_selection",
)


def sanitize_grammar_rule(raw: dict[str, Any], fallback_id: str = "") -> dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    rule_name = str(raw.get("rule_name") or fallback_id or "").strip()
    clean_id = store.slug(rule_name) or "grammar_rule"

    examples = raw.get("examples", [])
    if isinstance(examples, str):
        examples = [examples]
    elif not isinstance(examples, list):
        examples = []

    exceptions = raw.get("exceptions", [])
    if isinstance(exceptions, str):
        exceptions = [exceptions]
    elif not isinstance(exceptions, list):
        exceptions = []

    common_errors = raw.get("common_errors", [])
    if isinstance(common_errors, str):
        common_errors = [common_errors]
    elif not isinstance(common_errors, list):
        common_errors = []

    return {
        "id": clean_id,
        "rule_name": rule_name,
        "structure": str(raw.get("structure") or "").strip(),
        "explanation": str(raw.get("explanation") or "").strip(),
        "examples": [str(e) for e in examples],
        "exceptions": [str(x) for x in exceptions],
        "common_errors": [str(err) for err in common_errors],
        "level": str(raw.get("level") or "B1").upper().strip(),
        "mastery": round(max(0.0, min(1.0, float(raw.get("mastery") or 0.0))), 2),
        "source_note": str(raw.get("source_note") or ""),
    }


class EnglishGrammarManager:
    def __init__(self, vault_root: Path):
        self.vault_root = Path(vault_root)
        self.dir = self.vault_root / ".notevault" / "estudio" / "gramatica"
        self.dir.mkdir(parents=True, exist_ok=True)
        self._cache: Optional[dict[str, dict[str, Any]]] = None
        self._stamp = None

    def _path(self, rule_id: str) -> Path:
        return self.dir / f"{rule_id}.json"

    def _dir_stamp(self):
        try:
            files = sorted(self.dir.glob("*.json"))
            return tuple((f.name, f.stat().st_mtime_ns) for f in files)
        except OSError:
            return ()

    def all_rules(self, level: Optional[str] = None) -> list[dict[str, Any]]:
        stamp = self._dir_stamp()
        if self._cache is None or stamp != self._stamp:
            out = {}
            for name, _ in stamp:
                p = self.dir / name
                if vault_format.is_sync_conflict(name):
                    continue
                data = store.load_json(p)
                if isinstance(data, dict):
                    clean = sanitize_grammar_rule(data, p.stem)
                    out[clean["id"]] = clean
            self._cache, self._stamp = out, stamp

        items = list(self._cache.values())
        if level:
            l_up = level.upper()
            items = [r for r in items if r["level"] == l_up]
        items.sort(key=lambda r: (r["level"], r["rule_name"]))
        return [dict(r) for r in items]

    def get(self, rule_id: str) -> Optional[dict[str, Any]]:
        self.all_rules()
        clean_id = store.slug(rule_id)
        return self._cache.get(clean_id) if self._cache else None

    def add_rule(self, rule_name: str, structure: str, explanation: str,
                 level: str = "B1", examples: Optional[list[str]] = None,
                 exceptions: Optional[list[str]] = None, common_errors: Optional[list[str]] = None,
                 source_note: str = "") -> dict[str, Any]:
        data = {
            "rule_name": rule_name,
            "structure": structure,
            "explanation": explanation,
            "level": level,
            "examples": examples or [],
            "exceptions": exceptions or [],
            "common_errors": common_errors or [],
            "source_note": source_note,
            "mastery": 0.0,
        }
        clean = sanitize_grammar_rule(data, rule_name)
        store.write_json(self._path(clean["id"]), clean)
        self._cache = None
        return clean
