"""
NoteVault Project Manager
Data layer for the Proyectos module.

A project is NOT a task: it is a container with its own checklist of steps,
a deadline, a colour and a progress percentage derived from its steps.

    {vault}/proyectos/<project-id>.md

    ---
    id: p20260911-a1b2c3
    name: Portafolio web
    status: En curso
    color: "#2383e2"
    created: 2026-09-11
    start: 2026-09-11
    deadline: 2026-10-30
    ---

    Descripción libre en markdown.

    ## Tareas
    - [x] Diseñar la home | 2026-09-14
    - [ ] Maquetar en HTML | 2026-09-20
"""

import re
import uuid
from datetime import date
from pathlib import Path
from typing import Optional

P_PLANNED = "Planeado"
P_ACTIVE  = "En curso"
P_PAUSED  = "Pausado"
P_DONE    = "Terminado"
PROJECT_STATUSES = [P_PLANNED, P_ACTIVE, P_PAUSED, P_DONE]

PROJECT_STATUS_COLORS = {
    P_PLANNED: "#8b8b96",
    P_ACTIVE:  "#2383e2",
    P_PAUSED:  "#ff9632",
    P_DONE:    "#4ade80",
}

PALETTE = [
    "#2383e2", "#4ade80", "#ff9632", "#f2555a",
    "#a78bfa", "#38bdf8", "#facc15", "#fb7185",
]

TASKS_HEADING = "## Tareas"


def _parse_date(value: str) -> Optional[date]:
    value = (value or "").strip()
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


class ProjectStep:
    """One checklist item inside a project."""

    def __init__(self, name: str, done: bool = False, due: Optional[date] = None):
        self.name = name
        self.done = done
        self.due = due

    def to_line(self) -> str:
        mark = "x" if self.done else " "
        tail = f" | {self.due.isoformat()}" if self.due else ""
        return f"- [{mark}] {self.name}{tail}"

    @staticmethod
    def from_line(line: str) -> Optional["ProjectStep"]:
        m = re.match(r"^\s*-\s*\[([ xX])\]\s*(.+?)\s*$", line)
        if not m:
            return None
        done = m.group(1).lower() == "x"
        rest = m.group(2)
        due = None
        if "|" in rest:
            rest, _, tail = rest.rpartition("|")
            due = _parse_date(tail)
            rest = rest.strip()
        return ProjectStep(rest, done, due)


class Project:
    def __init__(self, pid: str, **f):
        self.id = pid
        self.name: str = f.get("name", "Nuevo proyecto")
        self.status: str = f.get("status", P_PLANNED)
        self.color: str = f.get("color", PALETTE[0])
        self.created: Optional[date] = f.get("created") or date.today()
        self.start: Optional[date] = f.get("start")
        self.deadline: Optional[date] = f.get("deadline")
        self.description: str = f.get("description", "")
        self.steps: list = f.get("steps") or []

    # ── Derived ───────────────────────────────────────────────────────────

    @property
    def total_steps(self) -> int:
        return len(self.steps)

    @property
    def done_steps(self) -> int:
        return sum(1 for s in self.steps if s.done)

    @property
    def progress(self) -> float:
        return (self.done_steps / self.total_steps) if self.total_steps else 0.0

    @property
    def is_done(self) -> bool:
        return self.status == P_DONE

    @property
    def is_overdue(self) -> bool:
        return bool(self.deadline and not self.is_done
                    and self.deadline < date.today())

    def days_left(self) -> Optional[int]:
        if not self.deadline:
            return None
        return (self.deadline - date.today()).days

    def steps_due_on(self, d: date) -> list:
        return [s for s in self.steps if s.due == d and not s.done]

    def matches(self, query: str) -> bool:
        q = query.strip().lower()
        if not q:
            return True
        hay = " ".join([self.name, self.status, self.description]
                       + [s.name for s in self.steps]).lower()
        return q in hay


class ProjectManager:
    def __init__(self, vault_root: Path):
        self.vault_root = Path(vault_root)
        self.projects_dir = self.vault_root / "proyectos"
        self._cache: Optional[list] = None

    def _path(self, pid: str) -> Path:
        return self.projects_dir / f"{pid}.md"

    # ── Load ──────────────────────────────────────────────────────────────

    def projects(self, force: bool = False) -> list:
        if self._cache is None or force:
            self._cache = self._load_all()
        return self._cache

    def _load_all(self) -> list:
        if not self.projects_dir.exists():
            return []
        out = []
        for p in sorted(self.projects_dir.glob("*.md")):
            proj = self._parse(p)
            if proj:
                out.append(proj)
        order = {s: i for i, s in enumerate(PROJECT_STATUSES)}
        out.sort(key=lambda p: (order.get(p.status, 9),
                                p.deadline or date.max, p.name.lower()))
        return out

    def _parse(self, path: Path) -> Optional[Project]:
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            return None

        fm: dict = {}
        body: list = []
        fm_count = 0
        for line in text.splitlines():
            if line.strip() == "---" and fm_count < 2:
                fm_count += 1
                continue
            if fm_count == 1:
                m = re.match(r"^([a-z_]+):\s*(.*)$", line.strip())
                if m:
                    fm[m.group(1)] = m.group(2).strip().strip('"')
            elif fm_count >= 2:
                body.append(line)

        description_lines, steps, in_tasks = [], [], False
        for line in body:
            if line.strip().lower() == TASKS_HEADING.lower():
                in_tasks = True
                continue
            if in_tasks:
                step = ProjectStep.from_line(line)
                if step:
                    steps.append(step)
            else:
                description_lines.append(line)

        return Project(
            fm.get("id") or path.stem,
            name=fm.get("name", path.stem),
            status=fm.get("status", P_PLANNED),
            color=fm.get("color", PALETTE[0]),
            created=_parse_date(fm.get("created", "")) or date.today(),
            start=_parse_date(fm.get("start", "")),
            deadline=_parse_date(fm.get("deadline", "")),
            description="\n".join(description_lines).strip(),
            steps=steps,
        )

    # ── Save ──────────────────────────────────────────────────────────────

    def save(self, project: Project):
        self.projects_dir.mkdir(parents=True, exist_ok=True)
        lines = [
            "---",
            f"id: {project.id}",
            f'name: "{project.name}"',
            f"status: {project.status}",
            f'color: "{project.color}"',
            f"created: {project.created.isoformat() if project.created else ''}",
            f"start: {project.start.isoformat() if project.start else ''}",
            f"deadline: {project.deadline.isoformat() if project.deadline else ''}",
            "---",
            "",
            project.description.strip(),
            "",
            TASKS_HEADING,
        ]
        lines.extend(s.to_line() for s in project.steps)
        lines.append("")
        self._path(project.id).write_text("\n".join(lines), encoding="utf-8")
        self._cache = None

    # ── CRUD ──────────────────────────────────────────────────────────────

    def create(self, name: str = "Nuevo proyecto", **fields) -> Project:
        pid = f"p{date.today().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6]}"
        color = fields.pop("color", PALETTE[len(self.projects()) % len(PALETTE)])
        project = Project(pid, name=name, created=date.today(),
                          start=date.today(), color=color, **fields)
        self.save(project)
        return project

    def get(self, pid: str) -> Optional[Project]:
        for p in self.projects():
            if p.id == pid:
                return p
        return None

    def update(self, pid: str, **fields) -> Optional[Project]:
        p = self.get(pid)
        if not p:
            return None
        for k, v in fields.items():
            if hasattr(p, k):
                setattr(p, k, v)
        self.save(p)
        return p

    def delete(self, pid: str):
        path = self._path(pid)
        if path.exists():
            path.unlink()
        self._cache = None

    # ── Steps ─────────────────────────────────────────────────────────────

    def add_step(self, pid: str, name: str, due: Optional[date] = None):
        p = self.get(pid)
        if not p:
            return
        p.steps.append(ProjectStep(name, False, due))
        self.save(p)

    def set_step(self, pid: str, index: int, **fields):
        p = self.get(pid)
        if not p or not (0 <= index < len(p.steps)):
            return
        step = p.steps[index]
        for k, v in fields.items():
            if hasattr(step, k):
                setattr(step, k, v)
        self.save(p)

    def remove_step(self, pid: str, index: int):
        p = self.get(pid)
        if not p or not (0 <= index < len(p.steps)):
            return
        p.steps.pop(index)
        self.save(p)

    # ── Queries ───────────────────────────────────────────────────────────

    def filtered(self, query: str = "", status: str = "") -> list:
        out = []
        for p in self.projects():
            if query and not p.matches(query):
                continue
            if status and p.status != status:
                continue
            out.append(p)
        return out

    def steps_due_on(self, d: date) -> list:
        """[(project, step)] for every open step scheduled for that day."""
        out = []
        for p in self.projects():
            for s in p.steps_due_on(d):
                out.append((p, s))
        return out

    def active_projects(self) -> list:
        return [p for p in self.projects() if p.status == P_ACTIVE]
