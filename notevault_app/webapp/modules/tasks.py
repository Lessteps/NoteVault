"""Tareas: the bridge over core.task_manager.TaskManager."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from ...core.recurrence import Recurrence
from ...core.task_manager import (
    PRIORITY_MAX, STATUS_COLORS, STATUS_DONE, STATUSES, Task, TaskManager,
)
from ..errors import ApiError
from .common import (
    body_text, clamp_int, iso, one_line, opt_date, opt_datetime, opt_time,
)

MAX_RANGE_DAYS = 62


def task_dict(t: Task) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "created": iso(t.created),
        "start": iso(t.start),
        "start_time": t.start_time,
        "due": iso(t.due),
        "due_time": t.due_time,
        "status": t.status,
        "subject": t.subject,
        "priority": t.priority,
        "reminder": iso(t.reminder),
        "reminder_done": t.reminder_done,
        "body": t.body,
        "repeat": t.repeat,
        "repeat_until": iso(t.repeat_until),
        "repeat_label": t.rule.describe(),
        "overdue": t.is_overdue,
        "done": t.is_done,
    }


class TasksApi:
    """Mixed into NoteVaultApi; relies on its _lock and _root."""

    def _task_mgr(self) -> TaskManager:
        return self._mgrs().tasks

    @staticmethod
    def _task_fields(fields: Any) -> dict:
        if not isinstance(fields, dict):
            raise ApiError("Datos de tarea inválidos.")
        out: dict = {}
        if "name" in fields:
            out["name"] = one_line(fields["name"], 200) or "Sin título"
        if "subject" in fields:
            out["subject"] = one_line(fields["subject"], 80)
        if "status" in fields:
            if fields["status"] not in STATUSES:
                raise ApiError("Estado inválido.")
            out["status"] = fields["status"]
        if "priority" in fields:
            out["priority"] = clamp_int(fields["priority"], 1, PRIORITY_MAX, 1)
        for key in ("start", "due", "repeat_until"):
            if key in fields:
                out[key] = opt_date(fields[key])
        for key in ("start_time", "due_time"):
            if key in fields:
                out[key] = opt_time(fields[key])
        if "reminder" in fields:
            out["reminder"] = opt_datetime(fields["reminder"])
            out["reminder_done"] = False
        if "reminder_done" in fields:
            out["reminder_done"] = bool(fields["reminder_done"])
        if "repeat" in fields:
            out["repeat"] = Recurrence.parse(one_line(fields["repeat"], 60)).to_string()
        if "body" in fields:
            out["body"] = body_text(fields["body"])
        return out

    # ── queries ───────────────────────────────────────────────────────────

    def tasks_meta(self) -> dict:
        with self._lock:
            return {
                "statuses": list(STATUSES),
                "status_colors": dict(STATUS_COLORS),
                "done_status": STATUS_DONE,
                "priority_max": PRIORITY_MAX,
                "subjects": self._task_mgr().subjects(),
            }

    def tasks_list(self) -> list:
        with self._lock:
            return [task_dict(t) for t in self._task_mgr().tasks()]

    def tasks_in_range(self, first: str, last: str) -> list:
        """Every (date, task id) in [first, last], repeats included."""
        with self._lock:
            a, b = opt_date(first), opt_date(last)
            if a is None or b is None or b < a:
                raise ApiError("Rango de fechas inválido.")
            if (b - a).days > MAX_RANGE_DAYS:
                raise ApiError("El rango es demasiado largo.")
            out = []
            for t in self._task_mgr().tasks():
                d = a
                while d <= b:
                    if t.occurs_on(d):
                        out.append({"date": d.isoformat(), "id": t.id})
                    d += timedelta(days=1)
            return out

    def tasks_due_reminders(self) -> list:
        """Reminders whose time has come and that were not shown yet."""
        with self._lock:
            return [task_dict(t) for t in self._task_mgr().due_reminders(datetime.now())]

    # ── mutations ─────────────────────────────────────────────────────────

    def tasks_create(self, fields: dict | None = None) -> dict:
        with self._lock:
            clean = self._task_fields(fields or {})
            name = clean.pop("name", "Nueva tarea")
            clean.setdefault("due", date.today())
            return task_dict(self._task_mgr().create(name, **clean))

    def tasks_update(self, task_id: str, fields: dict) -> dict:
        with self._lock:
            clean = self._task_fields(fields)
            task = self._task_mgr().update(one_line(task_id, 80), **clean)
            if task is None:
                raise ApiError("La tarea ya no existe.")
            return task_dict(task)

    def tasks_delete(self, task_id: str) -> dict:
        """Moves the task file to the vault's .trash (recoverable)."""
        with self._lock:
            mgr = self._task_mgr()
            task = mgr.get(one_line(task_id, 80))
            if task is None:
                raise ApiError("La tarea ya no existe.")
            path = mgr._path(task.id)
            trash = self._root / ".trash"
            trash.mkdir(exist_ok=True)
            dest = trash / path.name
            n = 1
            while dest.exists():
                dest = trash / f"{path.stem}_{n}{path.suffix}"
                n += 1
            path.rename(dest)
            mgr._cache = None
            return {"ok": True}

    def tasks_mark_reminder_shown(self, task_id: str) -> dict:
        with self._lock:
            self._task_mgr().mark_reminder_shown(one_line(task_id, 80))
            return {"ok": True}
