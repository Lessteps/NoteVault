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
from .frontmatter_utils import FRONTMATTER_RE
# Media copied into notes lives here; it is not a note and never listed.
from .attachments import ATTACHMENTS_DIR

BOOKMARKS_FILE = ".notevault-bookmarks.json"

_DIGITS = re.compile(r"(\d+)")

# Obsidian resolves a [[wikilink]] against a note's file name, its full path,
# its frontmatter `title:` and each of its `aliases:` — and treats spaces and
# underscores as interchangeable. These helpers reproduce that so a backlink is
# found no matter which of those names the other note wrote.
_ALIAS_KEYS = ("aliases", "alias")
_WIKILINK_SCAN_RE = re.compile(r"\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]")


def _norm(s: str) -> str:
    """Fold underscores to spaces (Obsidian link equivalence)."""
    return s.replace("_", " ")


def _variants(s: str) -> set:
    """Both the space and underscore spellings of a name, so a link written
    either way is matched regardless of how the file itself is named."""
    return {s, s.replace("_", " "), s.replace(" ", "_")}


def _frontmatter_names(text: str) -> list[str]:
    """Lowercase `title:` and `aliases:` from YAML frontmatter.

    Handles both inline lists (``aliases: [a, b]``) and block lists::

        aliases:
          - Alias One
          - Alias Two
    """
    m = FRONTMATTER_RE.match(text or "")
    if not m:
        return []
    names: list[str] = []
    lines = m.group(1).splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip().lower()
        val = val.strip()
        if key == "title":
            v = val.strip("\"'")
            if v:
                names.append(v)
        elif key in _ALIAS_KEYS:
            if val.startswith("[") and val.endswith("]"):
                names += [x.strip().strip("\"'")
                          for x in val[1:-1].split(",") if x.strip()]
            elif val:
                names.append(val.strip("\"'"))
            else:                       # block list: consume the "- item" lines
                while i < len(lines):
                    item = lines[i].strip()
                    if item.startswith("-"):
                        names.append(item[1:].strip().strip("\"'"))
                        i += 1
                    elif not item or item.startswith(" "):
                        i += 1
                    else:
                        break
    return [n.lower() for n in names if n.strip()]


def link_identifiers(note: Note, vault_root, raw_text: str = None):
    """(target_ids, name_needles) for one note.

    ``target_ids``   — normalized strings a ``[[wikilink]]`` target may equal
                       (file name/stem, vault path with and without extension,
                       frontmatter title and aliases; each also space/underscore
                       normalized).
    ``name_needles`` — distinctive lowercase strings to search for in body text,
                       used both for the early-exit scan and for detecting
                       unlinked (plain-text) mentions.
    """
    ids: set[str] = set()
    needles: set[str] = set()
    stem = note.path.stem.lower()
    name = note.path.name.lower()
    ids.update({stem, name, _norm(stem), _norm(name),
                stem.replace(" ", "_"), name.replace(" ", "_")})
    needles.update({stem, _norm(stem), stem.replace(" ", "_")})
    try:
        rel = note.path.relative_to(vault_root).as_posix().lower()
        rel_ns = Path(rel).with_suffix("").as_posix().lower()
        ids.update({rel, rel_ns, _norm(rel), _norm(rel_ns),
                    rel.replace(" ", "_"), rel_ns.replace(" ", "_")})
    except Exception:
        pass
    if raw_text is not None:
        text = raw_text
    else:
        # A vault_manager.Note exposes .raw (disk-backed); an IndexedNote
        # exposes .text (already cached in memory). Accept either.
        text = getattr(note, "raw", None)
        if text is None:
            text = getattr(note, "text", "")
    for nm in _frontmatter_names(text):
        ids.update({nm, _norm(nm), nm.replace(" ", "_")})
        needles.update({nm, _norm(nm), nm.replace(" ", "_")})
    ids.discard("")
    needles.discard("")
    return ids, needles


def wikilink_matches(line: str, target_ids: set) -> bool:
    """True if any ``[[wikilink]]`` on the line points at ``target_ids``."""
    for wm in _WIKILINK_SCAN_RE.finditer(line):
        raw_target = wm.group(1).strip().lower()
        if not raw_target:
            continue
        name = Path(raw_target).name.lower()
        stem = Path(raw_target).stem.lower()
        for cand in (raw_target, name, stem):
            if cand in target_ids or _norm(cand) in target_ids:
                return True
    return False


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

    # ── Bookmarks (rich format) ───────────────────────────────────────────
    # Each bookmark is a dict: {type, target, label}
    # type: "note" | "heading" | "search" | "file"
    # target: vault-relative path string (note/heading/file) or search query
    # label: display name (optional, defaults to target stem)

    @staticmethod
    def _migrate_bookmark(entry) -> dict:
        """Convert old-format string entries to new dict format."""
        if isinstance(entry, str):
            return {"type": "note", "target": entry, "label": Path(entry).stem}
        return entry

    def bookmarks_rich(self) -> list[dict]:
        """All bookmarks in rich dict format, cached by file mtime."""
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
        entries = [self._migrate_bookmark(e) for e in raw]
        self._bookmarks_cache = (entries, stamp)
        return list(entries)

    def bookmarks(self) -> list:
        """Bookmarked note paths that still exist (backward-compat, note type only)."""
        out = []
        for bm in self.bookmarks_rich():
            if bm.get("type") == "note":
                p = self.root / bm["target"]
                if p.exists():
                    out.append(p)
        return out

    def _save_bookmarks_rich(self, entries: list[dict]):
        self._bookmarks_path().write_text(
            json.dumps(entries, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        self._bookmarks_cache = ([], None)

    def _save_bookmarks(self, paths: list):
        """Backward-compat: save a list of Paths as note bookmarks."""
        entries = []
        for p in paths:
            try:
                rel = str(Path(p).relative_to(self.root)).replace("\\", "/")
                entries.append({"type": "note", "target": rel,
                                "label": Path(p).stem})
            except ValueError:
                continue
        self._save_bookmarks_rich(entries)

    def is_bookmarked(self, path: Path) -> bool:
        return Path(path) in self.bookmarks()

    def toggle_bookmark(self, path: Path) -> bool:
        """Add or remove a note bookmark. Returns the new state."""
        path = Path(path)
        try:
            rel = str(path.relative_to(self.root)).replace("\\", "/")
        except ValueError:
            return False
        entries = self.bookmarks_rich()
        for i, bm in enumerate(entries):
            if bm.get("type") == "note" and bm.get("target") == rel:
                entries.pop(i)
                self._save_bookmarks_rich(entries)
                return False
        entries.append({"type": "note", "target": rel, "label": path.stem})
        self._save_bookmarks_rich(entries)
        return True

    def add_bookmark(self, bm_type: str, target: str, label: str = "") -> None:
        """Add a bookmark of any type. Duplicates (same type+target) are skipped."""
        entries = self.bookmarks_rich()
        for bm in entries:
            if bm.get("type") == bm_type and bm.get("target") == target:
                return
        entries.append({"type": bm_type, "target": target,
                        "label": label or target})
        self._save_bookmarks_rich(entries)

    def remove_bookmark_rich(self, bm_type: str, target: str) -> None:
        entries = self.bookmarks_rich()
        entries = [b for b in entries
                   if not (b.get("type") == bm_type and b.get("target") == target)]
        self._save_bookmarks_rich(entries)

    def remove_bookmark(self, path: Path):
        path = Path(path)
        try:
            rel = str(path.relative_to(self.root)).replace("\\", "/")
        except ValueError:
            return
        self.remove_bookmark_rich("note", rel)

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
                          "name": f.name if kind == "code" else f.stem,
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
        target_ids, name_needles = link_identifiers(note, self.vault.vault_root)
        if not name_needles:
            return ([], [])

        # Plain-text (unlinked) detection: match each distinctive name as a whole
        # word. Very short names (e.g. a "D1" alias) are skipped to avoid noise.
        plain_res = [
            re.compile(r"(?<![\w\[])" + re.escape(n) + r"(?![\w\]])", re.IGNORECASE)
            for n in name_needles if len(n) >= 3
        ]

        for other in self.index.notes():
            if other.path == note.path:
                continue
            # Early exit: skip a note that mentions none of the target's names.
            if not any(n in other.lower for n in name_needles):
                continue
            for i, line in enumerate(other.text.splitlines(), start=1):
                if wikilink_matches(line, target_ids):
                    linked.append(Mention(other.path, other.title, i,
                                          line.strip()[:200], True))
                elif any(rx.search(line) for rx in plain_res):
                    unlinked.append(Mention(other.path, other.title, i,
                                            line.strip()[:200], False))
        return (linked, unlinked)

    def linkify_mention(self, note_path: Path, line_no: int, target_title: str) -> bool:
        """Convert the first unlinked mention of target_title at/near line_no in note_path
        into a [[target_title]] wikilink and persist it to disk and index."""
        p = Path(note_path)
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return False

        lines = text.splitlines(keepends=True)
        if not lines:
            return False

        title_clean = target_title.strip()
        if not title_clean:
            return False

        title_esc = re.escape(title_clean)
        pattern = r"(?<![\w\[])(" + title_esc + r")(?![\w\]])"
        if "_" in title_clean or " " in title_clean:
            alt = re.escape(title_clean.replace("_", " ") if "_" in title_clean else title_clean.replace(" ", "_"))
            pattern = r"(?<![\w\[])(" + title_esc + r"|" + alt + r")(?![\w\]])"
        rx = re.compile(pattern, re.IGNORECASE)

        idx = line_no - 1
        candidate_indices = []
        if 0 <= idx < len(lines):
            candidate_indices.append(idx)
        for offset in range(1, 5):
            if 0 <= idx - offset < len(lines):
                candidate_indices.append(idx - offset)
            if 0 <= idx + offset < len(lines):
                candidate_indices.append(idx + offset)

        replaced = False
        for i in candidate_indices:
            line = lines[i]
            if rx.search(line):
                def _replace_match(m):
                    nonlocal replaced
                    if not replaced:
                        replaced = True
                        return f"[[{title_clean}]]"
                    return m.group(0)

                new_line = rx.sub(_replace_match, line, count=1)
                if replaced:
                    lines[i] = new_line
                    break

        if not replaced:
            for i, line in enumerate(lines):
                if rx.search(line):
                    def _replace_match(m):
                        nonlocal replaced
                        if not replaced:
                            replaced = True
                            return f"[[{title_clean}]]"
                        return m.group(0)

                    new_line = rx.sub(_replace_match, line, count=1)
                    if replaced:
                        lines[i] = new_line
                        break

        if replaced:
            new_text = "".join(lines)
            try:
                p.write_text(new_text, encoding="utf-8")
                self.note_written(p, new_text)
                return True
            except OSError:
                return False
        return False

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
