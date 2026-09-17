"""
NoteVault Study Error Manager
Manages learning errors across Mathematics, Programming, English, and General subjects.
Classifies errors under 11 strict categories and links them to the SRS engine for remediation.
Stores individual errors in .notevault/estudio/errores/<error_id>.json.
"""

import hashlib
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from . import store, vault_format

ERROR_CATEGORIES = (
    "conceptual", "logical", "procedural", "calculation", "syntax",
    "implementation", "grammar", "vocabulary", "listening",
    "reading", "pronunciation",
)


def generate_error_id(subject: str, topic: str, category: str) -> str:
    raw = f"{subject}:{topic}:{category}:{time.time_ns()}"
    h = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
    return f"err_{h}"


def sanitize_error(raw: dict[str, Any], fallback_id: str = "") -> dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    err_id = str(raw.get("id") or fallback_id or "").strip()
    if not err_id:
        err_id = f"err_{hashlib.sha256(str(time.time_ns()).encode()).hexdigest()[:12]}"

    category = str(raw.get("category") or "conceptual").lower()
    if category not in ERROR_CATEGORIES:
        category = "conceptual"

    return {
        "id": err_id,
        "category": category,
        "subject": str(raw.get("subject") or "general").lower(),
        "topic": str(raw.get("topic") or "").strip(),
        "source_note": str(raw.get("source_note") or ""),
        "exercise_id": str(raw.get("exercise_id") or ""),
        "wrong_answer": str(raw.get("wrong_answer") or "").strip(),
        "expected": str(raw.get("expected") or "").strip(),
        "explanation": str(raw.get("explanation") or "").strip(),
        "occurred_at": str(raw.get("occurred_at") or datetime.now().isoformat()),
        "resolved": bool(raw.get("resolved", False)),
        "repeat_count": max(1, int(raw.get("repeat_count") or 1)),
    }


class StudyErrorManager:
    def __init__(self, vault_root: Path):
        self.vault_root = Path(vault_root)
        self.dir = self.vault_root / vault_format.LAYOUT["study_errors_dir"]
        self.dir.mkdir(parents=True, exist_ok=True)
        self._cache: Optional[dict[str, dict[str, Any]]] = None
        self._stamp = None

    def _path(self, err_id: str) -> Path:
        return self.vault_root / vault_format.LAYOUT["study_error"].format(id=err_id)

    def _dir_stamp(self):
        try:
            files = sorted(self.dir.glob("*.json"))
            return tuple((f.name, f.stat().st_mtime_ns) for f in files)
        except OSError:
            return ()

    def _load_all(self) -> dict[str, dict[str, Any]]:
        stamp = self._dir_stamp()
        if self._cache is None or stamp != self._stamp:
            out = {}
            for name, _ in stamp:
                path = self.dir / name
                if vault_format.is_sync_conflict(name):
                    continue
                data = store.load_json(path)
                if isinstance(data, dict):
                    clean = sanitize_error(data, path.stem)
                    out[clean["id"]] = clean
            self._cache, self._stamp = out, stamp
        return self._cache

    def errors(self, subject: Optional[str] = None, category: Optional[str] = None,
               unresolved_only: bool = False) -> list[dict[str, Any]]:
        items = list(self._load_all().values())
        if subject:
            s_low = subject.lower()
            items = [e for e in items if e["subject"] == s_low]
        if category:
            c_low = category.lower()
            items = [e for e in items if e["category"] == c_low]
        if unresolved_only:
            items = [e for e in items if not e["resolved"]]
        items.sort(key=lambda e: e.get("occurred_at", ""), reverse=True)
        return [dict(e) for e in items]

    def get(self, error_id: str) -> Optional[dict[str, Any]]:
        return self._load_all().get(error_id)

    def record_error(self, category: str, subject: str, topic: str,
                     wrong_answer: str, expected: str = "", explanation: str = "",
                     source_note: str = "", exercise_id: str = "") -> dict[str, Any]:
        """Record an error and link to SRS if appropriate."""
        err_id = generate_error_id(subject, topic, category)
        data = {
            "id": err_id,
            "category": category,
            "subject": subject,
            "topic": topic,
            "wrong_answer": wrong_answer,
            "expected": expected,
            "explanation": explanation,
            "source_note": source_note,
            "exercise_id": exercise_id,
            "occurred_at": datetime.now().isoformat(),
            "resolved": False,
            "repeat_count": 1,
        }
        clean = sanitize_error(data, err_id)
        store.write_json(self._path(clean["id"]), clean)
        self._cache = None
        return clean

    def mark_resolved(self, error_id: str, resolved: bool = True) -> Optional[dict[str, Any]]:
        err = self.get(error_id)
        if not err:
            return None
        err["resolved"] = resolved
        store.write_json(self._path(error_id), sanitize_error(err))
        self._cache = None
        return err

    def category_breakdown(self, subject: Optional[str] = None) -> dict[str, int]:
        """Return counts of errors grouped by category."""
        all_errs = self.errors(subject=subject)
        breakdown = {cat: 0 for cat in ERROR_CATEGORIES}
        for e in all_errs:
            cat = e.get("category", "conceptual")
            if cat in breakdown:
                breakdown[cat] += 1
        return breakdown
