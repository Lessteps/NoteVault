"""
NoteVault Habit Manager
Data layer: reads and writes one .md file per day inside {vault}/habits/.

Habit schema (v3)
-----------------
{
  "id": "...", "name": "...", "icon": "...",
  "days": [0..6],                 # weekdays the habit is active (0 = Monday)
  "subtasks": [{"id": "...", "name": "..."}],

  # Optional, all written only when set:
  "repeat": "every:2",            # recurrence.py rule; wins over "days"
  "start_date": "2026-09-14",     # first day it counts (anchor for every:N)
  "end_date": "2026-12-31",       # last day it counts
  "paused_from": "2026-10-01",    # inactive from this day on, history kept
  "time": "07:30",                # shown at this hour in Calendario
  "duration_min": 30,
  "in_calendar": true,            # own block in Calendario
  "reminder_min": 10,             # desktop notification before "time"
  "colour": "#33b679",
  "notes": "free text"
}
"""

import json
import re
import calendar
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

from . import vault_format
from .recurrence import Recurrence, parse_date

CONFIG_VERSION = 3
ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
MON_WED_FRI = [0, 2, 4]
TUESDAY = [1]

DEFAULT_HABITS = [
    {"id": "nophone",   "name": "Sin celular 30 min al despertar", "icon": "📵",
     "days": list(ALL_DAYS), "subtasks": []},
    {"id": "bed",       "name": "Preparar la cama",     "icon": "🛏",
     "days": list(ALL_DAYS), "subtasks": []},
    {"id": "water",     "name": "Tomar un vaso de agua", "icon": "💧",
     "days": list(ALL_DAYS), "subtasks": []},
    {"id": "teeth",     "name": "Cepillarme",           "icon": "🪥",
     "days": list(ALL_DAYS), "subtasks": []},
    {"id": "food",      "name": "Comida",               "icon": "🍽",
     "days": list(ALL_DAYS), "subtasks": []},
    {"id": "shower",    "name": "Ducha",                "icon": "🚿",
     "days": list(ALL_DAYS), "subtasks": []},
    {"id": "gym",       "name": "Ir al gimnasio",       "icon": "🏋",
     "days": list(ALL_DAYS), "subtasks": []},
    {"id": "nofa",      "name": "Nofa",                 "icon": "🚫",
     "days": list(ALL_DAYS), "subtasks": []},
    {"id": "nomusic",   "name": "Nomusic",              "icon": "🎵",
     "days": list(ALL_DAYS), "subtasks": []},
    {"id": "reading",   "name": "Lectura",              "icon": "📖",
     "days": list(ALL_DAYS), "subtasks": []},
    {"id": "hairwash",  "name": "Lavarme el cabello",   "icon": "🧴",
     "days": list(MON_WED_FRI), "subtasks": []},
    {"id": "haircare",  "name": "Aplicarme productos del cabello", "icon": "💆",
     "days": list(TUESDAY), "subtasks": []},
    {"id": "coding",    "name": "Programar",            "icon": "💻",
     "days": list(ALL_DAYS),
     "subtasks": [
         {"id": "theory",   "name": "Estudiar teoría"},
         {"id": "practice", "name": "Practicar código"},
         {"id": "review",   "name": "Repasar lo aprendido"},
     ]},
    {"id": "math",      "name": "Matemáticas",          "icon": "🧮",
     "days": list(ALL_DAYS), "subtasks": []},
    {"id": "language",  "name": "Lenguaje",             "icon": "🗣",
     "days": list(ALL_DAYS), "subtasks": []},
]

MONTH_NAMES = [
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
]

DAY_INITIALS = ["L", "M", "X", "J", "V", "S", "D"]
DAY_NAMES_ES = ["Lunes", "Martes", "Miércoles", "Jueves",
                "Viernes", "Sábado", "Domingo"]


def habit_days(habit: dict) -> list[int]:
    """Weekdays a habit is active on; a missing field means every day."""
    days = habit.get("days")
    if not isinstance(days, list) or not days:
        return list(ALL_DAYS)
    out = []
    for d in days:
        try:
            v = int(d)
        except (TypeError, ValueError):
            continue
        if 0 <= v <= 6:
            out.append(v)
    return out or list(ALL_DAYS)


def habit_rule(habit: dict) -> Recurrence:
    rule = Recurrence.parse(habit.get("repeat"))
    return rule if rule.repeats else Recurrence.from_weekdays(habit_days(habit))


def habit_active_on(habit: dict, d: date) -> bool:
    paused = parse_date(habit.get("paused_from"))
    if paused is not None and d >= paused:
        return False
    start = parse_date(habit.get("start_date"))
    end = parse_date(habit.get("end_date"))
    return habit_rule(habit).occurs_on(d, start, end)


def habit_schedule_text(habit: dict) -> str:
    """'Cada lun, mié, vie · 07:30' — for chips and tooltips."""
    parts = [habit_rule(habit).describe()]
    if habit.get("time"):
        parts.append(habit["time"])
    if habit.get("paused_from"):
        parts.append("en pausa")
    return " · ".join(parts)


# Keys a habit may carry besides id / name / icon / days / subtasks.
OPTIONAL_KEYS = vault_format.HABIT_OPTIONAL_KEYS


def _apply_options(habit: dict, options: dict):
    """Set optional keys; a falsy value removes the key so the file stays lean.

    "days" is kept equal to the weekdays a rule covers, so a client that only
    reads "days" still sees a sensible schedule.
    """
    for key, value in options.items():
        if key not in OPTIONAL_KEYS:
            continue
        if value in (None, "", False) and not (key in ("duration_min", "reminder_min") and value == 0):
            habit.pop(key, None)
        else:
            habit[key] = value
    if "repeat" in options:
        rule = Recurrence.parse(habit.get("repeat"))
        if rule.repeats:
            habit["days"] = rule.weekdays_mask()
            if rule.freq in ("daily", "weekly"):
                habit.pop("repeat", None)   # "days" alone says it all
        else:
            habit.pop("repeat", None)


class HabitDay:
    def __init__(self, day: date, completed: dict, notes: str = "",
                 journal: str = "", subtasks: Optional[dict] = None):
        self.date = day
        self.completed: dict[str, bool] = completed  # {habit_id: bool}
        self.notes = notes
        self.journal = journal  # free-form body text saved after frontmatter
        # {habit_id: {subtask_id: bool}}
        self.subtasks: dict[str, dict[str, bool]] = subtasks or {}

    # ── Helpers ───────────────────────────────────────────────────────────

    def active_habits(self, habits: list[dict]) -> list[dict]:
        """Only the habits scheduled for this day."""
        return [h for h in habits if habit_active_on(h, self.date)]

    def subtask_done(self, habit_id: str, subtask_id: str) -> bool:
        return bool(self.subtasks.get(habit_id, {}).get(subtask_id, False))

    def set_subtask(self, habit_id: str, subtask_id: str, value: bool):
        self.subtasks.setdefault(habit_id, {})[subtask_id] = value

    def subtask_progress(self, habit: dict) -> tuple[int, int]:
        subs = habit.get("subtasks") or []
        if not subs:
            return (0, 0)
        done = sum(1 for s in subs if self.subtask_done(habit["id"], s["id"]))
        return (done, len(subs))

    # ── Stats ─────────────────────────────────────────────────────────────

    def completion_pct(self, habits: list[dict]) -> float:
        active = self.active_habits(habits)
        if not active:
            return 0.0
        done = sum(1 for h in active if self.completed.get(h["id"], False))
        return done / len(active)

    def completed_count(self, habits: list[dict]) -> int:
        return sum(1 for h in self.active_habits(habits)
                   if self.completed.get(h["id"], False))


class HabitManager:
    def __init__(self, vault_root: Path):
        self.vault_root = vault_root
        self.habits_dir = vault_root / vault_format.LAYOUT["habits_dir"]
        self._config_path = vault_root / vault_format.LAYOUT["habits_config"]
        self._habits: Optional[list] = None
        self._day_cache: dict[date, HabitDay] = {}

    # ── Habit config ──────────────────────────────────────────────────────

    def habits(self) -> list[dict]:
        if self._habits is None:
            self._habits = self._load_config()
        return self._habits

    def habits_for_day(self, d: date) -> list[dict]:
        return [h for h in self.habits() if habit_active_on(h, d)]

    def get_habit(self, habit_id: str) -> Optional[dict]:
        return next((h for h in self.habits() if h["id"] == habit_id), None)

    def reload(self):
        """Forget cached config and day logs; another window may have written them."""
        self._habits = None
        self._day_cache.clear()

    def set_done(self, d: date, habit_id: str, done: bool):
        day = self.get_day(d)
        day.completed[habit_id] = done
        self.save_day(day)

    def _load_config(self) -> list[dict]:
        raw = None
        if self._config_path.exists():
            try:
                raw = json.loads(self._config_path.read_text(encoding="utf-8"))
            except Exception:
                raw = None

        if isinstance(raw, dict) and raw.get("version", 1) >= 2:
            habits = raw.get("habits") or []
            for h in habits:
                h.setdefault("days", list(ALL_DAYS))
                h.setdefault("subtasks", [])
            if not habits:
                # The user removed every habit on purpose: an empty list is
                # a real configuration, not a missing one. Reinstalling the
                # defaults here brought deleted habits back.
                return habits
            if habits:
                # Older v2 configs miss the habits added in later versions;
                # append them instead of wiping the user's own edits.
                if raw.get("version", 1) < CONFIG_VERSION:
                    known = {h["id"] for h in habits}
                    for d in DEFAULT_HABITS:
                        if d["id"] not in known:
                            habits.append({
                                **d, "days": list(d["days"]),
                                "subtasks": [s.copy() for s in d["subtasks"]],
                            })
                    self._habits = habits
                    self.save_config()
                return habits

        # No config, or a v1 (plain list) config -> install current defaults.
        habits = [
            {**h, "days": list(h["days"]),
             "subtasks": [s.copy() for s in h["subtasks"]]}
            for h in DEFAULT_HABITS
        ]
        self._habits = habits
        self.save_config()
        return habits

    def save_config(self):
        self.habits_dir.mkdir(parents=True, exist_ok=True)
        payload = {"version": CONFIG_VERSION, "habits": self._habits or []}
        self._config_path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False),
            encoding="utf-8"
        )

    # ── File paths ────────────────────────────────────────────────────────

    def _day_path(self, d: date) -> Path:
        return self.habits_dir / str(d.year) / f"{d.month:02d}" / f"{d.isoformat()}.md"

    # ── CRUD ─────────────────────────────────────────────────────────────

    def get_day(self, d: date) -> HabitDay:
        cached = self._day_cache.get(d)
        if cached is not None:
            return cached
        path = self._day_path(d)
        day = self._parse(path, d) if path.exists() else HabitDay(d, {}, "")
        self._day_cache[d] = day
        return day

    def save_day(self, day: HabitDay):
        self._day_cache[day.date] = day
        path = self._day_path(day.date)
        path.parent.mkdir(parents=True, exist_ok=True)
        lines = [
            "---",
            f"date: {day.date.isoformat()}",
            "completed:",
        ]
        for h in self.habits():
            val = "true" if day.completed.get(h["id"], False) else "false"
            lines.append(f"  {h['id']}: {val}")
        lines.append(f'notes: "{day.notes}"')
        if day.subtasks:
            lines.append(
                "subtasks: " + json.dumps(day.subtasks, ensure_ascii=False)
            )
        lines.append("---")
        body = day.journal.strip()
        if body:
            lines.append("")
            lines.append(body)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def _parse(self, path: Path, d: date) -> HabitDay:
        text = path.read_text(encoding="utf-8", errors="replace")
        completed: dict[str, bool] = {}
        notes = ""
        subtasks: dict[str, dict[str, bool]] = {}
        journal_lines: list[str] = []
        fm_count = 0   # counts how many "---" lines we have seen
        in_completed = False
        for line in text.splitlines():
            if line.strip() == "---":
                fm_count += 1
                in_completed = False
                continue
            if fm_count < 2:
                # inside frontmatter
                if line.strip().startswith("completed:"):
                    in_completed = True
                    continue
                if in_completed and re.match(r"^\s+\w", line):
                    m = re.match(r"\s+(\w+):\s*(true|false)", line)
                    if m:
                        completed[m.group(1)] = m.group(2) == "true"
                else:
                    if in_completed:
                        in_completed = False
                    m = re.match(r'notes:\s*"?(.*?)"?\s*$', line)
                    if m:
                        notes = m.group(1)
                    m = re.match(r'subtasks:\s*(\{.*\})\s*$', line)
                    if m:
                        try:
                            subtasks = json.loads(m.group(1))
                        except Exception:
                            subtasks = {}
            else:
                # body / journal
                journal_lines.append(line)
        journal = "\n".join(journal_lines).strip()
        return HabitDay(d, completed, notes, journal, subtasks)

    # ── Range queries ─────────────────────────────────────────────────────

    def get_week(self, ref: date) -> list[HabitDay]:
        monday = ref - timedelta(days=ref.weekday())
        return [self.get_day(monday + timedelta(days=i)) for i in range(7)]

    def get_month(self, year: int, month: int) -> list[HabitDay]:
        days_in = calendar.monthrange(year, month)[1]
        return [self.get_day(date(year, month, d)) for d in range(1, days_in + 1)]

    def get_year_summary(self, year: int) -> list[tuple[int, float]]:
        habits = self.habits()
        today = date.today()
        result = []
        for m in range(1, 13):
            days = [d for d in self.get_month(year, m) if d.date <= today]
            if days:
                avg = sum(d.completion_pct(habits) for d in days) / len(days)
            else:
                avg = 0.0
            result.append((m, avg))
        return result

    # ── Stats ─────────────────────────────────────────────────────────────

    def day_pct(self, d: date) -> float:
        return self.get_day(d).completion_pct(self.habits())

    def week_pct(self, ref: date) -> float:
        today = date.today()
        days = [d for d in self.get_week(ref) if d.date <= today]
        if not days:
            return 0.0
        return sum(d.completion_pct(self.habits()) for d in days) / len(days)

    def month_pct(self, year: int, month: int) -> float:
        today = date.today()
        days = [d for d in self.get_month(year, month) if d.date <= today]
        if not days:
            return 0.0
        return sum(d.completion_pct(self.habits()) for d in days) / len(days)

    def year_pct(self, year: int) -> float:
        pcts = [p for _, p in self.get_year_summary(year) if p > 0]
        return sum(pcts) / len(pcts) if pcts else 0.0

    # ── Habit config mutations ────────────────────────────────────────────

    def _unique_id(self, base: str, existing: set) -> str:
        hid = base
        counter = 2
        while hid in existing:
            hid = f"{base}{counter}"
            counter += 1
        return hid

    def add_habit(self, name: str, icon: str,
                  days: Optional[list] = None, **options) -> dict:
        habits = self.habits()
        base_id = re.sub(r'[^a-z0-9]', '', name.lower()) or "habit"
        hid = self._unique_id(base_id, {h["id"] for h in habits})
        h = {
            "id": hid, "name": name, "icon": icon,
            "days": list(days) if days else list(ALL_DAYS),
            "subtasks": [],
        }
        _apply_options(h, options)
        habits.append(h)
        self._habits = habits
        self.save_config()
        return h

    def remove_habit(self, habit_id: str):
        habits = self.habits()
        self._habits = [h for h in habits if h["id"] != habit_id]
        self.save_config()

    def update_habit(self, habit_id: str, **fields):
        options = {k: fields.pop(k) for k in list(fields) if k in OPTIONAL_KEYS}
        for h in self.habits():
            if h["id"] == habit_id:
                h.update(fields)
                _apply_options(h, options)
                break
        self.save_config()

    def set_habit_days(self, habit_id: str, days: list):
        self.update_habit(habit_id, days=sorted({int(d) for d in days}))

    # ── Subtasks ──────────────────────────────────────────────────────────

    def add_subtask(self, habit_id: str, name: str) -> Optional[dict]:
        for h in self.habits():
            if h["id"] == habit_id:
                subs = h.setdefault("subtasks", [])
                base = re.sub(r'[^a-z0-9]', '', name.lower()) or "sub"
                sid = self._unique_id(base, {s["id"] for s in subs})
                s = {"id": sid, "name": name}
                subs.append(s)
                self.save_config()
                return s
        return None

    def remove_subtask(self, habit_id: str, subtask_id: str):
        for h in self.habits():
            if h["id"] == habit_id:
                h["subtasks"] = [
                    s for s in h.get("subtasks", []) if s["id"] != subtask_id
                ]
                self.save_config()
                return
