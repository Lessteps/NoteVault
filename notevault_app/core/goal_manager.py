"""
Metas: goals divided into sub-goals at any depth, grouped by area.

    .notevault/metas/
    ├── <goal-id>/goal.md                  the goal (typed frontmatter + description)
    ├── <goal-id>/items/<item-id>.md       one sub-goal per file, `parent` makes the tree
    └── registro/AAAA/MM/AAAA-MM-DD.json   checks of repeating sub-goals for that day

Registro:
    {"items": {"<goal>/<item>": {"done": true, "value": 3.5, "at": "21:40"}},
     "habit_marks": {"<habit-id>": ["<goal>/<item>", ...]}}

`habit_marks` records which habit checks Metas made, so unticking a sub-goal
removes only those and never a check the user made by hand.

A goal is never deleted when its end date passes; it only shows "Vencida".
"""

from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from . import store, vault_format
from .recurrence import Recurrence

STATUS_ACTIVE, STATUS_PAUSED, STATUS_DONE, STATUS_ARCHIVED = vault_format.GOAL_STATUSES
ITEM_TODO, ITEM_DOING, ITEM_DONE = vault_format.GOAL_ITEM_STATUSES

GOAL_STATUS_COLOURS = {
    STATUS_ACTIVE: "#2383e2", STATUS_PAUSED: "#ff9632",
    STATUS_DONE: "#4ade80", STATUS_ARCHIVED: "#8b8b96",
}

FILTER_ACTIVE, FILTER_PAUSED, FILTER_DONE, FILTER_OVERDUE, FILTER_ARCHIVED, FILTER_ALL = (
    "activas", "pausa", "completadas", "vencidas", "archivadas", "todas")

LOG_BUCKET = "registro"


def _today() -> date:
    return date.today()


class Goal:
    def __init__(self, values: dict, extra: Optional[dict] = None, description: str = ""):
        self.id: str = values.get("id", "")
        self.name: str = values.get("name") or "Nueva meta"
        self.area: str = values.get("area") or ""
        self.status: str = values.get("status") or STATUS_ACTIVE
        self.priority: int = max(1, min(4, values.get("priority") or 2))
        self.start: Optional[date] = values.get("start")
        self.end: Optional[date] = values.get("end")
        self.icon: str = values.get("icon") or ""
        self.colour: str = values.get("colour") or "#3f51b5"
        self.in_overview: bool = bool(values.get("in_overview"))
        self.order = values.get("order")
        self.created: Optional[date] = values.get("created")
        self.description = description
        self.extra = dict(extra or {})

    def values(self) -> dict:
        return {k: getattr(self, k) for k, _t in vault_format.GOAL_FIELDS}

    def is_overdue(self, today: Optional[date] = None) -> bool:
        today = today or _today()
        return bool(self.end and self.end < today
                    and self.status not in (STATUS_DONE, STATUS_ARCHIVED))

    def days_left(self, today: Optional[date] = None) -> Optional[int]:
        return (self.end - (today or _today())).days if self.end else None


class GoalItem:
    def __init__(self, values: dict, extra: Optional[dict] = None, notes: str = ""):
        self.id: str = values.get("id", "")
        self.goal: str = values.get("goal", "")
        self.parent: str = values.get("parent") or ""
        self.name: str = values.get("name") or "Nueva submeta"
        self.status: str = values.get("status") or ITEM_TODO
        self.priority: int = max(1, min(4, values.get("priority") or 2))
        self.order = values.get("order") if values.get("order") is not None else 0
        self.start: Optional[date] = values.get("start")
        self.due: Optional[date] = values.get("due")
        self.due_time: str = values.get("due_time") or ""
        self.duration_min: Optional[int] = values.get("duration_min")
        self.repeat: str = Recurrence.parse(values.get("repeat")).to_string()
        self.repeat_until: Optional[date] = values.get("repeat_until")
        self.in_calendar: bool = bool(values.get("in_calendar"))
        self.reminder_min: Optional[int] = values.get("reminder_min")
        self.target = values.get("target")
        self.unit: str = values.get("unit") or ""
        self.value = values.get("value")
        self.habit_links: list = list(values.get("habit_links") or [])
        self.done_at: Optional[date] = values.get("done_at")
        self.created: Optional[date] = values.get("created")
        self.notes = notes
        self.extra = dict(extra or {})
        self.children: list = []

    @property
    def category(self) -> str:
        return str(self.extra.get("category") or "").strip()

    @category.setter
    def category(self, val: str):
        v = (val or "").strip()
        if v:
            self.extra["category"] = v
        else:
            self.extra.pop("category", None)

    @property
    def is_priority(self) -> bool:
        if "is_priority" in self.extra:
            return bool(self.extra["is_priority"])
        return self.priority >= 3 or bool(self.children)

    @is_priority.setter
    def is_priority(self, val: bool):
        self.extra["is_priority"] = bool(val)

    def values(self) -> dict:
        return {k: getattr(self, k) for k, _t in vault_format.GOAL_ITEM_FIELDS}

    @property
    def key(self) -> str:
        return f"{self.goal}/{self.id}"

    @property
    def rule(self) -> Recurrence:
        return Recurrence.parse(self.repeat)

    @property
    def repeating(self) -> bool:
        return bool(self.repeat)

    @property
    def measurable(self) -> bool:
        return isinstance(self.target, (int, float)) and not isinstance(self.target, bool) \
            and self.target > 0

    @property
    def is_leaf(self) -> bool:
        return not self.children

    def anchor(self, goal: Optional[Goal] = None) -> Optional[date]:
        return self.start or (goal.start if goal else None) or self.created

    def until(self, goal: Optional[Goal] = None) -> Optional[date]:
        ends = [d for d in (self.repeat_until, goal.end if goal else None) if d]
        return min(ends) if ends else None

    def occurs_on(self, d: date, goal: Optional[Goal] = None) -> bool:
        if not self.repeating:
            return self.due == d
        return self.rule.occurs_on(d, self.anchor(goal), self.until(goal))

    def schedule_text(self) -> str:
        parts = []
        if self.repeating:
            parts.append(self.rule.describe())
        elif self.due:
            parts.append(self.due.strftime("%d/%m/%Y"))
        if self.due_time:
            parts.append(self.due_time)
        return " · ".join(parts)


class GoalManager:
    def __init__(self, vault_root: Path, habit_mgr=None, area_mgr=None):
        self.vault_root = Path(vault_root)
        self.dir = self.vault_root / vault_format.LAYOUT["goals_dir"]
        self.habit_mgr = habit_mgr
        self.area_mgr = area_mgr
        self._goals_cache = None
        self._goals_stamp = None
        self._items_cache: dict = {}
        self._logs = store.MtimeCache()

    # ── Paths ─────────────────────────────────────────────────────────────

    def goal_path(self, gid: str) -> Path:
        return self.vault_root / vault_format.LAYOUT["goal"].format(id=gid)

    def items_dir(self, gid: str) -> Path:
        return self.vault_root / vault_format.LAYOUT["goal_items_dir"].format(id=gid)

    def item_path(self, gid: str, iid: str) -> Path:
        return self.vault_root / vault_format.LAYOUT["goal_item"].format(goal=gid, id=iid)

    def log_path(self, d: date) -> Path:
        return self.vault_root / vault_format.LAYOUT["goal_log_day"].format(
            year=d.year, month=d.month, date=d.isoformat())

    # ── Goals ─────────────────────────────────────────────────────────────

    def _stamp(self, folder: Path, pattern: str):
        try:
            return tuple(sorted((p.as_posix(), p.stat().st_mtime_ns) for p in folder.glob(pattern)))
        except OSError:
            return ()

    def goals(self, filter_key: str = FILTER_ALL, area: Optional[str] = None,
              today: Optional[date] = None) -> list:
        stamp = self._stamp(self.dir, "*/goal.md")
        if self._goals_cache is None or stamp != self._goals_stamp:
            out = []
            for rel, _m in stamp:
                path = Path(rel)
                if vault_format.is_sync_conflict(path.parent.name):
                    continue
                parsed = store.read_doc(path, vault_format.GOAL_FIELDS)
                if parsed is None:
                    continue
                values, extra, body = parsed
                values.setdefault("id", path.parent.name)
                out.append(Goal(values, extra, body))
            self._goals_cache, self._goals_stamp = out, stamp
        today = today or _today()
        goals = list(self._goals_cache)
        if area is not None and area != "*":
            goals = [g for g in goals if g.area == area]
        if filter_key == FILTER_ACTIVE:
            goals = [g for g in goals if g.status == STATUS_ACTIVE]
        elif filter_key == FILTER_PAUSED:
            goals = [g for g in goals if g.status == STATUS_PAUSED]
        elif filter_key == FILTER_DONE:
            goals = [g for g in goals if g.status == STATUS_DONE]
        elif filter_key == FILTER_OVERDUE:
            goals = [g for g in goals if g.is_overdue(today)]
        elif filter_key == FILTER_ARCHIVED:
            goals = [g for g in goals if g.status == STATUS_ARCHIVED]
        elif filter_key == FILTER_ALL:
            goals = [g for g in goals if g.status != STATUS_ARCHIVED]
        goals.sort(key=lambda g: (-g.priority, g.end or date.max, g.name.lower()))
        return goals

    def get_goal(self, gid: str) -> Optional[Goal]:
        return next((g for g in self._all_goals() if g.id == gid), None)

    def _all_goals(self) -> list:
        self.goals()
        return list(self._goals_cache or [])

    def save_goal(self, goal: Goal):
        store.write_text(self.goal_path(goal.id),
                         store.dump_doc(vault_format.GOAL_FIELDS, goal.values(), goal.extra,
                                        goal.description))
        self._goals_cache = None

    def create_goal(self, name: str, **fields) -> Goal:
        today = _today()
        goal = Goal({"id": store.new_id("g"), "name": name.strip() or "Nueva meta",
                     "status": STATUS_ACTIVE, "priority": 2, "start": today,
                     "created": today, "in_overview": True})
        self._apply(goal, fields, vault_format.GOAL_FIELDS, "description")
        self.save_goal(goal)
        return goal

    def update_goal(self, gid: str, **fields) -> Optional[Goal]:
        goal = self.get_goal(gid)
        if goal is None:
            return None
        self._apply(goal, fields, vault_format.GOAL_FIELDS, "description")
        self.save_goal(goal)
        return goal

    def delete_goal(self, gid: str):
        folder = self.goal_path(gid).parent
        store.to_trash(self.vault_root, folder, "metas")
        self._goals_cache = None
        self._items_cache.pop(gid, None)

    @staticmethod
    def _apply(obj, fields: dict, contract, text_key: str):
        keys = {k for k, _t in contract} - {"id"}
        for k, v in fields.items():
            if k in keys:
                if k == "priority" and v is not None:
                    v = max(1, min(4, int(v)))
                if k == "repeat":
                    v = Recurrence.parse(v).to_string()
                if k == "habit_links":
                    v = store.split_list(v)
                setattr(obj, k, v)
            elif k == text_key:
                setattr(obj, "description" if text_key == "description" else "notes", v or "")
            elif k in ("category", "is_priority"):
                setattr(obj, k, v)

    # ── Items ─────────────────────────────────────────────────────────────

    def items(self, gid: str) -> list:
        """Flat list of the goal's sub-goals, with .children linked and sorted."""
        folder = self.items_dir(gid)
        stamp = self._stamp(folder, "*.md")
        hit = self._items_cache.get(gid)
        if hit is None or hit[0] != stamp:
            items = []
            for rel, _m in stamp:
                path = Path(rel)
                if vault_format.is_sync_conflict(path.name):
                    continue
                parsed = store.read_doc(path, vault_format.GOAL_ITEM_FIELDS)
                if parsed is None:
                    continue
                values, extra, body = parsed
                values.setdefault("id", path.stem)
                values["goal"] = gid
                items.append(GoalItem(values, extra, body))
            self._link(items)
            hit = (stamp, items)
            self._items_cache[gid] = hit
        return list(hit[1])

    @staticmethod
    def _link(items: list):
        by_id = {i.id: i for i in items}
        for i in items:
            i.children = []
        for i in items:
            parent = by_id.get(i.parent)
            if parent is not None and parent is not i and not GoalManager._is_ancestor(i, parent, by_id):
                parent.children.append(i)
            elif i.parent:
                i.parent = ""       # orphan or cycle: shown at the top level
        for i in items:
            i.children.sort(key=lambda c: (c.order, c.name.lower()))

    @staticmethod
    def _is_ancestor(item, candidate, by_id) -> bool:
        seen, cur = set(), candidate
        while cur is not None and cur.id not in seen:
            if cur.id == item.id:
                return True
            seen.add(cur.id)
            cur = by_id.get(cur.parent)
        return False

    def tree(self, gid: str) -> list:
        return sorted([i for i in self.items(gid) if not i.parent],
                      key=lambda c: (c.order, c.name.lower()))

    def get_item(self, gid: str, iid: str) -> Optional[GoalItem]:
        return next((i for i in self.items(gid) if i.id == iid), None)

    def save_item(self, item: GoalItem):
        store.write_text(self.item_path(item.goal, item.id),
                         store.dump_doc(vault_format.GOAL_ITEM_FIELDS, item.values(),
                                        item.extra, item.notes))
        self._items_cache.pop(item.goal, None)

    def create_item(self, gid: str, name: str, parent: str = "", **fields) -> GoalItem:
        siblings = [i for i in self.items(gid) if i.parent == (parent or "")]
        order = max([s.order for s in siblings] or [0]) + 1
        item = GoalItem({"id": store.new_id("i"), "goal": gid, "parent": parent or "",
                         "name": name.strip() or "Nueva submeta", "status": ITEM_TODO,
                         "priority": 2, "order": order, "created": _today()})
        self._apply(item, fields, vault_format.GOAL_ITEM_FIELDS, "notes")
        self.save_item(item)
        return item

    def update_item(self, gid: str, iid: str, **fields) -> Optional[GoalItem]:
        item = self.get_item(gid, iid)
        if item is None:
            return None
        self._apply(item, fields, vault_format.GOAL_ITEM_FIELDS, "notes")
        if item.status == ITEM_DONE and not item.done_at and not item.repeating:
            item.done_at = _today()
        if item.status != ITEM_DONE:
            item.done_at = None
        self.save_item(item)
        return item

    def move_item(self, gid: str, iid: str, new_parent: Optional[str], index: int):
        items = self.items(gid)
        by_id = {i.id: i for i in items}
        item = by_id.get(iid)
        if item is None:
            return
        new_parent = new_parent or ""
        if new_parent and (new_parent == iid or self._is_ancestor(item, by_id.get(new_parent), by_id)):
            return          # cannot move a node inside its own subtree
        siblings = sorted([i for i in items if i.parent == new_parent and i.id != iid],
                          key=lambda c: (c.order, c.name.lower()))
        index = max(0, min(index, len(siblings)))
        before = siblings[index - 1].order if index > 0 else None
        after = siblings[index].order if index < len(siblings) else None
        if before is None and after is None:
            order = 1
        elif before is None:
            order = after - 1
        elif after is None:
            order = before + 1
        else:
            order = (before + after) / 2
        if before is not None and after is not None and not (before < order < after):
            for n, s in enumerate(siblings[:index] + [item] + siblings[index:], start=1):
                if s is not item and s.order != n:
                    s.order = n
                    self.save_item(s)
            order = index + 1
        item.parent = new_parent
        item.order = int(order) if float(order).is_integer() else round(order, 6)
        self.save_item(item)

    def indent(self, gid: str, iid: str, direction: int):
        items = self.items(gid)
        by_id = {i.id: i for i in items}
        item = by_id.get(iid)
        if item is None:
            return
        siblings = sorted([i for i in items if i.parent == item.parent],
                          key=lambda c: (c.order, c.name.lower()))
        pos = siblings.index(item)
        if direction > 0:
            if pos == 0:
                return
            new_parent = siblings[pos - 1]
            self.move_item(gid, iid, new_parent.id, len(new_parent.children))
        else:
            if not item.parent:
                return
            parent = by_id[item.parent]
            grand = [i for i in items if i.parent == parent.parent]
            grand.sort(key=lambda c: (c.order, c.name.lower()))
            self.move_item(gid, iid, parent.parent, grand.index(parent) + 1)

    def descendants(self, item: GoalItem) -> list:
        current = self.get_item(item.goal, item.id) if (item and getattr(item, "goal", None)) else item
        current = current or item
        out, stack = [], list(current.children)
        while stack:
            cur = stack.pop()
            out.append(cur)
            stack.extend(cur.children)
        return out

    def delete_item(self, gid: str, iid: str):
        item = self.get_item(gid, iid)
        if item is None:
            return
        for node in [item] + self.descendants(item):
            store.to_trash(self.vault_root, self.item_path(gid, node.id), f"metas/{gid}")
        self._items_cache.pop(gid, None)

    # ── Registro ──────────────────────────────────────────────────────────

    def log(self, d: date) -> dict:
        def load(path):
            data = store.load_json(path, {}) if path else {}
            data = data if isinstance(data, dict) else {}
            items = data.get("items") if isinstance(data.get("items"), dict) else {}
            marks = data.get("habit_marks") if isinstance(data.get("habit_marks"), dict) else {}
            return {"items": items, "habit_marks": {k: list(v) for k, v in marks.items()
                                                    if isinstance(v, list)}}
        data = self._logs.get(self.log_path(d), load)
        return {"items": {k: dict(v) for k, v in data["items"].items() if isinstance(v, dict)},
                "habit_marks": {k: list(v) for k, v in data["habit_marks"].items()}}

    def _save_log(self, d: date, data: dict):
        path = self.log_path(d)
        items = {}
        for k in sorted(data["items"]):
            e = data["items"][k]
            # Fixed key order so every client writes the same bytes.
            items[k] = {key: e[key] for key in ("done", "value", "at") if key in e}
            items[k].update({key: v for key, v in e.items() if key not in items[k]})
        marks = {k: sorted(v) for k, v in sorted(data["habit_marks"].items()) if v}
        if not items and not marks:
            if path.exists():
                path.unlink()
            self._logs.forget(path)
            return
        store.write_json(path, {"items": items, "habit_marks": marks})
        self._logs.forget(path)

    def entry(self, item: GoalItem, d: date) -> dict:
        return self.log(d)["items"].get(item.key, {})

    def is_done_on(self, item: GoalItem, d: date) -> bool:
        """Leaves only; a branch is computed by `branch_done`."""
        if item.repeating:
            e = self.entry(item, d)
            if item.measurable and isinstance(e.get("value"), (int, float)):
                return e["value"] >= item.target
            return bool(e.get("done"))
        if item.measurable and isinstance(item.value, (int, float)):
            return item.value >= item.target or item.status == ITEM_DONE
        return item.status == ITEM_DONE

    def value_on(self, item: GoalItem, d: date):
        if item.repeating:
            return self.entry(item, d).get("value")
        return item.value

    def branch_done(self, item: GoalItem, d: Optional[date] = None) -> bool:
        if item.is_leaf:
            return self.is_done_on(item, d or _today())
        return all(self.branch_done(c, d) for c in item.children)

    def set_done(self, gid, iid=None, d: Optional[date] = None, done: Optional[bool] = None, value=None,
                 at: Optional[str] = None) -> Optional[GoalItem]:
        if isinstance(gid, GoalItem):
            item_obj = gid
            return self.set_done(item_obj.goal, item_obj.id, iid, d, value=value, at=at)
        item = self.get_item(gid, iid)
        if item is None:
            return None
        if not item.is_leaf:
            for desc in self.descendants(item):
                if desc.is_leaf:
                    self.set_done(gid, desc.id, d, done, value=value, at=at)
            item.status = ITEM_DONE if done else ITEM_TODO
            item.done_at = d if done else None
            self.save_item(item)
            return item
        if item.measurable and value is not None:
            done = value >= item.target

        if item.repeating:
            data = self.log(d)
            if done or value is not None:
                entry = data["items"].get(item.key, {})
                entry["done"] = bool(done)
                if value is not None:
                    entry["value"] = value
                entry["at"] = at or datetime.now().strftime("%H:%M")
                data["items"][item.key] = entry
            else:
                data["items"].pop(item.key, None)
            self._save_log(d, data)
        else:
            if value is not None:
                item.value = value
            item.status = ITEM_DONE if done else (ITEM_DOING if value else ITEM_TODO)
            item.done_at = d if done else None
            self.save_item(item)
        self._sync_habits(item, d, done)
        return item

    def _sync_habits(self, item: GoalItem, d: date, done: bool):
        if self.habit_mgr is None or not item.habit_links:
            return
        from .habit_manager import habit_active_on
        data = self.log(d)
        marks = data["habit_marks"]
        day = self.habit_mgr.get_day(d)
        changed_day = False
        for hid in item.habit_links:
            habit = self.habit_mgr.get_habit(hid)
            if habit is None or not habit_active_on(habit, d):
                continue
            sources = marks.get(hid, [])
            ticked = bool(day.completed.get(hid, False))
            if done:
                if not ticked:
                    day.completed[hid] = True
                    changed_day = True
                    sources = [item.key]
                elif sources and item.key not in sources:
                    sources.append(item.key)
                # ticked with no sources: the user ticked it; Metas leaves it alone.
            else:
                if item.key in sources:
                    sources.remove(item.key)
                    if not sources and ticked:
                        day.completed[hid] = False
                        changed_day = True
            marks[hid] = sources
        if changed_day:
            self.habit_mgr.save_day(day)
        self._save_log(d, data)

    # ── Queries ───────────────────────────────────────────────────────────

    def leaves(self, gid: str) -> list:
        return [i for i in self.items(gid) if i.is_leaf]

    def items_due_on(self, d: date, goals: Optional[list] = None) -> list:
        """[(goal, item)] leaves that are due on d: once-only ones due that day
        (plus overdue ones when d is today) and repeating ones whose rule lands on d."""
        today = _today()
        out = []
        for goal in goals if goals is not None else self.goals(FILTER_ACTIVE):
            for item in self.leaves(goal.id):
                if item.repeating:
                    if item.occurs_on(d, goal):
                        out.append((goal, item))
                elif item.due == d or (d == today and item.due and item.due < today
                                       and item.status != ITEM_DONE):
                    out.append((goal, item))
        out.sort(key=lambda gi: (gi[1].due_time or "99", -gi[1].priority, gi[1].name.lower()))
        return out

    def scheduled_days(self, item: GoalItem, goal: Goal, last: date) -> list:
        anchor = item.anchor(goal)
        if anchor is None:
            return []
        until = item.until(goal)
        stop = min(last, until) if until else last
        out, d = [], anchor
        rule = item.rule
        while d <= stop:
            if rule.occurs_on(d, anchor, until):
                out.append(d)
            d += timedelta(days=1)
        return out

    def item_progress(self, item: GoalItem, goal: Goal, today: Optional[date] = None) -> float:
        today = today or _today()
        current = self.get_item(item.goal, item.id) if (item and getattr(item, "goal", None)) else item
        current = current or item
        if not current.is_leaf:
            return sum(self.item_progress(c, goal, today) for c in current.children) / len(current.children)
        if current.repeating:
            days = self.scheduled_days(current, goal, today)
            if not days:
                return 0.0
            return sum(1 for d in days if self.is_done_on(current, d)) / len(days)
        if self.is_done_on(current, today):
            return 1.0
        if current.measurable and isinstance(current.value, (int, float)):
            return max(0.0, min(1.0, current.value / current.target))
        return 0.0

    def progress(self, goal: Goal, today: Optional[date] = None) -> float:
        roots = self.tree(goal.id)
        if not roots:
            return 1.0 if goal.status == STATUS_DONE else 0.0
        return sum(self.item_progress(r, goal, today) for r in roots) / len(roots)

    def counts(self, goal: Goal, today: Optional[date] = None) -> tuple:
        """(done leaves, total leaves); a repeating leaf counts as done when today is."""
        today = today or _today()
        leaves = self.leaves(goal.id)
        done = 0
        for item in leaves:
            if item.repeating:
                done += 1 if (item.occurs_on(today, goal) and self.is_done_on(item, today)) \
                    or self.item_progress(item, goal, today) >= 1.0 else 0
            else:
                done += 1 if self.is_done_on(item, today) else 0
        return done, len(leaves)

    def item_leaves(self, item: GoalItem) -> list:
        """Leaf sub-goals inside this item (or itself if it is a leaf)."""
        current = self.get_item(item.goal, item.id) if (item and getattr(item, "goal", None)) else item
        current = current or item
        if current.is_leaf:
            return [current]
        return [i for i in self.descendants(current) if i.is_leaf]

    def item_counts(self, item: GoalItem, goal: Goal, today: Optional[date] = None) -> tuple:
        """(done leaves, total leaves) for this item's children or descendants."""
        today = today or _today()
        current = self.get_item(item.goal, item.id) if (item and getattr(item, "goal", None)) else item
        current = current or item
        leaves = [i for i in self.descendants(current) if i.is_leaf]
        if not leaves:
            leaves = [current]
        done = 0
        for leaf in leaves:
            if leaf.repeating:
                done += 1 if (leaf.occurs_on(today, goal) and self.is_done_on(leaf, today)) \
                    or self.item_progress(leaf, goal, today) >= 1.0 else 0
            else:
                done += 1 if self.is_done_on(leaf, today) else 0
        return done, len(leaves)

    def item_adherence(self, item: GoalItem, goal: Goal, days: int = 7, today: Optional[date] = None) -> Optional[float]:
        """Adherence of repeating checks inside this item (or itself) in the last `days` days."""
        today = today or _today()
        first = today - timedelta(days=days - 1)
        scheduled = done = 0
        leaves = [i for i in self.descendants(item) if i.is_leaf]
        if not leaves:
            leaves = [item]
        for leaf in leaves:
            if not leaf.repeating:
                continue
            for d in self.scheduled_days(leaf, goal, today):
                if d >= first:
                    scheduled += 1
                    done += 1 if self.is_done_on(leaf, d) else 0
        return done / scheduled if scheduled else None

    def categories(self, gid: str) -> list:
        """Sorted list of unique category names present in this goal's sub-goals."""
        cats = set()
        for item in self.items(gid):
            if item.category:
                cats.add(item.category)
        return sorted(cats, key=lambda s: s.lower())

    def streak(self, item: GoalItem, goal: Goal, today: Optional[date] = None) -> int:
        today = today or _today()
        days = self.scheduled_days(item, goal, today)
        if not days:
            return 0
        if days[-1] == today and not self.is_done_on(item, today):
            days = days[:-1]
        n = 0
        for d in reversed(days):
            if not self.is_done_on(item, d):
                break
            n += 1
        return n

    def adherence(self, goal: Goal, days: int = 7, today: Optional[date] = None) -> Optional[float]:
        """Share of scheduled repeating checks done in the last `days` days (today included)."""
        today = today or _today()
        first = today - timedelta(days=days - 1)
        scheduled = done = 0
        for item in self.leaves(goal.id):
            if not item.repeating:
                continue
            for d in self.scheduled_days(item, goal, today):
                if d >= first:
                    scheduled += 1
                    done += 1 if self.is_done_on(item, d) else 0
        return done / scheduled if scheduled else None

    def completed_on(self, goal: Goal, d: date) -> int:
        n = 0
        for item in self.leaves(goal.id):
            if item.repeating:
                n += 1 if item.occurs_on(d, goal) and self.is_done_on(item, d) else 0
            elif item.done_at == d:
                n += 1
        return n

    def daily_counts(self, goal: Goal, days: int = 14, today: Optional[date] = None) -> list:
        today = today or _today()
        return [self.completed_on(goal, today - timedelta(days=days - 1 - i)) for i in range(days)]

    def completed_between(self, goal: Goal, first: date, last: date) -> int:
        n, d = 0, first
        while d <= last:
            n += self.completed_on(goal, d)
            d += timedelta(days=1)
        return n

    def overdue(self, goal: Goal, today: Optional[date] = None) -> list:
        today = today or _today()
        return [i for i in self.leaves(goal.id) if not i.repeating and i.due and i.due < today
                and i.status != ITEM_DONE]

    def next_item(self, goal: Goal, today: Optional[date] = None):
        """(item, date) of the next pending leaf, or None."""
        today = today or _today()
        best = None
        for item in self.leaves(goal.id):
            if item.repeating:
                d = today if item.occurs_on(today, goal) and not self.is_done_on(item, today) \
                    else item.rule.next_after(today, item.anchor(goal), item.until(goal))
            elif item.status != ITEM_DONE:
                d = item.due
            else:
                d = None
            if d is not None and (best is None or d < best[1]):
                best = (item, d)
        return best

    def history(self, goal: Goal, item: GoalItem, days: int = 30, today: Optional[date] = None):
        today = today or _today()
        out = []
        for i in range(days):
            d = today - timedelta(days=days - 1 - i)
            if not item.occurs_on(d, goal):
                out.append((d.strftime("%d/%m"), None))
            else:
                out.append((d.strftime("%d/%m"), 1 if self.is_done_on(item, d) else 0))
        return out

    def area_goals(self, filter_key: str = FILTER_ALL) -> list:
        """[(area dict or None, [goals])] in area order, 'Sin área' last."""
        goals = self.goals(filter_key)
        areas = self.area_mgr.areas() if self.area_mgr is not None else []
        known = {a["id"] for a in areas}
        out = []
        for a in areas:
            group = [g for g in goals if g.area == a["id"]]
            if group:
                out.append((a, group))
        rest = [g for g in goals if g.area not in known]
        if rest:
            out.append((None, rest))
        return out


class GoalCalendarSource:
    """Sub-goals with `in_calendar` as calendar blocks."""

    prefix = "goal:"

    def __init__(self, manager: GoalManager):
        self.manager = manager

    def occurrences(self, first: date, last: date) -> dict:
        from .schedule_manager import Occurrence
        out: dict = {}
        for goal in self.manager.goals(FILTER_ALL):
            if goal.status == STATUS_ARCHIVED:
                continue
            if goal.end and first <= goal.end <= last:
                out.setdefault(goal.end, []).append(Occurrence(
                    id=f"{self.prefix}{goal.id}",
                    title=f"{goal.icon} 🏁 {goal.name}".strip(),
                    kind="goal_item",
                    date=goal.end,
                    start=None,
                    duration_min=None,
                    colour=goal.colour or "#3f51b5",
                    links=[{"type": "goal", "id": goal.id}],
                    done=(goal.status == STATUS_DONE),
                    source="metas",
                    editable=False,
                ))
            for item in self.manager.items(goal.id):
                if not (item.in_calendar or (item.due and item.due_time)):
                    continue
                d = first
                while d <= last:
                    if item.occurs_on(d, goal):
                        start = item.due_time or None
                        out.setdefault(d, []).append(Occurrence(
                            id=f"{self.prefix}{goal.id}/{item.id}",
                            title=f"{goal.icon} {item.name}".strip(),
                            kind="goal_item",
                            date=d,
                            start=start,
                            duration_min=(item.duration_min or 60) if start else None,
                            colour=goal.colour or "#3f51b5",
                            links=[{"type": "goal", "id": goal.id, "item": item.id}],
                            done=self.manager.is_done_on(item, d),
                            source="metas",
                            editable=False,
                            reminder_min=item.reminder_min if start else None,
                        ))
                    d += timedelta(days=1)
        return out

    def set_done(self, d: date, occurrence_id: str, done: bool):
        gid, _, iid = occurrence_id[len(self.prefix):].partition("/")
        if not iid:
            goal = self.manager.get_goal(gid)
            if goal is not None:
                self.manager.update_goal(gid, status=STATUS_DONE if done else STATUS_ACTIVE)
            return
        self.manager.set_done(gid, iid, d, done)
