"""
NoteVault Exercise Manager
Data layer for the Ejercicio module.
Exercise definitions: {vault}/ejercicio/exercises.json
Daily logs:          {vault}/ejercicio/YYYY/MM/YYYY-MM-DD.json
"""

import json
import calendar
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

from . import vault_format

# Default exercises loaded from exercise_data.py on first use
_DEFAULT_EXERCISES_LOADED = False
_DEFAULT_EXERCISES: list[dict] = []


def _get_defaults() -> list[dict]:
    global _DEFAULT_EXERCISES_LOADED, _DEFAULT_EXERCISES
    if not _DEFAULT_EXERCISES_LOADED:
        try:
            from notevault_app.ui.components.ejercicio.exercise_data import DAYS
            for day in DAYS:
                for ex in day.get("exercises", []):
                    _DEFAULT_EXERCISES.append({
                        "id": f"{day['key']}_{ex['id']}",
                        "day": day["key"],
                        "name": ex["name"],
                        "video": ex.get("video", ""),
                        "video_path": "",          # full path set by user
                        "series_reps": ex.get("series_reps", ""),
                        "rest": ex.get("rest", ""),
                        "how_to": ex.get("how_to", ""),
                    })
        except Exception:
            pass
        _DEFAULT_EXERCISES_LOADED = True
    return [e.copy() for e in _DEFAULT_EXERCISES]


class ExerciseLog:
    """Completion log for one calendar day."""

    def __init__(self, day: date, entries: dict):
        self.date = day
        # {exercise_id: {done: bool, weight: float, reps: int, notes: str}}
        self.entries: dict[str, dict] = entries

    def is_done(self, exercise_id: str) -> bool:
        return self.entries.get(exercise_id, {}).get("done", False)

    def all_done(self, exercise_ids: list[str]) -> bool:
        return bool(exercise_ids) and all(self.is_done(eid) for eid in exercise_ids)

    def completion_pct(self, exercise_ids: list[str]) -> float:
        if not exercise_ids:
            return 0.0
        return sum(1 for eid in exercise_ids if self.is_done(eid)) / len(exercise_ids)


class ExerciseManager:
    def __init__(self, vault_root: Path):
        self.vault_root = vault_root
        self.ejercicio_dir = vault_root / vault_format.LAYOUT["exercise_dir"]
        self._config_path = vault_root / vault_format.LAYOUT["exercises"]
        self._exercises: Optional[list] = None
        self._log_cache: dict[date, ExerciseLog] = {}

    # ── Exercise definitions ──────────────────────────────────────────────

    def exercises(self) -> list[dict]:
        if self._exercises is None:
            self._exercises = self._load_exercises()
        return self._exercises

    def exercises_for_day(self, day_key: str) -> list[dict]:
        return [e for e in self.exercises() if e.get("day") == day_key]

    def _load_exercises(self) -> list[dict]:
        if self._config_path.exists():
            try:
                data = json.loads(self._config_path.read_text(encoding="utf-8"))
                if data:
                    if self._ensure_stretching(data):
                        self._exercises = data
                        self.save_exercises()
                    return data
            except Exception:
                pass
        defaults = _get_defaults()
        # Persist defaults immediately so mark_done calls can reference stable IDs
        self._exercises = defaults
        self.save_exercises()
        return defaults

    @staticmethod
    def _ensure_stretching(exercises: list) -> bool:
        """Every routine ends with a stretching block. Returns True if added."""
        from notevault_app.ui.components.ejercicio.exercise_data import (
            DAYS, STRETCHING,
        )
        changed = False
        for day in DAYS:
            key = day["key"]
            has = any(
                e.get("day") == key
                and str(e.get("name", "")).lower().startswith("estiramiento")
                for e in exercises
            )
            if not has:
                exercises.append({
                    "id": f"{key}_estiramientos",
                    "day": key,
                    "name": STRETCHING["name"],
                    "video": STRETCHING["video"],
                    "video_path": "",
                    "series_reps": STRETCHING["series_reps"],
                    "rest": STRETCHING["rest"],
                    "how_to": STRETCHING["how_to"],
                })
                changed = True
        return changed

    def save_exercises(self):
        self.ejercicio_dir.mkdir(parents=True, exist_ok=True)
        self._config_path.write_text(
            json.dumps(self._exercises, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    def add_exercise(self, name: str, day_key: str, video_path: str,
                     series_reps: str, rest: str, how_to: str) -> dict:
        import re
        exercises = self.exercises()
        base_id = f"{day_key}_{re.sub(r'[^a-z0-9]', '', name.lower()) or 'ex'}"
        hid = base_id
        existing = {e["id"] for e in exercises}
        counter = 2
        while hid in existing:
            hid = f"{base_id}{counter}"
            counter += 1
        e = {
            "id": hid,
            "day": day_key,
            "name": name,
            "video": Path(video_path).name if video_path else "",
            "video_path": video_path,
            "series_reps": series_reps,
            "rest": rest,
            "how_to": how_to,
        }
        exercises.append(e)
        self._exercises = exercises
        self.save_exercises()
        return e

    def update_exercise(self, exercise_id: str, **fields):
        exercises = self.exercises()
        for e in exercises:
            if e["id"] == exercise_id:
                e.update(fields)
                break
        self._exercises = exercises
        self.save_exercises()

    def remove_exercise(self, exercise_id: str):
        self._exercises = [e for e in self.exercises() if e["id"] != exercise_id]
        self.save_exercises()

    # ── Day logs ──────────────────────────────────────────────────────────

    def _log_path(self, d: date) -> Path:
        return (
            self.ejercicio_dir
            / str(d.year)
            / f"{d.month:02d}"
            / f"{d.isoformat()}.json"
        )

    def get_log(self, d: date) -> ExerciseLog:
        cached = self._log_cache.get(d)
        if cached is not None:
            return cached
        path = self._log_path(d)
        if path.exists():
            try:
                entries = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                entries = {}
        else:
            entries = {}
        log = ExerciseLog(d, entries)
        self._log_cache[d] = log
        return log

    def save_log(self, log: ExerciseLog):
        self._log_cache[log.date] = log
        path = self._log_path(log.date)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(log.entries, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    def mark_done(self, d: date, exercise_id: str, done: bool,
                  weight: float = 0.0, reps: int = 0, notes: str = ""):
        log = self.get_log(d)
        log.entries[exercise_id] = {
            "done": done,
            "weight": weight,
            "reps": reps,
            "notes": notes,
        }
        self.save_log(log)

    # ── Stats ─────────────────────────────────────────────────────────────

    def day_pct(self, d: date) -> float:
        import calendar as _cal
        day_key = ["lunes", "martes", "miercoles", "jueves",
                   "viernes", "sabado", "domingo"][d.weekday()]
        ids = [e["id"] for e in self.exercises_for_day(day_key)]
        if not ids:
            return 0.0
        return self.get_log(d).completion_pct(ids)

    def range_pct_by_day(self, year: int) -> dict[date, float]:
        """Returns {date: pct} for every day of the year up to today."""
        today = date.today()
        start = date(year, 1, 1)
        result: dict[date, float] = {}
        current = start
        day_keys = ["lunes", "martes", "miercoles", "jueves",
                    "viernes", "sabado", "domingo"]
        while current <= min(today, date(year, 12, 31)):
            key = day_keys[current.weekday()]
            ids = [e["id"] for e in self.exercises_for_day(key)]
            pct = self.get_log(current).completion_pct(ids) if ids else 0.0
            result[current] = pct
            current += timedelta(days=1)
        return result

    def exercise_history(self, exercise_id: str, year: int) -> dict[date, bool]:
        """Returns {date: done} for every past occurrence of this exercise."""
        today = date.today()
        ex = next((e for e in self.exercises() if e["id"] == exercise_id), None)
        if not ex:
            return {}
        day_key = ex.get("day", "")
        day_keys = ["lunes", "martes", "miercoles", "jueves",
                    "viernes", "sabado", "domingo"]
        target_weekday = day_keys.index(day_key) if day_key in day_keys else -1
        result: dict[date, bool] = {}
        current = date(year, 1, 1)
        while current <= min(today, date(year, 12, 31)):
            if current.weekday() == target_weekday:
                result[current] = self.get_log(current).is_done(exercise_id)
            current += timedelta(days=1)
        return result
