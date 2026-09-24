"""Per-exercise attempt history and answer draft, in .notevault/estudio/intentos/."""

import hashlib
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from .. import store, vault_format
from .exercise_note import ExerciseNote
from .grading import GradeResult


def attempt_key(note_id: str) -> str:
    return "att_" + hashlib.sha256(str(note_id).encode("utf-8")).hexdigest()[:12]


class PracticeAttemptStore:
    def __init__(self, vault_root: Path):
        self.vault_root = Path(vault_root)

    def _path(self, note_id: str) -> Path:
        return self.vault_root / vault_format.LAYOUT["study_attempt"].format(
            id=attempt_key(note_id))

    def load(self, note_id: str) -> dict:
        data = store.load_json(self._path(note_id), {})
        data = data if isinstance(data, dict) else {}
        attempts = data.get("attempts")
        return {
            "note_id": str(data.get("note_id") or note_id),
            "note_path": str(data.get("note_path") or ""),
            "draft": str(data.get("draft") or ""),
            "attempts": [a for a in attempts if isinstance(a, dict)]
            if isinstance(attempts, list) else [],
        }

    def attempts(self, note_id: str) -> list[dict]:
        return self.load(note_id)["attempts"]

    def draft(self, note_id: str) -> str:
        return self.load(note_id)["draft"]

    def save_draft(self, note_id: str, note_path: str, text: str) -> None:
        data = self.load(note_id)
        if data["draft"] == text and data["note_path"] == note_path:
            return
        data["draft"], data["note_path"] = text, note_path
        store.write_json(self._path(note_id), data)

    def record(self, ex: ExerciseNote, note_path: str, *, answer: str, hints_used: int,
               seconds: int, solution_seen: bool, transport: str,
               result: GradeResult | None, quality: int) -> dict:
        attempt = {
            "at": datetime.now().isoformat(timespec="seconds"),
            "mode": ex.mode,
            "discipline": ex.discipline,
            "skill": ex.skill,
            "subject": ex.subject,
            "answer": answer,
            "hints_used": int(hints_used),
            "seconds": int(seconds),
            "solution_seen": bool(solution_seen),
            "transport": transport,
            "score": result.score if result else 0,
            "quality": int(quality),
            "verdict": result.verdict if result else "ungraded",
            "rubric": list(result.rubric) if result else [],
            "errors": [asdict(e) for e in result.errors] if result else [],
            "feedback": result.feedback if result else "",
            "next_step": result.next_step if result else "",
            "example": result.example if result else "",
        }
        data = self.load(ex.note_id)
        data["note_path"] = note_path
        data["draft"] = ""
        data["attempts"].append(attempt)
        store.write_json(self._path(ex.note_id), data)
        return attempt
