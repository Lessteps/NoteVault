"""Skill Ledger: Not started -> Practicing -> Consolidated, computed from the attempts.

Rules taken from the user's training systems (0.*_TRAINING_SYSTEM.md):
- the first attempt on any exercise of a skill moves it to Practicing;
- a skill is Consolidated after passing a judgment mode (debug, refactor, find_error, ...)
  at Advanced difficulty with no help, or after passing Beginner, Intermediate and
  Advanced exercises of it;
- a consolidated skill is due again after its interval (7 days, doubled by every passed
  review); failing an exercise of a consolidated skill sends it back to Practicing.

The ledger is derived data: it is rebuilt from .notevault/estudio/intentos and written
to .notevault/estudio/ledger/<discipline>.json for other tools (and AIs) to read.
"""

from datetime import date, datetime, timedelta
from pathlib import Path

from .. import store, vault_format
from .discipline_catalog import DISCIPLINES, skill_of
from .exercise_index import skill_key

NOT_STARTED, PRACTICING, CONSOLIDATED = "not_started", "practicing", "consolidated"
STATUS_LABELS = {NOT_STARTED: "Sin empezar", PRACTICING: "Practicando",
                 CONSOLIDATED: "Consolidada"}
BANDS = ("beginner", "intermediate", "advanced")
BAND_LABELS = {"beginner": "Principiante", "intermediate": "Intermedio", "advanced": "Avanzado"}
JUDGMENT_MODES = frozenset({"debug", "refactor", "find_error", "counterexample", "design",
                            "rewrite"})
PASS_SCORE = 75
FAIL_SCORE = 40
FIRST_INTERVAL = 7
MAX_INTERVAL = 180


def difficulty_band(difficulty) -> str:
    try:
        d = int(difficulty)
    except (TypeError, ValueError):
        d = 2
    return "beginner" if d <= 2 else "intermediate" if d == 3 else "advanced"


def attempt_passed(attempt: dict) -> bool:
    return (attempt.get("verdict") != "ungraded" and not attempt.get("solution_seen")
            and int(attempt.get("score") or 0) >= PASS_SCORE)


def attempt_failed(attempt: dict) -> bool:
    return attempt.get("verdict") != "ungraded" and int(attempt.get("score") or 0) < FAIL_SCORE


def attempt_no_help(attempt: dict) -> bool:
    return int(attempt.get("hints_used") or 0) == 0 and not attempt.get("solution_seen")


def _day(stamp: str) -> date:
    try:
        return datetime.fromisoformat(str(stamp)).date()
    except ValueError:
        return date.today()


def replay(events: list[dict], today: date | None = None) -> dict:
    """Status of one skill from its attempts (dicts with `at`, `score`, `verdict`, `mode`,
    `hints_used`, `solution_seen` and `difficulty`)."""
    today = today or date.today()
    status, bands, judged = NOT_STARTED, set(), False
    interval, due, consolidated_on, lapses = 0, None, None, 0
    for ev in sorted(events, key=lambda e: str(e.get("at") or "")):
        day = _day(ev.get("at"))
        if status == NOT_STARTED:
            status = PRACTICING
        if status == CONSOLIDATED:
            if attempt_failed(ev):
                status, bands, judged = PRACTICING, set(), False
                interval, due, lapses = 0, None, lapses + 1
            elif attempt_passed(ev) and due and day >= due:
                interval = min(MAX_INTERVAL, interval * 2)
                due = day + timedelta(days=interval)
            continue
        if attempt_passed(ev):
            band = difficulty_band(ev.get("difficulty"))
            bands.add(band)
            if band == "advanced" and ev.get("mode") in JUDGMENT_MODES and attempt_no_help(ev):
                judged = True
        if judged or bands >= set(BANDS):
            status, consolidated_on = CONSOLIDATED, day
            interval, due = FIRST_INTERVAL, day + timedelta(days=FIRST_INTERVAL)
    scores = [int(e.get("score") or 0) for e in events if e.get("verdict") != "ungraded"]
    last = max((str(e.get("at") or "") for e in events), default="")
    return {
        "status": status,
        "attempts": len(events),
        "best": max(scores) if scores else None,
        "last_at": last,
        "bands": [b for b in BANDS if b in bands],
        "judged": judged,
        "consolidated_on": consolidated_on.isoformat() if consolidated_on else "",
        "interval_days": interval,
        "due": due.isoformat() if due else "",
        "is_due": bool(status == CONSOLIDATED and due and due <= today),
        "lapses": lapses,
    }


def load_all_attempts(vault_root: Path) -> dict[str, dict]:
    """note_id -> attempts file content, for every file in the attempts folder."""
    folder = Path(vault_root) / vault_format.LAYOUT["study_attempts_dir"]
    out = {}
    try:
        files = sorted(folder.glob("*.json"))
    except OSError:
        return out
    for f in files:
        if vault_format.is_sync_conflict(f.name):
            continue
        data = store.load_json(f, {})
        if not isinstance(data, dict) or not data.get("note_id"):
            continue
        attempts = data.get("attempts")
        data["attempts"] = [a for a in attempts if isinstance(a, dict)] \
            if isinstance(attempts, list) else []
        out[str(data["note_id"])] = data
    return out


def _events(exercises: list, attempts: dict) -> dict[tuple, list[dict]]:
    by_id = {e.note_id: e for e in exercises}
    groups: dict[tuple, list[dict]] = {}
    for note_id, data in attempts.items():
        ref = by_id.get(note_id)
        for a in data["attempts"]:
            if ref:
                key, difficulty = (ref.discipline, ref.skill), ref.difficulty
            else:
                disc = str(a.get("discipline") or "")
                key = (disc, skill_key(disc, str(a.get("mode") or ""), a.get("skill")))
                difficulty = a.get("difficulty", 2)
            groups.setdefault(key, []).append({**a, "difficulty": difficulty,
                                               "note_id": note_id})
    return groups


def build_ledger(vault_root: Path, exercises: list, attempts: dict | None = None,
                 today: date | None = None) -> dict[str, dict]:
    """discipline id -> ledger, for every discipline with exercises or attempts."""
    attempts = load_all_attempts(vault_root) if attempts is None else attempts
    events = _events(exercises, attempts)
    active = {e.discipline for e in exercises} | {d for d, _ in events}
    now = datetime.now().isoformat(timespec="seconds")
    ledgers = {}
    for disc_id in sorted(active):
        disc = DISCIPLINES.get(disc_id)
        if not disc:
            continue
        codes = [s.code for s in disc.skills]
        extra = sorted({e.skill for e in exercises if e.discipline == disc_id}
                       | {s for d, s in events if d == disc_id})
        codes += [c for c in extra if c not in codes]
        rows = []
        for code in codes:
            skill = skill_of(disc, code)
            refs = [e for e in exercises if e.discipline == disc_id and e.skill == code]
            evs = events.get((disc_id, code), [])
            row = replay(evs, today)
            row.update({
                "code": code,
                "title": skill.title if skill else (code or "Sin skill"),
                "label": STATUS_LABELS[row["status"]],
                "exercises": len(refs),
                "attempted_exercises": len({ev["note_id"] for ev in evs}),
            })
            rows.append(row)
        ledgers[disc_id] = {
            "discipline": disc_id,
            "title": disc.title,
            "subject": disc.subject,
            "updated": now,
            "skills": rows,
        }
    return ledgers


def ledger_path(vault_root: Path, discipline: str) -> Path:
    return Path(vault_root) / vault_format.LAYOUT["study_ledger"].format(id=discipline)


def save_ledgers(vault_root: Path, ledgers: dict[str, dict]) -> None:
    for disc_id, data in ledgers.items():
        path = ledger_path(vault_root, disc_id)
        old = store.load_json(path, {})
        if isinstance(old, dict) and old.get("skills") == data["skills"]:
            continue
        store.write_json(path, data)


def load_ledger(vault_root: Path, discipline: str) -> dict:
    data = store.load_json(ledger_path(vault_root, discipline), {})
    return data if isinstance(data, dict) else {}


def refresh_ledgers(vault_root: Path, exercises: list, today: date | None = None,
                    attempts: dict | None = None) -> dict[str, dict]:
    ledgers = build_ledger(vault_root, exercises, attempts, today)
    save_ledgers(vault_root, ledgers)
    return ledgers


def skill_status(ledgers: dict, discipline: str, code: str) -> dict | None:
    for row in ledgers.get(discipline, {}).get("skills", []):
        if row["code"] == code:
            return row
    return None
