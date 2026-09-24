"""Notas extras: templates, the daily note and the tag index."""

from __future__ import annotations

import re
from pathlib import Path

from ...config import AppConfig
from ...core import daily_notes, templates
from ...core.tag_index import TagIndex
from ..errors import ApiError
from .common import one_line

MAX_TEMPLATE_BYTES = 512 * 1024
_TAG_RE = re.compile(r"^[A-Za-z0-9_/\-]{1,80}$")


class NotesExtrasApi:
    """Mixed into NoteVaultApi; relies on its _lock, _root, _rel, _resolve
    and _service."""

    def _inside(self, path: Path) -> bool:
        try:
            path.resolve().relative_to(self._root)
            return True
        except ValueError:
            return False

    def _templates_dir(self) -> Path:
        return AppConfig.get_templates_dir(self._root)

    def _template_path(self, name: str) -> Path:
        name = str(name or "")
        for p in templates.list_templates(self._templates_dir()):
            if p.name == name:
                if p.stat().st_size > MAX_TEMPLATE_BYTES:
                    raise ApiError("La plantilla es demasiado grande.")
                return p
        raise ApiError("Esa plantilla no existe.")

    def templates_list(self) -> dict:
        with self._lock:
            folder = self._templates_dir()
            return {"folder": self._rel(folder) if self._inside(folder) else str(folder),
                    "templates": [{"name": p.name, "title": p.stem}
                                  for p in templates.list_templates(folder)]}

    def template_text(self, name: str, title: str = "") -> dict:
        """The template with its variables expanded, to insert at the cursor."""
        with self._lock:
            path = self._template_path(name)
            return {"text": templates.read_and_expand(path, {"title": one_line(title, 200)})}

    def note_from_template(self, name: str, title: str, folder_rel: str = "") -> dict:
        with self._lock:
            title = one_line(title, 200)
            if not title:
                raise ApiError("El título está vacío.")
            text = templates.read_and_expand(self._template_path(name), {"title": title})
            folder = self._resolve(folder_rel, allow_root=True)
            if not folder.is_dir():
                raise ApiError("No es una carpeta.")
            note = self._service.create_note(title, folder)
            note.path.write_text(text, encoding="utf-8")
            return {"path": self._rel(note.path)}

    def daily_note(self) -> dict:
        """Today's note, created (from the daily template) if missing. A
        configured folder outside the vault falls back to vault/Diario."""
        with self._lock:
            folder = AppConfig.get_daily_notes_dir(self._root)
            if not self._inside(folder):
                folder = self._root / "Diario"
            tmpl = AppConfig.get_daily_notes_template()
            if tmpl is not None and (not tmpl.is_file() or tmpl.stat().st_size > MAX_TEMPLATE_BYTES):
                tmpl = None
            path = daily_notes.open_or_create_today(self._root, folder, tmpl)
            return {"path": self._rel(path)}

    def _tag_index(self) -> TagIndex:
        idx = TagIndex.for_vault(self._service.index)
        idx.build(self._service.index.notes())
        return idx

    def tags_list(self) -> list:
        with self._lock:
            return [{"tag": t, "count": n} for t, n in self._tag_index().all_tags_sorted()]

    def tag_notes(self, tag: str) -> list:
        with self._lock:
            tag = str(tag or "").lstrip("#")
            if not _TAG_RE.match(tag):
                raise ApiError("Etiqueta inválida.")
            out = []
            for p in self._tag_index().paths_for_tag(tag):
                if self._inside(p):
                    out.append({"path": self._rel(p), "title": p.stem})
            return sorted(out, key=lambda x: x["title"].lower())
