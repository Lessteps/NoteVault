"""
Proyectos: a single-user Jira. A project holds issues (Submeta, Tarea,
Subtarea, Error, Mejora) that move through the project's Kanban columns.

    .notevault/proyectos/<project-id>/<project-id>.md       the project
    .notevault/proyectos/<project-id>/issues/<issue-id>.md  one issue per file

FORMAT_VERSION 3 kept a project in one file with a "## Tareas" checklist.
`migrate_projects()` turns every step into an issue and only then moves the
old file to `.notevault/.papelera/proyectos-v3/`; it never overwrites.
"""

import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from . import store, vault_format
from .recurrence import Recurrence

P_PLANNED, P_ACTIVE, P_PAUSED, P_DONE = vault_format.PROJECT_STATUSES
PROJECT_STATUSES = list(vault_format.PROJECT_STATUSES)

PROJECT_STATUS_COLORS = {
    P_PLANNED: "#8b8b96",
    P_ACTIVE:  "#2383e2",
    P_PAUSED:  "#ff9632",
    P_DONE:    "#4ade80",
}

PALETTE = ["#2383e2", "#4ade80", "#ff9632", "#f2555a",
           "#a78bfa", "#38bdf8", "#facc15", "#fb7185"]

T_GOAL, T_TASK, T_SUBTASK, T_BUG, T_IMPROVEMENT = vault_format.ISSUE_TYPES
TYPE_ICONS = {T_GOAL: "◆", T_TASK: "☑", T_SUBTASK: "↳", T_BUG: "🐞", T_IMPROVEMENT: "⬆"}
TYPE_COLOURS = {T_GOAL: "#a78bfa", T_TASK: "#2383e2", T_SUBTASK: "#38bdf8",
                T_BUG: "#f2555a", T_IMPROVEMENT: "#4ade80"}

TASKS_HEADING = "## Tareas"
LEGACY_BUCKET = "proyectos-v3"


def _today() -> date:
    return date.today()


def derive_key(name: str, taken=()) -> str:
    """'Portafolio web' -> 'PW'; 'Backend' -> 'BAC'; unique among `taken`."""
    table = str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")
    words = re.findall(r"[A-Za-z0-9]+", (name or "").translate(table))
    if not words:
        base = "PRY"
    elif len(words) == 1:
        base = words[0][:3].upper()
    else:
        base = "".join(w[0] for w in words[:4]).upper()
    key, n = base, 2
    taken = {t.upper() for t in taken}
    while key in taken:
        key, n = f"{base}{n}", n + 1
    return key


class Project:
    def __init__(self, values: dict, extra: Optional[dict] = None, description: str = ""):
        self.id: str = values.get("id", "")
        self.key: str = values.get("key") or ""
        self.name: str = values.get("name") or "Nuevo proyecto"
        self.status: str = values.get("status") or P_PLANNED
        self.area: str = values.get("area") or ""
        self.colour: str = values.get("colour") or PALETTE[0]
        self.icon: str = values.get("icon") or ""
        self.created: Optional[date] = values.get("created")
        self.start: Optional[date] = values.get("start")
        self.deadline: Optional[date] = values.get("deadline")
        self.columns: list = list(values.get("columns") or vault_format.DEFAULT_COLUMNS)
        self.done_column: str = values.get("done_column") or self.columns[-1]
        if self.done_column not in self.columns:
            self.columns.append(self.done_column)
        self.in_calendar: bool = bool(values.get("in_calendar", False))
        self.description = description

        self.extra = dict(extra or {})

    # Names the rest of the app used before FORMAT_VERSION 4.
    @property
    def color(self) -> str:
        return self.colour

    @property
    def is_done(self) -> bool:
        return self.status == P_DONE

    def values(self) -> dict:
        return {k: getattr(self, k) for k, _t in vault_format.PROJECT_FIELDS}

    def days_left(self, today: Optional[date] = None) -> Optional[int]:
        return (self.deadline - (today or _today())).days if self.deadline else None

    def is_overdue(self, today: Optional[date] = None) -> bool:
        today = today or _today()
        return bool(self.deadline and self.deadline < today and not self.is_done)


class Issue:
    reminder_kind = "issue"

    def __init__(self, values: dict, extra: Optional[dict] = None, description: str = ""):
        self.id: str = values.get("id", "")
        self.project: str = values.get("project", "")
        self.number: int = values.get("number") or 0
        self.type: str = values.get("type") or T_TASK
        self.parent: str = values.get("parent") or ""
        self.title: str = values.get("title") or "Nuevo issue"
        self.status: str = values.get("status") or ""
        self.priority: int = max(1, min(4, values.get("priority") or 2))
        self.order = values.get("order") if values.get("order") is not None else 0
        self.estimate_min: Optional[int] = values.get("estimate_min")
        self.labels: list = list(values.get("labels") or [])
        self.created: Optional[date] = values.get("created")
        self.start: Optional[date] = values.get("start")
        self.due: Optional[date] = values.get("due")
        self.due_time: str = values.get("due_time") or ""
        self.repeat: str = Recurrence.parse(values.get("repeat")).to_string()
        self.repeat_until: Optional[date] = values.get("repeat_until")
        self.in_calendar: bool = bool(values.get("in_calendar", False))
        self.reminder: Optional[datetime] = values.get("reminder")

        self.reminder_done: bool = bool(values.get("reminder_done"))
        self.done_at: Optional[date] = values.get("done_at")
        self.attachments: list = list(values.get("attachments") or [])
        self.description = description
        self.extra = dict(extra or {})
        self.children: list = []
        self.done_column: str = ""
        self.key_prefix: str = ""

    def values(self) -> dict:
        return {k: getattr(self, k) for k, _t in vault_format.ISSUE_FIELDS}

    @property
    def is_done(self) -> bool:
        return bool(self.done_column) and self.status == self.done_column

    @property
    def key(self) -> str:
        return f"{self.key_prefix}-{self.number}" if self.key_prefix else f"#{self.number}"

    @property
    def name(self) -> str:          # for reminder_scheduler
        return f"{self.key} {self.title}"

    @property
    def rule(self) -> Recurrence:
        return Recurrence.parse(self.repeat)

    def is_overdue(self, today: Optional[date] = None) -> bool:
        today = today or _today()
        return bool(self.due and self.due < today and not self.is_done)

    def occurs_on(self, d: date) -> bool:
        if not self.repeat:
            return self.due == d
        return self.rule.occurs_on(d, self.due or self.start, self.repeat_until)

    def matches(self, query: str) -> bool:
        q = (query or "").strip().lower()
        if not q:
            return True
        return q in " ".join([self.key, self.title, self.description, self.type,
                              ",".join(self.labels)]).lower()


class ProjectManager:
    def __init__(self, vault_root: Path):
        self.vault_root = Path(vault_root)
        self.projects_dir = self.vault_root / vault_format.LAYOUT["projects_dir"]
        self._cache = None
        self._stamp = None
        self._issues: dict = {}
        self._migrated = False

    # ── Paths ─────────────────────────────────────────────────────────────

    def project_path(self, pid: str) -> Path:
        return self.vault_root / vault_format.LAYOUT["project"].format(id=pid)

    def issues_dir(self, pid: str) -> Path:
        return self.vault_root / vault_format.LAYOUT["project_issues_dir"].format(id=pid)

    def issue_path(self, pid: str, xid: str) -> Path:
        return self.vault_root / vault_format.LAYOUT["issue"].format(project=pid, id=xid)

    @staticmethod
    def _stamp_of(folder: Path, pattern: str):
        try:
            return tuple(sorted((p.as_posix(), p.stat().st_mtime_ns) for p in folder.glob(pattern)))
        except OSError:
            return ()

    # ── Projects ──────────────────────────────────────────────────────────

    def projects(self, force: bool = False) -> list:
        if not self._migrated:
            self._migrated = True
            migrate_projects(self.vault_root)
        stamp = self._stamp_of(self.projects_dir, "*/*.md")
        if force or self._cache is None or stamp != self._stamp:
            out = []
            for rel, _m in stamp:
                path = Path(rel)
                if path.stem != path.parent.name or vault_format.is_sync_conflict(path.name):
                    continue
                parsed = store.read_doc(path, vault_format.PROJECT_FIELDS)
                if parsed is None:
                    continue
                values, extra, body = parsed
                values.setdefault("id", path.stem)
                out.append(Project(values, extra, body))
            order = {s: i for i, s in enumerate(PROJECT_STATUSES)}
            out.sort(key=lambda p: (order.get(p.status, 9), p.deadline or date.max, p.name.lower()))
            self._cache, self._stamp = out, stamp
            if force:
                self._issues.clear()
        return list(self._cache)

    def get(self, pid: str) -> Optional[Project]:
        return next((p for p in self.projects() if p.id == pid), None)

    def save(self, project: Project):
        store.write_text(self.project_path(project.id),
                         store.dump_doc(vault_format.PROJECT_FIELDS, project.values(),
                                        project.extra, project.description))
        self._cache = None

    def create(self, name: str = "Nuevo proyecto", **fields) -> Project:
        existing = self.projects()
        today = _today()
        project = Project({
            "id": store.new_id("p"), "name": name.strip() or "Nuevo proyecto",
            "key": derive_key(name, [p.key for p in existing]), "status": P_PLANNED,
            "colour": fields.pop("color", None) or PALETTE[len(existing) % len(PALETTE)],
            "created": today, "start": today,
        })
        self._apply(project, fields)
        self.save(project)
        return project

    def update(self, pid: str, **fields) -> Optional[Project]:
        project = self.get(pid)
        if project is None:
            return None
        if "color" in fields:
            fields["colour"] = fields.pop("color")
        self._apply(project, fields)
        self.save(project)
        return project

    @staticmethod
    def _apply(project: Project, fields: dict):
        keys = {k for k, _t in vault_format.PROJECT_FIELDS} - {"id"}
        for k, v in fields.items():
            if k in keys:
                if k == "columns":
                    v = [c for c in store.split_list(v)] or list(vault_format.DEFAULT_COLUMNS)
                setattr(project, k, v)
            elif k == "description":
                project.description = v or ""

    def delete(self, pid: str):
        store.to_trash(self.vault_root, self.project_path(pid).parent, "proyectos")
        self._cache = None
        self._issues.pop(pid, None)

    def set_columns(self, pid: str, columns: list, done_column: Optional[str] = None,
                    renames: Optional[dict] = None):
        """Replace the workflow. `renames` maps old names to new ones; issues in a
        column that disappears move to the first column."""
        project = self.get(pid)
        if project is None:
            return
        columns = [c.strip().replace(",", " ") for c in columns if c.strip()]
        if not columns:
            return
        renames = renames or {}
        done_column = done_column if done_column in columns else \
            renames.get(project.done_column, project.done_column)
        if done_column not in columns:
            done_column = columns[-1]
        for issue in self.issues(pid):
            new = renames.get(issue.status, issue.status)
            if new not in columns:
                new = columns[0]
            if new != issue.status:
                issue.status = new
                self._stamp_done(issue, done_column)
                self.save_issue(issue)
        project.columns, project.done_column = columns, done_column
        self.save(project)

    # ── Issues ────────────────────────────────────────────────────────────

    def issues(self, pid: str) -> list:
        project = self.get(pid)
        if project is None:
            return []
        stamp = self._stamp_of(self.issues_dir(pid), "*.md")
        hit = self._issues.get(pid)
        if hit is None or hit[0] != stamp or hit[2] != (project.key, project.done_column,
                                                         tuple(project.columns)):
            out = []
            for rel, _m in stamp:
                path = Path(rel)
                if vault_format.is_sync_conflict(path.name):
                    continue
                parsed = store.read_doc(path, vault_format.ISSUE_FIELDS)
                if parsed is None:
                    continue
                values, extra, body = parsed
                values.setdefault("id", path.stem)
                values["project"] = pid
                issue = Issue(values, extra, body)
                issue.done_column = project.done_column
                issue.key_prefix = project.key
                if issue.status not in project.columns:
                    issue.status = project.columns[0]
                out.append(issue)
            self._link(out)
            hit = (stamp, out, (project.key, project.done_column, tuple(project.columns)))
            self._issues[pid] = hit
        return list(hit[1])

    @staticmethod
    def _link(issues: list):
        by_id = {i.id: i for i in issues}
        for i in issues:
            i.children = []
        for i in issues:
            parent = by_id.get(i.parent)
            seen, cur, cycle = set(), parent, False
            while cur is not None and cur.id not in seen:
                if cur.id == i.id:
                    cycle = True
                    break
                seen.add(cur.id)
                cur = by_id.get(cur.parent)
            if parent is not None and not cycle:
                parent.children.append(i)
            elif i.parent:
                i.parent = ""
        for i in issues:
            i.children.sort(key=lambda c: (c.order, c.number))

    def tree(self, pid: str) -> list:
        return sorted([i for i in self.issues(pid) if not i.parent], key=lambda c: (c.order, c.number))

    def get_issue(self, pid: str, xid: str) -> Optional[Issue]:
        return next((i for i in self.issues(pid) if i.id == xid), None)

    def all_issues(self) -> list:
        return [i for p in self.projects() for i in self.issues(p.id)]

    def descendants(self, issue: Issue) -> list:
        out, stack = [], list(issue.children)
        while stack:
            cur = stack.pop()
            out.append(cur)
            stack.extend(cur.children)
        return out

    def save_issue(self, issue: Issue):
        store.write_text(self.issue_path(issue.project, issue.id),
                         store.dump_doc(vault_format.ISSUE_FIELDS, issue.values(), issue.extra,
                                        issue.description))
        self._issues.pop(issue.project, None)

    def create_issue(self, pid: str, title: str, **fields) -> Optional[Issue]:
        project = self.get(pid)
        if project is None:
            return None
        issues = self.issues(pid)
        status = fields.pop("status", None) or project.columns[0]
        if status not in project.columns:
            status = project.columns[0]
        column = [i for i in issues if i.status == status]
        issue = Issue({
            "id": store.new_id("x"), "project": pid,
            "number": max([i.number for i in issues] or [0]) + 1,
            "type": T_TASK, "title": title.strip() or "Nuevo issue", "status": status,
            "priority": 2, "order": max([i.order for i in column] or [0]) + 1,
            "created": _today(),
        })
        issue.done_column = project.done_column
        issue.key_prefix = project.key
        self._apply_issue(issue, fields)
        self._stamp_done(issue, project.done_column)
        self.save_issue(issue)
        return issue

    @staticmethod
    def _apply_issue(issue: Issue, fields: dict):
        keys = {k for k, _t in vault_format.ISSUE_FIELDS} - {"id", "number"}
        for k, v in fields.items():
            if k in keys:
                if k == "priority" and v is not None:
                    v = max(1, min(4, int(v)))
                elif k == "repeat":
                    v = Recurrence.parse(v).to_string()
                elif k in ("labels", "attachments"):
                    v = store.split_list(v)
                setattr(issue, k, v)
            elif k == "description":
                issue.description = v or ""

    @staticmethod
    def _stamp_done(issue: Issue, done_column: str, day: Optional[date] = None):
        if issue.status == done_column:
            issue.done_at = issue.done_at or day or _today()
        else:
            issue.done_at = None

    def update_issue(self, pid: str, xid: str, **fields) -> Optional[Issue]:
        issue = self.get_issue(pid, xid)
        project = self.get(pid)
        if issue is None or project is None:
            return None
        was_done = issue.is_done
        if "reminder" in fields and fields["reminder"] != issue.reminder:
            issue.reminder_done = False
        self._apply_issue(issue, fields)
        if issue.status not in project.columns:
            issue.status = project.columns[0]
        self._stamp_done(issue, project.done_column)
        if issue.is_done and not was_done and issue.repeat:
            self._roll_forward(issue, project)
        self.save_issue(issue)
        return issue

    @staticmethod
    def _roll_forward(issue: Issue, project: Project):
        """A repeating issue that reaches the done column comes back with its next date."""
        if issue.due is None:
            return
        nxt = issue.rule.next_after(issue.due, issue.due, issue.repeat_until)
        if nxt is None:
            return
        shift = nxt - issue.due
        issue.due = nxt
        if issue.start:
            issue.start += shift
        if issue.reminder:
            issue.reminder += shift
            issue.reminder_done = False
        issue.status = project.columns[0]
        issue.done_at = None

    def move(self, pid: str, xid: str, status: str, index: int):
        """Drop an issue into a column at a position (Kanban)."""
        project = self.get(pid)
        issue = self.get_issue(pid, xid)
        if project is None or issue is None or status not in project.columns:
            return
        column = sorted([i for i in self.issues(pid) if i.status == status and i.id != xid],
                        key=lambda c: (c.order, c.number))
        index = max(0, min(index, len(column)))
        before = column[index - 1].order if index > 0 else None
        after = column[index].order if index < len(column) else None
        if before is None and after is None:
            order = 1
        elif before is None:
            order = after - 1
        elif after is None:
            order = before + 1
        else:
            order = (before + after) / 2
            if not before < order < after:
                for n, other in enumerate(column, start=1):
                    other.order = n if n <= index else n + 1
                    self.save_issue(other)
                order = index + 1
        was_done = issue.is_done
        issue.status = status
        issue.order = int(order) if float(order).is_integer() else round(order, 6)
        self._stamp_done(issue, project.done_column)
        if issue.is_done and not was_done and issue.repeat:
            self._roll_forward(issue, project)
        self.save_issue(issue)

    def reparent(self, pid: str, xid: str, parent: Optional[str]):
        issue = self.get_issue(pid, xid)
        if issue is None:
            return
        by_id = {i.id: i for i in self.issues(pid)}
        cur = by_id.get(parent or "")
        while cur is not None:
            if cur.id == xid:
                return
            cur = by_id.get(cur.parent)
        issue.parent = parent or ""
        self.save_issue(issue)

    def delete_issue(self, pid: str, xid: str):
        issue = self.get_issue(pid, xid)
        if issue is None:
            return
        for node in [issue] + self.descendants(issue):
            store.to_trash(self.vault_root, self.issue_path(pid, node.id), f"proyectos/{pid}")
        self._issues.pop(pid, None)

    def fix_duplicate_numbers(self, pid: str) -> int:
        """Two devices creating issues at once may repeat a number: renumber the newer one."""
        seen, fixed = {}, 0
        issues = sorted(self.issues(pid), key=lambda i: (i.number, i.created or date.min, i.id))
        top = max([i.number for i in issues] or [0])
        for issue in issues:
            if issue.number in seen:
                top += 1
                issue.number = top
                self.save_issue(issue)
                fixed += 1
            seen[issue.number] = issue.id
        return fixed

    # ── Queries used across the app ───────────────────────────────────────

    def filtered(self, query: str = "", status: str = "") -> list:
        q = (query or "").strip().lower()
        return [p for p in self.projects()
                if (not status or p.status == status)
                and (not q or q in f"{p.name} {p.key} {p.description}".lower())]

    def active_projects(self) -> list:
        return [p for p in self.projects() if p.status == P_ACTIVE]

    def due_on(self, d: date, include_overdue: bool = True) -> list:
        """[(project, issue)] open issues due on d (and overdue ones when asked)."""
        out = []
        for p in self.projects():
            if p.status == P_DONE:
                continue
            for i in self.issues(p.id):
                if i.is_done or not i.due:
                    continue
                if i.occurs_on(d) or (include_overdue and i.due < d and not i.repeat):
                    out.append((p, i))
        out.sort(key=lambda pi: (pi[1].due, -pi[1].priority))
        return out

    def progress(self, project: Project) -> float:
        issues = [i for i in self.issues(project.id) if i.type != T_GOAL or not i.children]
        return sum(1 for i in issues if i.is_done) / len(issues) if issues else 0.0


# ── Statistics ────────────────────────────────────────────────────────────

class ProjectStats:
    """Numbers for the Resumen tab, computed from issue files only."""

    def __init__(self, manager: ProjectManager, project: Project, today: Optional[date] = None):
        self.manager = manager
        self.project = project
        self.today = today or _today()
        self.issues = manager.issues(project.id)
        # Sub-goals group their descendants; the sub-goal itself is not work.
        self.work = [i for i in self.issues if not (i.type == T_GOAL and i.children)]

    @staticmethod
    def _summary(issues: list, today: date) -> dict:
        total = len(issues)
        done = sum(1 for i in issues if i.is_done)
        return {
            "total": total, "done": done, "open": total - done,
            "overdue": sum(1 for i in issues if i.is_overdue(today)),
            "progress": done / total if total else 0.0,
            "estimate_min": sum(i.estimate_min or 0 for i in issues),
            "estimate_done_min": sum(i.estimate_min or 0 for i in issues if i.is_done),
        }

    def summary(self) -> dict:
        s = self._summary(self.work, self.today)
        week_start = self.today - timedelta(days=self.today.weekday())
        s["done_this_week"] = sum(1 for i in self.work if i.is_done and i.done_at
                                  and i.done_at >= week_start)
        s["days_left"] = self.project.days_left(self.today)
        return s

    def by_status(self) -> list:
        return [(c, sum(1 for i in self.work if i.status == c)) for c in self.project.columns]

    def by_priority(self) -> list:
        return [(p, sum(1 for i in self.work if i.priority == p and not i.is_done)) for p in (1, 2, 3, 4)]

    def by_type(self) -> list:
        return [(t, sum(1 for i in self.issues if i.type == t)) for t in vault_format.ISSUE_TYPES]

    def submetas(self) -> list:
        """[(issue, summary)] for every Submeta, over all its descendants."""
        out = []
        for goal in sorted([i for i in self.issues if i.type == T_GOAL], key=lambda i: (i.order, i.number)):
            members = [d for d in self.manager.descendants(goal)
                       if not (d.type == T_GOAL and d.children)]
            out.append((goal, self._summary(members, self.today)))
        return out

    def burndown(self) -> tuple:
        """(dates, remaining, ideal) from start (or first created) to deadline or today."""
        created = [i.created for i in self.work if i.created]
        first = self.project.start or (min(created) if created else self.today)
        last = max(self.today, self.project.deadline or self.today)
        if (last - first).days > 180:
            first = last - timedelta(days=180)
        days, remaining = [], []
        d = first
        while d <= last:
            days.append(d)
            if d <= self.today:
                remaining.append(sum(1 for i in self.work
                                     if (i.created or first) <= d
                                     and not (i.done_at and i.done_at <= d)))
            else:
                remaining.append(None)
            d += timedelta(days=1)
        start_value = max([v for v in remaining if v is not None] or [0])
        n = len(days) - 1 or 1
        ideal = [round(start_value * (1 - k / n), 2) for k in range(len(days))] \
            if self.project.deadline else []
        return days, remaining, ideal

    def throughput(self, weeks: int = 8) -> list:
        """[(monday, done count)] for the last `weeks` weeks, oldest first."""
        monday = self.today - timedelta(days=self.today.weekday())
        out = []
        for k in range(weeks - 1, -1, -1):
            start = monday - timedelta(weeks=k)
            end = start + timedelta(days=6)
            out.append((start, sum(1 for i in self.work if i.done_at and start <= i.done_at <= end)))
        return out

    def cycle_days(self) -> Optional[float]:
        spans = [(i.done_at - i.created).days for i in self.work if i.done_at and i.created]
        return round(sum(spans) / len(spans), 1) if spans else None

    def next_due(self):
        open_ = sorted([i for i in self.work if not i.is_done and i.due], key=lambda i: i.due)
        return open_[0] if open_ else None


# ── Calendar ──────────────────────────────────────────────────────────────

class ProjectCalendarSource:
    prefix = "issue:"
    prefixes = ("issue:", "project:")

    def __init__(self, manager: ProjectManager):
        self.manager = manager

    def occurrences(self, first: date, last: date) -> dict:
        from .schedule_manager import Occurrence
        out: dict = {}
        for p in self.manager.projects():
            if p.in_calendar and p.deadline and first <= p.deadline <= last:
                out.setdefault(p.deadline, []).append(Occurrence(
                    id=f"project:{p.id}",
                    title=f"🏁 {p.name}",
                    kind="project", date=p.deadline, start=None,
                    duration_min=None, colour=p.colour,
                    links=[{"type": "project", "id": p.id}],
                    done=(p.status == P_DONE), source="proyectos", editable=False,
                ))
            if p.status == P_DONE:
                continue
            for i in self.manager.issues(p.id):
                if not (p.in_calendar or i.in_calendar) or not (i.due or i.repeat):
                    continue
                d = first
                while d <= last:
                    if i.occurs_on(d):
                        start = i.due_time or None
                        out.setdefault(d, []).append(Occurrence(
                            id=f"{self.prefix}{p.id}/{i.id}",
                            title=f"{i.key} {i.title}",
                            kind="issue", date=d, start=start,
                            duration_min=(i.estimate_min or 60) if start else None,
                            colour=p.colour, links=[{"type": "project", "id": p.id, "issue": i.id}],
                            done=i.is_done, source="proyectos", editable=False,
                        ))
                    d += timedelta(days=1)
        return out

    def set_done(self, d: date, occurrence_id: str, done: bool):
        if occurrence_id.startswith("project:"):
            pid = occurrence_id[len("project:"):]
            project = self.manager.get(pid)
            if project is not None:
                self.manager.update(pid, status=P_DONE if done else P_ACTIVE)
            return
        pid, _, xid = occurrence_id[len(self.prefix):].partition("/")
        project = self.manager.get(pid)
        if project is None:
            return
        column = project.done_column if done else project.columns[0]
        self.manager.move(pid, xid, column, 10 ** 6)


# ── Migration from FORMAT_VERSION 3 ───────────────────────────────────────

_STEP_RE = re.compile(r"^\s*-\s*\[([ xX])\]\s*(.+?)\s*$")
_V3_KEY_RE = re.compile(r"^([a-z_0-9\-]+):\s*(.*)$")


def _parse_v3(text: str) -> tuple:
    fm, body, count = {}, [], 0
    for line in text.replace("\r\n", "\n").split("\n"):
        if line.strip() == "---" and count < 2:
            count += 1
            continue
        if count == 1:
            m = _V3_KEY_RE.match(line.strip())
            if m:
                fm[m.group(1)] = store.unquote(m.group(2).strip())
        elif count >= 2:
            body.append(line)
    description, steps, in_tasks = [], [], False
    for line in body:
        if line.strip().lower() == TASKS_HEADING.lower():
            in_tasks = True
            continue
        if in_tasks:
            m = _STEP_RE.match(line)
            if m:
                rest, due = m.group(2), None
                if "|" in rest:
                    rest, _, tail = rest.rpartition("|")
                    due = store.parse_day(tail.strip())
                steps.append((rest.strip(), m.group(1).lower() == "x", due))
        else:
            description.append(line)
    return fm, "\n".join(description).strip(), steps


def migrate_projects(vault_root: Path, today: Optional[date] = None) -> list:
    """Convert FORMAT_VERSION 3 project files. Returns the ids migrated."""
    vault_root = Path(vault_root)
    folder = vault_root / vault_format.LAYOUT["projects_dir"]
    if not folder.is_dir():
        return []
    done = []
    legacy = [p for p in sorted(folder.glob("*.md")) if p.is_file()
              and not vault_format.is_sync_conflict(p.name)]
    if not legacy:
        return []
    taken = []
    for p in folder.glob("*/*.md"):
        if p.stem == p.parent.name:
            parsed = store.read_doc(p, vault_format.PROJECT_FIELDS)
            if parsed and parsed[0].get("key"):
                taken.append(parsed[0]["key"])
    today = today or _today()
    for path in legacy:
        try:
            fm, description, steps = _parse_v3(path.read_text(encoding="utf-8", errors="replace"))
        except OSError:
            continue
        pid = fm.get("id") or path.stem
        target_dir = folder / pid
        if target_dir.exists():
            continue                    # already migrated (or synced from another device)
        known = {"id", "name", "status", "color", "colour", "created", "start", "deadline"}
        extra = {k: v for k, v in fm.items() if k not in known and v != ""}
        name = fm.get("name") or path.stem
        key = derive_key(name, taken)
        taken.append(key)
        created = store.parse_day(fm.get("created", "")) or today
        project = Project({
            "id": pid, "key": key, "name": name,
            "status": fm.get("status") if fm.get("status") in PROJECT_STATUSES else P_PLANNED,
            "colour": fm.get("colour") or fm.get("color") or PALETTE[0],
            "created": created, "start": store.parse_day(fm.get("start", "")),
            "deadline": store.parse_day(fm.get("deadline", "")),
            "columns": list(vault_format.DEFAULT_COLUMNS), "done_column": "Hecho",
        }, extra, description)
        issue_dir = target_dir / "issues"
        issue_dir.mkdir(parents=True, exist_ok=True)
        for n, (title, is_done, due) in enumerate(steps, start=1):
            issue = Issue({
                "id": f"x{pid[1:9] if len(pid) > 9 else today.strftime('%Y%m%d')}-{n:06x}",
                "project": pid, "number": n, "type": T_TASK, "title": title,
                "status": "Hecho" if is_done else "Por hacer", "priority": 2, "order": n,
                "created": created, "due": due,
                "done_at": (due if due and due <= today else today) if is_done else None,
            })
            store.write_text(issue_dir / f"{issue.id}.md",
                             store.dump_doc(vault_format.ISSUE_FIELDS, issue.values()))
        store.write_text(target_dir / f"{pid}.md",
                         store.dump_doc(vault_format.PROJECT_FIELDS, project.values(),
                                        project.extra, project.description))
        # Everything new is on disk: only now does the old file leave.
        if len(list(issue_dir.glob("*.md"))) == len(steps):
            store.to_trash(vault_root, path, LEGACY_BUCKET)
            done.append(pid)
    return done
