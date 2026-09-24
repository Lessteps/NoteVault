"""Entry points the notes module calls: `nv://media` timestamp links and media files.

Importing this module is cheap; QtMultimedia is only loaded when the player opens.
"""

import re
from pathlib import Path

from PySide6.QtCore import QEvent, QObject, Qt, QUrl, Slot
from PySide6.QtGui import QDesktopServices

from ....core.english.media_links import is_media_file, parse_media_url, resolve_media

_MEDIA_LINK_RE = re.compile(r"\[[^\]\n]*\]\((nv://media\?[^)\s]+)\)")


def _player():
    from .media_player import open_media_player
    return open_media_player


def open_media_url(url: str, vault_root: Path | None, open_note=None) -> bool:
    """Open the player at the moment of an `nv://media?file=…&t=…` link."""
    parsed = parse_media_url(url)
    if parsed is None:
        return False
    file, seconds = parsed
    _player()(resolve_media(file, vault_root), seconds, vault_root, open_note)
    return True


def open_media_file(path, vault_root: Path | None = None, open_note=None) -> bool:
    """Open a video/audio file in the player; False when `path` is not media."""
    if not is_media_file(path):
        return False
    _player()(Path(path), None, vault_root, open_note)
    return True


def media_link_at(text: str, column: int) -> str:
    for m in _MEDIA_LINK_RE.finditer(text or ""):
        if m.start() <= column <= m.end():
            return m.group(1)
    return ""


class _MediaLinkRouter(QObject):
    def __init__(self):
        super().__init__()
        self.vault_root = None
        self.open_note = None

    def root(self):
        return self.vault_root() if callable(self.vault_root) else self.vault_root

    @Slot(QUrl)
    def handle(self, url: QUrl):
        open_media_url(bytes(url.toEncoded()).decode("ascii", "replace"), self.root(), self.open_note)


_ROUTER: _MediaLinkRouter | None = None


def install_media_link_handler(vault_root, open_note=None):
    """Send every `nv://` url opened through QDesktopServices (reading mode, practice
    view…) to the player. `vault_root` is a path or a callable returning it."""
    global _ROUTER
    if _ROUTER is None:
        _ROUTER = _MediaLinkRouter()
        QDesktopServices.setUrlHandler("nv", _ROUTER, "handle")
    _ROUTER.vault_root = vault_root
    _ROUTER.open_note = open_note


class MediaLinkClicks(QObject):
    """While editing, a click on a timestamp link opens the player: a plain click on
    the rendered link, or Ctrl+click on the raw `[mm:ss](nv://media…)` text."""

    def __init__(self, view, open_url):
        super().__init__(view)
        self.view = view
        self.open_url = open_url
        view.viewport().installEventFilter(self)

    def url_at(self, pos, ctrl: bool) -> str:
        href = self.view.anchorAt(pos)
        if href.startswith("nv://media"):
            return href
        if not ctrl:
            return ""
        cursor = self.view.cursorForPosition(pos)
        return media_link_at(cursor.block().text(), cursor.positionInBlock())

    def eventFilter(self, obj, event):
        if event.type() == QEvent.MouseButtonPress and event.button() == Qt.LeftButton:
            ctrl = bool(event.modifiers() & Qt.ControlModifier)
            url = self.url_at(event.position().toPoint(), ctrl)
            if url:
                self.open_url(url)
                return True
        return False
