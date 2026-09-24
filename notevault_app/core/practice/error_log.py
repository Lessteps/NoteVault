"""English error log fed by graded attempts, and the post-grading pipeline."""

from datetime import datetime
from pathlib import Path

from .. import store, vault_format
from ..study_error_manager import StudyErrorManager
from ..study_srs_manager import StudySRSManager
from .attempts import PracticeAttemptStore
from .exercise_note import ExerciseNote
from .grading import GradeResult, quality_from

SUBJECT_ORDER = ("mathematics", "programming", "english", "general")
_EVIDENCE_MAX = 500


def _rel_path(vault_root: Path, path: Path | None) -> str:
    if not path:
        return ""
    try:
        return Path(path).resolve().relative_to(Path(vault_root).resolve()).as_posix()
    except (OSError, ValueError):
        return str(path)


def _sentence(text: str) -> str:
    text = " ".join(str(text).split())
    return text if not text or text[-1] in ".!?" else text + "."


def record_grade_errors(vault_root: Path, ex: ExerciseNote, result: GradeResult,
                        answer: str) -> list[dict]:
    if not result.errors:
        return []
    manager = StudyErrorManager(vault_root)
    source = _rel_path(vault_root, ex.path)
    return [
        manager.record_error(
            category=err.category,
            subject=ex.subject,
            topic=ex.skill or ex.discipline,
            wrong_answer=err.evidence or answer[:_EVIDENCE_MAX],
            expected=err.fix,
            explanation=err.description,
            source_note=source,
            exercise_id=ex.note_id,
            discipline=ex.discipline,
            skill=ex.skill,
            mode=ex.mode,
            anchor=err.anchor,
            description_en=err.description,
            fix_en=err.fix,
            note_id=ex.note_id,
        )
        for err in result.errors
    ]


def _recency(err: dict) -> str:
    return err.get("last_seen") or err.get("occurred_at") or ""


def recent_errors(vault_root: Path, subject: str, limit: int = 15) -> list[dict]:
    errors = StudyErrorManager(vault_root).errors(subject=subject, unresolved_only=True)
    errors.sort(key=_recency, reverse=True)
    return errors[:max(0, limit)]


def _digest_line(err: dict) -> str:
    head = [f"[x{err['repeat_count']}] {err['category']}"]
    if err.get("discipline"):
        head.append(err["discipline"])
    if err.get("anchor"):
        head.append(f"anchor: \"{err['anchor']}\"")
    line = "- " + " · ".join(head)
    description = err.get("description_en") or err.get("explanation") or ""
    if description:
        line += " — " + _sentence(description)
    fix = err.get("fix_en") or err.get("expected") or ""
    if fix:
        line += " Fix: " + _sentence(fix)
    seen = _recency(err)[:10]
    where = err.get("note_id") or err.get("exercise_id") or err.get("topic") or ""
    if seen:
        line += f" Last seen {seen}" + (f" in {where}." if where else ".")
    return line


def write_error_digest(vault_root: Path) -> Path:
    errors = StudyErrorManager(vault_root).errors(unresolved_only=True)
    by_subject: dict[str, list[dict]] = {}
    for err in errors:
        by_subject.setdefault(err["subject"], []).append(err)
    subjects = [s for s in SUBJECT_ORDER if s in by_subject]
    subjects += sorted(s for s in by_subject if s not in SUBJECT_ORDER)

    lines = [
        "# NoteVault learner error log",
        f"Generated {datetime.now().strftime(vault_format.DATETIME_FMT)}. "
        "Unresolved errors, most repeated first.",
    ]
    if not subjects:
        lines += ["", "No unresolved errors."]
    for subject in subjects:
        items = sorted(by_subject[subject], key=_recency, reverse=True)
        items.sort(key=lambda e: e["repeat_count"], reverse=True)
        lines += ["", f"## {subject}"] + [_digest_line(e) for e in items]

    path = Path(vault_root) / vault_format.LAYOUT["study_error_digest"]
    store.write_text(path, "\n".join(lines) + "\n")
    return path


def apply_result(vault_root: Path, ex: ExerciseNote, note_path: str, *, answer: str,
                 hints_used: int, seconds: int, solution_seen: bool, transport: str,
                 result: GradeResult, entity_type: str = "exercise") -> dict:
    """Record the attempt, its errors, the digest and the SRS review; return the attempt."""
    quality = quality_from(result, hints_used, solution_seen)
    attempt = PracticeAttemptStore(vault_root).record(
        ex, note_path, answer=answer, hints_used=hints_used, seconds=seconds,
        solution_seen=solution_seen, transport=transport, result=result, quality=quality)
    record_grade_errors(vault_root, ex, result, answer)
    write_error_digest(vault_root)
    srs = StudySRSManager(vault_root)
    item = srs.register_item(entity_id=ex.note_id, entity_type=entity_type, subject=ex.subject,
                             topic=ex.skill or ex.discipline, source_note=note_path,
                             difficulty=ex.difficulty)
    srs.review(item["id"], quality)
    return attempt
