"""What to practise next, and the interleaved daily queue of the Estudio hub.

Adapted from the coach recommender of the user's training systems:
1. a weakness repeated >= 2 times -> a debug / find_error exercise of that skill;
2. every skill of a chapter at least Practicing -> an integration exercise;
3. a consolidated skill whose interval has elapsed -> spaced review with a fresh exercise;
4. otherwise the next skill of the ledger.

Exercise generation is on hold, so every recommendation points to an existing exercise
note (never attempted first, then due in SRS). When there is none, the recommendation
carries a message saying so instead of an exercise.
"""

from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from ..study_error_manager import StudyErrorManager
from ..study_srs_manager import StudySRSManager
from .cards import ENTITY_TYPE as CARD_TYPE, NEW_CARDS_PER_DAY, index_cards
from .discipline_catalog import DISCIPLINES, skill_of
from .exercise_index import ExerciseRef, scan_vault, skill_key
from .ledger import (
    CONSOLIDATED, NOT_STARTED, PRACTICING, attempt_passed, load_all_attempts, refresh_ledgers,
    skill_status,
)
from .modes import MODES
from .study_area import StudyArea

REMEDIATION_MODES = ("debug", "find_error")
REPEAT_THRESHOLD = 2

REMEDIATION, INTEGRATION, REVIEW, NEXT_SKILL, CONTINUE = (
    "remediation", "integration", "review", "next_skill", "continue")
SRS_EXERCISE, SRS_PROOF, SRS_CARD = "srs_exercise", "srs_proof", "srs_card"
PRIORITY = {REMEDIATION: 0, INTEGRATION: 1, REVIEW: 2, SRS_EXERCISE: 3, SRS_PROOF: 3,
            SRS_CARD: 4, NEXT_SKILL: 5, CONTINUE: 6}


def _is_proof(item: dict) -> bool:
    return str(item.get("entity_type", "")).lower().startswith("proof_l")


def _vault_rel(vault_root: Path, source: str) -> str:
    p = Path(source)
    if p.is_absolute():
        try:
            return p.resolve().relative_to(Path(vault_root).resolve()).as_posix()
        except (OSError, ValueError):
            return p.as_posix()
    return p.as_posix()


def _proof_ref(vault_root: Path, item: dict) -> ExerciseRef:
    rel = _vault_rel(vault_root, item.get("source_note", ""))
    return ExerciseRef(Path(vault_root) / rel, rel, item["entity_id"], Path(rel).stem,
                       item.get("subject", ""), "math_general", "", "prove",
                       int(item.get("difficulty") or 3), "", "", "")


@dataclass
class Recommendation:
    kind: str
    discipline: str
    skill: str
    subject: str
    title: str
    reason: str
    exercise: ExerciseRef | None = None
    message: str = ""

    @property
    def priority(self) -> int:
        return PRIORITY.get(self.kind, 9)


@dataclass
class QueueItem:
    kind: str
    group: tuple
    subject: str
    title: str
    reason: str
    exercise: ExerciseRef | None = None
    srs_item: dict | None = None
    message: str = ""
    extra: dict = field(default_factory=dict)

    @property
    def priority(self) -> int:
        return PRIORITY.get(self.kind, 9)


def skill_label(discipline: str, code: str) -> str:
    disc = DISCIPLINES.get(discipline)
    if not disc:
        return f"{discipline} · {code}" if code else discipline
    skill = skill_of(disc, code)
    if not skill:
        return f"{disc.title} · {code}" if code else disc.title
    return f"{disc.title} · {skill.code} {skill.title}"


def _natural(ref: ExerciseRef):
    return (ref.difficulty, ref.rel.lower())


def pick_exercise(candidates, attempted: set, due: dict) -> ExerciseRef | None:
    """Never attempted first (easiest first), then the most overdue in SRS."""
    candidates = list(candidates)
    fresh = sorted((e for e in candidates if e.note_id not in attempted), key=_natural)
    if fresh:
        return fresh[0]
    overdue = sorted((e for e in candidates if e.note_id in due),
                     key=lambda e: (due[e.note_id], _natural(e)))
    return overdue[0] if overdue else None


def _due_exercises(srs_items: list[dict], today: date) -> dict[str, str]:
    day = today.isoformat()
    return {i["entity_id"]: i["next_review"] for i in srs_items
            if i.get("entity_type") == "exercise" and i["next_review"] <= day}


def _error_skill(err: dict, by_id: dict) -> tuple[str, str, str]:
    ref = by_id.get(err.get("note_id") or err.get("exercise_id") or "")
    if ref:
        return ref.discipline, ref.skill, ref.concept
    disc = err.get("discipline") or ""
    return disc, skill_key(disc, err.get("mode") or "", err.get("skill")), ""


def _remediations(errors, exercises, by_id, attempted, due) -> list[Recommendation]:
    groups: dict[tuple, dict] = {}
    for err in errors:
        disc, skill, concept = _error_skill(err, by_id)
        if not disc:
            continue
        weakness = err.get("anchor") or err.get("category") or ""
        g = groups.setdefault((disc, skill, weakness.lower()), {
            "count": 0, "subject": err.get("subject") or "", "weakness": weakness,
            "concepts": set()})
        g["count"] += int(err.get("repeat_count") or 1)
        if concept:
            g["concepts"].add(concept)
    recs = []
    for (disc, skill, _), g in sorted(groups.items(), key=lambda kv: -kv[1]["count"]):
        if g["count"] < REPEAT_THRESHOLD:
            continue
        pool = [e for e in exercises if e.mode in REMEDIATION_MODES and e.discipline == disc
                and (e.skill == skill or (e.concept and e.concept in g["concepts"]))]
        label = skill_label(disc, skill)
        ex = pick_exercise(pool, attempted, due)
        subject = g["subject"] or (DISCIPLINES[disc].subject if disc in DISCIPLINES else "")
        recs.append(Recommendation(
            REMEDIATION, disc, skill, subject, "Corregir un error repetido",
            f"«{g['weakness']}» se ha repetido {g['count']} veces en {label}.",
            ex, "" if ex else f"No hay ejercicios de depuración o de encontrar el error de "
                              f"{label} todavía."))
    return recs


def _integrations(exercises, ledgers, attempts, attempted, due) -> list[Recommendation]:
    chapters: dict[tuple, list[ExerciseRef]] = {}
    for e in exercises:
        chapters.setdefault((e.chapter, e.discipline), []).append(e)
    recs = []
    for _, refs in sorted(chapters.items()):
        skills = {(e.discipline, e.skill) for e in refs if not e.integration}
        if len(skills) < 2:
            continue
        rows = [skill_status(ledgers, d, s) for d, s in skills]
        if any(r is None or r["status"] == NOT_STARTED for r in rows):
            continue
        pool = [e for e in refs if e.integration]
        if any(attempt_passed(a) for e in pool
               for a in attempts.get(e.note_id, {}).get("attempts", [])):
            continue
        title = refs[0].chapter_title
        ex = pick_exercise(pool, attempted, due)
        first = refs[0]
        recs.append(Recommendation(
            INTEGRATION, first.discipline, "", first.subject, "Ejercicio de integración",
            f"Todas las skills de «{title}» ya están en práctica: toca integrarlas.",
            ex, "" if ex else f"No hay ejercicios de integración de «{title}» todavía."))
    return recs


def _skill_recs(exercises, ledgers, attempted, due) -> list[Recommendation]:
    recs = []
    for disc_id, ledger in sorted(ledgers.items()):
        refs = [e for e in exercises if e.discipline == disc_id and not e.integration]
        subject = ledger.get("subject", "")
        for row in ledger["skills"]:
            if row["status"] == CONSOLIDATED and row["is_due"]:
                pool = [e for e in refs if e.skill == row["code"]]
                fresh = pick_exercise(pool, attempted, due)
                label = skill_label(disc_id, row["code"])
                recs.append(Recommendation(
                    REVIEW, disc_id, row["code"], subject, "Repaso espaciado de una skill",
                    f"{label} está consolidada y tocaba repasarla (cada "
                    f"{row['interval_days']} días).",
                    fresh, "" if fresh else f"No hay ejercicios nuevos de {label} todavía."))
        rows = ledger["skills"]
        pending = [r for r in rows if r["status"] == NOT_STARTED]
        if pending:
            first = pending[0]
            pool = [e for e in refs if e.skill == first["code"]]
            ex = pick_exercise(pool, attempted, due)
            label = skill_label(disc_id, first["code"])
            recs.append(Recommendation(
                NEXT_SKILL, disc_id, first["code"], subject, "Siguiente skill",
                f"Siguiente skill sin empezar del ledger: {label}.",
                ex, "" if ex else f"No hay ejercicios de {label} todavía."))
            if ex is None:
                for row in pending[1:]:
                    pool = [e for e in refs if e.skill == row["code"]]
                    ex = pick_exercise(pool, attempted, due)
                    if ex:
                        recs.append(Recommendation(
                            NEXT_SKILL, disc_id, row["code"], subject, "Siguiente skill",
                            "Primera skill sin empezar que ya tiene ejercicios: "
                            f"{skill_label(disc_id, row['code'])}.", ex))
                        break
        for row in rows:
            if row["status"] != PRACTICING:
                continue
            pool = [e for e in refs if e.skill == row["code"]]
            ex = pick_exercise(pool, attempted, due)
            if ex:
                recs.append(Recommendation(
                    CONTINUE, disc_id, row["code"], subject, "Seguir practicando",
                    f"{skill_label(disc_id, row['code'])} está en práctica: sigue hasta "
                    "consolidarla.", ex))
                break
    return recs


def recommend(vault_root: Path, exercises: list, ledgers: dict, attempts: dict,
              errors: list | None = None, srs_items: list | None = None,
              today: date | None = None) -> list[Recommendation]:
    today = today or date.today()
    if errors is None:
        errors = StudyErrorManager(vault_root).errors(unresolved_only=True)
    if srs_items is None:
        srs_items = StudySRSManager(vault_root).all_items()
    attempted = {nid for nid, data in attempts.items() if data.get("attempts")}
    due = _due_exercises(srs_items, today)
    by_id = {e.note_id: e for e in exercises}
    recs = _remediations(errors, exercises, by_id, attempted, due)
    recs += _integrations(exercises, ledgers, attempts, attempted, due)
    recs += _skill_recs(exercises, ledgers, attempted, due)
    return recs


def _interleave(items: list[QueueItem]) -> list[QueueItem]:
    buckets: dict[tuple, list[QueueItem]] = {}
    for item in sorted(items, key=lambda i: i.priority):
        buckets.setdefault(item.group, []).append(item)
    order = sorted(buckets.values(), key=lambda b: b[0].priority)
    out = []
    while order:
        for bucket in list(order):
            out.append(bucket.pop(0))
            if not bucket:
                order.remove(bucket)
    return out


def build_daily_queue(vault_root: Path, exercises: list, ledgers: dict, attempts: dict,
                      recommendations: list[Recommendation], srs_items: list | None = None,
                      today: date | None = None) -> dict:
    """{"items": interleaved QueueItems, "gaps": recommendations without an exercise,
    "counts": {...}}."""
    today = today or date.today()
    if srs_items is None:
        srs_items = StudySRSManager(vault_root).all_items()
    by_id = {e.note_id: e for e in exercises}
    items: list[QueueItem] = []
    seen: set = set()
    gaps = []
    for rec in recommendations:
        if rec.exercise is None:
            gaps.append(rec)
            continue
        if rec.exercise.note_id in seen:
            continue
        seen.add(rec.exercise.note_id)
        items.append(QueueItem(rec.kind, (rec.exercise.discipline, rec.exercise.skill),
                               rec.subject or rec.exercise.subject, rec.title, rec.reason,
                               rec.exercise))
    day = today.isoformat()
    due = sorted((i for i in srs_items if i["next_review"] <= day),
                 key=lambda i: (i["next_review"], -i["lapses"], i["mastery"]))
    new_cards = 0
    n_exercises = n_cards = 0
    for item in due:
        if item.get("entity_type") == "exercise":
            ref = by_id.get(item["entity_id"])
            if ref is None or ref.note_id in seen:
                continue
            seen.add(ref.note_id)
            n_exercises += 1
            items.append(QueueItem(
                SRS_EXERCISE, (ref.discipline, ref.skill), ref.subject, "Repaso programado",
                f"Tocaba repasarlo hoy (intervalo {item['interval_days']} d).", ref, item))
        elif _is_proof(item):
            if item["entity_id"] in seen:
                continue
            seen.add(item["entity_id"])
            ref = _proof_ref(vault_root, item)
            level = str(item["entity_type"])[len("proof_l"):]
            n_exercises += 1
            items.append(QueueItem(
                SRS_PROOF, ("proof", ref.note_id), ref.subject, "Repaso de demostración",
                f"Toca repasar el nivel {level} de la escalera.", ref, item))
        elif item.get("entity_type") == CARD_TYPE:
            if not item.get("history"):
                if new_cards >= NEW_CARDS_PER_DAY:
                    continue
                new_cards += 1
            n_cards += 1
            items.append(QueueItem(
                SRS_CARD, ("card", item.get("topic", "")), item.get("subject", ""),
                "Tarjeta", item.get("topic", ""), None, item))
    ordered = _interleave(items)
    return {
        "items": ordered,
        "gaps": gaps,
        "counts": {
            "recommendations": sum(1 for i in ordered if i.srs_item is None),
            "srs_exercises": n_exercises,
            "cards": n_cards,
            "total": len(ordered),
        },
    }


def mode_label(mode: str) -> str:
    m = MODES.get(mode)
    return m.label if m else mode


@dataclass
class HubSnapshot:
    exercises: list
    attempts: dict
    ledgers: dict
    errors: list
    recommendations: list
    queue: dict
    srs_items: list = field(default_factory=list)
    area: StudyArea | None = None


def hub_snapshot(vault_root: Path, note_paths, today: date | None = None,
                 area: StudyArea | None = None) -> HubSnapshot:
    """Scan the vault, rebuild and persist the ledgers, index the cards and build the
    daily queue. With an area, everything shown is scoped to it: its exercises, the
    ledgers of their disciplines, the errors of its subject and its cards."""
    today = today or date.today()
    scan = scan_vault(vault_root, note_paths)
    attempts = load_all_attempts(vault_root)
    ledgers = refresh_ledgers(vault_root, scan.exercises, today, attempts)
    attempted = {nid for nid, data in attempts.items() if data.get("attempts")}
    srs = StudySRSManager(vault_root)
    index_cards(vault_root, scan.card_notes, scan.exercises, attempted, srs)
    srs_items = srs.all_items()
    errors = StudyErrorManager(vault_root).errors(unresolved_only=True)
    exercises, weaknesses = scan.exercises, errors
    if area is not None:
        exercises = [e for e in scan.exercises if area.contains(e.rel, e.subject)]
        scoped = {e.discipline for e in exercises}
        ledgers = {k: v for k, v in ledgers.items() if k in scoped}
        errors = [e for e in errors if e["subject"] == area.subject]
        known = {e.note_id for e in scan.exercises}
        ids = {e.note_id for e in exercises}
        weaknesses = [e for e in errors if (e.get("note_id") or e.get("exercise_id")) in ids
                      or (e.get("note_id") or e.get("exercise_id")) not in known]
        srs_items = [i for i in srs_items
                     if (i["entity_id"] in ids if i.get("entity_type") == "exercise"
                         else area.contains(_vault_rel(vault_root, i.get("source_note", "")),
                                            i.get("subject", "")))]
    recs = recommend(vault_root, exercises, ledgers, attempts, weaknesses, srs_items, today)
    queue = build_daily_queue(vault_root, exercises, ledgers, attempts, recs, srs_items, today)
    return HubSnapshot(exercises, attempts, ledgers, errors, recs, queue, srs_items, area)
