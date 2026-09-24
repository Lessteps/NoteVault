"""End-to-end checks of the web UI: a real browser drives the built
frontend (frontend/dist) against the real Python API, and every assertion is
about what ends up on disk.

Skipped unless Playwright and a Chromium are available and the frontend has
been built (cd frontend && npm run build).
"""

import os
import shutil
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist"
CHROMIUM = os.environ.get("NV_CHROMIUM", "/opt/pw-browsers/chromium")

try:
    from playwright.sync_api import sync_playwright
except ImportError:          # pragma: no cover
    sync_playwright = None

READY = (sync_playwright is not None and (DIST / "index.html").is_file()
         and Path(CHROMIUM).exists())


@unittest.skipUnless(READY, "needs playwright, Chromium and a built frontend")
class WebUiE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from notevault_app.webapp.api import NoteVaultApi
        from notevault_app.webapp.devserver import serve_in_thread

        cls.dir = Path(tempfile.mkdtemp(prefix="nv_e2e_"))
        (cls.dir / "Carpeta").mkdir()
        (cls.dir / "Carpeta" / "Nota.md").write_text(
            "---\nstatus: draft\n---\n# Nota\n\n- [ ] primera tarea\n- [x] hecha\n\n"
            "Ver [[Destino]] y [la web](https://example.com).\n", encoding="utf-8")
        (cls.dir / "Destino.md").write_text("# Destino\n\nhola\n", encoding="utf-8")
        (cls.dir / "Windows.md").write_bytes(b"# Windows\r\n\r\nlinea\r\n")
        cls.api = NoteVaultApi(cls.dir)
        cls.server, cls.url, _ = serve_in_thread(cls.api, 0, DIST)
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=CHROMIUM)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()
        shutil.rmtree(cls.dir, ignore_errors=True)

    def setUp(self):
        self.page = self.browser.new_page(viewport={"width": 1400, "height": 900})
        self.errors = []
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        self.page.goto(self.url)
        self.page.get_by_role("treeitem", name="Carpeta").wait_for()

    def tearDown(self):
        self.page.close()
        self.assertEqual(self.errors, [], "JavaScript errors on the page")

    def _open(self, *names):
        for name in names:
            self.page.get_by_role("treeitem", name=name, exact=True).click()

    def _wait_disk(self, path: Path, predicate, timeout=6.0):
        end = time.time() + timeout
        while time.time() < end:
            # The file may not exist yet: the UI creates it asynchronously.
            if path.exists() and predicate(path.read_bytes()):
                return
            time.sleep(0.1)
        state = path.read_bytes() if path.exists() else "missing"
        self.fail(f"{path.name} never reached the expected state: {state!r}")

    def test_typing_autosaves_to_disk(self):
        self._open("Carpeta", "Nota")
        self.page.get_by_role("tab", name="Editar").click()
        editor = self.page.locator(".cm-content")
        editor.click()
        self.page.keyboard.press("Control+End")
        self.page.keyboard.type("\nlinea nueva escrita en la web")
        self._wait_disk(self.dir / "Carpeta" / "Nota.md",
                        lambda b: b"linea nueva escrita en la web" in b)
        # Frontmatter survives untouched.
        self.assertTrue((self.dir / "Carpeta" / "Nota.md").read_bytes().startswith(
            b"---\nstatus: draft\n---\n"))

    def test_ticking_a_task_in_reading_view_edits_the_file(self):
        self._open("Carpeta", "Nota")
        self.page.locator("input.task-box").first.click()
        self._wait_disk(self.dir / "Carpeta" / "Nota.md", lambda b: b"- [x] primera tarea" in b)

    def test_crlf_note_stays_crlf(self):
        self._open("Windows")
        self.page.get_by_role("tab", name="Editar").click()
        self.page.locator(".cm-content").click()
        self.page.keyboard.press("Control+End")
        self.page.keyboard.type("otra")
        self.page.keyboard.press("Enter")
        self.page.keyboard.type("mas")
        path = self.dir / "Windows.md"
        self._wait_disk(path, lambda b: b"mas" in b)
        data = path.read_bytes()
        self.assertNotIn(b"\n", data.replace(b"\r\n", b""), data)

    def test_quick_switcher_creates_a_note(self):
        self.page.keyboard.press("Control+p")
        self.page.keyboard.type("Creada desde switcher")
        self.page.get_by_text("Crear nota").click()
        self._wait_disk(self.dir / "Creada desde switcher.md", lambda b: True)
        self.page.get_by_role("tab", name="Creada desde switcher").wait_for()

    def test_wikilink_opens_the_target_note(self):
        self._open("Carpeta", "Nota")
        self.page.locator("a.wikilink", has_text="Destino").click()
        self.page.get_by_role("tab", name="Destino").wait_for()

    def test_external_link_opens_outside_and_window_stays(self):
        self._open("Carpeta", "Nota")
        with mock.patch("notevault_app.webapp.api.webbrowser.open") as opened:
            self.page.get_by_role("link", name="la web").click()
            end = time.time() + 5
            while not opened.called and time.time() < end:
                time.sleep(0.05)
        opened.assert_called_once_with("https://example.com", new=2)
        self.assertTrue(self.page.url.startswith(self.url))

    def test_outside_edit_is_detected_not_overwritten(self):
        path = self.dir / "Destino.md"
        self._open("Destino")
        self.page.get_by_role("tab", name="Editar").click()
        path.write_text("# Destino\n\ncambiado por otra app\n", encoding="utf-8")
        os.utime(path, (time.time() + 5, time.time() + 5))
        self.page.locator(".cm-content").click()
        self.page.keyboard.press("Control+End")
        self.page.keyboard.type(" mio")
        self.page.get_by_text("Este archivo cambió fuera de NoteVault").wait_for(timeout=6000)
        self.assertIn("cambiado por otra app", path.read_text(encoding="utf-8"))
        self.page.get_by_role("button", name="Conservar la mía").click()
        self._wait_disk(path, lambda b: b" mio" in b)


@unittest.skipUnless(READY, "needs playwright, Chromium and a built frontend")
class TasksE2E(unittest.TestCase):
    """Tareas driven through the browser; checks the task files on disk."""

    @classmethod
    def setUpClass(cls):
        from notevault_app.webapp.api import NoteVaultApi
        from notevault_app.webapp.devserver import serve_in_thread

        cls.dir = Path(tempfile.mkdtemp(prefix="nv_e2e_tasks_"))
        cls.api = NoteVaultApi(cls.dir)
        cls.seed = cls.api.tasks_create({"name": "Semilla", "body": "- [ ] paso uno"})
        cls.server, cls.url, _ = serve_in_thread(cls.api, 0, DIST)
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=CHROMIUM)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()
        shutil.rmtree(cls.dir, ignore_errors=True)

    def setUp(self):
        self.page = self.browser.new_page(viewport={"width": 1500, "height": 900})
        self.errors = []
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        self.page.goto(self.url)
        self.page.get_by_role("button", name="Tareas").click()
        self.page.get_by_text("Semilla").first.wait_for()

    def tearDown(self):
        self.page.close()
        self.assertEqual(self.errors, [])

    def _task_file(self, tid):
        from notevault_app.core.task_manager import TaskManager
        return TaskManager(self.dir).get(tid)

    def _wait(self, predicate, timeout=6.0):
        end = time.time() + timeout
        while time.time() < end:
            if predicate():
                return
            time.sleep(0.1)
        self.fail("state never reached")

    def test_create_and_rename_in_drawer(self):
        self.page.get_by_role("button", name="Nueva tarea").click()
        title = self.page.locator("aside input").first
        title.fill("Creada en la web")
        title.press("Enter")
        self._wait(lambda: any(t["name"] == "Creada en la web" for t in self.api.tasks_list()))

    def test_tick_done_and_subtask_write_the_file(self):
        tid = self.seed["id"]
        self.page.get_by_text("Semilla").first.click()
        self.page.get_by_text("paso uno", exact=True).wait_for()
        self.page.locator("aside").get_by_role("checkbox").first.check()
        self._wait(lambda: "- [x] paso uno" in self._task_file(tid).body)
        self.page.get_by_placeholder("Añadir subtarea…").fill("paso dos")
        self.page.get_by_placeholder("Añadir subtarea…").press("Enter")
        self._wait(lambda: "- [ ] paso dos" in self._task_file(tid).body)
        # The row of this task (other tests add tasks that sort before it).
        row = self.page.locator("div.grid", has=self.page.get_by_text("Semilla", exact=True))
        row.get_by_title("Marcar como completada").check()
        self._wait(lambda: self._task_file(tid).status == "Completado")


if __name__ == "__main__":
    unittest.main()
