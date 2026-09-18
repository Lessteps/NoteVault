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
    VaultManager, Note, is_reserved, is_ignored_dir,
)
from .vault_index import VaultIndex

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
        self.index = VaultIndex.for_vault(vault)
        self._bookmarks_cache = ([], None)      # (paths, mtime of the file)

    # ── Paths ─────────────────────────────────────────────────────────────

    @property
    def root(self) -> Path:
        return self.vault.vault_root

    def _bookmarks_path(self) -> Path:
        return self.root / BOOKMARKS_FILE

    # ── Bookmarks ─────────────────────────────────────────────────────────

    def bookmarks(self) -> list:
        """Bookmarked note paths that still exist, in the saved order.

        Cached against the file's modification time: the editor asks whether
        the note it just opened is bookmarked, and re-reading the list plus
        stat-ing every entry for that one question cost more than loading
        the note itself.
        """
        path = self._bookmarks_path()
        try:
            stamp = path.stat().st_mtime_ns
        except OSError:
            self._bookmarks_cache = ([], None)
            return []
        cached, cached_stamp = self._bookmarks_cache
        if cached_stamp == stamp:
            return list(cached)
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            self._bookmarks_cache = ([], stamp)
            return []
        out = [self.root / rel for rel in raw if (self.root / rel).exists()]
        self._bookmarks_cache = (out, stamp)
        return list(out)

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
        self._bookmarks_cache = ([], None)      # re-read on the next question

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

    # ── Search ────────────────────────────────────────────────────────────

    @staticmethod
    def _parse_query(raw: str):
        """Parse a search query into structured filters.

        Supported operators (AND-combined):
          tag:value       — note must have this tag
          path:value      — vault-relative path contains value
          property:value  — any frontmatter key contains value
          key:value       — shorthand for property (if key not a reserved op)
          "exact phrase"  — body/title contains this literal string
          plain text      — title or body contains each word

        Returns a dict with keys:
          tags, path_frags, properties, phrases, terms
        """
        filters: dict = {
            "tags": [],
            "path_frags": [],
            "properties": [],
            "phrases": [],
            "terms": [],
        }
        # Extract quoted phrases first
        rest = raw
        for phrase in re.findall(r'"([^"]+)"', rest):
            filters["phrases"].append(phrase.lower())
        rest = re.sub(r'"[^"]*"', "", rest)

        KNOWN_OPS = {"tag", "path", "property"}
        for token in rest.split():
            if ":" in token:
                key, _, val = token.partition(":")
                key_l, val_l = key.lower(), val.lower()
                if key_l == "tag":
                    filters["tags"].append(val_l)
                elif key_l == "path":
                    filters["path_frags"].append(val_l)
                elif key_l in ("property", "prop"):
                    filters["properties"].append(val_l)
                else:
                    # Treat unknown key:val as a property filter
                    filters["properties"].append(f"{key_l}:{val_l}")
            elif token:
                filters["terms"].append(token.lower())
        return filters

    def _note_matches(self, note, filters: dict, tag_idx=None) -> bool:
        """Return True if *note* satisfies all active filters (AND logic)."""
        # tag: filter
        if filters["tags"]:
            from .tag_index import TagIndex, _extract_inline_tags, _extract_fm_tags
            if tag_idx is None:
                tag_idx = TagIndex.for_vault(self.index)
            note_tags_lower = {t.lower() for t in tag_idx.tags_for_path(note.path)}
            for wanted in filters["tags"]:
                if not any(wanted in t for t in note_tags_lower):
                    return False

        # path: filter
        rel = note.path.as_posix().lower()
        for frag in filters["path_frags"]:
            if frag not in rel:
                return False

        # property: filter  (scan frontmatter lines)
        if filters["properties"]:
            fm_text = ""
            if note.text.startswith("---"):
                end = note.text.find("\n---", 3)
                if end != -1:
                    fm_text = note.text[3:end].lower()
            for prop in filters["properties"]:
                if ":" in prop:
                    key, _, val = prop.partition(":")
                    if key not in fm_text or val not in fm_text:
                        return False
                else:
                    if prop not in fm_text:
                        return False

        # phrase filters
        for phrase in filters["phrases"]:
            if phrase not in note.lower and phrase not in note.title.lower():
                return False

        # plain term filters (each term must appear somewhere)
        for term in filters["terms"]:
            if term not in note.title.lower() and term not in note.lower:
                return False

        return True

    def search(self, query: str, limit: int = 200) -> list:
        """Search with optional operators: tag:, path:, property:, "phrase", terms.

        All operators combine with AND. Falls back to plain full-text search
        when no operators are present (same behaviour as before).
        """
        raw = query.strip()
        if not raw:
            return []

        filters = self._parse_query(raw)
        has_operators = any([
            filters["tags"], filters["path_frags"],
            filters["properties"], filters["phrases"],
        ])

        notes = (self.index.cached_notes() if self.index.ready
                 else self.index.notes())

        hits = []

        if has_operators or filters["terms"]:
            from .tag_index import TagIndex
            tag_idx = TagIndex.for_vault(self.index) if filters["tags"] else None
            if tag_idx and notes:
                tag_idx.build(notes)

            for note in notes:
                if not self._note_matches(note, filters, tag_idx):
                    continue
                # Emit one SearchHit per matching body line (or a title hit)
                matched_lines = False
                for i, line in enumerate(note.text.splitlines(), start=1):
                    ll = line.lower()
                    relevant = (
                        any(t in ll for t in filters["terms"])
                        or any(p in ll for p in filters["phrases"])
                        or (not filters["terms"] and not filters["phrases"])
                    )
                    if relevant:
                        hits.append(SearchHit(note.path, note.title, i,
                                              line.strip()[:180]))
                        matched_lines = True
                        if len(hits) >= limit:
                            return hits
                if not matched_lines:
                    hits.append(SearchHit(note.path, note.title, 0, note.title))
        else:
            # Plain search: backward compatible
            q = raw.lower()
            for note in notes:
                if q in note.title.lower():
                    hits.append(SearchHit(note.path, note.title, 0, note.title))
                if q not in note.lower:
                    continue
                for i, line in enumerate(note.text.splitlines(), start=1):
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

        The scan runs over the text index, so it costs a pass over memory
        rather than a read of the whole vault. Call it from a worker thread
        anyway: the very first call is what fills the index.
        """
        title = note.title.strip()
        if not title:
            return ([], [])

        linked, unlinked = [], []
        needle = title.lower()
        link_re = re.compile(
            r"\[\[\s*" + re.escape(title) + r"\s*(\|[^\]]*)?\]\]", re.IGNORECASE
        )
        plain_re = re.compile(
            r"(?<![\w\[])" + re.escape(title) + r"(?![\w\]])", re.IGNORECASE
        )

        for other in self.index.notes():
            if other.path == note.path:
                continue
            if needle not in other.lower:
                continue
            for i, line in enumerate(other.text.splitlines(), start=1):
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
        self.index.forget(path)
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
        self.index.forget(path)
        self.remove_bookmark(path)

    def move_path(self, src: Path, dest_folder: Path) -> Path:
        """Move a note or folder into dest_folder; invalidates the old index entry."""
        src = Path(src)
        new_path = self.vault.move_path(src, dest_folder)
        self.index.forget(src)
        if new_path.is_file():
            try:
                self.index.update(new_path, new_path.read_text(encoding="utf-8", errors="replace"))
            except OSError:
                pass
        return new_path

    def note_written(self, path: Path, text: str):
        """Called after the editor saves, so the index does not have to wait
        for its next directory walk to see the new text."""
        self.index.update(path, text)

    def set_vault(self, vault: VaultManager):
        self.vault = vault
        self.index = VaultIndex.for_vault(vault)
        self._bookmarks_cache = ([], None)
