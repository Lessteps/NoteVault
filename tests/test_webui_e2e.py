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

def _rail(page, name):
    """The module button in the icon rail (Vista General has buttons with the same names)."""
    return page.get_by_role("navigation", name="Módulos").get_by_role("button", name=name, exact=True)


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
        _rail(self.page, "Notas").click()
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
        _rail(self.page, "Tareas").click()
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


@unittest.skipUnless(READY, "needs playwright, Chromium and a built frontend")
class HabitsE2E(unittest.TestCase):
    """Hábitos driven through the browser; checks the habit files on disk."""

    @classmethod
    def setUpClass(cls):
        from notevault_app.webapp.api import NoteVaultApi
        from notevault_app.webapp.devserver import serve_in_thread

        cls.dir = Path(tempfile.mkdtemp(prefix="nv_e2e_habits_"))
        cls.api = NoteVaultApi(cls.dir)
        for h in cls.api.habits_list():
            cls.api.habits_remove(h["id"])
        cls.water = cls.api.habits_add({"name": "Agua", "icon": "💧"})
        cls.sub = cls.api.habits_add_subtask(cls.water["id"], "Primer vaso")
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
        _rail(self.page, "Hábitos").click()
        self.page.get_by_text("Habit Streak").wait_for()

    def tearDown(self):
        self.page.close()
        self.assertEqual(self.errors, [])

    def _view(self, name):
        self.page.locator("aside nav").get_by_text(name, exact=True).click()

    def _day(self):
        from datetime import date
        from notevault_app.core.habit_manager import HabitManager
        return HabitManager(self.dir).get_day(date.today())

    def _wait(self, predicate, timeout=6.0):
        end = time.time() + timeout
        while time.time() < end:
            if predicate():
                return
            time.sleep(0.1)
        self.fail("state never reached")

    def test_daily_check_in_subtask_and_journal(self):
        hid, sid = self.water["id"], self.sub["id"]
        self._view("Diaria")
        self.page.get_by_role("checkbox", name="Agua").click()
        self._wait(lambda: self._day().completed.get(hid) is True)
        self.page.get_by_label("Primer vaso").check()
        self._wait(lambda: self._day().subtasks.get(hid, {}).get(sid) is True)
        self.page.get_by_placeholder("Diario: ¿cómo fue el día?").fill("buen día\n---\nfin")
        self._wait(lambda: "buen día" in self._day().journal)
        self.assertTrue(self._day().completed.get(hid))

    def test_create_and_rename_in_manager(self):
        self._view("Gestionar hábitos")
        self.page.get_by_role("button", name="Nuevo hábito").click()
        name = self.page.locator("aside input").nth(1)
        name.fill("Leer 20 min")
        name.press("Enter")
        self._wait(lambda: any(h["name"] == "Leer 20 min" for h in self.api.habits_list()))
        self.page.get_by_role("button", name="X", exact=True).click()   # drop Wednesday
        self._wait(lambda: next(h for h in self.api.habits_list()
                                if h["name"] == "Leer 20 min")["days"] == [0, 1, 3, 4, 5, 6])


@unittest.skipUnless(READY, "needs playwright, Chromium and a built frontend")
class CalendarE2E(unittest.TestCase):
    """Calendario driven through the browser; checks the agenda files on disk."""

    @classmethod
    def setUpClass(cls):
        from datetime import date
        from notevault_app.webapp.api import NoteVaultApi
        from notevault_app.webapp.devserver import serve_in_thread

        cls.dir = Path(tempfile.mkdtemp(prefix="nv_e2e_cal_"))
        cls.api = NoteVaultApi(cls.dir)
        for h in cls.api.habits_list():
            cls.api.habits_remove(h["id"])
        cls.today = date.today()
        cls.api.cal_save(dict(mode="create", kind="event", title="Semilla", date=cls.today.isoformat(),
                              start="10:00", duration=60, colour="#039be5", repeat="", orig={}))
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
        _rail(self.page, "Calendario").click()
        self.page.locator("aside nav").get_by_text("Día", exact=True).click()
        self.page.get_by_text("Semilla").first.wait_for()

    def tearDown(self):
        self.page.close()
        self.assertEqual(self.errors, [])

    def _events(self):
        from notevault_app.core.schedule_manager import ScheduleManager
        return ScheduleManager(self.dir).get_day_file(self.today)["events"]

    def _wait(self, predicate, timeout=6.0):
        end = time.time() + timeout
        while time.time() < end:
            if predicate():
                return
            time.sleep(0.1)
        self.fail("state never reached")

    def test_drag_to_create_an_event(self):
        col = self.page.locator(f"[data-day='{self.today.isoformat()}']").last
        box = col.bounding_box()
        # 48 px per hour: from 14:00 to 15:30.
        x = box["x"] + box["width"] / 2
        self.page.evaluate("document.querySelector('.overflow-y-auto .relative.flex').parentElement.scrollTop = 13*48")
        top = col.bounding_box()["y"]
        self.page.mouse.move(x, top + 14 * 48 + 2)
        self.page.mouse.down()
        self.page.mouse.move(x, top + 15.5 * 48, steps=5)
        self.page.mouse.up()
        self.page.get_by_placeholder("Añadir título").fill("Arrastrado")
        self.page.get_by_role("button", name="Guardar").click()
        self._wait(lambda: any(e["title"] == "Arrastrado" and e["start"] == "14:00"
                               and e["duration_min"] == 90 for e in self._events()))

    def test_edit_title_and_make_it_weekly(self):
        self.page.get_by_text("Semilla").first.click()
        self.page.get_by_placeholder("Añadir título").fill("Semilla editada")
        self.page.get_by_label("Repetición").select_option("weekly")
        self.page.get_by_role("button", name="Guardar").click()
        self._wait(lambda: any(r["title"] == "Semilla editada" for r in self.api.cal_routines()))
        self.assertFalse([e for e in self._events() if e["title"].startswith("Semilla")])


@unittest.skipUnless(READY, "needs playwright, Chromium and a built frontend")
class ProjectsE2E(unittest.TestCase):
    """Proyectos driven through the browser; checks the issue files on disk."""

    @classmethod
    def setUpClass(cls):
        from notevault_app.webapp.api import NoteVaultApi
        from notevault_app.webapp.devserver import serve_in_thread

        cls.dir = Path(tempfile.mkdtemp(prefix="nv_e2e_proj_"))
        cls.api = NoteVaultApi(cls.dir)
        cls.p = cls.api.projects_create({"name": "Portafolio web", "status": "En curso"})
        cls.x = cls.api.projects_issue_create(cls.p["id"], {"title": "Semilla"})
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
        _rail(self.page, "Proyectos").click()
        self.page.locator("main").get_by_text("Portafolio web").first.click()
        self.page.get_by_role("tab", name="Tablero").wait_for()

    def tearDown(self):
        self.page.close()
        self.assertEqual(self.errors, [])

    def _issues(self):
        from notevault_app.core.project_manager import ProjectManager
        return {i.title: i for i in ProjectManager(self.dir).issues(self.p["id"])}

    def _wait(self, predicate, timeout=6.0):
        end = time.time() + timeout
        while time.time() < end:
            if predicate():
                return
            time.sleep(0.1)
        self.fail("state never reached")

    def test_drag_card_to_done(self):
        self.page.get_by_role("tab", name="Tablero").click()
        card = self.page.locator("[data-card]", has_text="Semilla")
        card.drag_to(self.page.locator("[data-column='Hecho']"))
        self._wait(lambda: self._issues()["Semilla"].status == "Hecho")
        self.assertIsNotNone(self._issues()["Semilla"].done_at)

    def test_create_issue_and_edit_in_panel(self):
        self.page.get_by_role("button", name="Crear issue").click()
        self.page.get_by_placeholder("¿Qué hay que hacer?").fill("Formulario")
        self.page.get_by_role("button", name="Crear", exact=True).click()
        self._wait(lambda: "Formulario" in self._issues())
        panel = self.page.get_by_label("Detalle del issue")
        panel.get_by_placeholder("frontend, diseño").fill("ui, backend")
        panel.get_by_role("button", name="Guardar").click()
        self._wait(lambda: self._issues()["Formulario"].labels == ["ui", "backend"])

    def test_project_note_autosaves(self):
        self.page.get_by_role("tab", name="Notas").click()
        self.page.get_by_title("Nueva nota").click()
        dialog = self.page.get_by_role("dialog", name="Nueva nota")
        dialog.locator("input").fill("Ideas")
        dialog.get_by_role("button", name="Crear").click()
        editor = self.page.get_by_label("Documento")
        editor.click()
        editor.press("End")
        editor.type("texto del proyecto")
        from notevault_app.core.project_manager import ProjectManager
        note = ProjectManager(self.dir).notes_dir(self.p["id"]) / "Ideas.md"
        self._wait(lambda: note.exists() and "texto del proyecto" in note.read_text(encoding="utf-8"))


@unittest.skipUnless(READY, "needs playwright, Chromium and a built frontend")
class GoalsE2E(unittest.TestCase):
    """Metas driven through the browser; checks the goal files on disk."""

    @classmethod
    def setUpClass(cls):
        from notevault_app.webapp.api import NoteVaultApi
        from notevault_app.webapp.devserver import serve_in_thread

        cls.dir = Path(tempfile.mkdtemp(prefix="nv_e2e_goals_"))
        cls.api = NoteVaultApi(cls.dir)
        cls.g = cls.api.goals_create({"name": "Backend"}, ["Aprender SQL"])
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
        _rail(self.page, "Metas").click()
        self.page.get_by_text("Backend").first.wait_for()

    def tearDown(self):
        self.page.close()
        self.assertEqual(self.errors, [])

    def _items(self):
        from notevault_app.core.goal_manager import GoalManager
        return {i.name: i for i in GoalManager(self.dir).items(self.g["id"])}

    def _wait(self, predicate, timeout=6.0):
        end = time.time() + timeout
        while time.time() < end:
            if predicate():
                return
            time.sleep(0.1)
        self.fail("state never reached")

    def test_tick_a_submeta_in_the_cards(self):
        self.page.locator("main").get_by_text("Backend").first.click()
        self.page.get_by_role("checkbox", name="Hecha: Aprender SQL").check()
        self._wait(lambda: self._items()["Aprender SQL"].status == "Hecha")

    def test_checklist_dialog_creates_children(self):
        self.page.locator("main").get_by_text("Backend").first.click()
        self.page.get_by_role("button", name="Submeta con checklist").click()
        dialog = self.page.get_by_role("dialog", name="Nueva submeta con checklist")
        dialog.get_by_placeholder("p. ej. Módulo de Autenticación y JWT").fill("Auth")
        dialog.locator("textarea").fill("Login\nLogout")
        dialog.get_by_role("button", name="Crear").click()
        self._wait(lambda: {"Auth", "Login", "Logout"} <= set(self._items()))
        items = self._items()
        self.assertEqual(items["Login"].parent, items["Auth"].id)


@unittest.skipUnless(READY, "needs playwright, Chromium and a built frontend")
class FinanceE2E(unittest.TestCase):
    """Finanzas driven through the browser; checks the day files on disk."""

    @classmethod
    def setUpClass(cls):
        from notevault_app.webapp.api import NoteVaultApi
        from notevault_app.webapp.devserver import serve_in_thread

        cls.dir = Path(tempfile.mkdtemp(prefix="nv_e2e_fin_"))
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
        self.page = self.browser.new_page(viewport={"width": 1500, "height": 900})
        self.errors = []
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        self.page.goto(self.url)
        _rail(self.page, "Finanzas").click()
        self.page.get_by_text("Registro rápido").wait_for()

    def tearDown(self):
        self.page.close()
        self.assertEqual(self.errors, [])

    def _day(self):
        from datetime import date
        from notevault_app.core.finance_manager import FinanceManager
        return FinanceManager(self.dir).day(date.today())

    def _wait(self, predicate, timeout=6.0):
        end = time.time() + timeout
        while time.time() < end:
            if predicate():
                return
            time.sleep(0.1)
        self.fail("state never reached")

    def test_quick_entry_parses_spanish_amounts(self):
        self.page.get_by_label("Importe rápido").fill("12,5k")
        what = self.page.get_by_placeholder("En qué")
        what.fill("Almuerzo")
        what.press("Enter")
        self._wait(lambda: any(m.get("what") == "Almuerzo" for m in self._day()))
        self.assertEqual(next(m for m in self._day() if m.get("what") == "Almuerzo")["amount_cents"], 1250000)

    def test_income_dialog(self):
        self.page.get_by_role("button", name="+  Ingreso").click()
        dialog = self.page.get_by_role("dialog")
        dialog.get_by_label("Importe").fill("1.200.000")
        dialog.get_by_placeholder("p. ej. Almuerzo").fill("Salario")
        dialog.get_by_role("button", name="Guardar").click()
        self._wait(lambda: any(m.get("what") == "Salario" and m["type"] == "ingreso"
                               and m["amount_cents"] == 120000000 for m in self._day()))


@unittest.skipUnless(READY, "needs playwright, Chromium and a built frontend")
class ExerciseE2E(unittest.TestCase):
    """Ejercicio driven through the browser; checks the day logs on disk."""

    @classmethod
    def setUpClass(cls):
        from notevault_app.webapp.api import NoteVaultApi
        from notevault_app.webapp.devserver import serve_in_thread

        cls.dir = Path(tempfile.mkdtemp(prefix="nv_e2e_ex_"))
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
        self.page = self.browser.new_page(viewport={"width": 1500, "height": 900})
        self.errors = []
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        self.page.goto(self.url)
        _rail(self.page, "Ejercicio").click()
        self.page.get_by_text("Racha de ejercicio").wait_for()

    def tearDown(self):
        self.page.close()
        self.assertEqual(self.errors, [])

    def test_log_weight_and_reps_in_registro(self):
        from datetime import date
        from notevault_app.core.exercise_manager import ExerciseManager
        self.page.locator("aside nav").get_by_text("Registro", exact=True).click()
        first = self.api.ex_days(date.today().isoformat(), date.today().isoformat())[0]["exercises"]
        if not first:
            self.skipTest("rest day in the default routine")
        name = first[0]["name"]
        self.page.get_by_label(f"Peso: {name}").fill("42,5")
        self.page.get_by_label(f"Reps: {name}").fill("8")
        self.page.get_by_label(f"Hecho: {name}").check()
        end = time.time() + 6
        entry = {}
        while time.time() < end:
            entry = ExerciseManager(self.dir).get_log(date.today()).entries.get(first[0]["id"], {})
            if entry.get("done") and entry.get("weight") == 42.5 and entry.get("reps") == 8:
                break
            time.sleep(0.1)
        self.assertEqual((entry.get("done"), entry.get("weight"), entry.get("reps")), (True, 42.5, 8))


if __name__ == "__main__":
    unittest.main()
