"""
One in-memory copy of every note's text.

Backlinks and full-text search both have to look at the whole vault. Reading
3,000 files costs tens of seconds the first time and about three afterwards,
and the editor used to pay that on every note the user opened, which is what
froze the window.

The index reads each file once and keeps it until its modification time
changes on disk, so every later scan runs over memory. It is shared by all
the panels of a vault and is safe to use from a worker thread.
"""

import threading
import time
from dataclasses import dataclass
from pathlib import Path

from .attachments import fs_path
from .vault_manager import MAX_SCAN_NOTES

# The directory is re-walked at most this often. A walk stats every file in
# the vault, which takes a couple of seconds on a real machine, so doing it
# for every note the user opens would put the cost straight back. Anything
# this app writes is fed to the index by `update()` and shows up at once;
# only a note another program created has to wait for the next walk.
WALK_INTERVAL = 30.0


@dataclass
class IndexedNote:
    path: Path
    title: str
    text: str
    lower: str          # text.lower(), kept so a scan never lowercases again


class VaultIndex:
    """Every note of one vault, keyed by path and validated by mtime."""

    _shared: dict = {}
    _shared_lock = threading.Lock()

    @classmethod
    def for_vault(cls, vault) -> "VaultIndex":
        """The index of this vault, created on first use."""
        root = Path(vault.vault_root)
        with cls._shared_lock:
            index = cls._shared.get(root)
            if index is None:
                index = cls(vault)
                cls._shared[root] = index
            index.vault = vault
            return index

    def __init__(self, vault):
        self.vault = vault
        self._lock = threading.RLock()
        self._entries: dict = {}        # path -> (stamp, IndexedNote)
        self._walked = 0.0
        self._ready = False

    @property
    def ready(self) -> bool:
        """True once the whole vault has been read at least once."""
        return self._ready

    def notes(self, force: bool = False) -> list:
        """Every note's text, re-reading only what changed on disk.

        The first call reads the whole vault and is slow; it is meant to run
        on a worker thread. Later calls cost a stat per file, and nothing at
        all within WALK_INTERVAL seconds of the previous one.
        """
        with self._lock:
            fresh = (self._ready and not force
                     and time.monotonic() - self._walked < WALK_INTERVAL)
            if fresh:
                return [entry for _, entry in self._entries.values()]
            known = dict(self._entries)

        entries = {}
        for path in self.vault.note_paths(MAX_SCAN_NOTES):
            try:
                stat = fs_path(path).stat()
            except (OSError, ValueError):
                continue
            stamp = (stat.st_mtime_ns, stat.st_size)
            cached = known.get(path)
            if cached is not None and cached[0] == stamp:
                entries[path] = cached
                continue
            try:
                text = fs_path(path).read_text(encoding="utf-8", errors="replace")
            except (OSError, ValueError):
                continue
            entries[path] = (stamp,
                             IndexedNote(path, path.stem, text, text.lower()))

        with self._lock:
            self._entries = entries
            self._walked = time.monotonic()
            self._ready = True
            return [entry for _, entry in entries.values()]

    def cached_notes(self) -> list:
        """What is already in memory, without touching the disk."""
        with self._lock:
            return [entry for _, entry in self._entries.values()]

    def update(self, path: Path, text: str):
        """Record a note this app just wrote, so the next scan sees it
        without waiting for the stat to come back different."""
        path = Path(path)
        try:
            stat = fs_path(path).stat()
        except (OSError, ValueError):
            return
        with self._lock:
            self._entries[path] = ((stat.st_mtime_ns, stat.st_size),
                                   IndexedNote(path, path.stem, text, text.lower()))

    def forget(self, path: Path):
        """Drop a renamed or deleted note and force the next walk."""
        with self._lock:
            self._entries.pop(Path(path), None)
            self._walked = 0.0

    def clear(self):
        with self._lock:
            self._entries.clear()
            self._walked = 0.0
            self._ready = False
