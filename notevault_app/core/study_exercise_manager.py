"""
NoteVault Study Exercise Manager
Manages academic and practical exercises for Mathematics, Programming, English, and General.
Stores individual exercises in .notevault/estudio/ejercicios/<exercise_id>.json.
"""

import hashlib
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from . import store, vault_format

EXERCISE_TYPES = (
    "recall", "short_answer", "multiple_choice", "problem_solving",
    "coding", "debugging", "translation", "listening",
    "reading", "writing", "project_task",
)

EXERCISE_STATUSES = ("pending", "in_progress", "completed", "failed")


def generate_exercise_id(subject: str, topic: str, prompt: str) -> str:
    """Generate a stable unique exercise ID."""
    raw = f"{subject}:{topic}:{prompt}:{time.time_ns()}"
    h = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
    return f"ex_{h}"


def sanitize_exercise(raw: dict[str, Any], fallback_id: str = "") -> dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    ex_id = str(raw.get("id") or fallback_id or "").strip()
    if not ex_id:
        ex_id = f"ex_{hashlib.sha256(str(time.time_ns()).encode()).hexdigest()[:12]}"

    ex_type = str(raw.get("type") or "recall").lower()
    if ex_type not in EXERCISE_TYPES:
        ex_type = "recall"

    status = str(raw.get("status") or "pending").lower()
    if status not in EXERCISE_STATUSES:
        status = "pending"

    difficulty = int(raw.get("difficulty") or 1)
    difficulty = max(1, min(5, difficulty))

    goal_level = int(raw.get("goal_level") or 1)
    goal_level = max(1, min(4, goal_level))

    options = raw.get("options", [])
    if not isinstance(options, list):
        options = []

    tests = raw.get("tests", [])
    if not isinstance(tests, list):
        tests = []

    history = raw.get("history", [])
    if not isinstance(history, list):
        history = []

    return {
        "id": ex_id,
        "type": ex_type,
        "subject": str(raw.get("subject") or "general").lower(),
        "topic": str(raw.get("topic") or "").strip(),
        "skill": str(raw.get("skill") or "").strip(),
        "difficulty": difficulty,
        "goal_level": goal_level,
        "source_note": str(raw.get("source_note") or ""),
        "prompt": str(raw.get("prompt") or "").strip(),
        "expected_solution": str(raw.get("expected_solution") or "").strip(),
        "options": [str(o) for o in options],
        "correct_option_index": raw.get("correct_option_index"),
        "code_starter": str(raw.get("code_starter") or ""),
        "tests": tests,
        "audio_script": str(raw.get("audio_script") or ""),
        "hints": [str(h) for h in raw.get("hints", []) if isinstance(h, str)],
        "status": status,
        "created_at": str(raw.get("created_at") or datetime.now().isoformat()),
        "last_attempt_at": raw.get("last_attempt_at"),
        "success_rate": float(raw.get("success_rate") or 0.0),
        "attempts_count": int(raw.get("attempts_count") or 0),
        "history": history,
    }


class StudyExerciseManager:
    def __init__(self, vault_root: Path):
        self.vault_root = Path(vault_root)
        self.dir = self.vault_root / vault_format.LAYOUT["study_exercises_dir"]
        self.dir.mkdir(parents=True, exist_ok=True)
        self._cache: Optional[dict[str, dict[str, Any]]] = None
        self._stamp = None

    def _path(self, ex_id: str) -> Path:
        return self.vault_root / vault_format.LAYOUT["study_exercise"].format(id=ex_id)

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
                    clean = sanitize_exercise(data, path.stem)
                    out[clean["id"]] = clean
            self._cache, self._stamp = out, stamp
        return self._cache

    def exercises(self, subject: Optional[str] = None, topic: Optional[str] = None,
                  status: Optional[str] = None) -> list[dict[str, Any]]:
        items = list(self._load_all().values())
        if subject:
            s_low = subject.lower()
            items = [e for e in items if e["subject"] == s_low]
        if topic:
            t_low = topic.lower()
            items = [e for e in items if t_low in e["topic"].lower()]
        if status:
            items = [e for e in items if e["status"] == status]
        items.sort(key=lambda e: e.get("created_at", ""), reverse=True)
        return [dict(e) for e in items]

    def get(self, exercise_id: str) -> Optional[dict[str, Any]]:
        return self._load_all().get(exercise_id)

    def create(self, exercise_type: str, subject: str, topic: str, prompt: str,
               expected_solution: str = "", difficulty: int = 1, goal_level: int = 1,
               skill: str = "", source_note: str = "", **extra) -> dict[str, Any]:
        ex_id = generate_exercise_id(subject, topic, prompt)
        data = {
            "id": ex_id,
            "type": exercise_type,
            "subject": subject,
            "topic": topic,
            "prompt": prompt,
            "expected_solution": expected_solution,
            "difficulty": difficulty,
            "goal_level": goal_level,
            "skill": skill,
            "source_note": source_note,
            **extra,
        }
        clean = sanitize_exercise(data, ex_id)
        store.write_json(self._path(clean["id"]), clean)
        self._cache = None
        return clean

    def save(self, exercise_data: dict[str, Any]) -> dict[str, Any]:
        clean = sanitize_exercise(exercise_data)
        store.write_json(self._path(clean["id"]), clean)
        self._cache = None
        return clean

    def delete(self, exercise_id: str) -> bool:
        p = self._path(exercise_id)
        if p.exists():
            p.unlink()
            self._cache = None
            return True
        return False

    def record_attempt(self, exercise_id: str, user_answer: str, is_correct: bool,
                       score: float = 1.0, error_category: Optional[str] = None,
                       feedback: str = "") -> Optional[dict[str, Any]]:
        """
        Record user execution attempt and update exercise lifecycle stats.
        """
        ex = self.get(exercise_id)
        if not ex:
            return None

        attempts = ex["attempts_count"] + 1
        prev_successes = round(ex["success_rate"] * ex["attempts_count"])
        new_successes = prev_successes + (1 if is_correct else 0)
        new_rate = round(new_successes / attempts, 2)

        attempt_record = {
            "timestamp": datetime.now().isoformat(),
            "user_answer": user_answer,
            "is_correct": is_correct,
            "score": round(max(0.0, min(1.0, score)), 2),
            "error_category": error_category or "",
            "feedback": feedback,
        }

        ex["attempts_count"] = attempts
        ex["success_rate"] = new_rate
        ex["status"] = "completed" if is_correct else "failed"
        ex["last_attempt_at"] = attempt_record["timestamp"]
        ex["history"].append(attempt_record)

        return self.save(ex)
