"""
NoteVault Vault Manager
Reads and writes real .md files from a vault directory on disk.
Handles file tree, frontmatter, backlinks, and note CRUD.
"""

import re
import json
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional

from . import vault_format


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
            try:
                self._raw = self.path.read_text(encoding="utf-8", errors="replace")
            except (OSError, ValueError):
                # Missing, locked or path-too-long: treat as empty rather
                # than taking the whole explorer down.
                self._raw = ""
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
RESERVED_DIRS = set(vault_format.RESERVED_DIRS)

# Folders that are never notes. Without this, pointing the app at a code
# folder tries to build a tree of tens of thousands of files.
IGNORED_DIRS = {
    "node_modules", "__pycache__", "site-packages", "venv", ".venv", "env",
    "dist", "build", "target", "out", "bin", "obj", ".git", ".idea",
    ".vscode", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".next",
    ".gradle", ".cache", "vendor", "Lib", "Scripts",
}

# Hard ceiling so a wrong pick can never hang the app.
MAX_SCAN_NOTES = 4000


def is_ignored_dir(path: Path) -> bool:
    return path.name in IGNORED_DIRS or path.name.startswith(".")


# Name of the optional, user-editable file (inside the data folder) that lists
# top-level folders to keep out of the notes explorer, graph and text index —
# one folder name per line. Lets a vault that also holds big code projects
# (e.g. FULLSTACK_DEVELOPMENT, PROJECTS) skip scanning thousands of stray .md
# files without hardcoding anyone's folder names into the app.
EXCLUDE_FILE = "explorer-ignore.txt"


def load_excluded_top_dirs(root: Path) -> set[str]:
    """Read the per-vault top-level exclusion list. Missing file → empty set."""
    path = root / vault_format.DATA_DIR / EXCLUDE_FILE
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, ValueError):
        return set()
    out = set()
    for line in lines:
        name = line.strip()
        if name and not name.startswith("#"):
            out.add(name)
    return out


def is_reserved(path: Path, root: Path) -> bool:
    """True when path lives inside one of the module data folders."""
    try:
        rel = path.relative_to(root)
    except ValueError:
        return False
    parts = rel.parts
    return bool(parts) and parts[0] in RESERVED_DIRS


def migrate_vault(root: Path) -> list[str]:
    """Move FORMAT_VERSION 1 module folders under DATA_DIR.

    A file already present at the destination wins; its legacy copy is left
    on disk rather than overwritten, so a half-synced vault cannot lose data.
    """
    moved: list[str] = []
    data_root = root / vault_format.DATA_DIR

    # Picking `<vault>/.notevault` as the vault root makes the app write
    # `<vault>/.notevault/.notevault`, and the videos and day logs land in a
    # folder nothing reads. Lift anything found there back one level.
    nested = data_root / vault_format.DATA_DIR
    if nested.is_dir():
        for src in sorted(nested.rglob("*")):
            if not src.is_file():
                continue
            dest = data_root / src.relative_to(nested)
            if dest.exists():
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dest))
            moved.append(dest.relative_to(root).as_posix())
        if not any(p.is_file() for p in nested.rglob("*")):
            shutil.rmtree(nested, ignore_errors=True)

    for name in vault_format.LEGACY_DIRS:
        old = root / name
        if not old.is_dir():
            continue
        new = data_root / name

        if not new.exists():
            new.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(old), str(new))
            moved.append(name)
            continue

        for src in old.rglob("*"):
            if not src.is_file():
                continue
            dest = new / src.relative_to(old)
            if dest.exists():
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dest))
            moved.append(src.relative_to(root).as_posix())

        # Only ever removes a tree we just emptied ourselves.
        if not any(p.is_file() for p in old.rglob("*")):
            shutil.rmtree(old, ignore_errors=True)

    return moved


def normalise_vault_root(path: Path) -> Path:
    """The vault root for a folder the user picked.

    Picking the data folder itself is the easy mistake — it is the one that
    shows up in a sync client's folder list — and it makes the app build a
    second data folder inside it. Selecting `.notevault` means the vault is
    its parent.
    """
    path = Path(path)
    return path.parent if path.name == vault_format.DATA_DIR else path


class VaultManager:
    def __init__(self, vault_root: Path):
        vault_root = normalise_vault_root(Path(vault_root))
        self.vault_root = vault_root
        self.vault_root.mkdir(parents=True, exist_ok=True)
        migrate_vault(self.vault_root)
        self._backlink_index: dict[str, list[Path]] = {}
        self._excluded_top: set[str] = set()
        self._excluded_stamp = None
        self._refresh_excluded()

    def _refresh_excluded(self):
        """Reload the top-level exclusion list when its file changes."""
        p = self.vault_root / vault_format.DATA_DIR / EXCLUDE_FILE
        try:
            stamp = p.stat().st_mtime_ns
        except OSError:
            stamp = None
        if stamp != self._excluded_stamp:
            self._excluded_stamp = stamp
            self._excluded_top = load_excluded_top_dirs(self.vault_root)

    def _is_excluded_top(self, entry: Path) -> bool:
        return (entry.parent == self.vault_root
                and entry.name in self._excluded_top)

    # ── File tree ────────────────────────────────────────────────────────

    def _walk_note_paths(self, limit: int = MAX_SCAN_NOTES):
        """Yield markdown paths, skipping module data and tooling folders."""
        self._refresh_excluded()
        count = 0
        stack = [self.vault_root]
        while stack:
            folder = stack.pop()
            try:
                entries = list(folder.iterdir())
            except (OSError, ValueError):
                continue
            for entry in entries:
                try:
                    if entry.is_dir():
                        if is_ignored_dir(entry):
                            continue
                        if self._is_excluded_top(entry):
                            continue
                        if entry.parent == self.vault_root and is_reserved(
                                entry, self.vault_root):
                            continue
                        stack.append(entry)
                    elif entry.suffix.lower() == ".md":
                        if is_reserved(entry, self.vault_root):
                            continue
                        yield entry
                        count += 1
                        if count >= limit:
                            return
                except (OSError, ValueError):
                    continue

    def note_paths(self, limit: int = MAX_SCAN_NOTES) -> list:
        """Every note path in the vault, sorted. Walks directories but reads
        no file, which is what the text index needs to spot new notes."""
        return sorted(self._walk_note_paths(limit))

    def all_notes(self, limit: int = MAX_SCAN_NOTES) -> list:
        return [Note(p, self.vault_root) for p in self.note_paths(limit)]

    def all_folders(self) -> list:
        self._refresh_excluded()
        out = []
        stack = [self.vault_root]
        while stack:
            folder = stack.pop()
            try:
                entries = list(folder.iterdir())
            except (OSError, ValueError):
                continue
            for entry in entries:
                try:
                    if not entry.is_dir() or is_ignored_dir(entry):
                        continue
                except OSError:
                    continue
                if self._is_excluded_top(entry):
                    continue
                if entry.parent == self.vault_root and is_reserved(
                        entry, self.vault_root):
                    continue
                out.append(entry)
                stack.append(entry)
        return sorted(out)

    def tree(self) -> list[dict]:
        """Return a nested dict tree for the file explorer."""
        self._refresh_excluded()
        return _build_tree(self.vault_root, self.vault_root, self._excluded_top)

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

    def move_path(self, src: Path, dest_folder: Path) -> Path:
        """Move a note or folder into dest_folder. Returns the new path.

        Rules:
        - dest_folder must be a directory inside the vault.
        - Cannot move a folder into itself or a descendant.
        - Cannot move into .notevault or reserved dirs.
        - If name collision, adds ' 2', ' 3', … suffix.
        - Silently returns src if src == dest_folder / src.name (already there).
        """
        src = Path(src)
        dest_folder = Path(dest_folder)

        if not src.exists():
            raise FileNotFoundError(f"Source not found: {src}")
        if not dest_folder.is_dir():
            raise NotADirectoryError(f"Destination is not a directory: {dest_folder}")

        # Reject moves into reserved/excluded locations
        try:
            dest_folder.relative_to(self.vault_root)
        except ValueError:
            raise ValueError("Destination is outside the vault")

        rel_parts = dest_folder.relative_to(self.vault_root).parts
        if rel_parts and rel_parts[0] in RESERVED_DIRS:
            raise ValueError("Cannot move into a reserved folder")

        # Prevent moving a folder into its own subtree
        if src.is_dir():
            try:
                dest_folder.relative_to(src)
                return src  # destination is inside source — no-op
            except ValueError:
                pass

        target = dest_folder / src.name
        if target == src:
            return src  # already in place

        # Resolve name collision
        if target.exists():
            stem, suffix = src.stem, src.suffix
            counter = 2
            while target.exists():
                target = dest_folder / f"{stem} {counter}{suffix}"
                counter += 1

        shutil.move(str(src), str(target))
        return target

    # ── Backlinks ────────────────────────────────────────────────────────

    def rebuild_backlinks(self):
        self._backlink_index = {}
        for note in self.all_notes():
            for link in note.wikilinks:
                clean = link.split("#")[0].strip().lower()
                stem = Path(clean).stem.lower()
                name = Path(clean).name.lower()
                for key in {clean, stem, name}:
                    if key:
                        self._backlink_index.setdefault(key, []).append(note.path)

    def get_backlinks(self, note: Note) -> list[Note]:
        self.rebuild_backlinks()
        keys = {note.title.lower(), note.path.name.lower()}
        try:
            rel = note.path.relative_to(self.vault_root).as_posix().lower()
            keys.add(rel)
            keys.add(Path(rel).with_suffix("").as_posix().lower())
        except Exception:
            pass
        matched_paths = set()
        for k in keys:
            for p in self._backlink_index.get(k, []):
                if p != note.path:
                    matched_paths.add(p)
        return [Note(p, self.vault_root) for p in matched_paths]

    # ── Resolve wikilink ─────────────────────────────────────────────────

    def resolve_link(self, link_text: str) -> Optional[Note]:
        """Find a note by title (case-insensitive, partial match ok)."""
        clean = link_text.split("#")[0].split("|")[0].strip()
        target = clean.lower()
        target_stem = Path(clean).stem.lower()
        target_name = Path(clean).name.lower()

        rel_candidate = self.vault_root / clean
        if rel_candidate.is_file():
            return Note(rel_candidate, self.vault_root)
        if rel_candidate.with_suffix(".md").is_file():
            return Note(rel_candidate.with_suffix(".md"), self.vault_root)

        for note in self.all_notes():
            if note.title.lower() in (target, target_stem) or note.path.name.lower() in (target, target_name):
                return note
        for note in self.all_notes():
            if target_stem and target_stem in note.title.lower():
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
        """Cheap counters: never opens a file, never raises."""
        notes = 0
        for _ in self._walk_note_paths():
            notes += 1
        return {"notes": notes, "folders": 0, "words": 0}


def _build_tree(folder: Path, root: Path, excluded_top: set[str] = frozenset()) -> list[dict]:
    items = []
    try:
        entries = sorted(folder.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
    except PermissionError:
        return items

    for entry in entries:
        if entry.name.startswith("."):
            continue
        if entry.is_dir() and entry.name in IGNORED_DIRS:
            continue
        if entry.parent == root and entry.name in RESERVED_DIRS:
            continue   # module data folders are not notes
        if entry.parent == root and entry.name in excluded_top:
            continue   # user-excluded top-level code/project folders
        if entry.is_dir():
            items.append({
                "type": "folder",
                "name": entry.name,
                "path": entry,
                "children": _build_tree(entry, root, excluded_top),
            })
        elif entry.suffix == ".md":
            items.append({
                "type": "note",
                "name": entry.stem,
                "path": entry,
            })
    return items
