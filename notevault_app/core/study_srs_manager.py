"""
NoteVault Study Spaced Repetition (SRS) Manager
Shared Spaced Repetition Engine for Mathematics, Programming, English, and General concepts.
Stores individual SRS records in .notevault/estudio/srs/<srs_id>.json.
"""

import hashlib
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Optional

from . import store, vault_format

DEFAULT_EASE_FACTOR = 2.5
MIN_EASE_FACTOR = 1.3


def generate_srs_id(subject: str, entity_type: str, entity_id: str) -> str:
    raw = f"{subject.lower()}:{entity_type.lower()}:{entity_id.strip()}"
    h = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
    return f"srs_{h}"


def sanitize_srs_item(raw: dict[str, Any], fallback_id: str = "") -> dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    srs_id = str(raw.get("id") or fallback_id or "").strip()
    if not srs_id:
        srs_id = f"srs_{hashlib.sha256(str(time.time_ns()).encode()).hexdigest()[:12]}"

    today_str = date.today().strftime(vault_format.DATE_FMT)
    ease = float(raw.get("ease_factor") or DEFAULT_EASE_FACTOR)
    ease = max(MIN_EASE_FACTOR, ease)

    mastery = float(raw.get("mastery") or 0.0)
    mastery = round(max(0.0, min(1.0, mastery)), 2)

    return {
        "id": srs_id,
        "entity_id": str(raw.get("entity_id") or "").strip(),
        "entity_type": str(raw.get("entity_type") or "concept").lower(),
        "subject": str(raw.get("subject") or "general").lower(),
        "topic": str(raw.get("topic") or "").strip(),
        "source_note": str(raw.get("source_note") or ""),
        "difficulty": max(1, min(5, int(raw.get("difficulty") or 1))),
        "interval_days": max(1, int(raw.get("interval_days") or 1)),
        "ease_factor": round(ease, 2),
        "repetitions": max(0, int(raw.get("repetitions") or 0)),
        "lapses": max(0, int(raw.get("lapses") or 0)),
        "last_reviewed": str(raw.get("last_reviewed") or today_str),
        "next_review": str(raw.get("next_review") or today_str),
        "mastery": mastery,
        "history": list(raw.get("history") or []),
    }


class StudySRSManager:
    def __init__(self, vault_root: Path):
        self.vault_root = Path(vault_root)
        self.dir = self.vault_root / vault_format.LAYOUT["study_srs_dir"]
        self.dir.mkdir(parents=True, exist_ok=True)
        self._cache: Optional[dict[str, dict[str, Any]]] = None
        self._stamp = None

    def _path(self, srs_id: str) -> Path:
        return self.vault_root / vault_format.LAYOUT["study_srs_item"].format(id=srs_id)

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
                    clean = sanitize_srs_item(data, path.stem)
                    out[clean["id"]] = clean
            self._cache, self._stamp = out, stamp
        return self._cache

    def all_items(self) -> list[dict[str, Any]]:
        return [dict(i) for i in self._load_all().values()]

    def get(self, srs_id: str) -> Optional[dict[str, Any]]:
        return self._load_all().get(srs_id)

    def register_item(self, entity_id: str, entity_type: str, subject: str,
                      topic: str = "", source_note: str = "", difficulty: int = 1) -> dict[str, Any]:
        srs_id = generate_srs_id(subject, entity_type, entity_id)
        existing = self.get(srs_id)
        if existing:
            return existing

        today_str = date.today().strftime(vault_format.DATE_FMT)
        data = {
            "id": srs_id,
            "entity_id": entity_id,
            "entity_type": entity_type,
            "subject": subject,
            "topic": topic,
            "source_note": source_note,
            "difficulty": difficulty,
            "interval_days": 1,
            "ease_factor": DEFAULT_EASE_FACTOR,
            "repetitions": 0,
            "lapses": 0,
            "last_reviewed": today_str,
            "next_review": today_str,
            "mastery": 0.0,
            "history": [],
        }
        clean = sanitize_srs_item(data, srs_id)
        store.write_json(self._path(clean["id"]), clean)
        self._cache = None
        return clean

    def review(self, srs_id: str, quality_grade: int,
               review_date: Optional[date] = None) -> Optional[dict[str, Any]]:
        """
        Update SRS item based on response grade (0 to 5):
          5 - Perfect response
          4 - Correct response after hesitation
          3 - Correct response with serious difficulty
          2 - Incorrect response, correct answer seemed easy to recall
          1 - Incorrect response, correct answer remembered
          0 - Complete blackout
        """
        item = self.get(srs_id)
        if not item:
            return None

        today = review_date or date.today()
        grade = max(0, min(5, int(quality_grade)))

        repetitions = item["repetitions"]
        ease = item["ease_factor"]
        interval = item["interval_days"]
        lapses = item["lapses"]

        if grade >= 3:
            if repetitions == 0:
                interval = 1
            elif repetitions == 1:
                interval = 6
            else:
                interval = max(1, round(interval * ease))
            repetitions += 1
            ease = ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
            ease = max(MIN_EASE_FACTOR, ease)
        else:
            repetitions = 0
            interval = 1
            lapses += 1
            ease = max(MIN_EASE_FACTOR, ease - 0.2)

        next_due = today + timedelta(days=interval)

        # Compute mastery: smooth progression towards 1.0 with penalties for lapses
        mastery = min(1.0, max(0.0, (repetitions * 0.18) - (lapses * 0.08)))

        item["repetitions"] = repetitions
        item["ease_factor"] = round(ease, 2)
        item["interval_days"] = interval
        item["lapses"] = lapses
        item["last_reviewed"] = today.strftime(vault_format.DATE_FMT)
        item["next_review"] = next_due.strftime(vault_format.DATE_FMT)
        item["mastery"] = round(mastery, 2)
        item["history"].append({
            "date": today.strftime(vault_format.DATE_FMT),
            "grade": grade,
            "interval_days": interval,
            "ease_factor": round(ease, 2),
        })

        store.write_json(self._path(item["id"]), sanitize_srs_item(item))
        self._cache = None
        return item

    def due_items(self, target_date: Optional[date] = None,
                  subject: Optional[str] = None) -> list[dict[str, Any]]:
        """Return all items due for review on or before target_date."""
        target = (target_date or date.today()).strftime(vault_format.DATE_FMT)
        all_items = self.all_items()
        due = [i for i in all_items if i["next_review"] <= target]
        if subject:
            s_low = subject.lower()
            due = [i for i in due if i["subject"] == s_low]
        # Prioritize by urgency: higher lapses and overdue days first
        due.sort(key=lambda i: (i["next_review"], -i["lapses"], i["mastery"]))
        return due
