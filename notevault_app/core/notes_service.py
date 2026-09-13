"""
NoteVault Notes Service
Everything the notes explorer needs beyond plain file CRUD: bookmarks,
full-text search, numeric ordering, and linked / unlinked mentions.
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .vault_manager import (
    VaultManager, Note, is_reserved, is_ignored_dir, MAX_SCAN_NOTES,
)

from .file_kinds import kind_for
# Media copied into notes lives here; it is not a note and never listed.
from .attachments import ATTACHMENTS_DIR

BOOKMARKS_FILE = ".notevault-bookmarks.json"

_DIGITS = re.compile(r"(\d+)")


def numeric_key(name: str):
    """Natural order: every run of digits compares as a number.

    Only reading the leading number put "1.10" before "1.2" and "Fase 10"
    before "Fase 2". Splitting on every digit run orders "1.2" < "1.10",
    "Paso 9" < "Paso 10" and "0.4" < "1.1". Names that start with a number
    still come before names that do not, because an empty text chunk sorts
    before any letter.
    """
    key = []
    for i, chunk in enumerate(_DIGITS.split(name)):
        if i % 2:
            key.append((0, int(chunk), ""))
        else:
            key.append((1, 0, chunk.lower()))
    return key


@dataclass
class SearchHit:
    path: Path
    title: str
    line_no: int
    line: str


@dataclass
class Mention:
    path: Path
    title: str
    line_no: int
    line: str
    linked: bool


class NotesService:
    """Sits on top of VaultManager and owns notes-explorer state."""

    def __init__(self, vault: VaultManager):
        self.vault = vault

    # ── Paths ─────────────────────────────────────────────────────────────

    @property
    def root(self) -> Path:
        return self.vault.vault_root

    def _bookmarks_path(self) -> Path:
        return self.root / BOOKMARKS_FILE

    # ── Bookmarks ─────────────────────────────────────────────────────────

    def bookmarks(self) -> list:
        """Bookmarked note paths that still exist, in the saved order."""
        path = self._bookmarks_path()
        if not path.exists():
            return []
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return []
        out = []
        for rel in raw:
            p = self.root / rel
            if p.exists():
                out.append(p)
        return out

    def _save_bookmarks(self, paths: list):
        rels = []
        for p in paths:
            try:
                rels.append(str(Path(p).relative_to(self.root)).replace("\\", "/"))
            except ValueError:
                continue
        self._bookmarks_path().write_text(
            json.dumps(rels, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    def is_bookmarked(self, path: Path) -> bool:
        return Path(path) in self.bookmarks()

    def toggle_bookmark(self, path: Path) -> bool:
        """Add or remove a bookmark. Returns the new state."""
        path = Path(path)
        current = self.bookmarks()
        if path in current:
            current.remove(path)
            self._save_bookmarks(current)
            return False
        current.append(path)
        self._save_bookmarks(current)
        return True

    def remove_bookmark(self, path: Path):
        current = self.bookmarks()
        path = Path(path)
        if path in current:
            current.remove(path)
            self._save_bookmarks(current)

    # ── Tree ──────────────────────────────────────────────────────────────

    def tree(self, numeric_sort: bool = True) -> list:
        """Top-level entries only. Children are read when a folder opens."""
        return self.children_of(self.root, numeric_sort)

    def children_of(self, folder: Path, numeric_sort: bool = True) -> list:
        """One level of the tree: folders first, then markdown files.

        Reading a single level keeps opening a huge folder instant; the
        explorer asks for the next level only when the user expands it.
        """
        folder = Path(folder)
        try:
            entries = list(folder.iterdir())
        except (OSError, ValueError):
            return []

        folders, files = [], []
        for entry in entries:
            try:
                is_dir = entry.is_dir()
            except OSError:
                continue
            if is_dir:
                if is_ignored_dir(entry) or entry.name == ATTACHMENTS_DIR:
                    continue
                if entry.parent == self.root and is_reserved(entry, self.root):
                    continue
                folders.append(entry)
            elif not entry.name.startswith(".") and kind_for(entry):
                files.append(entry)

        key = (lambda p: numeric_key(p.name)) if numeric_sort \
            else (lambda p: p.name.lower())
        folders.sort(key=key)
        files.sort(key=key)

        items = [{"type": "folder", "name": f.name, "path": f, "children": None}
                 for f in folders]
        for f in files:
            kind = kind_for(f)
            # Notes show their title; code keeps its extension, which is how
            # a script is told apart from a note of the same name.
            items.append({"type": "note", "kind": kind,
                          "name": f.stem if kind == "note" else f.name,
                          "path": f})
        return items

    def has_children(self, folder: Path) -> bool:
        """Cheap check so a folder can show an expand arrow before it opens."""
        folder = Path(folder)
        try:
            for entry in folder.iterdir():
                try:
                    if entry.is_dir():
                        if is_ignored_dir(entry) or entry.name == ATTACHMENTS_DIR:
                            continue
                        if entry.parent == self.root and is_reserved(
                                entry, self.root):
                            continue
                        return True
                    if kind_for(entry):
                        return True
                except OSError:
                    continue
        except (OSError, ValueError):
            return False
        return False

    def notes_in_folder(self, folder: Path, recursive: bool = False) -> list:
        """Every .md directly inside folder (or below it when recursive)."""
        folder = Path(folder)
        if not folder.exists():
            return []
        try:
            it = folder.rglob("*.md") if recursive else folder.glob("*.md")
            candidates = list(it)
        except (OSError, ValueError):
            return []
        out = [
            p for p in candidates
            if not any(part.startswith(".") for part in p.parts)
            and not any(part in ("node_modules", "__pycache__")
                        for part in p.parts)
            and not is_reserved(p, self.root)
        ]
        out.sort(key=lambda p: numeric_key(p.name))
        return out

    # ── Search ────────────────────────────────────────────────────────────

    def search(self, query: str, limit: int = 200) -> list:
        """Case-insensitive search over titles and body lines."""
        q = query.strip().lower()
        if not q:
            return []
        hits = []
        for note in self.vault.all_notes():
            try:
                text = note.raw
            except Exception:
                continue
            if q in note.title.lower():
                hits.append(SearchHit(note.path, note.title, 0, note.title))
            if q not in text.lower():
                continue
            for i, line in enumerate(text.splitlines(), start=1):
                if q in line.lower():
                    hits.append(
                        SearchHit(note.path, note.title, i, line.strip()[:180])
                    )
                    if len(hits) >= limit:
                        return hits
        return hits

    # ── Mentions ──────────────────────────────────────────────────────────

    def mentions(self, note: Note) -> tuple:
        """(linked, unlinked) mentions of note across the whole vault.

        Linked   = another note contains [[This note]].
        Unlinked = another note writes the title as plain text, with no link.
        """
        title = note.title.strip()
        if not title:
            return ([], [])

        linked, unlinked = [], []
        scanned = 0
        link_re = re.compile(
            r"\[\[\s*" + re.escape(title) + r"\s*(\|[^\]]*)?\]\]", re.IGNORECASE
        )
        plain_re = re.compile(
            r"(?<![\w\[])" + re.escape(title) + r"(?![\w\]])", re.IGNORECASE
        )

        for other in self.vault.all_notes(limit=MAX_SCAN_NOTES):
            if other.path == note.path:
                continue
            scanned += 1
            try:
                text = other.raw
            except Exception:
                continue
            if title.lower() not in text.lower():
                continue
            for i, line in enumerate(text.splitlines(), start=1):
                if link_re.search(line):
                    linked.append(Mention(other.path, other.title, i,
                                          line.strip()[:200], True))
                elif plain_re.search(line):
                    unlinked.append(Mention(other.path, other.title, i,
                                            line.strip()[:200], False))
        return (linked, unlinked)

    # ── Mutations ─────────────────────────────────────────────────────────

    def create_note(self, title: str, folder: Optional[Path] = None) -> Note:
        return self.vault.create_note(title, folder)

    def create_folder(self, name: str, parent: Optional[Path] = None) -> Path:
        return self.vault.create_folder(name, parent)

    def rename_path(self, path: Path, new_name: str) -> Path:
        path = Path(path)
        safe = re.sub(r'[\\/:*?"<>|]', "_", new_name).strip()
        if not safe:
            return path
        if path.is_dir():
            target = path.parent / safe
        elif kind_for(path) == "note":
            target = path.parent / (safe if safe.endswith(".md") else safe + ".md")
        else:
            # A script keeps its own extension unless the new name gives one.
            target = path.parent / (safe if Path(safe).suffix else safe + path.suffix)
        if target == path or target.exists():
            return path
        path.rename(target)
        return target

    def delete_path(self, path: Path):
        """Move a note or folder into the vault's .trash."""
        path = Path(path)
        trash = self.root / ".trash"
        trash.mkdir(exist_ok=True)
        dest = trash / path.name
        counter = 1
        while dest.exists():
            dest = trash / f"{path.stem}_{counter}{path.suffix}"
            counter += 1
        path.rename(dest)
        self.remove_bookmark(path)

    def set_vault(self, vault: VaultManager):
        self.vault = vault
