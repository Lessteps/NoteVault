"""Tag index for NoteVault.

Scans the vault for #tags in note bodies and the 'tags:' frontmatter field,
building an inverted index {tag: set(paths)}.

Results are cached per vault and invalidated when the underlying VaultIndex
is refreshed (same stamp mechanism: only re-builds when notes change).
"""

import re
import threading
from pathlib import Path
from typing import Optional

_TAG_RE = re.compile(r"(?<!\S)#([A-Za-z0-9_/\-]+)")
_FENCE_RE = re.compile(r"^```.*?^```", re.MULTILINE | re.DOTALL)


def _extract_inline_tags(body: str) -> list[str]:
    """Extract #tags from a note body, ignoring code fences."""
    stripped = _FENCE_RE.sub("", body)
    return _TAG_RE.findall(stripped)


def _extract_fm_tags(frontmatter: str) -> list[str]:
    """Extract tags from YAML frontmatter 'tags:' field (simple parser)."""
    tags: list[str] = []
    in_tags = False
    for line in frontmatter.splitlines():
        stripped = line.strip()
        if stripped.startswith("tags:"):
            rest = stripped[5:].strip()
            if rest.startswith("["):
                # inline list: tags: [a, b, c]
                rest = rest.strip("[]")
                for t in rest.split(","):
                    t = t.strip().strip("\"'")
                    if t:
                        tags.append(t)
            elif rest:
                tags.append(rest.strip("\"'"))
            in_tags = True
        elif in_tags:
            if stripped.startswith("- "):
                tags.append(stripped[2:].strip().strip("\"'"))
            elif stripped and not stripped.startswith("#"):
                break
    return tags


class TagIndex:
    """Inverted tag → {note paths} index, shared per vault root."""

    _shared: dict = {}
    _shared_lock = threading.Lock()

    @classmethod
    def for_vault(cls, vault_index) -> "TagIndex":
        root = Path(vault_index.vault.vault_root)
        with cls._shared_lock:
            idx = cls._shared.get(root)
            if idx is None:
                idx = cls()
                cls._shared[root] = idx
            return idx

    def __init__(self):
        self._lock = threading.Lock()
        self._index: dict[str, set[Path]] = {}   # tag -> set of paths
        self._stamp: Optional[int] = None          # used to detect staleness

    def build(self, notes: list) -> dict[str, set[Path]]:
        """(Re)build from a list of IndexedNote objects. Thread-safe."""
        index: dict[str, set[Path]] = {}
        for note in notes:
            text = note.text
            # Split frontmatter from body
            body = text
            fm_text = ""
            if text.startswith("---"):
                end = text.find("\n---", 3)
                if end != -1:
                    fm_text = text[3:end]
                    body = text[end + 4:]

            all_tags = set(_extract_fm_tags(fm_text)) | set(_extract_inline_tags(body))
            for tag in all_tags:
                index.setdefault(tag, set()).add(note.path)

        with self._lock:
            self._index = index
        return index

    def get_index(self) -> dict[str, set[Path]]:
        with self._lock:
            return dict(self._index)

    def paths_for_tag(self, tag: str) -> list[Path]:
        with self._lock:
            return sorted(self._index.get(tag, set()))

    def tags_for_path(self, path: Path) -> list[str]:
        with self._lock:
            return sorted(tag for tag, paths in self._index.items()
                          if path in paths)

    def all_tags_sorted(self) -> list[tuple[str, int]]:
        """Return [(tag, count)] sorted by count descending then name."""
        with self._lock:
            return sorted(
                ((tag, len(paths)) for tag, paths in self._index.items()),
                key=lambda x: (-x[1], x[0].lower()),
            )
