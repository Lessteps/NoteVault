"""
NoteVault Vault Manager
Reads and writes real .md files from a vault directory on disk.
Handles file tree, frontmatter, backlinks, and note CRUD.
"""

import re
import json
from pathlib import Path
from datetime import datetime
from typing import Optional


class Note:
    def __init__(self, path: Path, vault_root: Path):
        self.path = path
        self.vault_root = vault_root
        self.rel_path = path.relative_to(vault_root)
        self._raw: Optional[str] = None
        self._frontmatter: Optional[dict] = None
        self._body: Optional[str] = None

    @property
    def title(self) -> str:
        return self.path.stem

    @property
    def raw(self) -> str:
        if self._raw is None:
            self._raw = self.path.read_text(encoding="utf-8", errors="replace")
        return self._raw

    @property
    def frontmatter(self) -> dict:
        if self._frontmatter is None:
            self._frontmatter, self._body = _split_frontmatter(self.raw)
        return self._frontmatter

    @property
    def body(self) -> str:
        if self._body is None:
            _, self._body = _split_frontmatter(self.raw)
        return self._body

    @property
    def tags(self) -> list[str]:
        fm_tags = self.frontmatter.get("tags", [])
        if isinstance(fm_tags, str):
            fm_tags = [fm_tags]
        # Also extract inline #tags from body
        inline = re.findall(r'(?<!\S)#([\w/-]+)', self.body)
        combined = list(dict.fromkeys(fm_tags + inline))
        return combined

    @property
    def wikilinks(self) -> list[str]:
        return re.findall(r'\[\[([^\]|#]+?)(?:\|[^\]]*)?\]\]', self.raw)

    @property
    def modified_time(self) -> str:
        ts = self.path.stat().st_mtime
        return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M")

    @property
    def created_time(self) -> str:
        ts = self.path.stat().st_ctime
        return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M")

    @property
    def word_count(self) -> int:
        text = self.body.strip()
        return len(text.split()) if text else 0

    def reload(self):
        self._raw = None
        self._frontmatter = None
        self._body = None

    def save(self, content: str):
        self.path.write_text(content, encoding="utf-8")
        self.reload()

    def __repr__(self):
        return f"Note({self.rel_path})"


def _split_frontmatter(raw: str) -> tuple[dict, str]:
    """Split YAML frontmatter (between --- delimiters) from body."""
    if not raw.startswith("---"):
        return {}, raw

    end = raw.find("\n---", 3)
    if end == -1:
        return {}, raw

    fm_text = raw[3:end].strip()
    body = raw[end + 4:].lstrip("\n")

    fm = {}
    for line in fm_text.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            k = k.strip()
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                items = [x.strip().strip("\"'") for x in v[1:-1].split(",") if x.strip()]
                fm[k] = items
            else:
                fm[k] = v.strip("\"'")
    return fm, body


# Folders owned by the app's own modules. They hold habit / exercise /
# task / project data files and must never appear in the notes explorer.
RESERVED_DIRS = {"habits", "ejercicio", "tareas", "proyectos"}


def is_reserved(path: Path, root: Path) -> bool:
    """True when path lives inside one of the module data folders."""
    try:
        rel = path.relative_to(root)
    except ValueError:
        return False
    parts = rel.parts
    return bool(parts) and parts[0] in RESERVED_DIRS


class VaultManager:
    def __init__(self, vault_root: Path):
        self.vault_root = vault_root
        self.vault_root.mkdir(parents=True, exist_ok=True)
        self._backlink_index: dict[str, list[Path]] = {}

    # ── File tree ────────────────────────────────────────────────────────

    def all_notes(self) -> list[Note]:
        return [
            Note(p, self.vault_root)
            for p in sorted(self.vault_root.rglob("*.md"))
            if not any(part.startswith(".") for part in p.parts)
            and not is_reserved(p, self.vault_root)
        ]

    def all_folders(self) -> list[Path]:
        return [
            p for p in sorted(self.vault_root.rglob("*"))
            if p.is_dir() and not any(part.startswith(".") for part in p.parts)
            and not is_reserved(p, self.vault_root)
        ]

    def tree(self) -> list[dict]:
        """Return a nested dict tree for the file explorer."""
        return _build_tree(self.vault_root, self.vault_root)

    # ── Note CRUD ────────────────────────────────────────────────────────

    def get_note(self, path: Path) -> Optional[Note]:
        if path.exists() and path.suffix == ".md":
            return Note(path, self.vault_root)
        return None

    def create_note(self, title: str, folder: Optional[Path] = None) -> Note:
        parent = folder or self.vault_root
        parent.mkdir(parents=True, exist_ok=True)
        safe_title = re.sub(r'[\\/:*?"<>|]', "_", title)
        path = parent / f"{safe_title}.md"
        counter = 1
        while path.exists():
            path = parent / f"{safe_title} {counter}.md"
            counter += 1
        now = datetime.now().strftime("%Y-%m-%d")
        path.write_text(
            f"---\ntitle: {title}\ndate: {now}\ntags: []\n---\n\n# {title}\n\n",
            encoding="utf-8"
        )
        return Note(path, self.vault_root)

    def create_folder(self, name: str, parent: Optional[Path] = None) -> Path:
        base = parent or self.vault_root
        folder = base / name
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    def rename_note(self, note: Note, new_title: str) -> Note:
        safe = re.sub(r'[\\/:*?"<>|]', "_", new_title)
        new_path = note.path.parent / f"{safe}.md"
        note.path.rename(new_path)
        return Note(new_path, self.vault_root)

    def delete_note(self, note: Note):
        trash = self.vault_root / ".trash"
        trash.mkdir(exist_ok=True)
        dest = trash / note.path.name
        note.path.rename(dest)

    # ── Backlinks ────────────────────────────────────────────────────────

    def rebuild_backlinks(self):
        self._backlink_index = {}
        for note in self.all_notes():
            for link in note.wikilinks:
                self._backlink_index.setdefault(link.lower(), []).append(note.path)

    def get_backlinks(self, note: Note) -> list[Note]:
        self.rebuild_backlinks()
        refs = self._backlink_index.get(note.title.lower(), [])
        return [Note(p, self.vault_root) for p in refs if p != note.path]

    # ── Resolve wikilink ─────────────────────────────────────────────────

    def resolve_link(self, link_text: str) -> Optional[Note]:
        """Find a note by title (case-insensitive, partial match ok)."""
        target = link_text.lower()
        for note in self.all_notes():
            if note.title.lower() == target:
                return note
        for note in self.all_notes():
            if target in note.title.lower():
                return note
        return None

    # ── Search ───────────────────────────────────────────────────────────

    def search(self, query: str) -> list[Note]:
        q = query.lower()
        results = []
        for note in self.all_notes():
            if q in note.title.lower() or q in note.raw.lower():
                results.append(note)
        return results

    # ── Stats ────────────────────────────────────────────────────────────

    def stats(self) -> dict:
        notes = self.all_notes()
        folders = self.all_folders()
        total_words = sum(n.word_count for n in notes)
        return {
            "notes": len(notes),
            "folders": len(folders),
            "words": total_words,
        }


def _build_tree(folder: Path, root: Path) -> list[dict]:
    items = []
    try:
        entries = sorted(folder.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
    except PermissionError:
        return items

    for entry in entries:
        if entry.name.startswith("."):
            continue
        if entry.parent == root and entry.name in RESERVED_DIRS:
            continue   # module data folders are not notes
        if entry.is_dir():
            items.append({
                "type": "folder",
                "name": entry.name,
                "path": entry,
                "children": _build_tree(entry, root),
            })
        elif entry.suffix == ".md":
            items.append({
                "type": "note",
                "name": entry.stem,
                "path": entry,
            })
    return items
