"""WEB module with the real QtWebEngine: blocking, canvas web cards, palette.

Everything runs against a temp vault and a temp browser profile (the
controller's ``home``), never the user's logins. Pages are local (data: or
setHtml), so the tests do not need the network. UI actions go through the
real event chain with QTest.
"""
import os
import shutil
import tempfile
import time
import unittest
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtCore import QCoreApplication, QPointF, Qt, QUrl
QCoreApplication.setAttribute(Qt.AA_ShareOpenGLContexts)
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

from notevault_app.core import web_runtime
from notevault_app.core.web_store import Restrictions

_app = QApplication.instance() or QApplication([])

_HOME = Path(tempfile.mkdtemp(prefix="nvwebhome"))


def _ctl(vault: Path):
    from notevault_app.ui.components.web import controller
    ctl = controller()
    ctl.home = _HOME                  # before the profile exists: temp logins only
    ctl.set_vault(vault)
    return ctl


def _wait(pred, timeout=20.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        _app.processEvents()
        if pred():
            return True
        QTest.qWait(50)
    return False


@unittest.skipUnless(web_runtime.available(), "QtWebEngine not installed")
class TestBlocking(unittest.TestCase):
    def setUp(self):
        self.vault = Path(tempfile.mkdtemp(prefix="nvwebvault"))
        self.ctl = _ctl(self.vault)

    def tearDown(self):
        self.ctl.save_restrictions(Restrictions())
        shutil.rmtree(self.vault, ignore_errors=True)

    def test_blocked_site_never_loads(self):
        from notevault_app.ui.components.web.engine import new_view
        self.ctl.save_restrictions(Restrictions(blocked_domains=["example.com"]))
        view = new_view(self.ctl)
        view.resize(400, 300)
        view.show()
        view.setUrl(QUrl("https://www.example.com/page"))
        self.assertTrue(_wait(lambda: view.title() == "Bloqueado"))
        self.assertEqual(view.page().blocked_url, "https://www.example.com/page")
        view.deleteLater()

    def test_single_page_app_route_is_caught(self):
        """YouTube-style navigation (pushState to /shorts) never fires a
        navigation request; it must still be blocked."""
        from notevault_app.ui.components.web.engine import new_view
        self.ctl.save_restrictions(Restrictions(blocked_patterns=["allowed.test/shorts"]))
        view = new_view(self.ctl)
        view.show()
        loaded = []
        view.loadFinished.connect(loaded.append)
        view.setHtml("<title>home</title><body>ok</body>", QUrl("https://allowed.test/"))
        self.assertTrue(_wait(lambda: loaded))
        self.assertEqual(view.title(), "home")
        view.page().runJavaScript("history.pushState({}, '', '/shorts/123')")
        self.assertTrue(_wait(lambda: view.title() == "Bloqueado"))
        view.deleteLater()


@unittest.skipUnless(web_runtime.available(), "QtWebEngine not installed")
class TestCanvasWebCards(unittest.TestCase):
    PAGE = "data:text/html,<title>Hola web</title><body style='background:%2300ff00'>x</body>"

    def setUp(self):
        from notevault_app.core.vault_manager import VaultManager
        from notevault_app.core.notes_service import NotesService
        from notevault_app.ui.components.notes.canvas.view import CanvasView
        self.vault = Path(tempfile.mkdtemp(prefix="nvwebcanvas"))
        self.ctl = _ctl(self.vault)
        vm = VaultManager(self.vault)
        self.view = CanvasView(vm, NotesService(vm))
        self.view.resize(1000, 700)
        self.view.show()
        cv = self.vault / "w.canvas"
        cv.write_text('{"nodes":[],"edges":[]}', encoding="utf-8")
        self.view.load(cv)
        _app.processEvents()

    def tearDown(self):
        self.view.close()
        self.view.deleteLater()
        _app.processEvents()
        shutil.rmtree(self.vault, ignore_errors=True)

    def _card(self):
        from notevault_app.ui.components.notes.canvas.items import LinkNodeItem
        item = self.view.add_link_node(QPointF(0, 0), self.PAGE)
        self.assertIsInstance(item, LinkNodeItem)
        self.view.centerOn(item)
        _app.processEvents()
        return item

    def test_double_click_makes_page_live_then_rest_saves_snapshot(self):
        item = self._card()
        body = item.mapToScene(QPointF(item.node.width / 2, item.node.height / 2))
        QTest.mouseDClick(self.view.viewport(), Qt.LeftButton, Qt.NoModifier,
                          self.view.mapFromScene(body))
        self.assertTrue(_wait(lambda: item.is_live))
        self.assertTrue(_wait(lambda: item.title() == "Hola web"))
        self.assertEqual(item.node.nv.get("title"), "Hola web")       # saved on the node

        # Clicking empty board deselects the card: it goes back to a snapshot.
        empty = self.view.mapFromScene(QPointF(-800, -600))
        QTest.mouseClick(self.view.viewport(), Qt.LeftButton, Qt.NoModifier, empty)
        self.assertTrue(_wait(lambda: not item.is_live))
        self.assertTrue(item._snapshot_path().exists())
        self.assertTrue(str(item._snapshot_path()).startswith(str(_HOME)))

    def test_ctrl_v_of_a_url_creates_a_web_card(self):
        QApplication.clipboard().setText("https://doc.qt.io/qt-6/")
        QTest.keyClick(self.view, Qt.Key_V, Qt.ControlModifier)
        _app.processEvents()
        links = [n for n in self.view._doc.nodes if n.type == "link"]
        self.assertEqual([n.url for n in links], ["https://doc.qt.io/qt-6/"])
        self.assertGreaterEqual(links[0].width, 400)

    def test_web_page_added_from_web_module(self):
        self.view.add_web_page("https://example.com", "Example")
        links = [n for n in self.view._doc.nodes if n.type == "link"]
        self.assertEqual(links[0].nv, {"title": "Example"})


@unittest.skipUnless(web_runtime.available(), "QtWebEngine not installed")
class TestBrowserWindow(unittest.TestCase):
    def setUp(self):
        self.vault = Path(tempfile.mkdtemp(prefix="nvwebwin"))
        self.ctl = _ctl(self.vault)

    def tearDown(self):
        win = self.ctl.window(create=False)
        if win is not None:
            win.close()
        _app.processEvents()
        shutil.rmtree(self.vault, ignore_errors=True)

    def test_open_bookmark_history_and_session(self):
        self.assertTrue(self.ctl.open_window("data:text/html,<title>uno</title>"))
        win = self.ctl.window()
        view = win._view()
        self.assertTrue(_wait(lambda: view.title() == "uno"))
        # bookmarks only accept web pages; history records them
        self.ctl.store.add_history("https://doc.qt.io/", "Qt")
        self.assertEqual(self.ctl.store.history()[-1]["url"], "https://doc.qt.io/")
        win.new_tab("https://allowed.invalid/")
        self.assertEqual(win._tabs.count(), 2)
        QTest.keyClick(win, Qt.Key_W, Qt.ControlModifier)       # close the current tab
        _app.processEvents()
        self.assertEqual(win._tabs.count(), 1)
        win.new_tab("https://doc.qt.io/")
        win.save_session()
        self.assertTrue((_HOME / "web_session.json").exists())
        win.close()
        self.assertEqual(win._tabs.count(), 0)          # pages unloaded on close


class TestPaletteCommands(unittest.TestCase):
    def test_web_commands_are_global(self):
        from notevault_app.ui.components.notes.command_palette import (
            Command, global_commands, register_global_commands, matches)
        provider = lambda: [Command("Abrir navegador WEB", "WEB", lambda: None)]  # noqa: E731
        register_global_commands(provider)
        cmds = [c for c in global_commands() if matches("web", c)]
        self.assertTrue(any(c.title == "Abrir navegador WEB" for c in cmds))


class TestMainWindowPalette(unittest.TestCase):
    """Ctrl+P is the only way into WEB: inside Notas the editor's palette
    lists the WEB commands; in every other module the window's own Ctrl+P
    opens the same palette."""

    def test_global_palette_follows_the_module(self):
        from notevault_app.ui.main_window import MainWindow, MODE_NOTAS, MODE_HOME
        from notevault_app.ui.components.notes.command_palette import global_commands
        win = MainWindow()
        try:
            titles = [c.title for c in global_commands() if c.group == "WEB"]
            self.assertIn("Abrir navegador WEB", titles)
            win._switch_mode(MODE_HOME)
            self.assertTrue(win._global_palette.isEnabled())
            win._switch_mode(MODE_NOTAS)
            self.assertFalse(win._global_palette.isEnabled())   # the editor owns Ctrl+P there
        finally:
            win.close()
            win.deleteLater()
            _app.processEvents()


if __name__ == "__main__":
    unittest.main()
