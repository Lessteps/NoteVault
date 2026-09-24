"""Attachments of module entities (issue screenshots, invoices) and the
Áreas de vida shared by Metas, Proyectos and Hábitos."""

from __future__ import annotations

import base64
import mimetypes
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path, PurePosixPath

from ...core import module_attachments as ma
from ...core import vault_format
from ..errors import ApiError
from .common import one_line

MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
ATTACH_MODULES = ("proyectos", "finanzas")
_OWNER_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def check_ref(ref) -> str:
    """A stored reference: 'proyectos/adjuntos/2026/09/x…-1.png'."""
    text = str(ref or "").strip()
    parts = PurePosixPath(text).parts
    if (not text or text.startswith("/") or "\\" in text or ".." in parts
            or len(parts) < 3 or parts[0] not in ATTACH_MODULES or parts[1] != "adjuntos"
            or PurePosixPath(text).suffix.lower() not in vault_format.ATTACHMENT_EXTS):
        raise ApiError("Adjunto inválido.")
    return text


def open_with_system(path: Path):
    """The path is already confined and of a known safe type; no shell."""
    if sys.platform.startswith("win"):
        os.startfile(str(path))  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path)])


class FilesApi:
    """Mixed into NoteVaultApi; relies on its _lock, _root and _mgrs()."""

    # ── attachments ───────────────────────────────────────────────────────

    def attach_add(self, module: str, owner: str, filename: str, data_b64: str) -> dict:
        """Store an uploaded image or PDF; returns its reference."""
        with self._lock:
            if module not in ATTACH_MODULES:
                raise ApiError("Módulo inválido.")
            if not _OWNER_RE.match(str(owner or "")):
                raise ApiError("Dueño inválido.")
            ext = PurePosixPath(str(filename or "")).suffix.lower()
            if ext not in vault_format.ATTACHMENT_EXTS:
                raise ApiError("Solo imágenes o PDF.")
            try:
                raw = base64.b64decode(str(data_b64 or ""), validate=True)
            except ValueError:
                raise ApiError("Archivo inválido.") from None
            if not raw or len(raw) > MAX_ATTACHMENT_BYTES:
                raise ApiError("El archivo está vacío o pasa de 15 MB.")
            with tempfile.TemporaryDirectory() as tmp:
                src = Path(tmp) / f"upload{ext}"
                src.write_bytes(raw)
                ref = ma.store_file(self._root, module, owner, src)
            return {"ref": ref}

    def attach_read(self, ref: str) -> dict:
        with self._lock:
            path = ma.resolve(self._root, check_ref(ref))
            if path is None:
                raise ApiError("El archivo todavía no está disponible.")
            path = path.resolve()
            if self._root not in path.parents:
                raise ApiError("El adjunto está fuera del vault.")
            if path.stat().st_size > MAX_ATTACHMENT_BYTES:
                raise ApiError("El archivo es demasiado grande.")
            mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            return {"name": path.name, "mime": mime,
                    "data_url": f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"}

    def attach_open(self, ref: str) -> dict:
        """Open an attachment (a PDF, say) with the system's default app."""
        with self._lock:
            path = ma.resolve(self._root, check_ref(ref))
            if path is None:
                raise ApiError("El archivo todavía no está disponible.")
            path = path.resolve()
            if self._root not in path.parents:
                raise ApiError("El adjunto está fuera del vault.")
            open_with_system(path)
            return {"ok": True}

    def attach_remove(self, ref: str) -> dict:
        """Sends the file to the vault trash."""
        with self._lock:
            ref = check_ref(ref)
            ma.remove(self._root, ref, ref.split("/")[0])
            return {"ok": True}

    # ── áreas ─────────────────────────────────────────────────────────────

    def areas_list(self, include_archived: bool = False) -> list:
        with self._lock:
            return self._mgrs().areas.areas(include_archived=bool(include_archived))

    def areas_save(self, area_id: str, fields: dict) -> dict:
        """Create (empty id) or edit an area: name, icon, colour."""
        with self._lock:
            if not isinstance(fields, dict):
                raise ApiError("Datos inválidos.")
            name = one_line(fields.get("name"), 60)
            icon = one_line(fields.get("icon"), 8)
            colour = str(fields.get("colour") or "#7986cb")
            if not _HEX_RE.match(colour):
                raise ApiError("Color inválido.")
            am = self._mgrs().areas
            if not area_id:
                if not name:
                    raise ApiError("El área necesita un nombre.")
                return am.create(name, icon, colour)
            if am.get(str(area_id)) is None:
                raise ApiError("Esa área ya no existe.")
            patch = {"icon": icon, "colour": colour}
            if name:
                patch["name"] = name
            return am.update(str(area_id), **patch)

    def areas_archive(self, area_id: str, archived: bool = True) -> dict:
        with self._lock:
            am = self._mgrs().areas
            if am.get(str(area_id)) is None:
                raise ApiError("Esa área ya no existe.")
            am.archive(str(area_id), bool(archived))
            return {"ok": True}

    def areas_create_suggested(self) -> list:
        with self._lock:
            am = self._mgrs().areas
            am.create_suggested()
            return am.areas()
