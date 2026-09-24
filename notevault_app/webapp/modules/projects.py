"""Proyectos: the bridge over core.project_manager (a single-user Jira)."""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path, PurePosixPath
from typing import Any, Optional

from ...core import store, vault_format
from ...core.project_manager import (
    PALETTE, PROJECT_STATUS_COLORS, PROJECT_STATUSES, T_GOAL, T_SUBTASK, TYPE_COLOURS, TYPE_ICONS,
    Issue, Project, ProjectStats,
)
from ...core.recurrence import Recurrence
from ..errors import ApiError
from .common import clamp_int, iso, one_line, opt_date, opt_datetime, opt_time
from .files import check_ref

_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
_KEY_RE = re.compile(r"^[A-Z0-9]{1,8}$")
MAX_NOTE_BYTES = 5 * 1024 * 1024


def _list_item(value: Any, max_len: int = 60) -> str:
    # Lists are stored comma-separated: a comma would split the item.
    return one_line(value, max_len).replace(",", " ").strip()


def issue_dict(i: Issue, today: date) -> dict:
    extra = i.extra or {}
    notes = extra.get("linked_notes") or []
    if isinstance(notes, str):
        notes = [notes]
    return {
        "id": i.id, "number": i.number, "key": i.key, "type": i.type, "icon": TYPE_ICONS.get(i.type, ""),
        "type_colour": TYPE_COLOURS.get(i.type, "#8b8b96"), "parent": i.parent, "title": i.title,
        "status": i.status, "priority": i.priority, "order": i.order, "estimate_min": i.estimate_min,
        "labels": list(i.labels), "created": iso(i.created), "start": iso(i.start), "due": iso(i.due),
        "due_time": i.due_time, "repeat": i.repeat, "repeat_until": iso(i.repeat_until),
        "in_calendar": i.in_calendar, "reminder": iso(i.reminder), "done_at": iso(i.done_at),
        "attachments": list(i.attachments), "updated": iso(i.updated), "description": i.description,
        "children": [c.id for c in i.children], "done": i.is_done, "overdue": i.is_overdue(today),
        "linked_folder": str(extra.get("linked_folder") or ""),
        "linked_notes": [str(n) for n in notes if isinstance(n, str)],
    }


def project_dict(p: Project, today: date) -> dict:
    return {
        "id": p.id, "key": p.key, "name": p.name, "status": p.status,
        "status_colour": PROJECT_STATUS_COLORS.get(p.status, "#8b8b96"), "area": p.area,
        "colour": p.colour, "icon": p.icon, "created": iso(p.created), "start": iso(p.start),
        "deadline": iso(p.deadline), "columns": list(p.columns), "done_column": p.done_column,
        "in_calendar": p.in_calendar, "description": p.description,
        "days_left": p.days_left(today), "overdue": p.is_overdue(today),
    }


class ProjectsApi:
    """Mixed into NoteVaultApi; relies on its _lock, _root and _mgrs()."""

    def _pm(self):
        return self._mgrs().projects

    def _need_project(self, pid: Any) -> Project:
        p = self._pm().get(str(pid))
        if p is None:
            raise ApiError("Ese proyecto ya no existe.")
        return p

    def _need_issue(self, pid: str, xid: Any) -> Issue:
        i = self._pm().get_issue(pid, str(xid))
        if i is None:
            raise ApiError("Ese issue ya no existe.")
        return i

    # ── projects ──────────────────────────────────────────────────────────

    def projects_meta(self) -> dict:
        return {"statuses": list(PROJECT_STATUSES), "status_colours": PROJECT_STATUS_COLORS,
                "types": list(vault_format.ISSUE_TYPES), "type_icons": TYPE_ICONS,
                "type_colours": TYPE_COLOURS, "palette": PALETTE,
                "default_columns": list(vault_format.DEFAULT_COLUMNS)}

    def projects_list(self) -> list:
        """Every project with the numbers its board card shows."""
        with self._lock:
            pm = self._pm()
            today = date.today()
            out = []
            for p in pm.projects():
                stats = ProjectStats(pm, p, today)
                s = stats.summary()
                nxt = stats.next_due()
                d = project_dict(p, today)
                d.update(summary=s, throughput=[n for _d, n in stats.throughput(8)],
                         next_due={"key": nxt.key, "title": nxt.title, "due": iso(nxt.due)} if nxt else None)
                out.append(d)
            return out

    def projects_get(self, pid: str) -> dict:
        """One project: its issues and every statistic of the Resumen tab."""
        with self._lock:
            pm = self._pm()
            p = self._need_project(pid)
            pm.fix_duplicate_numbers(p.id)
            today = date.today()
            stats = ProjectStats(pm, p, today)
            days, remaining, ideal = stats.burndown()
            return {
                "project": project_dict(p, today),
                "progress": pm.progress(p),
                "issues": [issue_dict(i, today) for i in sorted(pm.issues(p.id), key=lambda i: (i.order, i.number))],
                "stats": {
                    "summary": stats.summary(),
                    "by_status": stats.by_status(),
                    "by_priority": stats.by_priority(),
                    "by_type": stats.by_type(),
                    "submetas": [{"id": g.id, **s} for g, s in stats.submetas()],
                    "burndown": {"days": [d.isoformat() for d in days], "remaining": remaining, "ideal": ideal},
                    "throughput": [[d.isoformat(), n] for d, n in stats.throughput(8)],
                    "cycle_days": stats.cycle_days(),
                },
            }

    @staticmethod
    def _project_fields(fields: Any) -> dict:
        if not isinstance(fields, dict):
            raise ApiError("Datos de proyecto inválidos.")
        out: dict = {}
        if "name" in fields:
            out["name"] = one_line(fields["name"], 120) or "Nuevo proyecto"
        if "key" in fields:
            key = one_line(fields["key"], 8).upper()
            if key and not _KEY_RE.match(key):
                raise ApiError("La clave solo admite letras y números (máx. 8).")
            if key:
                out["key"] = key
        if "icon" in fields:
            out["icon"] = one_line(fields["icon"], 8)
        if "status" in fields:
            if fields["status"] not in PROJECT_STATUSES:
                raise ApiError("Estado inválido.")
            out["status"] = fields["status"]
        if "area" in fields:
            out["area"] = re.sub(r"[^a-z0-9-]", "", str(fields["area"] or ""))[:60]
        if "colour" in fields:
            c = str(fields["colour"] or "")
            if not _HEX_RE.match(c):
                raise ApiError("Color inválido.")
            out["colour"] = c
        for k in ("start", "deadline"):
            if k in fields:
                out[k] = opt_date(fields[k])
        if "in_calendar" in fields:
            out["in_calendar"] = bool(fields["in_calendar"])
        if "description" in fields:
            out["description"] = str(fields["description"] or "")[:100_000]
        return out

    @staticmethod
    def _columns(fields: dict):
        cols = fields.get("columns")
        if cols is None:
            return None
        if not isinstance(cols, list):
            raise ApiError("Columnas inválidas.")
        clean = []
        for c in cols:
            c = _list_item(c, 40)
            if c and c not in clean:
                clean.append(c)
        if not clean:
            raise ApiError("El flujo necesita al menos una columna.")
        done = _list_item(fields.get("done_column"), 40)
        renames = fields.get("renames") or {}
        if not isinstance(renames, dict):
            raise ApiError("Datos inválidos.")
        renames = {_list_item(k, 40): _list_item(v, 40) for k, v in renames.items()}
        return clean, (done if done in clean else clean[-1]), renames

    def projects_create(self, fields: dict) -> dict:
        with self._lock:
            f = self._project_fields(fields)
            cols = self._columns(fields)
            pm = self._pm()
            name = f.pop("name", "Nuevo proyecto")
            if "key" in f and f["key"] in {p.key for p in pm.projects()}:
                raise ApiError("Esa clave ya la usa otro proyecto.")
            if cols:
                f["columns"], f["done_column"] = cols[0], cols[1]
            p = pm.create(name, **f)
            return project_dict(p, date.today())

    def projects_update(self, pid: str, fields: dict) -> dict:
        with self._lock:
            p = self._need_project(pid)
            f = self._project_fields(fields)
            cols = self._columns(fields)
            pm = self._pm()
            if "key" in f and f["key"] != p.key and f["key"] in {o.key for o in pm.projects()}:
                raise ApiError("Esa clave ya la usa otro proyecto.")
            pm.update(p.id, **f)
            if cols and (cols[0] != p.columns or cols[1] != p.done_column or cols[2]):
                pm.set_columns(p.id, cols[0], cols[1], cols[2])
            return project_dict(pm.get(p.id), date.today())

    def projects_delete(self, pid: str) -> dict:
        """The project folder goes to the vault trash."""
        with self._lock:
            p = self._need_project(pid)
            self._pm().delete(p.id)
            return {"ok": True}

    # ── issues ────────────────────────────────────────────────────────────

    def _issue_fields(self, p: Project, fields: Any) -> dict:
        if not isinstance(fields, dict):
            raise ApiError("Datos de issue inválidos.")
        out: dict = {}
        if "title" in fields:
            out["title"] = one_line(fields["title"], 200) or "Nuevo issue"
        if "type" in fields:
            if fields["type"] not in vault_format.ISSUE_TYPES:
                raise ApiError("Tipo inválido.")
            out["type"] = fields["type"]
        if "status" in fields:
            if fields["status"] not in p.columns:
                raise ApiError("Estado inválido.")
            out["status"] = fields["status"]
        if "priority" in fields:
            out["priority"] = clamp_int(fields["priority"], 1, 4, 2)
        if "parent" in fields:
            parent = str(fields["parent"] or "")
            if parent and self._pm().get_issue(p.id, parent) is None:
                raise ApiError("El padre ya no existe.")
            out["parent"] = parent
        for k in ("start", "due", "repeat_until"):
            if k in fields:
                out[k] = opt_date(fields[k])
        if "due_time" in fields:
            out["due_time"] = opt_time(fields["due_time"]) or ""
        if "estimate_min" in fields:
            v = fields["estimate_min"]
            out["estimate_min"] = None if v in (None, "") else clamp_int(v, 0, 100_000, 0) or None
        if "reminder" in fields:
            out["reminder"] = opt_datetime(fields["reminder"])
        if "in_calendar" in fields:
            out["in_calendar"] = bool(fields["in_calendar"])
        if "repeat" in fields:
            out["repeat"] = Recurrence.parse(one_line(fields["repeat"], 60)).to_string()
        if "labels" in fields:
            labels = fields["labels"] if isinstance(fields["labels"], list) else str(fields["labels"] or "").split(",")
            out["labels"] = [x for x in (_list_item(v, 40) for v in labels) if x][:30]
        if "description" in fields:
            out["description"] = str(fields["description"] or "")[:200_000]
        if "attachments" in fields:
            refs = fields["attachments"] or []
            if not isinstance(refs, list):
                raise ApiError("Adjuntos inválidos.")
            out["attachments"] = [check_ref(r) for r in refs][:50]
        if "linked_folder" in fields or "linked_notes" in fields:
            extra: dict = {}
            if "linked_folder" in fields:
                extra["linked_folder"] = one_line(fields["linked_folder"], 400)
            if "linked_notes" in fields:
                notes = fields["linked_notes"] or []
                if not isinstance(notes, list):
                    raise ApiError("Notas vinculadas inválidas.")
                extra["linked_notes"] = [one_line(n, 400) for n in notes if one_line(n, 400)][:50]
            out["extra"] = extra
        return out

    def projects_issue_create(self, pid: str, fields: dict) -> dict:
        with self._lock:
            p = self._need_project(pid)
            f = self._issue_fields(p, fields)
            title = f.pop("title", "Nuevo issue")
            i = self._pm().create_issue(p.id, title, **f)
            if i is None:
                raise ApiError("No se pudo crear el issue.")
            return issue_dict(self._pm().get_issue(p.id, i.id) or i, date.today())

    def projects_issue_update(self, pid: str, xid: str, fields: dict) -> dict:
        with self._lock:
            p = self._need_project(pid)
            issue = self._need_issue(p.id, xid)
            f = self._issue_fields(p, fields)
            if f.get("repeat") and not (f.get("due", issue.due)):
                raise ApiError("Un issue que se repite necesita una fecha de vencimiento.")
            parent = f.pop("parent", None)
            if "extra" in f:
                merged = dict(issue.extra or {})
                merged.update(f.pop("extra"))
                f["extra"] = merged
            pm = self._pm()
            pm.update_issue(p.id, issue.id, **f)
            if parent is not None and parent != issue.parent:
                pm.reparent(p.id, issue.id, parent or None)
            return issue_dict(self._need_issue(p.id, issue.id), date.today())

    def projects_issue_move(self, pid: str, xid: str, status: str, index: int) -> dict:
        """Kanban drop: the column and the position in it."""
        with self._lock:
            p = self._need_project(pid)
            self._need_issue(p.id, xid)
            if status not in p.columns:
                raise ApiError("Columna inválida.")
            self._pm().move(p.id, str(xid), status, clamp_int(index, 0, 10 ** 6, 0))
            return {"ok": True}

    def projects_issue_delete(self, pid: str, xid: str) -> dict:
        """The issue and its descendants go to the vault trash."""
        with self._lock:
            p = self._need_project(pid)
            self._need_issue(p.id, xid)
            self._pm().delete_issue(p.id, str(xid))
            return {"ok": True}

    # ── project notes (.notevault/proyectos/<id>/notas) ──────────────────

    def _notes_root(self, pid: str) -> Path:
        p = self._need_project(pid)
        return self._pm().notes_dir(p.id).resolve()

    @staticmethod
    def _notes_path(root: Path, rel: Any, must_exist: bool = True) -> Path:
        text = str(rel or "").strip().replace("\\", "/")
        parts = PurePosixPath(text).parts
        if (not text or text.startswith("/") or "\x00" in text or ":" in text
                or any(x in ("..", ".") or x.startswith(".") for x in parts)):
            raise ApiError("Ruta inválida.")
        path = (root / Path(*parts)).resolve()
        if root not in path.parents:
            raise ApiError("Ruta inválida.")
        if must_exist and not path.exists():
            raise ApiError("Ese documento ya no existe.")
        return path

    def projects_notes_list(self, pid: str) -> list:
        with self._lock:
            root = self._notes_root(pid)
            out = []
            for path in sorted(root.rglob("*")):
                rel = path.relative_to(root)
                if any(part.startswith(".") for part in rel.parts) or path.is_symlink():
                    continue
                if path.is_dir():
                    out.append({"path": rel.as_posix(), "dir": True, "name": path.name})
                elif path.suffix.lower() == ".md":
                    st = path.stat()
                    out.append({"path": rel.as_posix(), "dir": False, "name": path.stem,
                                "size": st.st_size, "modified": st.st_mtime})
            return out

    def projects_note_read(self, pid: str, rel: str) -> dict:
        with self._lock:
            path = self._notes_path(self._notes_root(pid), rel)
            if path.suffix.lower() != ".md" or not path.is_file():
                raise ApiError("Solo notas .md.")
            with open(path, encoding="utf-8", errors="replace", newline="") as fh:
                return {"path": rel, "raw": fh.read(), "modified": path.stat().st_mtime}

    def projects_note_write(self, pid: str, rel: str, raw: str) -> dict:
        with self._lock:
            path = self._notes_path(self._notes_root(pid), rel, must_exist=False)
            if path.suffix.lower() != ".md":
                raise ApiError("Solo notas .md.")
            data = str(raw if raw is not None else "")
            if len(data.encode("utf-8")) > MAX_NOTE_BYTES:
                raise ApiError("La nota es demasiado grande.")
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "w", encoding="utf-8", newline="") as fh:
                fh.write(data)
            return {"ok": True, "modified": path.stat().st_mtime}

    def projects_note_create(self, pid: str, folder: str, name: str, is_folder: bool = False) -> dict:
        with self._lock:
            root = self._notes_root(pid)
            clean = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', " ", str(name or "")).strip().strip(".")[:120]
            if not clean:
                raise ApiError("Falta el nombre.")
            base = self._notes_path(root, folder, must_exist=True) if folder else root
            if not base.is_dir():
                raise ApiError("Carpeta inválida.")
            target = base / (clean if is_folder else f"{clean}.md")
            if target.exists():
                raise ApiError("Ya existe uno con ese nombre.")
            if is_folder:
                target.mkdir(parents=True)
            else:
                target.write_text(f"# {clean}\n\n", encoding="utf-8")
            return {"path": target.relative_to(root).as_posix()}

    def projects_note_delete(self, pid: str, rel: str) -> dict:
        with self._lock:
            path = self._notes_path(self._notes_root(pid), rel)
            store.to_trash(self._root, path, f"proyectos/{pid}/notas")
            return {"ok": True}
