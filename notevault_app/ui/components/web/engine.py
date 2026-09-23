"""
QtWebEngine pieces of the WEB module, built only once the engine is loaded.

The page subclass has to derive from a class that does not exist until
``web_runtime.load()`` runs, so it is created inside ``classes()`` and cached.
"""

from __future__ import annotations

import re
from pathlib import Path

from PySide6.QtCore import QTimer, QUrl, Signal
from PySide6.QtWidgets import QApplication, QMessageBox

from ....core import web_runtime
from ....core.web_store import blocked_page_html

_classes = None


def build_profile(ctl, root: Path):
    """The one persistent Chromium profile: cookies and logins survive
    restarts, the cache is on disk, and the user agent is a plain Chrome one
    (Google refuses to sign in to browsers that announce "QtWebEngine")."""
    ns = web_runtime.load()
    P = ns.QWebEngineProfile
    root.mkdir(parents=True, exist_ok=True)
    prof = P("NoteVault", QApplication.instance())
    prof.setPersistentStoragePath(str(root / "storage"))
    prof.setCachePath(str(root / "cache"))
    prof.setHttpCacheType(P.HttpCacheType.DiskHttpCache)
    prof.setHttpCacheMaximumSize(200 * 1024 * 1024)
    prof.setPersistentCookiesPolicy(P.PersistentCookiesPolicy.ForcePersistentCookies)
    prof.setHttpUserAgent(re.sub(r"\s*QtWebEngine/\S+", "", prof.httpUserAgent()))
    prof.setHttpAcceptLanguage("es-ES,es;q=0.9,en;q=0.8")
    s = prof.settings()
    A = ns.QWebEngineSettings.WebAttribute
    for attr in ("FullScreenSupportEnabled", "PdfViewerEnabled", "PluginsEnabled",
                 "LocalStorageEnabled", "ScrollAnimatorEnabled", "JavascriptCanOpenWindows",
                 "DnsPrefetchEnabled"):
        if hasattr(A, attr):
            s.setAttribute(getattr(A, attr), True)

    def on_download(req):
        folder = Path.home() / "Downloads"
        folder.mkdir(exist_ok=True)
        req.setDownloadDirectory(str(folder))
        req.accept()
        name = req.downloadFileName()
        ctl.status_message.emit(f"Descargando {name}…")
        req.isFinishedChanged.connect(
            lambda: ctl.status_message.emit(f"Descarga terminada: {folder / name}"))
    prof.downloadRequested.connect(on_download)
    return prof


_PERMISSION_NAMES = {
    "MediaAudioCapture": "el micrófono",
    "MediaVideoCapture": "la cámara",
    "MediaAudioVideoCapture": "la cámara y el micrófono",
    "Geolocation": "tu ubicación",
    "Notifications": "mostrar notificaciones",
    "DesktopVideoCapture": "compartir pantalla",
    "DesktopAudioVideoCapture": "compartir pantalla y audio",
    "ClipboardReadWrite": "el portapapeles",
}


def classes():
    global _classes
    if _classes is not None:
        return _classes
    ns = web_runtime.load()

    class NVPage(ns.QWebEnginePage):
        """A page that enforces the content restrictions: blocked main-frame
        navigations never load, and single-page apps that switch URL without
        navigating (YouTube → /shorts) are caught on urlChanged."""

        blocked = Signal(str, str)          # url, reason

        def __init__(self, profile, ctl, parent=None):
            super().__init__(profile, parent)
            self._ctl = ctl
            self.new_window_handler = None  # callable(type) -> page
            self.blocked_url = ""
            self.urlChanged.connect(self._on_url_changed)
            if hasattr(self, "permissionRequested"):
                self.permissionRequested.connect(self._on_permission)
            self.fullScreenRequested.connect(lambda req: req.accept())

        def acceptNavigationRequest(self, url, nav_type, is_main_frame):
            if is_main_frame:
                ok, reason = self._ctl.check(url.toString())
                if not ok:
                    target = url.toString()
                    QTimer.singleShot(0, lambda: self.show_blocked(target, reason))
                    return False
            return super().acceptNavigationRequest(url, nav_type, is_main_frame)

        def _on_url_changed(self, url):
            s = url.toString()
            ok, reason = self._ctl.check(s)
            if not ok:
                self.show_blocked(s, reason)

        def show_blocked(self, url: str, reason: str):
            self.blocked_url = url
            self.setHtml(blocked_page_html(url, reason), QUrl("about:blank"))
            self.blocked.emit(url, reason)

        def createWindow(self, win_type):
            if self.new_window_handler is not None:
                return self.new_window_handler(win_type)
            return None

        def _on_permission(self, permission):
            try:
                kind = permission.permissionType().name
            except AttributeError:
                kind = str(permission.permissionType())
            what = _PERMISSION_NAMES.get(kind, kind)
            origin = permission.origin().host() or permission.origin().toString()
            answer = QMessageBox.question(
                None, "Permiso del sitio", f"¿Permitir que {origin} use {what}?")
            if answer == QMessageBox.Yes:
                permission.grant()
            else:
                permission.deny()

        def javaScriptConsoleMessage(self, level, message, line, source):
            pass                            # keep page noise out of the app log

    class _NS:
        pass
    _classes = _NS()
    _classes.NVPage = NVPage
    _classes.QWebEngineView = ns.QWebEngineView
    _classes.QWebEnginePage = ns.QWebEnginePage
    return _classes


def new_view(ctl, parent=None, counts_when: str = "visible"):
    """A QWebEngineView on the shared profile with a restriction-aware page."""
    c = classes()
    view = c.QWebEngineView(parent)
    page = c.NVPage(ctl.profile(), ctl, view)
    view.setPage(page)
    ctl.register_view(view, counts_when)
    return view
