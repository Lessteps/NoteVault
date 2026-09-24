"""Vista General: today across every module, in one call."""

from __future__ import annotations

from datetime import date

from ...core import finance_manager as fin
from ...core.goal_manager import FILTER_ACTIVE
from .common import iso

DAY_KEYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]


class HomeApi:
    """Mixed into NoteVaultApi; relies on its _lock and _mgrs()."""

    def home_overview(self) -> dict:
        with self._lock:
            m = self._mgrs()
            today = date.today()

            habits = m.habits.habits_for_day(today)
            hday = m.habits.get_day(today)
            habit_rows = []
            for h in habits:
                subs = h.get("subtasks") or []
                d, t = hday.subtask_progress(h) if subs else (0, 0)
                habit_rows.append({"id": h["id"], "name": h["name"], "icon": h.get("icon", ""),
                                   "done": bool(hday.completed.get(h["id"], False)), "subs": [d, t]})

            exs = m.exercise.exercises_for_day(DAY_KEYS[today.weekday()])
            log = m.exercise.get_log(today)
            ex_rows = [{"id": e["id"], "name": e.get("name", ""), "series_reps": e.get("series_reps", ""),
                        "how_to": e.get("how_to", ""), "entry": log.entries.get(e["id"], {})} for e in exs]

            tasks = m.tasks.tasks()
            def task_row(t):
                return {"id": t.id, "name": t.name, "status": t.status, "subject": t.subject,
                        "priority": t.priority, "due": iso(t.due), "done": t.is_done}
            due_today = [task_row(t) for t in tasks if t.due == today and not t.is_done]
            overdue = [task_row(t) for t in tasks if t.is_overdue]

            pairs = m.projects.due_on(today)
            issue_rows = [{"project": {"id": p.id, "name": p.name, "colour": p.colour, "done_column": p.done_column,
                                       "first_column": p.columns[0]},
                           "id": i.id, "key": i.key, "title": i.title, "due": iso(i.due), "done": i.is_done}
                          for p, i in pairs]
            active = [{"id": p.id, "name": p.name, "icon": p.icon, "colour": p.colour,
                       "progress": m.projects.progress(p)} for p in m.projects.active_projects()[:5]]

            fm = m.finances
            fm.ensure_defaults()
            day_totals = fin.totals(fm.day(today))
            this, prev = fm.compare_month(today.year, today.month)
            checks = [{"goal": {"id": g["id"], "name": g["name"], "icon": g["icon"], "colour": g["colour"],
                                "suggested_cents": g["suggested_cents"]}, "checked": checked}
                      for g, checked, _ids in fm.due_checks(today)]

            goals = [g for g in m.goals.goals(FILTER_ACTIVE) if g.in_overview]
            goal_pairs = m.goals.items_due_on(today, goals)
            return {
                "today": today.isoformat(),
                "habits": habit_rows,
                "exercise": {"day": DAY_KEYS[today.weekday()], "rows": ex_rows},
                "tasks": {"today": due_today, "overdue": overdue},
                "projects": {"issues": issue_rows, "active": active},
                "finance": {"day": day_totals, "month": this, "prev": prev, "checks": checks},
                "goals": {
                    "list": [{"id": g.id, "name": g.name, "icon": g.icon, "colour": g.colour,
                              "progress": m.goals.progress(g, today)} for g in goals[:6]],
                    "items": [{"goal": {"id": g.id, "name": g.name, "icon": g.icon, "colour": g.colour},
                               "item": {"id": i.id, "name": i.name, "priority": i.priority,
                                        "due_time": i.due_time, "measurable": i.measurable,
                                        "target": i.target, "unit": i.unit},
                               "done": m.goals.is_done_on(i, today)} for g, i in goal_pairs],
                    "any": bool(goals),
                },
            }
