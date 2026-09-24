"""Hábitos: the bridge over core.habit_manager.HabitManager."""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any

from ...core.habit_manager import (
    HabitManager, OPTIONAL_KEYS, habit_active_on, habit_schedule_text,
)
from ...core.recurrence import Recurrence
from ..errors import ApiError
from .common import clamp_int, one_line, opt_date, opt_time

MAX_RANGE_DAYS = 400
_COLOUR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def _habit_out(h: dict) -> dict:
    out = {k: v for k, v in h.items() if k in (
        "id", "name", "icon", "days", "subtasks", *OPTIONAL_KEYS)}
    out["schedule"] = habit_schedule_text(h)
    return out


class HabitsApi:
    """Mixed into NoteVaultApi; relies on its _lock and _root."""

    def _habit_mgr(self) -> HabitManager:
        mgr = getattr(self, "_habits_mgr", None)
        if mgr is None or mgr.vault_root != self._root:
            mgr = self._habits_mgr = HabitManager(self._root)
        else:
            # The classic app may have written in between: never serve stale days.
            mgr.reload()
        return mgr

    def _need_habit(self, mgr: HabitManager, habit_id: Any) -> dict:
        h = mgr.get_habit(str(habit_id))
        if h is None:
            raise ApiError("Ese hábito ya no existe.")
        return h

    @staticmethod
    def _habit_fields(fields: Any) -> tuple[dict, dict]:
        """(core fields, optional fields) from UI input, validated."""
        if not isinstance(fields, dict):
            raise ApiError("Datos de hábito inválidos.")
        core: dict = {}
        opts: dict = {}
        if "name" in fields:
            core["name"] = one_line(fields["name"], 120) or "Nuevo hábito"
        if "icon" in fields:
            core["icon"] = one_line(fields["icon"], 8)
        if "days" in fields:
            days = sorted({clamp_int(d, 0, 6, 0) for d in (fields["days"] or [])})
            core["days"] = days or list(range(7))
        if "repeat" in fields:
            opts["repeat"] = Recurrence.parse(one_line(fields["repeat"], 60)).to_string()
        for key in ("start_date", "end_date", "paused_from"):
            if key in fields:
                d = opt_date(fields[key])
                opts[key] = d.isoformat() if d else None
        if "time" in fields:
            opts["time"] = opt_time(fields["time"])
        for key, hi in (("duration_min", 24 * 60), ("reminder_min", 24 * 60)):
            if key in fields:
                opts[key] = None if fields[key] in (None, "") else clamp_int(fields[key], 0, hi, 0)
        if "in_calendar" in fields:
            opts["in_calendar"] = bool(fields["in_calendar"])
        if "colour" in fields:
            c = one_line(fields["colour"], 7)
            if c and not _COLOUR_RE.match(c):
                raise ApiError("Color inválido.")
            opts["colour"] = c or None
        if "notes" in fields:
            opts["notes"] = one_line(fields["notes"], 500) or None
        if "area" in fields:
            opts["area"] = one_line(fields["area"], 80) or None
        return core, opts

    # ── queries ───────────────────────────────────────────────────────────

    def habits_list(self) -> list:
        with self._lock:
            return [_habit_out(h) for h in self._habit_mgr().habits()]

    def habits_range(self, first: str, last: str) -> list:
        """Per day: which habits were active and which were done."""
        with self._lock:
            a, b = opt_date(first), opt_date(last)
            if a is None or b is None or b < a:
                raise ApiError("Rango de fechas inválido.")
            if (b - a).days > MAX_RANGE_DAYS:
                raise ApiError("El rango es demasiado largo.")
            mgr = self._habit_mgr()
            habits = mgr.habits()
            out = []
            d = a
            while d <= b:
                day = mgr.get_day(d)
                active = [h["id"] for h in habits if habit_active_on(h, d)]
                done = [hid for hid in active if day.completed.get(hid, False)]
                out.append({
                    "date": d.isoformat(),
                    "active": active,
                    "done": done,
                    "pct": (len(done) / len(active)) if active else 0.0,
                })
                d += timedelta(days=1)
            return out

    def habits_day(self, day: str) -> dict:
        with self._lock:
            d = opt_date(day)
            if d is None:
                raise ApiError("Fecha inválida.")
            mgr = self._habit_mgr()
            hd = mgr.get_day(d)
            return {
                "date": d.isoformat(),
                "active": [h["id"] for h in mgr.habits() if habit_active_on(h, d)],
                "completed": {k: bool(v) for k, v in hd.completed.items()},
                "subtasks": hd.subtasks,
                "notes": hd.notes,
                "journal": hd.journal,
            }

    def habits_stats(self, ref: str = "") -> dict:
        """Today / week / month / year completion, the streak, and the same
        four numbers per habit (over the days each habit is scheduled)."""
        with self._lock:
            today = opt_date(ref) or date.today()
            mgr = self._habit_mgr()
            habits = mgr.habits()
            year_start = date(today.year, 1, 1)
            week_start = today - timedelta(days=today.weekday())
            month_start = today.replace(day=1)
            days = []
            d = year_start
            while d <= today:
                days.append(mgr.get_day(d))
                d += timedelta(days=1)

            def overall(since: date) -> float:
                sel = [x for x in days if x.date >= since]
                vals = [x.completion_pct(habits) for x in sel if x.active_habits(habits)]
                return sum(vals) / len(vals) if vals else 0.0

            def per_habit(h: dict, since: date) -> float | None:
                sel = [x for x in days if x.date >= since and habit_active_on(h, x.date)]
                if not sel:
                    return None
                return sum(1 for x in sel if x.completed.get(h["id"], False)) / len(sel)

            streak = 0
            d = today
            while d.year == today.year and mgr.day_pct(d) > 0:
                streak += 1
                d -= timedelta(days=1)

            return {
                "today": today.isoformat(),
                "day": mgr.day_pct(today),
                "week": overall(week_start),
                "month": overall(month_start),
                "year": overall(year_start),
                "streak": streak,
                "habits": {
                    h["id"]: {
                        "day": (1.0 if mgr.get_day(today).completed.get(h["id"]) else 0.0)
                        if habit_active_on(h, today) else None,
                        "week": per_habit(h, week_start),
                        "month": per_habit(h, month_start),
                        "year": per_habit(h, year_start),
                    }
                    for h in habits
                },
            }

    # ── day log ───────────────────────────────────────────────────────────

    def habits_set_done(self, day: str, habit_id: str, done: bool) -> dict:
        with self._lock:
            d = opt_date(day)
            if d is None:
                raise ApiError("Fecha inválida.")
            mgr = self._habit_mgr()
            self._need_habit(mgr, habit_id)
            mgr.set_done(d, str(habit_id), bool(done))
            return {"ok": True, "pct": mgr.day_pct(d)}

    def habits_set_subtask(self, day: str, habit_id: str, subtask_id: str, done: bool) -> dict:
        with self._lock:
            d = opt_date(day)
            if d is None:
                raise ApiError("Fecha inválida.")
            mgr = self._habit_mgr()
            h = self._need_habit(mgr, habit_id)
            if not any(s["id"] == subtask_id for s in h.get("subtasks", [])):
                raise ApiError("Esa subtarea ya no existe.")
            hd = mgr.get_day(d)
            hd.set_subtask(h["id"], str(subtask_id), bool(done))
            mgr.save_day(hd)
            return {"ok": True}

    def habits_set_day_text(self, day: str, notes: str = "", journal: str = "") -> dict:
        with self._lock:
            d = opt_date(day)
            if d is None:
                raise ApiError("Fecha inválida.")
            mgr = self._habit_mgr()
            hd = mgr.get_day(d)
            # Notes go into a quoted YAML line: one line, no double quotes.
            hd.notes = one_line(notes, 500).replace('"', "'")
            text = "" if journal is None else str(journal)
            if len(text.encode("utf-8")) > 1024 * 1024:
                raise ApiError("El diario es demasiado largo.")
            hd.journal = "\n".join("—" if ln.strip() == "---" else ln for ln in text.splitlines())
            mgr.save_day(hd)
            return {"ok": True}

    # ── habit config ──────────────────────────────────────────────────────

    def habits_add(self, fields: dict | None = None) -> dict:
        with self._lock:
            core, opts = self._habit_fields(fields or {})
            mgr = self._habit_mgr()
            h = mgr.add_habit(core.get("name", "Nuevo hábito"), core.get("icon", "✓"),
                              core.get("days"), **opts)
            return _habit_out(h)

    def habits_update(self, habit_id: str, fields: dict) -> dict:
        with self._lock:
            mgr = self._habit_mgr()
            self._need_habit(mgr, habit_id)
            core, opts = self._habit_fields(fields)
            mgr.update_habit(str(habit_id), **core, **opts)
            return _habit_out(mgr.get_habit(str(habit_id)))

    def habits_remove(self, habit_id: str) -> dict:
        """Removes the habit from the list; its past day logs are kept."""
        with self._lock:
            mgr = self._habit_mgr()
            self._need_habit(mgr, habit_id)
            mgr.remove_habit(str(habit_id))
            return {"ok": True}

    def habits_reorder(self, ids: list) -> dict:
        with self._lock:
            mgr = self._habit_mgr()
            habits = mgr.habits()
            order = {str(i): n for n, i in enumerate(ids or [])}
            if set(order) != {h["id"] for h in habits}:
                raise ApiError("El orden no coincide con los hábitos.")
            mgr._habits = sorted(habits, key=lambda h: order[h["id"]])
            mgr.save_config()
            return {"ok": True}

    def habits_add_subtask(self, habit_id: str, name: str) -> dict:
        with self._lock:
            mgr = self._habit_mgr()
            self._need_habit(mgr, habit_id)
            clean = one_line(name, 120)
            if not clean:
                raise ApiError("La subtarea necesita un nombre.")
            return mgr.add_subtask(str(habit_id), clean) or {}

    def habits_remove_subtask(self, habit_id: str, subtask_id: str) -> dict:
        with self._lock:
            mgr = self._habit_mgr()
            self._need_habit(mgr, habit_id)
            mgr.remove_subtask(str(habit_id), str(subtask_id))
            return {"ok": True}
