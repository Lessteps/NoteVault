"""
One object that owns everything the WEB module shares.

The browser window and every live web card on a canvas use the same
Chromium profile (so a login made in one is valid in the other), the same
content restrictions and the same usage meter. ``controller()`` returns the
app-wide instance; MainWindow points it at the active vault.
"""

from __future__ import annotations

import weakref
from pathlib import Path
from typing import Optional

from PySide6.QtCore import QObject, QTimer, Signal
from PySide6.QtWidgets import QApplication, QMessageBox

from ....config import APP_DATA_DIR
from ....core import web_runtime
from ....core.web_store import Restrictions, UsageMeter, WebStore, host_of

TICK_SECONDS = 5


class WebController(QObject):
    add_to_canvas_requested = Signal(str, str)     # url, title
    restrictions_changed = Signal()
    status_message = Signal(str)

    def __init__(self, vault_root: Optional[Path] = None, parent=None):
        super().__init__(parent)
        # Machine-local data (profile, session, snapshots). Tests point it
        # at a temp folder so they never touch the user's logins.
        self.home: Path = APP_DATA_DIR
        self.store: Optional[WebStore] = None
        self.meter = UsageMeter(None)
        self.restrictions = Restrictions()
        self._profile = None
        self._window = None
        self._views = weakref.WeakKeyDictionary()     # view -> "visible" | "focus"
        self._timer = QTimer(self)
        self._timer.setInterval(TICK_SECONDS * 1000)
        self._timer.timeout.connect(self._tick)
        if vault_root is not None:
            self.set_vault(vault_root)

    # ── vault ──────────────────────────────────────────────────────────
    def set_vault(self, vault_root: Optional[Path]):
        self.meter.flush()
        self.store = WebStore(vault_root) if vault_root else None
        self.meter = UsageMeter(self.store)
        self.reload_restrictions()

    def reload_restrictions(self):
        self.restrictions = self.store.restrictions() if self.store else Restrictions()
        self.restrictions_changed.emit()

    def save_restrictions(self, r: Restrictions):
        if self.store is not None:
            self.store.save_restrictions(r)
        self.restrictions = r
        self.restrictions_changed.emit()

    def check(self, url: str) -> tuple:
        return self.restrictions.check(url, self.meter.today())

    # ── engine ─────────────────────────────────────────────────────────
    def available(self) -> bool:
        return web_runtime.available()

    def engine(self, parent=None, quiet: bool = False):
        """The lazily-loaded QtWebEngine namespace, or None after telling
        the user why it could not load."""
        try:
            return web_runtime.load()
        except web_runtime.WebRuntimeMissing as exc:
            if not quiet:
                QMessageBox.warning(parent, "Módulo WEB", str(exc))
            return None

    def profile(self):
        if self._profile is None:
            from .engine import build_profile
            self._profile = build_profile(self, self.home / "web_profile")
            self._timer.start()
        return self._profile

    def new_page(self, parent=None):
        from .engine import classes
        return classes().NVPage(self.profile(), self, parent)

    # ── browser window ─────────────────────────────────────────────────
    def window(self, create: bool = True):
        if self._window is None and create:
            if self.engine() is None:
                return None
            from .browser_window import BrowserWindow
            self._window = BrowserWindow(self)
        return self._window

    def open_window(self, url: str = "") -> bool:
        win = self.window()
        if win is None:
            return False
        if url:
            win.open_url(url, new_tab=True)
        win.show_and_raise()
        return True

    def toggle_window(self) -> bool:
        win = self.window(create=False)
        if win is not None and win.isVisible() and win.isActiveWindow():
            win.close()
            return True
        return self.open_window()

    # ── usage ──────────────────────────────────────────────────────────
    def register_view(self, view, counts_when: str = "visible"):
        """Browser tabs count while visible in the active window; canvas
        cards only while they hold the keyboard focus."""
        self._views[view] = counts_when

    def active_host(self) -> str:
        app = QApplication.instance()
        focus = app.focusWidget() if app else None
        for view, mode in list(self._views.items()):
            try:
                if not view.isVisible() or not view.window().isActiveWindow():
                    continue
                if mode == "focus" and not (focus is view or (focus and view.isAncestorOf(focus))):
                    continue
                host = host_of(view.url().toString())
            except RuntimeError:          # C++ object already deleted
                continue
            if host:
                return host
        return ""

    def _tick(self):
        host = self.active_host()
        if not host:
            return
        self.meter.tick(host, TICK_SECONDS)
        if self.restrictions.limit_for(host) is None:
            return
        # A daily limit just ran out: block every page showing that site.
        for view in list(self._views.keys()):
            try:
                url = view.url().toString()
                if host_of(url) and self.restrictions.limit_for(host_of(url)):
                    ok, reason = self.check(url)
                    if not ok:
                        view.page().show_blocked(url, reason)
            except (RuntimeError, AttributeError):
                continue

    def usage_label(self, url: str) -> str:
        host = host_of(url)
        if not host:
            return ""
        used = self.meter.today().get(host, 0) // 60
        lim = self.restrictions.limit_for(host)
        if lim:
            from ....core.web_store import seconds_for
            used = seconds_for(self.meter.today(), lim[0]) // 60
            return f"Hoy en {lim[0]}: {used} de {lim[1]} min"
        return f"Hoy en {host}: {used} min"

    def shutdown(self):
        self.meter.flush()
        if self._window is not None:
            self._window.save_session()


_instance: Optional[WebController] = None


def controller() -> WebController:
    global _instance
    if _instance is None:
        _instance = WebController(parent=QApplication.instance())
    return _instance
