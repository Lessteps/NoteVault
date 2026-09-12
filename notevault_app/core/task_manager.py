"""
NoteVault Task Manager
Data layer for the Tareas / Proyectos module.

Every task is a real markdown file the user can open and edit:
    {vault}/tareas/<task-id>.md

    ---
    id: t20260911-abc123
    name: Ensayo de historia
    created: 2026-09-11
    start: 2026-09-11          # "fecha de salida" (cuando se asigna)
    due: 2026-09-20            # fecha límite
    status: Sin empezar
    subject: Historia
    priority: 2                # 1..3 estrellas
    reminder: 2026-09-19T18:00 # opcional
    reminder_done: false
    ---

    (cuerpo markdown libre — el "archivo interno" de la tarea)
"""

import re
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Optional

STATUS_TODO   = "Sin empezar"
STATUS_DOING  = "En progreso"
STATUS_DONE   = "Completado"
STATUS_BLOCK  = "Bloqueado"
STATUSES = [STATUS_TODO, STATUS_DOING, STATUS_DONE, STATUS_BLOCK]

STATUS_COLORS = {
    STATUS_TODO:  "#8b8b96",
    STATUS_DOING: "#2383e2",
    STATUS_DONE:  "#4ade80",
    STATUS_BLOCK: "#f2555a",
}

PRIORITY_MAX = 3

MONTH_NAMES_ES = [
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]
WEEKDAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]


def parse_date(value: str) -> Optional[date]:
    value = (value or "").strip()
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def parse_dt(value: str) -> Optional[datetime]:
    value = (value or "").strip()
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def fmt_date(d: Optional[date]) -> str:
    if not d:
        return "—"
    return f"{d.day} de {MONTH_NAMES_ES[d.month].lower()}, {d.year}"


def fmt_date_short(d: Optional[date]) -> str:
    return d.strftime("%d/%m/%Y") if d else "—"


class Task:
    def __init__(self, tid: str, **fields):
        self.id: str = tid
        self.name: str = fields.get("name", "Sin título")
        self.created: Optional[date] = fields.get("created") or date.today()
        self.start: Optional[date] = fields.get("start")
        self.due: Optional[date] = fields.get("due")
        self.status: str = fields.get("status", STATUS_TODO)
        self.subject: str = fields.get("subject", "")
        self.priority: int = int(fields.get("priority", 1) or 1)
        self.reminder: Optional[datetime] = fields.get("reminder")
        self.reminder_done: bool = bool(fields.get("reminder_done", False))
        self.body: str = fields.get("body", "")

    # ── Helpers ───────────────────────────────────────────────────────────

    @property
    def is_done(self) -> bool:
        return self.status == STATUS_DONE

    @property
    def is_overdue(self) -> bool:
        return bool(self.due and not self.is_done and self.due < date.today())

    def stars(self) -> str:
        p = max(1, min(PRIORITY_MAX, self.priority))
        return "★" * p + "☆" * (PRIORITY_MAX - p)

    def matches(self, query: str) -> bool:
        q = query.strip().lower()
        if not q:
            return True
        haystack = " ".join([
            self.name, self.subject, self.status, self.body,
        ]).lower()
        return q in haystack


class TaskManager:
    def __init__(self, vault_root: Path):
        self.vault_root = Path(vault_root)
        self.tasks_dir = self.vault_root / "tareas"
        self._cache: Optional[list] = None

    # ── Paths ─────────────────────────────────────────────────────────────

    def _path(self, task_id: str) -> Path:
        return self.tasks_dir / f"{task_id}.md"

    # ── Load / save ───────────────────────────────────────────────────────

    def tasks(self, force: bool = False) -> list:
        if self._cache is None or force:
            self._cache = self._load_all()
        return self._cache

    def _load_all(self) -> list:
        if not self.tasks_dir.exists():
            return []
        out = []
        for p in sorted(self.tasks_dir.glob("*.md")):
            t = self._parse(p)
            if t:
                out.append(t)
        out.sort(key=lambda t: (t.due or date.max, -t.priority, t.name.lower()))
        return out

    def _parse(self, path: Path) -> Optional[Task]:
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            return None

        fm: dict = {}
        body_lines: list = []
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
                body_lines.append(line)

        tid = fm.get("id") or path.stem
        return Task(
            tid,
            name=fm.get("name", path.stem),
            created=parse_date(fm.get("created", "")) or date.today(),
            start=parse_date(fm.get("start", "")),
            due=parse_date(fm.get("due", "")),
            status=fm.get("status", STATUS_TODO),
            subject=fm.get("subject", ""),
            priority=int(fm.get("priority", "1") or 1),
            reminder=parse_dt(fm.get("reminder", "")),
            reminder_done=fm.get("reminder_done", "false") == "true",
            body="\n".join(body_lines).strip(),
        )

    def save(self, task: Task):
        self.tasks_dir.mkdir(parents=True, exist_ok=True)
        lines = [
            "---",
            f"id: {task.id}",
            f'name: "{task.name}"',
            f"created: {task.created.isoformat() if task.created else ''}",
            f"start: {task.start.isoformat() if task.start else ''}",
            f"due: {task.due.isoformat() if task.due else ''}",
            f"status: {task.status}",
            f'subject: "{task.subject}"',
            f"priority: {task.priority}",
            f"reminder: {task.reminder.isoformat(timespec='minutes') if task.reminder else ''}",
            f"reminder_done: {'true' if task.reminder_done else 'false'}",
            "---",
            "",
            task.body.strip(),
            "",
        ]
        self._path(task.id).write_text("\n".join(lines), encoding="utf-8")
        self._cache = None

    # ── CRUD ──────────────────────────────────────────────────────────────

    def create(self, name: str = "Nueva tarea", **fields) -> Task:
        tid = f"t{date.today().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6]}"
        task = Task(tid, name=name, created=date.today(), **fields)
        self.save(task)
        return task

    def get(self, task_id: str) -> Optional[Task]:
        for t in self.tasks():
            if t.id == task_id:
                return t
        return None

    def update(self, task_id: str, **fields) -> Optional[Task]:
        task = self.get(task_id)
        if not task:
            return None
        for k, v in fields.items():
            if hasattr(task, k):
                setattr(task, k, v)
        self.save(task)
        return task

    def delete(self, task_id: str):
        p = self._path(task_id)
        if p.exists():
            p.unlink()
        self._cache = None

    # ── Queries ───────────────────────────────────────────────────────────

    def subjects(self) -> list:
        return sorted({t.subject for t in self.tasks() if t.subject})

    def due_on(self, d: date) -> list:
        return [t for t in self.tasks() if t.due == d]

    def filtered(self, query: str = "", status: str = "",
                 subject: str = "", priority: int = 0,
                 hide_done: bool = False) -> list:
        out = []
        for t in self.tasks():
            if query and not t.matches(query):
                continue
            if status and t.status != status:
                continue
            if subject and t.subject != subject:
                continue
            if priority and t.priority != priority:
                continue
            if hide_done and t.is_done:
                continue
            out.append(t)
        return out

    # ── Reminders ─────────────────────────────────────────────────────────

    def upcoming_reminders(self) -> list:
        """Tasks with a reminder that has not fired yet, soonest first."""
        items = [t for t in self.tasks() if t.reminder and not t.reminder_done]
        items.sort(key=lambda t: t.reminder)
        return items

    def due_reminders(self, now: Optional[datetime] = None) -> list:
        """Reminders whose time has arrived and that were never shown."""
        now = now or datetime.now()
        return [t for t in self.tasks()
                if t.reminder and not t.reminder_done and t.reminder <= now]

    def mark_reminder_shown(self, task_id: str):
        self.update(task_id, reminder_done=True)
