"""
NoteVault Study Daily Queue Manager
Orchestrates the daily execution queue across Mathematics, Programming, and English.
Applies active recall, interleaving, error remediation, and Spaced Repetition (SRS) prioritization.
"""

from datetime import date
from pathlib import Path
from typing import Any, Optional

from .study_exercise_manager import StudyExerciseManager
from .study_srs_manager import StudySRSManager
from .study_error_manager import StudyErrorManager


class StudyDailyQueueManager:
    def __init__(self, vault_root: Path):
        self.vault_root = Path(vault_root)
        self.ex_mgr = StudyExerciseManager(self.vault_root)
        self.srs_mgr = StudySRSManager(self.vault_root)
        self.err_mgr = StudyErrorManager(self.vault_root)

    def get_queue(self, target_date: Optional[date] = None, limit_per_subject: int = 5) -> dict[str, Any]:
        """
        Build the unified daily practice queue.
        Returns a dictionary with:
          - by_subject: items grouped by subject (mathematics, programming, english, general)
          - interleaved: sequentially ordered practice tasks alternating disciplines
          - stats: total due, error count, completion rate
        """
        today = target_date or date.today()

        # 1. Gather due SRS items
        due_srs = self.srs_mgr.due_items(today)

        # 2. Gather active exercises
        pending_exercises = self.ex_mgr.exercises(status="pending")

        # 3. Gather unresolved errors
        unresolved_errors = self.err_mgr.errors(unresolved_only=True)

        # Group items by subject
        subjects = ("mathematics", "programming", "english", "general")
        grouped: dict[str, list[dict[str, Any]]] = {s: [] for s in subjects}

        # Add SRS reviews to queue
        for srs in due_srs:
            s = srs.get("subject", "general")
            if s in grouped:
                grouped[s].append({
                    "task_type": "srs_review",
                    "id": srs["id"],
                    "subject": s,
                    "title": f"Repaso: {srs.get('entity_id') or srs.get('topic')}",
                    "topic": srs.get("topic", ""),
                    "difficulty": srs.get("difficulty", 1),
                    "mastery": srs.get("mastery", 0.0),
                    "data": srs,
                })

        # Add unresolved errors for remediation
        for err in unresolved_errors:
            s = err.get("subject", "general")
            if s in grouped:
                grouped[s].append({
                    "task_type": "error_remediation",
                    "id": err["id"],
                    "subject": s,
                    "title": f"Corregir error [{err.get('category')}]: {err.get('topic')}",
                    "topic": err.get("topic", ""),
                    "difficulty": 3,
                    "data": err,
                })

        # Add pending exercises
        for ex in pending_exercises:
            s = ex.get("subject", "general")
            if s in grouped:
                grouped[s].append({
                    "task_type": "exercise",
                    "id": ex["id"],
                    "subject": s,
                    "title": f"Ejercicio [{ex.get('type')}]: {ex.get('topic') or ex.get('prompt')[:30]}",
                    "topic": ex.get("topic", ""),
                    "difficulty": ex.get("difficulty", 1),
                    "data": ex,
                })

        # Limit per subject
        for s in subjects:
            grouped[s] = grouped[s][:limit_per_subject]

        # 4. Interleaving algorithm: alternate tasks across subjects
        interleaved: list[dict[str, Any]] = []
        max_len = max([len(items) for items in grouped.values()] or [0])

        for step in range(max_len):
            for s in ("mathematics", "programming", "english", "general"):
                if step < len(grouped[s]):
                    interleaved.append(grouped[s][step])

        return {
            "date": today.isoformat(),
            "by_subject": grouped,
            "interleaved": interleaved,
            "total_tasks": len(interleaved),
            "srs_due_count": len(due_srs),
            "unresolved_errors_count": len(unresolved_errors),
        }
