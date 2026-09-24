"""Calendario: the bridge over core.schedule_manager.ScheduleManager.

The calendar merges routines and day events (its own) with blocks from
Tareas, Hábitos, Ejercicio, Proyectos, Metas and Finanzas. Only routines,
events and tasks are edited here, exactly as in the classic app; the rest
can be ticked and are edited in their own module.
"""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta
from typing import Any, Optional

from ...core.recurrence import Recurrence, parse_date
from ...core.schedule_manager import HABIT_PREFIX, Occurrence
from ...core.task_manager import STATUS_DONE, STATUS_TODO
from ...core.vault_format import WEEKDAY_KEYS
from ..errors import ApiError
from .common import clamp_int, one_line, opt_date, opt_time

MAX_RANGE_DAYS = 62
_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
DEFAULT_COLOUR = "#039be5"
_NAMED = {"blue": "#039be5", "orange": "#f4511e", "purple": "#8e24aa", "teal": "#33b679",
          "green": "#33b679", "red": "#d50000", "yellow": "#f6bf26"}
MODULE_SOURCES = ("metas", "proyectos", "finanzas")


def colour_hex(value: Optional[str]) -> str:
    if value and _HEX_RE.match(value):
        return value.lower()
    return _NAMED.get(value or "", DEFAULT_COLOUR)


def _checkable(o: Occurrence) -> bool:
    if o.source in ("routine", "event", "task") or o.source in MODULE_SOURCES:
        return True
    return o.id.startswith(HABIT_PREFIX)


def occ_dict(o: Occurrence) -> dict:
    return {
        "id": o.id, "title": o.title, "kind": o.kind, "date": o.date.isoformat(),
        "start": o.start, "duration_min": o.duration_min, "colour": colour_hex(o.colour),
        "done": bool(o.done), "source": o.source, "editable": bool(o.editable),
        "checkable": _checkable(o), "links": o.links, "reminder_min": o.reminder_min,
    }


def _hm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _minutes(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    h, m = value.split(":")
    return int(h) * 60 + int(m)


def _int_or_none(v):
    return v if isinstance(v, int) and not isinstance(v, bool) else None


class CalendarApi:
    """Mixed into NoteVaultApi; relies on its _lock, _root and _mgrs()."""

    def _sched(self):
        m = self._mgrs()
        # Tasks and projects are re-read from disk when their files change.
        return m.schedule

    @staticmethod
    def _need_date(value: Any) -> date:
        d = opt_date(value)
        if d is None:
            raise ApiError("Fecha inválida.")
        return d

    # ── queries ───────────────────────────────────────────────────────────

    def cal_range(self, first: str, last: str) -> dict:
        with self._lock:
            a, b = self._need_date(first), self._need_date(last)
            if b < a or (b - a).days > MAX_RANGE_DAYS:
                raise ApiError("Rango de fechas inválido.")
            found = self._sched().range(a, b)
            return {d.isoformat(): [occ_dict(o) for o in occs] for d, occs in found.items()}

    def cal_settings(self) -> dict:
        with self._lock:
            return self._sched().settings()

    def _find_event(self, d: date, event_id: str) -> Optional[dict]:
        for ev in self._sched().get_day_file(d).get("events", []):
            if ev.get("id") == event_id:
                return dict(ev)
        return None

    def cal_item(self, day: str, occurrence_id: str, kind: str) -> dict:
        """What the event editor needs to edit a block."""
        with self._lock:
            d = self._need_date(day)
            sm = self._sched()
            oid = str(occurrence_id)
            if kind == "event":
                ev = self._find_event(d, oid)
                if ev is None:
                    raise ApiError("Ese evento ya no existe.")
                return dict(kind="event", id=oid, date=d.isoformat(), title=ev.get("title", ""),
                            start=ev.get("start"), duration=ev.get("duration_min"),
                            location=ev.get("location", ""), description=ev.get("notes", ""),
                            reminder_min=_int_or_none(ev.get("reminder_min")),
                            colour=colour_hex(ev.get("colour")), repeat="", until=None, subject="")
            if kind == "routine":
                rt = next((r for r in sm.routines() if r.get("id") == oid), None)
                if rt is None:
                    raise ApiError("Esa rutina ya no existe.")
                rule = Recurrence.parse(rt.get("repeat"))
                if not rule.repeats:
                    rule = Recurrence.from_weekdays(
                        WEEKDAY_KEYS.index(k) for k in rt.get("days", []) if k in WEEKDAY_KEYS)
                until = parse_date(rt.get("active_until"))
                return dict(kind="routine", id=oid, date=d.isoformat(), title=rt.get("title", ""),
                            start=rt.get("start"), duration=rt.get("duration_min"),
                            location=rt.get("location", ""), description=rt.get("notes", ""),
                            reminder_min=_int_or_none(rt.get("reminder_min")),
                            colour=colour_hex(rt.get("colour")), repeat=rule.to_string(),
                            until=until.isoformat() if until else None, subject="")
            if kind == "task":
                tid = oid[len("task_"):] if oid.startswith("task_") else oid
                task = sm.task_mgr.get(tid)
                if task is None:
                    raise ApiError("Esa tarea ya no existe.")
                clock = task.due_time if task.due == d else task.start_time
                reminder = None
                start = _minutes(clock)
                if task.reminder and start is not None and not task.reminder_done:
                    begins = datetime.combine(d, time(start // 60, start % 60))
                    reminder = max(0, int((begins - task.reminder).total_seconds() // 60))
                return dict(kind="task", id=tid, date=(task.due or d).isoformat(), title=task.name,
                            start=clock, duration=None, location="", description=task.body,
                            reminder_min=reminder, colour=None, repeat=task.repeat,
                            until=task.repeat_until.isoformat() if task.repeat_until else None,
                            subject=task.subject)
            raise ApiError("Este bloque se edita desde su propio módulo.")

    # ── writes ────────────────────────────────────────────────────────────

    @staticmethod
    def _payload(p: Any) -> dict:
        if not isinstance(p, dict):
            raise ApiError("Datos inválidos.")
        kind = p.get("kind")
        if kind not in ("event", "task"):
            raise ApiError("Tipo inválido.")
        orig = p.get("orig") or {}
        if not isinstance(orig, dict):
            raise ApiError("Datos inválidos.")
        start = opt_time(p.get("start"))
        duration = p.get("duration")
        duration = None if duration in (None, "") or start is None else clamp_int(duration, 5, 24 * 60, 60)
        reminder = p.get("reminder_min")
        reminder = None if reminder in (None, "") or start is None else clamp_int(reminder, 0, 7 * 24 * 60, 0)
        colour = p.get("colour") or DEFAULT_COLOUR
        if not _HEX_RE.match(str(colour)):
            raise ApiError("Color inválido.")
        rule = Recurrence.parse(one_line(p.get("repeat"), 60))
        return dict(
            mode="edit" if p.get("mode") == "edit" else "create",
            kind=kind,
            orig=dict(kind=orig.get("kind"), id=one_line(orig.get("id"), 120),
                      date=opt_date(orig.get("date"))),
            title=one_line(p.get("title"), 200) or "(Sin título)",
            date=CalendarApi._need_date(p.get("date")),
            start=start,
            duration=duration,
            repeat=rule.to_string(),
            until=opt_date(p.get("until")) if rule.repeats else None,
            days=[WEEKDAY_KEYS[i] for i in rule.weekdays_mask()],
            location=one_line(p.get("location"), 300),
            description=str(p.get("description") or "")[:20000],
            subject=one_line(p.get("subject"), 120),
            reminder_min=reminder,
            colour=str(colour).lower(),
        )

    def cal_save(self, payload: dict) -> dict:
        """Create or edit an event, a repeating event (a routine) or a task."""
        with self._lock:
            p = self._payload(payload)
            sm = self._sched()
            orig = p["orig"]
            orig_kind = orig.get("kind")
            if p["mode"] == "edit" and orig.get("date") is None:
                raise ApiError("Falta la fecha original.")

            if p["kind"] == "task":
                self._save_task(p)
                return {"ok": True, "message": "Tarea guardada"}

            fields = dict(title=p["title"], start=p["start"], duration_min=p["duration"],
                          colour=p["colour"], notes=p["description"], location=p["location"],
                          reminder_min=p["reminder_min"])
            if not p["repeat"]:
                if orig_kind == "routine":
                    sm.remove_routine(orig["id"])
                    sm.add_event(p["date"], **fields)
                elif orig_kind == "event":
                    if p["date"] != orig["date"]:
                        event = self._find_event(orig["date"], orig["id"]) or {}
                        sm.remove_event(orig["date"], orig["id"])
                        event.update(fields)
                        sm.add_event(p["date"], **event)
                    else:
                        sm.update_event(orig["date"], orig["id"], **fields)
                else:
                    sm.add_event(p["date"], **fields)
                return {"ok": True, "message": "Evento guardado"}

            routine = dict(fields, days=p["days"], repeat=p["repeat"],
                           active_until=p["until"].isoformat() if p["until"] else None)
            if orig_kind == "routine":
                sm.update_routine(orig["id"], **routine)
            else:
                if orig_kind == "event":
                    sm.remove_event(orig["date"], orig["id"])
                sm.add_routine(active_from=p["date"].isoformat(), **routine)
            return {"ok": True, "message": "Evento periódico guardado en tus rutinas"}

    def _save_task(self, p: dict):
        tm = self._sched().task_mgr
        reminder = None
        start = _minutes(p["start"])
        if start is not None and p["reminder_min"] is not None:
            reminder = datetime.combine(p["date"], time(start // 60, start % 60)) \
                - timedelta(minutes=p["reminder_min"])
        body = "\n".join("—" if ln.strip() == "---" else ln for ln in p["description"].splitlines())
        fields = dict(due=p["date"], due_time=p["start"], body=body,
                      subject=p["subject"], reminder=reminder, reminder_done=False,
                      repeat=p["repeat"], repeat_until=p["until"] if p["repeat"] else None)
        if p["mode"] == "edit":
            task = tm.get(p["orig"]["id"])
            if task is None:
                raise ApiError("Esa tarea ya no existe.")
            if task.start == task.due:
                fields["start"] = p["date"]
            tm.update(task.id, name=p["title"], **fields)
        else:
            tm.create(p["title"], start=p["date"], **fields)

    def cal_delete(self, orig: dict, scope: str = "all") -> dict:
        """scope "one" skips a routine on that day; "all" removes it."""
        with self._lock:
            if not isinstance(orig, dict):
                raise ApiError("Datos inválidos.")
            kind = orig.get("kind")
            oid = one_line(orig.get("id"), 120)
            sm = self._sched()
            if kind == "event":
                sm.remove_event(self._need_date(orig.get("date")), oid)
            elif kind == "routine":
                if scope == "one":
                    sm.skip(self._need_date(orig.get("date")), oid)
                else:
                    sm.remove_routine(oid)
            elif kind == "task":
                self.tasks_delete(oid)
            else:
                raise ApiError("Este bloque se borra desde su propio módulo.")
            return {"ok": True}

    def cal_move(self, occ: dict, day: str, start: str, duration: int) -> dict:
        """Drag in the time grid: new day, start and length."""
        with self._lock:
            if not isinstance(occ, dict):
                raise ApiError("Datos inválidos.")
            sm = self._sched()
            kind = occ.get("kind")
            oid = one_line(occ.get("id"), 160)
            old = self._need_date(occ.get("date"))
            new = self._need_date(day)
            start_t = opt_time(start)
            if start_t is None:
                raise ApiError("Hora inválida.")
            dur = clamp_int(duration, 5, 24 * 60, 60)
            if kind == "event":
                if new != old:
                    event = self._find_event(old, oid)
                    if event is None:
                        raise ApiError("Ese evento ya no existe.")
                    sm.remove_event(old, oid)
                    event.update(start=start_t, duration_min=dur)
                    sm.add_event(new, **event)
                else:
                    sm.update_event(old, oid, start=start_t, duration_min=dur)
            elif kind == "routine":
                sm.move(old, oid, start_t, dur)
            elif kind == "task":
                tid = oid[len("task_"):]
                task = sm.task_mgr.get(tid)
                if task is None:
                    raise ApiError("Esa tarea ya no existe.")
                if task.due == old:
                    fields = dict(due=new, due_time=start_t)
                    if task.start == task.due:
                        fields["start"] = new
                else:
                    fields = dict(start=new, start_time=start_t)
                sm.task_mgr.update(tid, **fields)
            else:
                raise ApiError("Este bloque no se puede mover desde el calendario.")
            return {"ok": True}

    def cal_set_done(self, day: str, occurrence_id: str, done: bool) -> dict:
        with self._lock:
            d = self._need_date(day)
            oid = one_line(occurrence_id, 160)
            sm = self._sched()
            if oid.startswith("task_"):
                sm.task_mgr.update(oid[len("task_"):], status=STATUS_DONE if done else STATUS_TODO)
            else:
                sm.set_done(d, oid, bool(done))
            return {"ok": True}

    # ── routines (the weekly template) ────────────────────────────────────

    def cal_routines(self) -> list:
        with self._lock:
            out = []
            for r in self._sched().routines():
                rule = Recurrence.parse(r.get("repeat"))
                if not rule.repeats:
                    rule = Recurrence.from_weekdays(
                        WEEKDAY_KEYS.index(k) for k in r.get("days", []) if k in WEEKDAY_KEYS)
                out.append({
                    "id": r["id"], "title": r.get("title", ""), "start": r.get("start"),
                    "duration_min": r.get("duration_min"), "colour": colour_hex(r.get("colour")),
                    "repeat": rule.to_string(), "describe": rule.describe(),
                    "active_from": r.get("active_from"), "active_until": r.get("active_until"),
                    "notes": r.get("notes", ""), "reminder_min": _int_or_none(r.get("reminder_min")),
                    "links": r.get("links", []),
                })
            return out

    def cal_routine_save(self, routine_id: Optional[str], fields: dict) -> dict:
        with self._lock:
            if not isinstance(fields, dict):
                raise ApiError("Datos inválidos.")
            rule = Recurrence.parse(one_line(fields.get("repeat"), 60))
            if not rule.repeats:
                raise ApiError("Una rutina tiene que repetirse.")
            colour = str(fields.get("colour") or DEFAULT_COLOUR)
            if not _HEX_RE.match(colour):
                raise ApiError("Color inválido.")
            start = opt_time(fields.get("start"))
            dur = fields.get("duration_min")
            a, b = opt_date(fields.get("active_from")), opt_date(fields.get("active_until"))
            rem = fields.get("reminder_min")
            clean = dict(
                title=one_line(fields.get("title"), 200) or "Rutina",
                repeat=rule.to_string(),
                days=[WEEKDAY_KEYS[i] for i in rule.weekdays_mask()],
                start=start,
                duration_min=None if dur in (None, "") else clamp_int(dur, 5, 24 * 60, 60),
                colour=colour.lower(),
                active_from=a.isoformat() if a else None,
                active_until=b.isoformat() if b else None,
                notes=str(fields.get("notes") or "")[:5000],
                reminder_min=None if rem in (None, "") or start is None else clamp_int(rem, 0, 7 * 24 * 60, 0),
            )
            sm = self._sched()
            if routine_id:
                if sm.update_routine(str(routine_id), **clean) is None:
                    raise ApiError("Esa rutina ya no existe.")
            else:
                sm.add_routine(**clean)
            return {"ok": True}

    def cal_routine_remove(self, routine_id: str) -> dict:
        with self._lock:
            if not self._sched().remove_routine(str(routine_id)):
                raise ApiError("Esa rutina ya no existe.")
            return {"ok": True}
