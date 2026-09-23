"""
The WEB module window: a tabbed browser, separate from the main window.

Opened only from the command palette (Ctrl+P → "WEB"). Tabs, address bar
with search, bookmarks bar, history, downloads, find in page, zoom, content
restrictions and "send this page to the open canvas". The open tabs are
restored the next time it opens; closing the window unloads every page so
nothing keeps playing in the background.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from PySide6.QtCore import Qt, QUrl, QStringListModel, QTimer, QSize, Signal
from PySide6.QtGui import QKeySequence, QShortcut, QIcon
from PySide6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QLineEdit, QToolButton,
    QTabWidget, QProgressBar, QLabel, QMenu, QCompleter, QMessageBox,
    QDialog, QListWidget, QListWidgetItem,
)

from ....config import APP_DIR
from ....core.web_store import HOME_URL, normalize_url, host_of


BG = "#1b1b1f"
BAR = "#232329"
BORDER = "#33333e"
TEXT = "#dcdde0"
DIM = "#8a8a96"
ACCENT = "#7c5af0"

_STYLE = f"""
QMainWindow, QWidget#webRoot {{ background:{BG}; }}
QWidget#navBar, QWidget#bmBar {{ background:{BAR}; }}
QWidget#bmBar {{ border-bottom:1px solid {BORDER}; }}
QToolButton {{ background:transparent; color:{TEXT}; border:none; border-radius:6px;
    padding:4px 7px; font-size:14px; }}
QToolButton:hover {{ background:#34343f; }}
QToolButton:disabled {{ color:#55555f; }}
QToolButton::menu-indicator {{ image:none; width:0; }}
QToolButton#bmButton {{ font-size:12px; padding:3px 8px; color:#c9c9d1; }}
QLineEdit#address {{ background:#141417; color:{TEXT}; border:1px solid {BORDER};
    border-radius:15px; padding:6px 14px; font-size:13px;
    font-family:'Segoe UI Variable Text','Segoe UI'; }}
QLineEdit#address:focus {{ border-color:{ACCENT}; }}
QTabWidget::pane {{ border:none; }}
QTabBar {{ background:{BG}; }}
QTabBar::tab {{ background:#202026; color:{DIM}; padding:7px 12px; margin-right:2px;
    border-top-left-radius:8px; border-top-right-radius:8px; min-width:120px; max-width:220px;
    font-family:'Segoe UI'; font-size:12px; }}
QTabBar::tab:selected {{ background:{BAR}; color:{TEXT}; }}
QTabBar::tab:hover {{ color:{TEXT}; }}
QProgressBar {{ background:transparent; border:none; max-height:2px; }}
QProgressBar::chunk {{ background:{ACCENT}; }}
QStatusBar {{ background:{BAR}; color:{DIM}; font-size:11px; }}
QWidget#findBar {{ background:{BAR}; border-top:1px solid {BORDER}; }}
QWidget#findBar QLineEdit {{ background:#141417; color:{TEXT}; border:1px solid {BORDER};
    border-radius:6px; padding:4px 8px; }}
QLabel {{ color:{DIM}; }}
"""


def _btn(text: str, tip: str, slot=None) -> QToolButton:
    b = QToolButton()
    b.setText(text)
    b.setToolTip(tip)
    b.setCursor(Qt.PointingHandCursor)
    if slot is not None:
        b.clicked.connect(slot)
    return b


class BrowserWindow(QMainWindow):
    def __init__(self, ctl, parent=None):
        super().__init__(parent)
        self.ctl = ctl
        self.setWindowTitle("NoteVault · WEB")
        self.resize(1240, 820)
        icon = APP_DIR.parent / "assets" / "notevault.ico"
        if icon.exists():
            self.setWindowIcon(QIcon(str(icon)))
        self.setStyleSheet(_STYLE)

        root = QWidget(objectName="webRoot")
        lay = QVBoxLayout(root)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)

        # navigation bar
        nav = QWidget(objectName="navBar")
        nl = QHBoxLayout(nav)
        nl.setContentsMargins(8, 6, 8, 6)
        nl.setSpacing(2)
        self._back = _btn("◀", "Atrás  (Alt+←)", lambda: self._view() and self._view().back())
        self._fwd = _btn("▶", "Adelante  (Alt+→)", lambda: self._view() and self._view().forward())
        self._reload = _btn("⟳", "Recargar  (F5)", self._reload_or_stop)
        self._home = _btn("⌂", "Inicio", lambda: self.open_url(HOME_URL))
        for b in (self._back, self._fwd, self._reload, self._home):
            nl.addWidget(b)
        self._address = QLineEdit(objectName="address")
        self._address.setPlaceholderText("Busca en Google o escribe una dirección")
        self._address.returnPressed.connect(self._on_address)
        self._completer_model = QStringListModel(self)
        comp = QCompleter(self._completer_model, self)
        comp.setCaseSensitivity(Qt.CaseInsensitive)
        comp.setFilterMode(Qt.MatchContains)
        comp.activated.connect(lambda text: (self._address.setText(text), self._on_address()))
        self._address.setCompleter(comp)
        nl.addWidget(self._address, 1)
        self._star = _btn("☆", "Guardar en marcadores  (Ctrl+D)", self.toggle_bookmark)
        nl.addWidget(self._star)
        nl.addWidget(_btn("📑", "Marcadores", self._show_bookmarks_menu))
        nl.addWidget(_btn("🕘", "Historial  (Ctrl+H)", self.show_history))
        self._shield = _btn("🛡", "Restricciones de contenido", self.show_restrictions)
        nl.addWidget(self._shield)
        nl.addWidget(_btn("⧉", "Añadir esta página al canvas abierto", self.add_to_canvas))
        more = _btn("⋮", "Más opciones")
        more.setPopupMode(QToolButton.InstantPopup)
        more.setMenu(self._build_more_menu())
        nl.addWidget(more)
        lay.addWidget(nav)

        # bookmarks bar
        self._bm_bar = QWidget(objectName="bmBar")
        self._bm_lay = QHBoxLayout(self._bm_bar)
        self._bm_lay.setContentsMargins(8, 2, 8, 2)
        self._bm_lay.setSpacing(2)
        lay.addWidget(self._bm_bar)

        self._progress = QProgressBar()
        self._progress.setTextVisible(False)
        self._progress.setFixedHeight(2)
        self._progress.hide()
        lay.addWidget(self._progress)

        self._tabs = QTabWidget()
        self._tabs.setDocumentMode(True)
        self._tabs.setTabsClosable(True)
        self._tabs.setMovable(True)
        self._tabs.setElideMode(Qt.ElideRight)
        self._tabs.setIconSize(QSize(16, 16))
        self._tabs.tabCloseRequested.connect(self.close_tab)
        self._tabs.currentChanged.connect(self._on_tab_changed)
        plus = _btn("＋", "Nueva pestaña  (Ctrl+T)", lambda: self.new_tab(HOME_URL))
        self._tabs.setCornerWidget(plus, Qt.TopRightCorner)
        lay.addWidget(self._tabs, 1)

        # find bar
        self._find_bar = QWidget(objectName="findBar")
        fl = QHBoxLayout(self._find_bar)
        fl.setContentsMargins(8, 4, 8, 4)
        self._find = QLineEdit()
        self._find.setPlaceholderText("Buscar en la página")
        self._find.textChanged.connect(lambda t: self._find_text(t))
        self._find.returnPressed.connect(lambda: self._find_text(self._find.text()))
        fl.addWidget(QLabel("Buscar:"))
        fl.addWidget(self._find, 1)
        fl.addWidget(_btn("↑", "Anterior", lambda: self._find_text(self._find.text(), back=True)))
        fl.addWidget(_btn("↓", "Siguiente", lambda: self._find_text(self._find.text())))
        fl.addWidget(_btn("✕", "Cerrar  (Esc)", self._close_find))
        self._find_bar.hide()
        lay.addWidget(self._find_bar)

        self.setCentralWidget(root)
        self._usage_lbl = QLabel()
        self.statusBar().addPermanentWidget(self._usage_lbl)
        self._usage_timer = QTimer(self)
        self._usage_timer.setInterval(15000)
        self._usage_timer.timeout.connect(self._refresh_usage)
        self._usage_timer.start()

        ctl.status_message.connect(lambda m: self.statusBar().showMessage(m, 6000))
        ctl.restrictions_changed.connect(self._refresh_shield)
        self._install_shortcuts()
        self._refresh_bookmarks_bar()
        self._refresh_shield()

    # ── tabs ───────────────────────────────────────────────────────────
    def _view(self):
        return self._tabs.currentWidget()

    def new_tab(self, url: str = "", switch: bool = True):
        from .engine import new_view
        view = new_view(self.ctl, counts_when="visible")
        page = view.page()
        page.new_window_handler = lambda _type: self.new_tab("", switch=True).page()
        page.fullScreenRequested.connect(self._on_fullscreen)
        view.titleChanged.connect(lambda t, v=view: self._set_tab_title(v, t))
        view.iconChanged.connect(lambda ic, v=view: self._set_tab_icon(v, ic))
        view.urlChanged.connect(lambda u, v=view: self._on_url_changed(v, u))
        view.loadStarted.connect(lambda v=view: self._on_load_started(v))
        view.loadProgress.connect(lambda p, v=view: self._on_progress(v, p))
        view.loadFinished.connect(lambda ok, v=view: self._on_load_finished(v, ok))
        page.linkHovered.connect(lambda link: self.statusBar().showMessage(link, 3000))
        idx = self._tabs.addTab(view, "Nueva pestaña")
        if switch:
            self._tabs.setCurrentIndex(idx)
        if url:
            view.setUrl(QUrl(normalize_url(url)))
        if not url or switch:
            QTimer.singleShot(0, self._address.setFocus if not url else view.setFocus)
        return view

    def open_url(self, url: str, new_tab: bool = False):
        if new_tab or self._view() is None:
            self.new_tab(url)
        else:
            self._view().setUrl(QUrl(normalize_url(url)))
            self._view().setFocus()

    def close_tab(self, index: int):
        view = self._tabs.widget(index)
        self._tabs.removeTab(index)
        if view is not None:
            view.deleteLater()
        if self._tabs.count() == 0:
            self.close()

    def _set_tab_title(self, view, title: str):
        i = self._tabs.indexOf(view)
        if i >= 0:
            self._tabs.setTabText(i, title or "Sin título")
            self._tabs.setTabToolTip(i, title)
        if view is self._view():
            self.setWindowTitle(f"{title} · NoteVault WEB" if title else "NoteVault · WEB")

    def _set_tab_icon(self, view, icon):
        i = self._tabs.indexOf(view)
        if i >= 0:
            self._tabs.setTabIcon(i, icon)

    def _on_tab_changed(self, _index: int):
        view = self._view()
        if view is None:
            return
        self._address.setText(view.url().toString())
        self._set_tab_title(view, view.title())
        self._refresh_nav(view)

    def _on_url_changed(self, view, url):
        if view is self._view():
            blocked = getattr(view.page(), "blocked_url", "")
            text = url.toString()
            self._address.setText(blocked if text == "about:blank" and blocked else text)
            self._address.setCursorPosition(0)
            self._refresh_nav(view)

    def _on_load_started(self, view):
        if view is self._view():
            self._reload.setText("✕")
            self._reload.setToolTip("Detener  (Esc)")
        view.page().blocked_url = ""

    def _on_progress(self, view, p: int):
        if view is self._view():
            self._progress.setVisible(p < 100)
            self._progress.setValue(p)

    def _on_load_finished(self, view, ok: bool):
        if view is self._view():
            self._progress.hide()
            self._reload.setText("⟳")
            self._reload.setToolTip("Recargar  (F5)")
            self._refresh_nav(view)
        if ok and self.ctl.store is not None:
            url = view.url().toString()
            try:
                self.ctl.store.add_history(url, view.title())
            except OSError:
                pass

    def _refresh_nav(self, view):
        h = view.history()
        self._back.setEnabled(h.canGoBack())
        self._fwd.setEnabled(h.canGoForward())
        url = view.url().toString()
        on = self.ctl.store is not None and self.ctl.store.is_bookmarked(url)
        self._star.setText("★" if on else "☆")
        self._refresh_usage()

    def _reload_or_stop(self):
        v = self._view()
        if v is None:
            return
        if self._reload.text() == "✕":
            v.stop()
        else:
            v.reload()

    def _on_address(self):
        text = self._address.text()
        self.open_url(text)

    # ── fullscreen (videos) ────────────────────────────────────────────
    def _on_fullscreen(self, request):
        chrome = [self._tabs.tabBar(), self.centralWidget().layout().itemAt(0).widget(),
                  self._bm_bar, self.statusBar()]
        if request.toggleOn():
            for w in chrome:
                w.hide()
            self.showFullScreen()
        else:
            for w in chrome:
                w.show()
            self.showNormal()

    # ── find / zoom ────────────────────────────────────────────────────
    def show_find(self):
        self._find_bar.show()
        self._find.setFocus()
        self._find.selectAll()

    def _close_find(self):
        if self._view() is not None:
            self._view().findText("")
        self._find_bar.hide()

    def _find_text(self, text: str, back: bool = False):
        v = self._view()
        if v is None:
            return
        from .engine import classes
        flags = classes().QWebEnginePage.FindFlag(0)
        if back:
            flags = classes().QWebEnginePage.FindFlag.FindBackward
        v.findText(text, flags)

    def _zoom(self, delta: float):
        v = self._view()
        if v is None:
            return
        z = 1.0 if delta == 0 else max(0.25, min(5.0, v.zoomFactor() + delta))
        v.setZoomFactor(z)
        self.statusBar().showMessage(f"Zoom {int(z * 100)} %", 2000)

    # ── bookmarks ──────────────────────────────────────────────────────
    def toggle_bookmark(self):
        v, store = self._view(), self.ctl.store
        if v is None or store is None:
            return
        url = v.url().toString()
        if not url.startswith("http"):
            return
        if store.is_bookmarked(url):
            store.remove_bookmark(url)
            self.statusBar().showMessage("Marcador eliminado", 3000)
        else:
            store.add_bookmark(v.title(), url)
            self.statusBar().showMessage("Guardado en marcadores", 3000)
        self._refresh_nav(v)
        self._refresh_bookmarks_bar()

    def _refresh_bookmarks_bar(self):
        while self._bm_lay.count():
            item = self._bm_lay.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        items = self.ctl.store.bookmarks() if self.ctl.store else []
        if not items:
            hint = QLabel("Guarda páginas con ☆ o Ctrl+D y aparecerán aquí")
            hint.setStyleSheet("font-size:11px;color:#6a6a75;padding:4px;")
            self._bm_lay.addWidget(hint)
        for b in items[:14]:
            btn = QToolButton(objectName="bmButton")
            title = b.title if len(b.title) <= 24 else b.title[:23] + "…"
            btn.setText("🌐 " + title)
            btn.setToolTip(f"{b.title}\n{b.url}")
            btn.setCursor(Qt.PointingHandCursor)
            btn.clicked.connect(lambda _=False, u=b.url: self.open_url(u))
            btn.setContextMenuPolicy(Qt.CustomContextMenu)
            btn.customContextMenuRequested.connect(
                lambda _p, u=b.url, w=btn: self._bookmark_context(u, w))
            self._bm_lay.addWidget(btn)
        self._bm_lay.addStretch(1)
        self._refresh_completer()

    def _bookmark_context(self, url: str, widget):
        menu = QMenu(self)
        menu.addAction("Abrir en pestaña nueva", lambda: self.new_tab(url))
        menu.addAction("Añadir al canvas", lambda: self.ctl.add_to_canvas_requested.emit(url, ""))
        menu.addSeparator()
        menu.addAction("Eliminar marcador", lambda: (self.ctl.store.remove_bookmark(url),
                                                      self._refresh_bookmarks_bar()))
        menu.exec(widget.mapToGlobal(widget.rect().bottomLeft()))

    def _show_bookmarks_menu(self):
        menu = QMenu(self)
        items = self.ctl.store.bookmarks() if self.ctl.store else []
        if not items:
            a = menu.addAction("Aún no hay marcadores")
            a.setEnabled(False)
        for b in items:
            menu.addAction("🌐 " + b.title, lambda u=b.url: self.open_url(u))
        btn = self.sender()
        menu.exec(btn.mapToGlobal(btn.rect().bottomLeft()) if btn else self.cursor().pos())

    def _refresh_completer(self):
        urls = []
        if self.ctl.store is not None:
            urls += [b.url for b in self.ctl.store.bookmarks()]
            for day in self.ctl.store.history_days()[:7]:
                urls += [h["url"] for h in reversed(self.ctl.store.history(day))]
        seen, uniq = set(), []
        for u in urls:
            if u not in seen:
                seen.add(u)
                uniq.append(u)
        self._completer_model.setStringList(uniq[:800])

    # ── history ────────────────────────────────────────────────────────
    def show_history(self):
        if self.ctl.store is None:
            return
        dlg = HistoryDialog(self.ctl.store, self)
        dlg.open_requested.connect(lambda url: self.open_url(url, new_tab=True))
        dlg.exec()
        self._refresh_completer()

    # ── restrictions ───────────────────────────────────────────────────
    def show_restrictions(self):
        from .restrictions_dialog import RestrictionsDialog
        dlg = RestrictionsDialog(self.ctl, self)
        if dlg.exec() == QDialog.Accepted:
            v = self._view()
            if v is not None:
                ok, reason = self.ctl.check(v.url().toString())
                if not ok:
                    v.page().show_blocked(v.url().toString(), reason)

    def _refresh_shield(self):
        r = self.ctl.restrictions
        active = r.enabled and (r.blocked_domains or r.blocked_patterns
                                or r.daily_limits or r.mode == "allowlist")
        self._shield.setStyleSheet(f"color:{ACCENT};" if active else "")
        self._shield.setToolTip("Restricciones de contenido" + (" (activas)" if active else ""))

    def _refresh_usage(self):
        v = self._view()
        self._usage_lbl.setText(self.ctl.usage_label(v.url().toString()) if v else "")

    # ── canvas ─────────────────────────────────────────────────────────
    def add_to_canvas(self):
        v = self._view()
        if v is None or not v.url().toString().startswith("http"):
            return
        self.ctl.add_to_canvas_requested.emit(v.url().toString(), v.title())

    # ── menu / shortcuts ───────────────────────────────────────────────
    def _build_more_menu(self) -> QMenu:
        m = QMenu(self)
        m.addAction("Nueva pestaña\tCtrl+T", lambda: self.new_tab(HOME_URL))
        m.addAction("Buscar en la página\tCtrl+F", self.show_find)
        m.addSeparator()
        m.addAction("Acercar\tCtrl++", lambda: self._zoom(0.1))
        m.addAction("Alejar\tCtrl+-", lambda: self._zoom(-0.1))
        m.addAction("Tamaño normal\tCtrl+0", lambda: self._zoom(0))
        m.addSeparator()
        m.addAction("Abrir en el navegador del sistema", self._open_external)
        m.addAction("Copiar dirección", self._copy_url)
        m.addSeparator()
        m.addAction("Borrar historial…", self._clear_history)
        m.addAction("Cerrar sesión en todos los sitios…", self._clear_cookies)
        return m

    def _install_shortcuts(self):
        pairs = [
            ("Ctrl+T", lambda: self.new_tab(HOME_URL)),
            ("Ctrl+W", lambda: self.close_tab(self._tabs.currentIndex())),
            ("Ctrl+L", lambda: (self._address.setFocus(), self._address.selectAll())),
            ("F6", lambda: (self._address.setFocus(), self._address.selectAll())),
            ("F5", lambda: self._view() and self._view().reload()),
            ("Ctrl+R", lambda: self._view() and self._view().reload()),
            ("Alt+Left", lambda: self._view() and self._view().back()),
            ("Alt+Right", lambda: self._view() and self._view().forward()),
            ("Ctrl+D", self.toggle_bookmark),
            ("Ctrl+H", self.show_history),
            ("Ctrl+F", self.show_find),
            ("Ctrl++", lambda: self._zoom(0.1)),
            ("Ctrl+=", lambda: self._zoom(0.1)),
            ("Ctrl+-", lambda: self._zoom(-0.1)),
            ("Ctrl+0", lambda: self._zoom(0)),
            ("Ctrl+Tab", lambda: self._cycle(1)),
            ("Ctrl+Shift+Tab", lambda: self._cycle(-1)),
            ("Escape", self._on_escape),
        ]
        for keys, fn in pairs:
            sc = QShortcut(QKeySequence(keys), self)
            sc.setContext(Qt.WindowShortcut)
            sc.activated.connect(fn)

    def _on_escape(self):
        if self._find_bar.isVisible():
            self._close_find()
        elif self.isFullScreen() and self._view() is not None:
            from .engine import classes
            self._view().triggerPageAction(classes().QWebEnginePage.WebAction.ExitFullScreen)
        elif self._view() is not None:
            self._view().stop()

    def _cycle(self, step: int):
        n = self._tabs.count()
        if n:
            self._tabs.setCurrentIndex((self._tabs.currentIndex() + step) % n)

    def _open_external(self):
        from PySide6.QtGui import QDesktopServices
        if self._view() is not None:
            QDesktopServices.openUrl(self._view().url())

    def _copy_url(self):
        from PySide6.QtWidgets import QApplication
        if self._view() is not None:
            QApplication.clipboard().setText(self._view().url().toString())

    def _clear_history(self):
        if self.ctl.store is None:
            return
        if QMessageBox.question(self, "Borrar historial",
                                "¿Borrar todo el historial de WEB?") == QMessageBox.Yes:
            self.ctl.store.clear_history()
            self._refresh_completer()

    def _clear_cookies(self):
        if QMessageBox.question(
                self, "Cerrar sesión",
                "Se borrarán las cookies: se cerrará la sesión en todos los sitios "
                "(Google, YouTube…). ¿Continuar?") == QMessageBox.Yes:
            self.ctl.profile().cookieStore().deleteAllCookies()
            self.statusBar().showMessage("Cookies borradas", 4000)

    # ── session ────────────────────────────────────────────────────────
    def save_session(self):
        urls = []
        for i in range(self._tabs.count()):
            v = self._tabs.widget(i)
            u = getattr(v.page(), "blocked_url", "") or v.url().toString()
            if u.startswith("http"):
                urls.append(u)
        if not urls:
            return
        try:
            (self.ctl.home / "web_session.json").write_text(json.dumps(
                {"tabs": urls, "current": max(0, self._tabs.currentIndex())},
                ensure_ascii=False, indent=2), encoding="utf-8")
        except OSError:
            pass

    def _restore_session(self):
        try:
            data = json.loads((self.ctl.home / "web_session.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            data = {}
        urls = [u for u in data.get("tabs") or [] if isinstance(u, str)]
        for u in urls:
            self.new_tab(u, switch=False)
        if urls:
            self._tabs.setCurrentIndex(min(int(data.get("current") or 0), len(urls) - 1))
        return bool(urls)

    def show_and_raise(self):
        if self._tabs.count() == 0 and not self._restore_session():
            self.new_tab(HOME_URL)
        self._refresh_bookmarks_bar()
        if self.isMinimized():
            self.showNormal()
        self.show()
        self.raise_()
        self.activateWindow()

    def closeEvent(self, event):
        self.save_session()
        self.ctl.meter.flush()
        # Unload every page: a closed window must not keep a video playing.
        while self._tabs.count():
            v = self._tabs.widget(0)
            self._tabs.removeTab(0)
            v.deleteLater()
        if self.isFullScreen():
            self.showNormal()
        super().closeEvent(event)


class HistoryDialog(QDialog):
    open_requested = Signal(str)

    def __init__(self, web_store, parent=None):
        super().__init__(parent)
        self.store = web_store
        self.setWindowTitle("Historial · WEB")
        self.resize(820, 560)
        self.setStyleSheet(
            f"QDialog{{background:{BG};}} QListWidget{{background:#202024;color:{TEXT};"
            f"border:1px solid {BORDER};border-radius:6px;font-size:12px;}}"
            "QListWidget::item{padding:5px;}"
            f"QListWidget::item:selected{{background:rgba(124,90,240,0.25);}}"
            f"QLineEdit{{background:#141417;color:{TEXT};border:1px solid {BORDER};"
            "border-radius:6px;padding:6px;}")
        lay = QVBoxLayout(self)
        self._search = QLineEdit()
        self._search.setPlaceholderText("Filtrar por título o dirección…")
        self._search.textChanged.connect(self._fill)
        lay.addWidget(self._search)
        row = QHBoxLayout()
        self._days = QListWidget()
        self._days.setFixedWidth(150)
        self._items = QListWidget()
        row.addWidget(self._days)
        row.addWidget(self._items, 1)
        lay.addLayout(row, 1)
        for d in web_store.history_days():
            it = QListWidgetItem("Hoy" if d == date.today() else d.strftime("%d/%m/%Y"))
            it.setData(Qt.UserRole, d.isoformat())
            self._days.addItem(it)
        self._days.currentRowChanged.connect(lambda _r: self._fill())
        self._items.itemActivated.connect(
            lambda it: (self.open_requested.emit(it.data(Qt.UserRole)), self.accept()))
        if self._days.count():
            self._days.setCurrentRow(0)
        hint = QLabel("Doble clic para abrir en una pestaña nueva")
        lay.addWidget(hint)

    def _fill(self, *_):
        self._items.clear()
        it = self._days.currentItem()
        if it is None:
            return
        q = self._search.text().lower().strip()
        for h in reversed(self.store.history(date.fromisoformat(it.data(Qt.UserRole)))):
            title, url = h.get("title") or h["url"], h["url"]
            if q and q not in title.lower() and q not in url.lower():
                continue
            row = QListWidgetItem(f"{h.get('time', '')[:5]}   {title}\n            {host_of(url)}")
            row.setToolTip(url)
            row.setData(Qt.UserRole, url)
            self._items.addItem(row)
