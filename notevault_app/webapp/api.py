"""
The bridge between the web UI and NoteVault's Python logic.

Every public method here is callable from JavaScript, so the rules are:

- Paths coming from the UI are vault-relative POSIX strings. `_resolve()`
  turns them into real paths and refuses anything that escapes the vault
  (absolute paths, `..`, symlinks pointing out) or touches internal folders
  (any component starting with a dot: .trash, .notevault, .obsidian…).
- Only notes and existing code files are ever written, and never above
  MAX_WRITE_BYTES.
- Return values are plain JSON types. Failures raise ApiError, which both
  transports (pywebview, the dev HTTP bridge) hand to JS as a rejected call.
- pywebview exposes public methods *and walks public attributes*, so every
  piece of state is kept in underscore-prefixed attributes.

pywebview runs each call on its own thread, hence the lock.
"""

from __future__ import annotations

import base64
import mimetypes
import threading
import webbrowser
from urllib.parse import urlparse
from datetime import date, datetime
from pathlib import Path, PurePosixPath
from typing import Any, Optional

from ..config import AppConfig
from ..core import attachments
from ..core.file_kinds import kind_for
from ..core.frontmatter_utils import parse_frontmatter
from ..core.notes_service import NotesService
from ..core.vault_manager import Note, VaultManager

MAX_WRITE_BYTES = 10 * 1024 * 1024
MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}
API_VERSION = 1


class ApiError(ValueError):
    """A request the API refuses; the message is shown to the user."""


def _json_safe(value: Any) -> Any:
    """Frontmatter can hold dates and other YAML types; JSON cannot."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(v) for v in value]
    return str(value)


class NoteVaultApi:
    def __init__(self, vault_path: Optional[Path] = None):
        self._lock = threading.RLock()
        # Window lifecycle (run_web.py): how many notes the UI still has
        # unsaved, and whether closing may go ahead.
        self._window = None
        self._unsaved = 0
        self._close_ok = False
        self._vault: VaultManager
        self._service: NotesService
        self._root: Path
        self._open(Path(vault_path) if vault_path else AppConfig.get_active_vault())

    # ── internals ─────────────────────────────────────────────────────────

    def _open(self, vault_path: Path):
        self._vault = VaultManager(vault_path)
        self._service = NotesService(self._vault)
        self._root = self._vault.vault_root.resolve()

    def _rel(self, path: Path) -> str:
        return path.resolve().relative_to(self._root).as_posix()

    def _resolve(self, rel: str, *, must_exist: bool = True,
                 allow_root: bool = False) -> Path:
        """Vault-relative string -> absolute path inside the vault, or ApiError."""
        if not isinstance(rel, str):
            raise ApiError("Ruta inválida.")
        rel = rel.strip().replace("\\", "/")
        if "\x00" in rel:
            raise ApiError("Ruta inválida.")
        if rel in ("", "."):
            if allow_root:
                return self._root
            raise ApiError("Ruta vacía.")
        pure = PurePosixPath(rel)
        if pure.is_absolute() or (len(rel) > 1 and rel[1] == ":"):
            raise ApiError("Solo se aceptan rutas dentro del vault.")
        if any(part == ".." for part in pure.parts):
            raise ApiError("Solo se aceptan rutas dentro del vault.")
        if any(part.startswith(".") for part in pure.parts):
            raise ApiError("Esa carpeta es interna de NoteVault.")
        path = (self._root / Path(*pure.parts)).resolve()
        if path != self._root and self._root not in path.parents:
            raise ApiError("Solo se aceptan rutas dentro del vault.")
        if must_exist and not path.exists():
            raise ApiError(f"No existe: {rel}")
        return path

    def _entry(self, item: dict) -> dict:
        path = Path(item["path"])
        out = {"type": item["type"], "name": item["name"], "path": self._rel(path)}
        if item["type"] == "folder":
            out["has_children"] = self._service.has_children(path)
        else:
            out["kind"] = item.get("kind") or kind_for(path)
        return out

    # ── app ───────────────────────────────────────────────────────────────

    def app_info(self) -> dict:
        with self._lock:
            return {
                "api_version": API_VERSION,
                "vault_name": self._root.name,
                "vault_path": str(self._root),
                "theme": AppConfig.get_theme(),
            }

    def stats(self) -> dict:
        with self._lock:
            return {"notes": self._vault.stats().get("notes", 0)}

    def set_theme(self, theme: str) -> dict:
        with self._lock:
            AppConfig.set_theme("light" if theme == "light" else "dark")
            return {"theme": AppConfig.get_theme()}

    def open_external(self, url: str) -> dict:
        """Open a link from a note in the system browser. The app window
        itself never navigates away: a remote page loaded there would get
        this API. Only web and mail links are allowed."""
        url = (url or "").strip()
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https", "mailto") or \
                (parsed.scheme != "mailto" and not parsed.netloc):
            raise ApiError("Solo se abren enlaces http(s) o mailto.")
        webbrowser.open(url, new=2)
        return {"ok": True}

    # ── window lifecycle ──────────────────────────────────────────────────

    def set_unsaved(self, count: int) -> dict:
        """The UI reports how many open notes are not saved yet."""
        self._unsaved = max(0, int(count))
        return {"ok": True}

    def close_window(self) -> dict:
        """Called by the UI once it has saved everything on close."""
        self._close_ok = True
        window = self._window
        if window is not None:
            threading.Thread(target=window.destroy, daemon=True).start()
        return {"ok": True}

    def _attach_window(self, window) -> None:
        self._window = window

    def _on_closing(self) -> bool:
        """pywebview closing handler: False cancels the close.

        With unsaved notes, ask the page to save and then close itself; a
        second close request always goes through."""
        if self._close_ok or self._unsaved == 0 or self._window is None:
            return True
        self._close_ok = True
        window = self._window
        # run_js waits on the GUI thread, which is the one closing the
        # window right now: call it from another thread or it deadlocks.
        threading.Thread(target=window.run_js, daemon=True, args=(
            "Promise.resolve(window.__nvFlush && window.__nvFlush())"
            ".finally(function () { window.pywebview.api.close_window(); });",
        )).start()
        return False

    # ── tree ──────────────────────────────────────────────────────────────

    def list_dir(self, rel: str = "") -> list:
        with self._lock:
            folder = self._resolve(rel, allow_root=True)
            if not folder.is_dir():
                raise ApiError("No es una carpeta.")
            return [self._entry(i) for i in self._service.children_of(folder)]

    def note_index(self, limit: int = 5000) -> list:
        """Every note's path and title, for the quick switcher (Ctrl+P)."""
        with self._lock:
            limit = max(1, min(int(limit), 20000))
            out = []
            for path in self._vault.note_paths(limit=limit):
                try:
                    rel = self._rel(path)
                except ValueError:
                    continue
                if any(part.startswith(".") for part in PurePosixPath(rel).parts):
                    continue
                out.append({"path": rel, "title": Path(path).stem})
            return out

    # ── notes ─────────────────────────────────────────────────────────────

    def read_note(self, rel: str) -> dict:
        with self._lock:
            path = self._resolve(rel)
            kind = kind_for(path)
            if not path.is_file() or kind not in ("note", "code"):
                raise ApiError("Ese archivo no se puede abrir como nota.")
            # newline="" keeps CRLF files as CRLF, so a save writes back
            # exactly the line endings the file already had.
            with open(path, encoding="utf-8", errors="replace", newline="") as fh:
                raw = fh.read()
            fm, body = ({}, raw)
            if kind == "note":
                fm, body = parse_frontmatter(raw)
            return {
                "path": self._rel(path),
                "name": path.name,
                "title": path.name if kind == "code" else path.stem,
                "kind": kind,
                "raw": raw,
                "frontmatter": _json_safe(fm or {}),
                "body": body,
                "modified": path.stat().st_mtime,
                "bookmarked": self._service.is_bookmarked(path),
            }

    def write_note(self, rel: str, raw: str,
                   expected_modified: Optional[float] = None) -> dict:
        """Save a note. With expected_modified, refuse to overwrite a file
        that changed on disk since it was read (another app edited it)."""
        with self._lock:
            if not isinstance(raw, str):
                raise ApiError("Contenido inválido.")
            if len(raw.encode("utf-8")) > MAX_WRITE_BYTES:
                raise ApiError("La nota supera el tamaño máximo (10 MB).")
            path = self._resolve(rel, must_exist=False)
            kind = kind_for(path)
            if kind == "code" and not path.is_file():
                raise ApiError("Solo se pueden editar archivos de código existentes.")
            if kind not in ("note", "code"):
                raise ApiError("Solo se pueden guardar notas (.md).")
            if (expected_modified is not None and path.exists()
                    and abs(path.stat().st_mtime - float(expected_modified)) > 1e-6):
                return {"ok": False, "conflict": True,
                        "modified": path.stat().st_mtime}
            path.parent.mkdir(parents=True, exist_ok=True)
            # newline="" keeps the exact line endings the UI sent.
            with open(path, "w", encoding="utf-8", newline="") as fh:
                fh.write(raw)
            self._service.note_written(path, raw)
            return {"ok": True, "conflict": False, "modified": path.stat().st_mtime}

    def create_note(self, title: str, folder_rel: str = "") -> dict:
        with self._lock:
            title = (title or "").strip()
            if not title:
                raise ApiError("El título está vacío.")
            folder = self._resolve(folder_rel, allow_root=True)
            if not folder.is_dir():
                raise ApiError("No es una carpeta.")
            note = self._service.create_note(title, folder)
            return {"path": self._rel(note.path)}

    def create_folder(self, name: str, parent_rel: str = "") -> dict:
        with self._lock:
            name = (name or "").strip()
            if not name or name.startswith("."):
                raise ApiError("Nombre de carpeta inválido.")
            parent = self._resolve(parent_rel, allow_root=True)
            folder = self._service.create_folder(name, parent)
            return {"path": self._rel(folder)}

    def rename(self, rel: str, new_name: str) -> dict:
        with self._lock:
            path = self._resolve(rel)
            new_name = (new_name or "").strip()
            if not new_name or new_name.startswith("."):
                raise ApiError("Nombre inválido.")
            return {"path": self._rel(self._service.rename_path(path, new_name))}

    def delete(self, rel: str) -> dict:
        """Moves to the vault's .trash; nothing is destroyed."""
        with self._lock:
            path = self._resolve(rel)
            self._service.delete_path(path)
            return {"ok": True}

    def move(self, rel: str, dest_folder_rel: str) -> dict:
        with self._lock:
            src = self._resolve(rel)
            dest = self._resolve(dest_folder_rel, allow_root=True)
            if not dest.is_dir():
                raise ApiError("El destino no es una carpeta.")
            if src.is_dir() and (dest == src or src in dest.parents):
                raise ApiError("No se puede mover una carpeta dentro de sí misma.")
            return {"path": self._rel(self._service.move_path(src, dest))}

    # ── links, search, mentions ───────────────────────────────────────────

    def resolve_link(self, target: str) -> dict:
        """[[wikilink]] target -> vault-relative path of the note, or None."""
        with self._lock:
            target = (target or "").split("#")[0].split("|")[0].strip()
            if not target or ".." in PurePosixPath(target.replace("\\", "/")).parts:
                return {"path": None}
            try:
                note = self._vault.resolve_link(target)
            except (ValueError, OSError):
                return {"path": None}
            if note is None:
                return {"path": None}
            path = note.path.resolve()
            if self._root not in path.parents:
                return {"path": None}
            return {"path": self._rel(path)}

    def search(self, query: str, limit: int = 100) -> list:
        with self._lock:
            query = (query or "").strip()
            if not query:
                return []
            limit = max(1, min(int(limit), 500))
            return [
                {"path": self._rel(h.path), "title": h.title,
                 "line_no": h.line_no, "line": h.line}
                for h in self._service.search(query, limit=limit)
            ]

    def mentions(self, rel: str) -> dict:
        with self._lock:
            path = self._resolve(rel)
            linked, unlinked = self._service.mentions(Note(path, self._root))

            def row(m):
                return {"path": self._rel(m.path), "title": m.title,
                        "line_no": m.line_no, "line": m.line}
            return {"linked": [row(m) for m in linked],
                    "unlinked": [row(m) for m in unlinked]}

    # ── bookmarks ─────────────────────────────────────────────────────────

    def bookmarks(self) -> list:
        with self._lock:
            out = []
            for b in self._service.bookmarks_rich():
                if b.get("type") != "note":
                    continue
                try:
                    path = self._resolve(b.get("target", ""))
                except ApiError:
                    continue
                out.append({"path": self._rel(path),
                            "label": b.get("label") or path.stem})
            return out

    def toggle_bookmark(self, rel: str) -> dict:
        with self._lock:
            path = self._resolve(rel)
            return {"bookmarked": bool(self._service.toggle_bookmark(path))}

    # ── attachments ───────────────────────────────────────────────────────

    def read_attachment(self, note_rel: str, name: str) -> dict:
        """An image embedded in a note, as a data: URL. Confined to the vault
        and to image types, so a note cannot pull arbitrary files."""
        with self._lock:
            note = self._resolve(note_rel)
            name = (name or "").strip()
            if not name or name.startswith(("/", "\\")) or ":" in name[:3]:
                raise ApiError("Adjunto inválido.")
            found = attachments.resolve(note, name, self._root)
            if found is None:
                raise ApiError(f"No se encontró el adjunto: {name}")
            path = Path(found).resolve()
            if self._root not in path.parents:
                raise ApiError("El adjunto está fuera del vault.")
            if path.suffix.lower() not in IMAGE_EXTS:
                raise ApiError("Solo se muestran imágenes.")
            size = path.stat().st_size
            if size > MAX_ATTACHMENT_BYTES:
                raise ApiError("La imagen es demasiado grande (15 MB).")
            mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            data = base64.b64encode(path.read_bytes()).decode("ascii")
            return {"data_url": f"data:{mime};base64,{data}"}


def public_methods() -> list[str]:
    """The names both transports are allowed to dispatch."""
    return sorted(n for n in dir(NoteVaultApi)
                  if not n.startswith("_") and callable(getattr(NoteVaultApi, n)))
