"""Metas: the bridge over core.goal_manager (goals, sub-goal trees, daily checks)."""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any, Optional

from ...core import goal_manager as gm
from ...core import vault_format
from ...core.recurrence import Recurrence
from ..errors import ApiError
from .common import clamp_int, iso, one_line, opt_date, opt_time

_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
FILTERS = (gm.FILTER_ALL, gm.FILTER_ACTIVE, gm.FILTER_PAUSED, gm.FILTER_DONE,
           gm.FILTER_OVERDUE, gm.FILTER_ARCHIVED)


def _num(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        n = float(str(value).replace(",", "."))
    except ValueError:
        raise ApiError(f"Número inválido: {value}") from None
    if n != n or abs(n) > 1e12:
        raise ApiError(f"Número inválido: {value}")
    return int(n) if n.is_integer() else round(n, 4)


def _links(extra: dict) -> tuple:
    notes = extra.get("linked_notes") or []
    if isinstance(notes, str):
        notes = [notes]
    return str(extra.get("linked_folder") or ""), [str(n) for n in notes if isinstance(n, str)]


def goal_dict(g: gm.Goal, today: date) -> dict:
    folder, notes = _links(g.extra or {})
    return {
        "id": g.id, "name": g.name, "area": g.area, "status": g.status,
        "status_colour": gm.GOAL_STATUS_COLOURS.get(g.status, "#8b8b96"), "priority": g.priority,
        "start": iso(g.start), "end": iso(g.end), "icon": g.icon, "colour": g.colour,
        "in_overview": g.in_overview, "order": g.order, "created": iso(g.created),
        "description": g.description, "overdue": g.is_overdue(today), "days_left": g.days_left(today),
        "linked_folder": folder, "linked_notes": notes,
    }


class GoalsApi:
    """Mixed into NoteVaultApi; relies on its _lock, _root and _mgrs()."""

    def _gm(self) -> gm.GoalManager:
        return self._mgrs().goals

    def _need_goal(self, gid: Any) -> gm.Goal:
        g = self._gm().get_goal(str(gid))
        if g is None:
            raise ApiError("Esa meta ya no existe.")
        return g

    def _need_item(self, gid: str, iid: Any) -> gm.GoalItem:
        i = self._gm().get_item(gid, str(iid))
        if i is None:
            raise ApiError("Esa submeta ya no existe.")
        return i

    def _item_dict(self, goal: gm.Goal, i: gm.GoalItem, today: date) -> dict:
        m = self._gm()
        folder, notes = _links(i.extra or {})
        done, total = m.item_counts(i, goal, today)
        return {
            "id": i.id, "goal": i.goal, "parent": i.parent, "name": i.name, "status": i.status,
            "priority": i.priority, "order": i.order, "start": iso(i.start), "due": iso(i.due),
            "due_time": i.due_time, "duration_min": i.duration_min, "repeat": i.repeat,
            "repeat_until": iso(i.repeat_until), "in_calendar": i.in_calendar,
            "reminder_min": i.reminder_min, "target": i.target, "unit": i.unit, "value": i.value,
            "habit_links": list(i.habit_links), "done_at": iso(i.done_at), "created": iso(i.created),
            "notes": i.notes, "category": i.category, "is_priority": i.is_priority,
            "children": [c.id for c in i.children], "is_leaf": i.is_leaf,
            "measurable": i.measurable, "schedule": i.schedule_text(),
            "progress": m.item_progress(i, goal, today), "counts": [done, total],
            "adherence7": m.item_adherence(i, goal, 7, today),
            "adherence30": m.item_adherence(i, goal, 30, today),
            "streak": m.streak(i, goal, today) if i.repeating else 0,
            "done_today": m.is_done_on(i, today) if i.is_leaf else m.branch_done(i, today),
            "value_today": m.value_on(i, today),
            "late": bool(not i.repeating and i.due and i.due < today and i.status != gm.ITEM_DONE),
            "linked_folder": folder, "linked_notes": notes,
        }

    # ── queries ───────────────────────────────────────────────────────────

    def goals_meta(self) -> dict:
        return {"statuses": list(vault_format.GOAL_STATUSES),
                "status_colours": gm.GOAL_STATUS_COLOURS,
                "item_statuses": list(vault_format.GOAL_ITEM_STATUSES),
                "filters": list(FILTERS)}

    def goals_sidebar(self) -> dict:
        """Counters of the Metas sidebar."""
        with self._lock:
            m = self._gm()
            areas = self._mgrs().areas.areas()
            goals = m.goals(gm.FILTER_ALL)
            known = {a["id"] for a in areas}
            return {
                "today": len(m.items_due_on(date.today())),
                "areas": {a["id"]: sum(1 for g in goals if g.area == a["id"]) for a in areas},
                "no_area": sum(1 for g in goals if g.area not in known),
                "all": len(goals),
                "filters": {f: len(m.goals(f)) for f in FILTERS},
            }

    def goals_list(self, filter_key: str = gm.FILTER_ALL, area: str = "*") -> list:
        """Goal cards: numbers, next step, linked habits."""
        with self._lock:
            if filter_key not in FILTERS:
                raise ApiError("Filtro inválido.")
            m = self._gm()
            hm = self._mgrs().habits
            today = date.today()
            areas = {a["id"] for a in self._mgrs().areas.areas()}
            goals = m.goals(filter_key)
            if area == "":
                goals = [g for g in goals if g.area not in areas]
            elif area not in ("*", None):
                goals = [g for g in goals if g.area == area]
            out = []
            for g in goals:
                done, total = m.counts(g, today)
                nxt = m.next_item(g, today)
                links: list = []
                for item in m.leaves(g.id):
                    for hid in item.habit_links:
                        if hid not in links:
                            links.append(hid)
                habits = []
                for hid in links[:4]:
                    h = hm.get_habit(hid)
                    if h:
                        habits.append({"id": hid, "name": h["name"], "icon": h.get("icon", "")})
                d = goal_dict(g, today)
                d.update(progress=m.progress(g, today), counts=[done, total],
                         adherence7=m.adherence(g, 7, today), daily=m.daily_counts(g, 14, today),
                         next=({"name": nxt[0].name, "date": nxt[1].isoformat()} if nxt else None),
                         overdue_items=len(m.overdue(g, today)), habits=habits)
                out.append(d)
            return out

    def goals_get(self, gid: str) -> dict:
        with self._lock:
            m = self._gm()
            g = self._need_goal(gid)
            today = date.today()
            items = m.items(g.id)
            leaves = [i for i in items if i.is_leaf]
            repeating = [i for i in leaves if i.repeating]
            done, total = m.counts(g, today)
            return {
                "goal": goal_dict(g, today),
                "items": [self._item_dict(g, i, today) for i in sorted(items, key=lambda c: (c.order, c.name.lower()))],
                "categories": m.categories(g.id),
                "stats": {
                    "progress": m.progress(g, today), "counts": [done, total],
                    "adherence7": m.adherence(g, 7, today), "adherence30": m.adherence(g, 30, today),
                    "best_streak": max([m.streak(i, g, today) for i in repeating] or [0]),
                    "days_left": g.days_left(today),
                },
                "history": {
                    "days": [(today - timedelta(days=29 - k)).isoformat() for k in range(30)],
                    "daily": m.daily_counts(g, 30, today),
                    "repeating": [{"id": i.id, "name": i.name,
                                   "cells": [v for _d, v in m.history(g, i, 30, today)],
                                   "streak": m.streak(i, g, today),
                                   "progress": m.item_progress(i, g, today)} for i in repeating],
                    "completed": [{"id": i.id, "name": i.name, "done_at": iso(i.done_at)} for i in sorted(
                        [i for i in leaves if not i.repeating and i.done_at], key=lambda i: i.done_at, reverse=True)],
                },
            }

    def goals_today(self, day: str = "", gid: str = "") -> dict:
        """Sub-goals due on a day (overdue ones too when it is today), grouped by area."""
        with self._lock:
            m = self._gm()
            d = opt_date(day) or date.today()
            goals = [self._need_goal(gid)] if gid else None
            pairs = m.items_due_on(d, goals)
            rows = []
            for goal, item in pairs:
                rows.append({
                    "goal": {"id": goal.id, "name": goal.name, "icon": goal.icon, "colour": goal.colour, "area": goal.area},
                    "item": {"id": item.id, "name": item.name, "priority": item.priority, "due": iso(item.due),
                             "due_time": item.due_time, "repeating": item.repeating, "measurable": item.measurable,
                             "target": item.target, "unit": item.unit},
                    "done": m.is_done_on(item, d), "value": m.value_on(item, d),
                    "late": bool(not item.repeating and item.due and item.due < d),
                    "streak": m.streak(item, goal, d) if item.repeating else 0,
                })
            return {"date": d.isoformat(), "rows": rows}

    # ── goals ─────────────────────────────────────────────────────────────

    def _goal_fields(self, fields: Any) -> dict:
        if not isinstance(fields, dict):
            raise ApiError("Datos de meta inválidos.")
        out: dict = {}
        if "name" in fields:
            out["name"] = one_line(fields["name"], 160) or "Nueva meta"
        if "icon" in fields:
            out["icon"] = one_line(fields["icon"], 8)
        if "area" in fields:
            out["area"] = re.sub(r"[^a-z0-9-]", "", str(fields["area"] or ""))[:60]
        if "status" in fields:
            if fields["status"] not in vault_format.GOAL_STATUSES:
                raise ApiError("Estado inválido.")
            out["status"] = fields["status"]
        if "priority" in fields:
            out["priority"] = clamp_int(fields["priority"], 1, 4, 2)
        for k in ("start", "end"):
            if k in fields:
                out[k] = opt_date(fields[k])
        if "colour" in fields:
            c = str(fields["colour"] or "")
            if not _HEX_RE.match(c):
                raise ApiError("Color inválido.")
            out["colour"] = c
        if "in_overview" in fields:
            out["in_overview"] = bool(fields["in_overview"])
        if "order" in fields:
            out["order"] = _num(fields["order"])
        if "description" in fields:
            out["description"] = str(fields["description"] or "")[:200_000]
        extra = {}
        if "linked_folder" in fields:
            extra["linked_folder"] = one_line(fields["linked_folder"], 400)
        if "linked_notes" in fields:
            notes = fields["linked_notes"] or []
            if not isinstance(notes, list):
                raise ApiError("Notas vinculadas inválidas.")
            extra["linked_notes"] = [one_line(n, 400) for n in notes if one_line(n, 400)][:50]
        if extra:
            out["extra"] = extra
        return out

    def goals_create(self, fields: dict, submetas: Optional[list] = None) -> dict:
        """A goal, plus an optional checklist of first sub-goals (one per line)."""
        with self._lock:
            f = self._goal_fields(fields)
            f.pop("extra", None)
            name = f.pop("name", "Nueva meta")
            g = self._gm().create_goal(name, **f)
            for line in (submetas or [])[:200]:
                text = one_line(line, 200)
                if text:
                    self._gm().create_item(g.id, text)
            return goal_dict(g, date.today())

    def goals_update(self, gid: str, fields: dict) -> dict:
        with self._lock:
            g = self._need_goal(gid)
            f = self._goal_fields(fields)
            if "extra" in f:
                merged = dict(g.extra or {})
                merged.update(f.pop("extra"))
                f["extra"] = merged
            self._gm().update_goal(g.id, **f)
            return goal_dict(self._need_goal(g.id), date.today())

    def goals_delete(self, gid: str) -> dict:
        """The goal folder goes to the vault trash."""
        with self._lock:
            g = self._need_goal(gid)
            self._gm().delete_goal(g.id)
            return {"ok": True}

    # ── sub-goals ─────────────────────────────────────────────────────────

    def _item_fields(self, fields: Any) -> dict:
        if not isinstance(fields, dict):
            raise ApiError("Datos de submeta inválidos.")
        out: dict = {}
        if "name" in fields:
            out["name"] = one_line(fields["name"], 200) or "Nueva submeta"
        if "status" in fields:
            if fields["status"] not in vault_format.GOAL_ITEM_STATUSES:
                raise ApiError("Estado inválido.")
            out["status"] = fields["status"]
        if "priority" in fields:
            out["priority"] = clamp_int(fields["priority"], 1, 4, 2)
        if "category" in fields:
            out["category"] = one_line(fields["category"], 60)
        if "is_priority" in fields:
            out["is_priority"] = bool(fields["is_priority"])
        if "repeat" in fields:
            out["repeat"] = Recurrence.parse(one_line(fields["repeat"], 60)).to_string()
        for k in ("start", "due", "repeat_until"):
            if k in fields:
                out[k] = opt_date(fields[k])
        if "due_time" in fields:
            out["due_time"] = opt_time(fields["due_time"]) or ""
        for k in ("duration_min", "reminder_min"):
            if k in fields:
                v = fields[k]
                out[k] = None if v in (None, "") else clamp_int(v, 0, 7 * 24 * 60, 0)
        if "in_calendar" in fields:
            out["in_calendar"] = bool(fields["in_calendar"])
        if "target" in fields:
            t = _num(fields["target"])
            out["target"] = t if t and t > 0 else None
        if "unit" in fields:
            out["unit"] = one_line(fields["unit"], 30)
        if "value" in fields:
            out["value"] = _num(fields["value"])
        if "habit_links" in fields:
            links = fields["habit_links"] or []
            if not isinstance(links, list):
                raise ApiError("Hábitos inválidos.")
            known = {h["id"] for h in self._mgrs().habits.habits()}
            out["habit_links"] = [str(h) for h in links if str(h) in known][:20]
        if "notes" in fields:
            out["notes"] = str(fields["notes"] or "")[:200_000]
        extra = {}
        if "linked_folder" in fields:
            extra["linked_folder"] = one_line(fields["linked_folder"], 400)
        if "linked_notes" in fields:
            notes = fields["linked_notes"] or []
            if not isinstance(notes, list):
                raise ApiError("Notas vinculadas inválidas.")
            extra["linked_notes"] = [one_line(n, 400) for n in notes if one_line(n, 400)][:50]
        if extra:
            out["extra"] = extra
        return out

    def goals_item_create(self, gid: str, name: str, parent: str = "", fields: Optional[dict] = None,
                          subtasks: Optional[list] = None) -> dict:
        with self._lock:
            g = self._need_goal(gid)
            if parent:
                self._need_item(g.id, parent)
            f = self._item_fields(fields or {})
            f.pop("name", None)
            f.pop("extra", None)
            item = self._gm().create_item(g.id, one_line(name, 200) or "Nueva submeta", parent=parent or "", **f)
            for line in (subtasks or [])[:200]:
                text = one_line(line, 200)
                if text:
                    self._gm().create_item(g.id, text, parent=item.id)
            return self._item_dict(g, self._need_item(g.id, item.id), date.today())

    def goals_item_update(self, gid: str, iid: str, fields: dict) -> dict:
        with self._lock:
            g = self._need_goal(gid)
            item = self._need_item(g.id, iid)
            f = self._item_fields(fields)
            if "extra" in f:
                merged = dict(item.extra or {})
                merged.update(f.pop("extra"))
                f["extra"] = merged
            self._gm().update_item(g.id, item.id, **f)
            return self._item_dict(g, self._need_item(g.id, item.id), date.today())

    def goals_item_delete(self, gid: str, iid: str) -> dict:
        with self._lock:
            g = self._need_goal(gid)
            self._need_item(g.id, iid)
            self._gm().delete_item(g.id, str(iid))
            return {"ok": True}

    def goals_item_move(self, gid: str, iid: str, parent: str, index: int) -> dict:
        with self._lock:
            g = self._need_goal(gid)
            self._need_item(g.id, iid)
            if parent:
                self._need_item(g.id, parent)
            self._gm().move_item(g.id, str(iid), parent or "", clamp_int(index, 0, 10 ** 6, 0))
            return {"ok": True}

    def goals_item_indent(self, gid: str, iid: str, direction: int) -> dict:
        with self._lock:
            g = self._need_goal(gid)
            self._need_item(g.id, iid)
            self._gm().indent(g.id, str(iid), 1 if direction > 0 else -1)
            return {"ok": True}

    def goals_set_done(self, gid: str, iid: str, day: str, done: bool, value: Any = None) -> dict:
        """Tick a sub-goal on a day (or set its measured value); linked habits follow."""
        with self._lock:
            g = self._need_goal(gid)
            self._need_item(g.id, iid)
            d = opt_date(day) or date.today()
            self._gm().set_done(g.id, str(iid), d, bool(done), value=_num(value))
            return {"ok": True}
