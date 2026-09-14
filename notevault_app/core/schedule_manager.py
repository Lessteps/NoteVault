"""
NoteVault Schedule Manager.

Data layer for the Calendario (time & scheduling) module.
Handles routines, day events, per-day overrides, calendar settings,
and merges derived occurrences from habits, exercise, tasks, and projects.
"""

import logging
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

from . import schedule_format as sf
from . import vault_format
from .exercise_manager import ExerciseManager
from .habit_manager import HabitManager
from .project_manager import ProjectManager
from .recurrence import Recurrence, parse_date
from .task_manager import TaskManager

logger = logging.getLogger(__name__)


@dataclass
class Occurrence:
    id: str
    title: str
    kind: str            # routine | event | habit | exercise | task | project
    date: date
    start: Optional[str]        # "HH:MM", None = all day
    duration_min: Optional[int]
    colour: str
    links: list[dict] = field(default_factory=list)
    done: bool = False
    source: str = ""     # "routine" | "event" | module name — where to write back
    editable: bool = True
    reminder_min: Optional[int] = None   # minutes before start; None = no reminder


HABIT_PREFIX = "habit:"


def routine_on(routine: dict, d: date) -> bool:
    """A routine repeats by its "repeat" rule, or else by its weekday names."""
    rule = Recurrence.parse(routine.get("repeat"))
    if not rule.repeats:
        rule = Recurrence.from_weekdays(
            vault_format.WEEKDAY_KEYS.index(k) for k in routine.get("days", [])
            if k in vault_format.WEEKDAY_KEYS)
        if not rule.repeats:
            return False
    return rule.occurs_on(d, parse_date(routine.get("active_from")),
                          parse_date(routine.get("active_until")))


def _reminder(item: dict) -> Optional[int]:
    value = item.get("reminder_min")
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


class ScheduleManager:
    def __init__(self, vault_root: Path, habit_mgr=None, exercise_mgr=None,
                 task_mgr=None, project_mgr=None):
        self.vault_root = Path(vault_root)
        self.agenda_dir = self.vault_root / vault_format.LAYOUT["agenda_dir"]
        self.agenda_routines = self.vault_root / vault_format.LAYOUT["agenda_routines"]
        self.agenda_events_dir = self.vault_root / vault_format.LAYOUT["agenda_events_dir"]
        self.agenda_settings = self.vault_root / vault_format.LAYOUT["agenda_settings"]

        # The app passes its own managers so every module shares one cache.
        self.habit_mgr = habit_mgr or HabitManager(self.vault_root)
        self.exercise_mgr = exercise_mgr or ExerciseManager(self.vault_root)
        self.task_mgr = task_mgr or TaskManager(self.vault_root)
        self.project_mgr = project_mgr or ProjectManager(self.vault_root)

        # Caching
        self._routines_cache: Optional[list[dict]] = None
        self._routines_mtime: float = 0.0

        self._settings_cache: Optional[dict] = None
        self._settings_mtime: float = 0.0

        # Map of date_str -> (mtime, parsed_day_dict)
        self._day_files_cache: Dict[str, Tuple[float, dict]] = {}

    # ── Routines ──────────────────────────────────────────────────────────

    def routines(self) -> list[dict]:
        if not self.agenda_routines.exists():
            return []
        try:
            mtime = self.agenda_routines.stat().st_mtime
        except OSError:
            return []

        if self._routines_cache is None or mtime != self._routines_mtime:
            data = sf.load_json(self.agenda_routines)
            if isinstance(data, list):
                self._routines_cache = [sf.sanitize_routine(r) for r in data if isinstance(r, dict)]
            else:
                self._routines_cache = []
            self._routines_mtime = mtime

        return list(self._routines_cache)

    def _save_routines(self, routines_list: list[dict]):
        self.agenda_dir.mkdir(parents=True, exist_ok=True)
        sanitized = [sf.sanitize_routine(r) for r in routines_list]
        text = sf.dump_json(sanitized)
        self.agenda_routines.write_text(text, encoding="utf-8")
        self._routines_cache = sanitized
        try:
            self._routines_mtime = self.agenda_routines.stat().st_mtime
        except OSError:
            self._routines_mtime = 0.0

    def add_routine(self, **fields) -> dict:
        r_list = self.routines()
        routine = sf.sanitize_routine(fields)
        r_list.append(routine)
        self._save_routines(r_list)
        return routine

    def update_routine(self, routine_id: str, **fields) -> Optional[dict]:
        r_list = self.routines()
        target = None
        for i, r in enumerate(r_list):
            if r.get("id") == routine_id:
                r.update(fields)
                r_list[i] = sf.sanitize_routine(r)
                target = r_list[i]
                break
        if target:
            self._save_routines(r_list)
        return target

    def remove_routine(self, routine_id: str) -> bool:
        r_list = self.routines()
        new_list = [r for r in r_list if r.get("id") != routine_id]
        if len(new_list) != len(r_list):
            self._save_routines(new_list)
            return True
        return False

    # ── Settings ──────────────────────────────────────────────────────────

    def settings(self) -> dict:
        if not self.agenda_settings.exists():
            return dict(sf.DEFAULT_SETTINGS)
        try:
            mtime = self.agenda_settings.stat().st_mtime
        except OSError:
            return dict(sf.DEFAULT_SETTINGS)

        if self._settings_cache is None or mtime != self._settings_mtime:
            data = sf.load_json(self.agenda_settings)
            self._settings_cache = sf.sanitize_settings(data if isinstance(data, dict) else None)
            self._settings_mtime = mtime

        return dict(self._settings_cache)

    def update_settings(self, **fields) -> dict:
        cur = self.settings()
        cur.update(fields)
        sanitized = sf.sanitize_settings(cur)
        self.agenda_dir.mkdir(parents=True, exist_ok=True)
        self.agenda_settings.write_text(sf.dump_json(sanitized), encoding="utf-8")
        self._settings_cache = sanitized
        try:
            self._settings_mtime = self.agenda_settings.stat().st_mtime
        except OSError:
            self._settings_mtime = 0.0
        return dict(self._settings_cache)

    # ── Day Files ─────────────────────────────────────────────────────────

    def get_day_file_path(self, d: date) -> Path:
        rel = vault_format.LAYOUT["agenda_events_day"].format(
            year=d.year, month=d.month, date=d.isoformat()
        )
        return self.vault_root / rel

    def get_day_file(self, d: date) -> dict:
        p = self.get_day_file_path(d)
        date_str = d.isoformat()
        if not p.exists():
            return sf.sanitize_day_file(None, date_str)

        try:
            mtime = p.stat().st_mtime
        except OSError:
            return sf.sanitize_day_file(None, date_str)

        cached = self._day_files_cache.get(date_str)
        if cached and cached[0] == mtime:
            return dict(cached[1])

        raw = sf.load_json(p)
        sanitized = sf.sanitize_day_file(raw if isinstance(raw, dict) else None, date_str)
        self._day_files_cache[date_str] = (mtime, sanitized)
        return dict(sanitized)

    def save_day_file(self, d: date, data: dict):
        p = self.get_day_file_path(d)
        p.parent.mkdir(parents=True, exist_ok=True)
        date_str = d.isoformat()
        sanitized = sf.sanitize_day_file(data, date_str)
        text = sf.dump_json(sanitized)
        p.write_text(text, encoding="utf-8")
        try:
            mtime = p.stat().st_mtime
        except OSError:
            mtime = 0.0
        self._day_files_cache[date_str] = (mtime, sanitized)

    # ── Day events ────────────────────────────────────────────────────────

    def add_event(self, d: date, **fields) -> dict:
        day_data = self.get_day_file(d)
        ev = sf.sanitize_event(fields)
        day_data["events"].append(ev)
        self.save_day_file(d, day_data)
        return ev

    def update_event(self, d: date, event_id: str, **fields) -> Optional[dict]:
        day_data = self.get_day_file(d)
        target = None
        for ev in day_data["events"]:
            if ev.get("id") == event_id:
                ev.update(fields)
                target = sf.sanitize_event(ev)
                break
        if target:
            self.save_day_file(d, day_data)
        return target

    def remove_event(self, d: date, event_id: str) -> bool:
        day_data = self.get_day_file(d)
        new_events = [ev for ev in day_data["events"] if ev.get("id") != event_id]
        if len(new_events) != len(day_data["events"]):
            day_data["events"] = new_events
            self.save_day_file(d, day_data)
            return True
        return False

    # ── Query & Resolve Occurrences ───────────────────────────────────────

    def day(self, d: date) -> list[Occurrence]:
        """Return the fully resolved occurrences for date d. Pure, does not write."""
        return self._resolve_day(d, self.routines(), self.get_day_file(d),
                                 self.task_mgr.tasks(), self.project_mgr.projects())

    def _resolve_day(self, d: date, routines_list: list[dict], day_data: dict,
                     tasks_list: list, projects_list: list) -> list[Occurrence]:
        wkey = vault_format.WEEKDAY_KEYS[d.weekday()]
        out: list[Occurrence] = []

        # 1. Routines
        overrides = day_data.get("overrides", {})
        for r in routines_list:
            if not routine_on(r, d):
                continue

            rid = r["id"]
            if rid in overrides:
                ov = overrides[rid]
                st = ov.get("status")
                if st == "skipped":
                    continue
                elif st == "moved":
                    start_t = ov.get("start", r.get("start"))
                    dur = ov.get("duration_min", r.get("duration_min"))
                    is_done = bool(ov.get("done", False))
                elif st == "done":
                    start_t = r.get("start")
                    dur = r.get("duration_min")
                    is_done = True
                else:
                    start_t = r.get("start")
                    dur = r.get("duration_min")
                    is_done = False
            else:
                start_t = r.get("start")
                dur = r.get("duration_min")
                is_done = False

            out.append(Occurrence(
                id=rid,
                title=r.get("title", "Rutina"),
                kind="routine",
                date=d,
                start=start_t,
                duration_min=dur,
                colour=r.get("colour", "blue"),
                links=r.get("links", []),
                done=is_done,
                source="routine",
                editable=True,
                reminder_min=_reminder(r),
            ))

        # 2. Day events
        for ev in day_data.get("events", []):
            out.append(Occurrence(
                id=ev.get("id", ""),
                title=ev.get("title", "Evento"),
                kind="event",
                date=d,
                start=ev.get("start"),
                duration_min=ev.get("duration_min"),
                colour=ev.get("colour", "orange"),
                links=ev.get("links", []),
                done=bool(ev.get("done", False)),
                source="event",
                editable=True,
                reminder_min=_reminder(ev),
            ))

        # 3. Tasks
        for t in tasks_list:
            if not t.occurs_on(d):
                continue
            repeating = t.rule.repeats
            if repeating or t.due == d:
                start_time = t.due_time or None
            else:
                start_time = t.start_time or None
            out.append(Occurrence(
                id=f"task_{t.id}",
                title=t.name,
                kind="task",
                date=d,
                start=start_time,
                duration_min=60 if start_time else None,
                colour="#3f51b5",
                links=[{"type": "task", "id": t.id}],
                done=t.is_done and (not repeating or d == t.due),
                source="task",
                editable=bool(start_time),
            ))

        # 4. Projects
        for p in projects_list:
            is_match = False
            if p.start and p.deadline and (p.start <= d <= p.deadline):
                is_match = True
            elif p.start and not p.deadline and p.start == d:
                is_match = True
            elif p.deadline and not p.start and p.deadline == d:
                is_match = True

            if is_match:
                start_time = p.start_time if (p.start == d and p.start_time) else None
                out.append(Occurrence(
                    id=f"project_{p.id}",
                    title=p.name,
                    kind="project",
                    date=d,
                    start=start_time,
                    duration_min=60 if start_time else None,
                    colour=p.color or "#a78bfa",
                    links=[{"type": "project", "id": p.id}],
                    done=p.is_done,
                    source="project",
                    editable=False,
                ))

        # 5. Exercises
        if self.exercise_mgr.exercises_for_day(wkey):
            is_done = self.exercise_mgr.day_pct(d) >= 1.0
            out.append(Occurrence(
                id=f"exercise_{d.isoformat()}",
                title="Ejercicio",
                kind="exercise",
                date=d,
                start=None,
                duration_min=None,
                colour="#ff9632",
                links=[{"type": "exercise", "id": "ejercicio"}],
                done=is_done,
                source="exercise",
                editable=False,
            ))

        # 6. Habits: the ones sent to the calendar get their own block, the
        # rest are summed up in a single "Hábitos" chip.
        habits_today = self.habit_mgr.habits_for_day(d)
        if habits_today:
            log = self.habit_mgr.get_day(d)
            grouped = []
            for h in habits_today:
                if not h.get("in_calendar"):
                    grouped.append(h)
                    continue
                clock = h.get("time") or None
                duration = h.get("duration_min")
                out.append(Occurrence(
                    id=f"{HABIT_PREFIX}{h['id']}",
                    title=f"{h.get('icon', '')} {h['name']}".strip(),
                    kind="habit",
                    date=d,
                    start=clock,
                    duration_min=(duration if isinstance(duration, int) and duration > 0 else 30)
                    if clock else None,
                    colour=h.get("colour") or "#7c5af0",
                    links=[{"type": "habit", "id": h["id"]}],
                    done=bool(log.completed.get(h["id"], False)),
                    source="habit",
                    editable=False,
                    reminder_min=_reminder(h) if clock else None,
                ))
            if grouped:
                out.append(Occurrence(
                    id=f"habit_{d.isoformat()}",
                    title="Hábitos",
                    kind="habit",
                    date=d,
                    start=None,
                    duration_min=None,
                    colour="#7c5af0",
                    links=[{"type": "habit", "id": "habits"}],
                    done=all(log.completed.get(h["id"], False) for h in grouped),
                    source="habit",
                    editable=False,
                ))

        # 7. Sort: all-day items (start is None) first, then start time, then title
        def sort_key(occ: Occurrence):
            return (0 if occ.start is None else 1, occ.start or "", occ.title.lower())

        out.sort(key=sort_key)
        return out

    def range(self, first: date, last: date) -> Dict[date, list[Occurrence]]:
        """Return occurrences for each date in range [first, last] inclusive.

        Performance target: < 50ms for a full month.
        """
        start_t = time.perf_counter()

        routines_list = self.routines()
        tasks_list = self.task_mgr.tasks()
        projects_list = self.project_mgr.projects()

        result: Dict[date, list[Occurrence]] = {}
        curr = first
        while curr <= last:
            day_data = self.get_day_file(curr)
            result[curr] = self._resolve_day(curr, routines_list, day_data,
                                             tasks_list, projects_list)
            curr += timedelta(days=1)

        elapsed_ms = (time.perf_counter() - start_t) * 1000.0
        logger.info("ScheduleManager.range(%s, %s) took %.2f ms", first, last, elapsed_ms)
        return result

    # ── Actions ───────────────────────────────────────────────────────────

    def move(self, d: date, occurrence_id: str, start: str, duration_min: int):
        """Move routine or event to a new start time and duration on date d."""
        if occurrence_id.startswith("ev_"):
            self.update_event(d, occurrence_id, start=start, duration_min=duration_min)
            return

        # Routines or routine overrides
        day_data = self.get_day_file(d)
        overrides = day_data.get("overrides", {})
        existing = overrides.get(occurrence_id, {})
        existing.update({"status": "moved", "start": start, "duration_min": duration_min})
        overrides[occurrence_id] = existing
        day_data["overrides"] = overrides
        self.save_day_file(d, day_data)

    def skip(self, d: date, occurrence_id: str):
        """Mark routine as skipped today or remove day event."""
        if occurrence_id.startswith("ev_"):
            self.remove_event(d, occurrence_id)
            return

        day_data = self.get_day_file(d)
        overrides = day_data.get("overrides", {})
        overrides[occurrence_id] = {"status": "skipped"}
        day_data["overrides"] = overrides
        self.save_day_file(d, day_data)

    def set_done(self, d: date, occurrence_id: str, done: bool):
        """Mark a routine, event, calendar habit or task as done/undone on date d."""
        if occurrence_id.startswith(HABIT_PREFIX):
            self.habit_mgr.set_done(d, occurrence_id[len(HABIT_PREFIX):], done)
            return
        if occurrence_id.startswith("task_"):
            from .task_manager import STATUS_DONE, STATUS_TODO
            self.task_mgr.update(occurrence_id[len("task_"):],
                                 status=STATUS_DONE if done else STATUS_TODO)
            return
        if occurrence_id.startswith("ev_"):
            self.update_event(d, occurrence_id, done=done)
            return

        day_data = self.get_day_file(d)
        overrides = day_data.get("overrides", {})
        if done:
            existing = overrides.get(occurrence_id, {})
            if existing.get("status") == "moved":
                existing["done"] = True
            else:
                existing = {"status": "done"}
            overrides[occurrence_id] = existing
        else:
            overrides.pop(occurrence_id, None)

        day_data["overrides"] = overrides
        self.save_day_file(d, day_data)
