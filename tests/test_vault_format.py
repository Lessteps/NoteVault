"""
Conformance tests for the vault file format.

These are the tests that stop the desktop app from silently breaking the
Android client. They do two things:

  1. Assert that what the managers write matches `docs/VAULT_FORMAT.md`
     byte for byte, for every entity.
  2. Write the fixtures in `tests/conformance/` that the Dart port is
     verified against, so both implementations are checked with the same
     inputs and the same expected output.

Run with:  python -m unittest discover -s tests -v
Regenerate the fixtures with:  python tests/test_vault_format.py --write
"""

import json
import re
import shutil
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from notevault_app.core import vault_format as fmt              # noqa: E402
from notevault_app.core import reminder_scheduler as sched       # noqa: E402
from notevault_app.core.habit_manager import HabitManager, habit_active_on  # noqa: E402
from notevault_app.core.recurrence import Recurrence             # noqa: E402
from notevault_app.core.exercise_manager import ExerciseManager  # noqa: E402
from notevault_app.core.task_manager import (                    # noqa: E402
    TaskManager, STATUSES, STATUS_DONE,
)
from notevault_app.core.project_manager import (                 # noqa: E402
    ProjectManager, PROJECT_STATUSES, P_ACTIVE,
)
from notevault_app.core.vault_manager import VaultManager        # noqa: E402
from notevault_app.core import store                             # noqa: E402
from notevault_app.core.area_manager import AreaManager          # noqa: E402
from notevault_app.core.goal_manager import GoalManager          # noqa: E402
from notevault_app.core.notes_service import NotesService        # noqa: E402

CONFORMANCE = Path(__file__).resolve().parent / "conformance"
FIXED_DAY = date(2026, 9, 12)


class VaultCase(unittest.TestCase):
    def setUp(self):
        self.vault = Path(tempfile.mkdtemp(prefix="nvfmt"))

    def tearDown(self):
        shutil.rmtree(self.vault, ignore_errors=True)

    def read(self, rel: str) -> str:
        return (self.vault / rel).read_text(encoding="utf-8")


class TestLayout(VaultCase):
    """Where each entity lands on disk."""

    def test_habit_day_path(self):
        hm = HabitManager(self.vault)
        hm.save_day(hm.get_day(FIXED_DAY))
        expected = fmt.LAYOUT["habits_day"].format(
            year=2026, month=9, date="2026-09-12")
        self.assertTrue((self.vault / expected).exists(), expected)

    def test_exercise_day_path(self):
        em = ExerciseManager(self.vault)
        ex = em.exercises()[0]
        em.mark_done(FIXED_DAY, ex["id"], True, 60.0, 5, "ok")
        expected = fmt.LAYOUT["exercise_day"].format(
            year=2026, month=9, date="2026-09-12")
        self.assertTrue((self.vault / expected).exists(), expected)

    def test_config_paths(self):
        HabitManager(self.vault).habits()
        ExerciseManager(self.vault).exercises()
        self.assertTrue((self.vault / fmt.LAYOUT["habits_config"]).exists())
        self.assertTrue((self.vault / fmt.LAYOUT["exercises"]).exists())

    def test_task_and_project_ids(self):
        task = TaskManager(self.vault).create("T")
        project = ProjectManager(self.vault).create("P")
        self.assertRegex(task.id, r"^t\d{8}-[0-9a-f]{6}$")
        self.assertRegex(project.id, r"^p\d{8}-[0-9a-f]{6}$")

    def test_reserved_dirs_match_the_spec(self):
        from notevault_app.core.vault_manager import RESERVED_DIRS
        self.assertEqual(set(RESERVED_DIRS), set(fmt.RESERVED_DIRS))

    def test_every_module_writes_inside_one_folder(self):
        """The whole point of FORMAT_VERSION 2: one folder to sync."""
        hm = HabitManager(self.vault)
        hm.save_day(hm.get_day(FIXED_DAY))
        em = ExerciseManager(self.vault)
        em.mark_done(FIXED_DAY, em.exercises()[0]["id"], True)
        TaskManager(self.vault).create("T")
        ProjectManager(self.vault).create("P")

        roots = {p.relative_to(self.vault).parts[0]
                 for p in self.vault.rglob("*") if p.is_file()}
        self.assertEqual(roots, {fmt.DATA_DIR})

    def test_legacy_layout_is_migrated(self):
        from notevault_app.core.vault_manager import migrate_vault

        legacy = self.vault / "habits" / "2026" / "09"
        legacy.mkdir(parents=True)
        (legacy / "2026-09-12.md").write_text("---\ndate: 2026-09-12\n---\n",
                                              encoding="utf-8")
        migrate_vault(self.vault)

        self.assertFalse((self.vault / "habits").exists())
        self.assertTrue((self.vault / fmt.DATA_DIR / "habits" / "2026" / "09"
                         / "2026-09-12.md").exists())

    def test_migration_never_overwrites(self):
        from notevault_app.core.vault_manager import migrate_vault

        current = self.vault / fmt.LAYOUT["habits_config"]
        current.parent.mkdir(parents=True)
        current.write_text('{"version": 3}', encoding="utf-8")

        stale = self.vault / "habits"
        stale.mkdir()
        (stale / "habits_config.json").write_text('{"version": 1}',
                                                  encoding="utf-8")
        migrate_vault(self.vault)

        self.assertEqual(current.read_text(encoding="utf-8"), '{"version": 3}')
        self.assertTrue((stale / "habits_config.json").exists(),
                        "el archivo que perdió se conserva, no se borra")


class TestHabits(VaultCase):
    def test_day_file_shape(self):
        hm = HabitManager(self.vault)
        day = hm.get_day(FIXED_DAY)
        day.completed["nophone"] = True
        day.set_subtask("coding", "theory", True)
        day.journal = "Diario del día."
        hm.save_day(day)

        text = self.read(fmt.LAYOUT["habits_day"].format(
            year=2026, month=9, date=FIXED_DAY.isoformat()))
        self.assertTrue(text.startswith("---\n"))
        self.assertIn(f"date: {FIXED_DAY.isoformat()}\n", text)
        self.assertIn("completed:\n", text)
        self.assertIn("  nophone: true\n", text)
        self.assertIn('notes: ""\n', text)
        self.assertIn('subtasks: {"coding": {"theory": true}}\n', text)
        self.assertTrue(text.rstrip().endswith("Diario del día."))

    def test_round_trip(self):
        hm = HabitManager(self.vault)
        day = hm.get_day(FIXED_DAY)
        day.completed["bed"] = True
        day.set_subtask("coding", "practice", True)
        day.journal = "línea 1\nlínea 2"
        hm.save_day(day)

        fresh = HabitManager(self.vault).get_day(FIXED_DAY)
        self.assertTrue(fresh.completed.get("bed"))
        self.assertTrue(fresh.subtask_done("coding", "practice"))
        self.assertEqual(fresh.journal, "línea 1\nlínea 2")

    def test_config_version_and_weekdays(self):
        hm = HabitManager(self.vault)
        hm.habits()
        cfg = json.loads(self.read(fmt.LAYOUT["habits_config"]))
        self.assertIn("version", cfg)
        self.assertIn("habits", cfg)
        hairwash = next(h for h in cfg["habits"] if h["id"] == "hairwash")
        self.assertEqual(hairwash["days"], [0, 2, 4], "0 = lunes")

    def test_percentage_uses_only_that_weekday(self):
        hm = HabitManager(self.vault)
        monday = FIXED_DAY - timedelta(days=FIXED_DAY.weekday())
        day = hm.get_day(monday)
        for h in hm.habits_for_day(monday):
            day.completed[h["id"]] = True
        hm.save_day(day)
        hm._day_cache.clear()
        self.assertAlmostEqual(HabitManager(self.vault).day_pct(monday), 1.0)


class TestExercise(VaultCase):
    def test_day_log_shape(self):
        em = ExerciseManager(self.vault)
        ex = em.exercises()[0]
        em.mark_done(FIXED_DAY, ex["id"], True, 60.0, 5, "fácil")
        data = json.loads(self.read(fmt.LAYOUT["exercise_day"].format(
            year=2026, month=9, date=FIXED_DAY.isoformat())))
        self.assertEqual(
            data[ex["id"]],
            {"done": True, "weight": 60.0, "reps": 5, "notes": "fácil"},
        )

    def test_day_keys_have_no_accents(self):
        em = ExerciseManager(self.vault)
        days = {e["day"] for e in em.exercises()}
        self.assertTrue(days.issubset(set(fmt.WEEKDAY_KEYS)), days)

    def test_every_routine_ends_in_stretching(self):
        em = ExerciseManager(self.vault)
        for key in fmt.WEEKDAY_KEYS:
            names = [e["name"].lower() for e in em.exercises_for_day(key)]
            self.assertTrue(
                any(n.startswith("estiramiento") for n in names),
                f"{key} sin estiramientos",
            )


class TestTasks(VaultCase):
    def test_frontmatter_keys_and_order(self):
        tm = TaskManager(self.vault)
        task = tm.create("Ensayo", subject="Historia", due=FIXED_DAY,
                         start=FIXED_DAY, priority=2,
                         reminder=datetime(2026, 9, 11, 18, 0))
        text = self.read(fmt.LAYOUT["task"].format(id=task.id))
        keys = re.findall(r"^([a-z_]+):", text, re.M)
        self.assertEqual(keys, list(fmt.TASK_KEYS))

    def test_field_encoding(self):
        tm = TaskManager(self.vault)
        task = tm.create("Ensayo", subject="Historia", due=FIXED_DAY,
                         reminder=datetime(2026, 9, 11, 18, 0))
        text = self.read(fmt.LAYOUT["task"].format(id=task.id))
        self.assertIn('name: "Ensayo"\n', text)
        self.assertIn("due: 2026-09-12\n", text)
        self.assertIn("reminder: 2026-09-11T18:00\n", text)
        self.assertIn("reminder_done: false\n", text)
        self.assertIn("start: \n", text, "una fecha vacía deja la clave sola")

    def test_statuses_match_the_spec(self):
        self.assertEqual(tuple(STATUSES), fmt.TASK_STATUSES)

    def test_round_trip_with_body(self):
        tm = TaskManager(self.vault)
        task = tm.create("Ensayo")
        tm.update(task.id, body="# Título\n\n- punto")
        fresh = TaskManager(self.vault).get(task.id)
        self.assertEqual(fresh.body, "# Título\n\n- punto")


class TestProjects(VaultCase):
    def test_project_and_issue_files(self):
        pm = ProjectManager(self.vault)
        p = pm.create("Portafolio web", status=P_ACTIVE)
        issue = pm.create_issue(p.id, "Diseñar la home", due=FIXED_DAY, labels=["diseño"])
        text = self.read(fmt.LAYOUT["project"].format(id=p.id))
        self.assertIn("key: PW\n", text)
        self.assertIn('columns: "Por hacer,En curso,En revisión,Hecho"\n', text)
        itext = self.read(fmt.LAYOUT["issue"].format(project=p.id, id=issue.id))
        self.assertIn("number: 1\n", itext)
        self.assertIn('status: "Por hacer"\n', itext)
        self.assertIn('labels: "diseño"\n', itext)

    def test_statuses_match_the_spec(self):
        self.assertEqual(tuple(PROJECT_STATUSES), fmt.PROJECT_STATUSES)

    def test_progress_is_derived_not_stored(self):
        pm = ProjectManager(self.vault)
        p = pm.create("P")
        a = pm.create_issue(p.id, "a")
        pm.create_issue(p.id, "b")
        pm.move(p.id, a.id, "Hecho", 0)
        text = self.read(fmt.LAYOUT["project"].format(id=p.id))
        self.assertNotIn("progress", text)
        fresh = ProjectManager(self.vault)
        self.assertAlmostEqual(fresh.progress(fresh.get(p.id)), 0.5)


class TestBookmarks(VaultCase):
    def test_relative_posix_paths(self):
        (self.vault / "1.PERSONAL").mkdir()
        note = self.vault / "1.PERSONAL" / "Nota.md"
        note.write_text("# Nota\n", encoding="utf-8")
        svc = NotesService(VaultManager(self.vault))
        svc.toggle_bookmark(note)
        data = json.loads(self.read(fmt.BOOKMARKS_FILE))
        self.assertEqual(data, ["1.PERSONAL/Nota.md"])


class TestSyncSafety(VaultCase):
    """The properties that make two devices safe on one folder."""

    def test_only_three_global_files(self):
        hm = HabitManager(self.vault)
        hm.habits()
        hm.save_day(hm.get_day(FIXED_DAY))
        em = ExerciseManager(self.vault)
        em.mark_done(FIXED_DAY, em.exercises()[0]["id"], True)
        TaskManager(self.vault).create("T")
        ProjectManager(self.vault).create("P")

        globals_found = set()
        for path in self.vault.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(self.vault).as_posix()
            if not re.search(r"\d{4}-\d{2}-\d{2}", rel) and \
                    not re.search(r"/[tp]\d{8}-[0-9a-f]{6}\.md$", "/" + rel):
                globals_found.add(rel)
        self.assertEqual(
            globals_found,
            {fmt.LAYOUT["habits_config"], fmt.LAYOUT["exercises"]},
            "un archivo global nuevo es un punto de conflicto entre dispositivos",
        )

    def test_conflict_marker_detected(self):
        self.assertTrue(fmt.is_sync_conflict(
            "Ejercicio.sync-conflict-20260818-210816-NDAI2SO.md"))
        self.assertFalse(fmt.is_sync_conflict("Ejercicio.md"))


class TestReminderRules(VaultCase):
    """The rules the Android client has to reproduce exactly."""

    def _task(self, tm, **kw):
        return tm.create("Tarea", **kw)

    def test_due_now_fires_once(self):
        tm = TaskManager(self.vault)
        now = datetime(2026, 9, 12, 10, 0)
        self._task(tm, reminder=now - timedelta(minutes=5))
        due = sched.due_now(tm.tasks(force=True), now)
        self.assertEqual(len(due), 1)

        tm.mark_reminder_shown(due[0].task_id)
        self.assertEqual(sched.due_now(tm.tasks(force=True), now), [])

    def test_future_reminder_does_not_fire(self):
        tm = TaskManager(self.vault)
        now = datetime(2026, 9, 12, 10, 0)
        self._task(tm, reminder=now + timedelta(hours=1))
        self.assertEqual(sched.due_now(tm.tasks(force=True), now), [])

    def test_stale_reminders_are_skipped(self):
        tm = TaskManager(self.vault)
        now = datetime(2026, 9, 12, 10, 0)
        self._task(tm, reminder=now - timedelta(days=10))
        tasks = tm.tasks(force=True)
        self.assertEqual(sched.due_now(tasks, now), [])
        self.assertEqual(len(sched.stale(tasks, now)), 1)

    def test_completed_task_never_reminds(self):
        tm = TaskManager(self.vault)
        now = datetime(2026, 9, 12, 10, 0)
        t = self._task(tm, reminder=now - timedelta(minutes=5))
        tm.update(t.id, status=STATUS_DONE)
        self.assertEqual(sched.due_now(tm.tasks(force=True), now), [])

    def test_upcoming_is_bounded(self):
        tm = TaskManager(self.vault)
        now = datetime(2026, 9, 12, 10, 0)
        for i in range(1, 40):
            self._task(tm, reminder=now + timedelta(hours=i))
        upcoming = sched.upcoming(tm.tasks(force=True), now, limit=10)
        self.assertEqual(len(upcoming), 10)
        self.assertEqual(upcoming, sorted(upcoming, key=lambda r: r.when))

    def test_upcoming_respects_the_window(self):
        tm = TaskManager(self.vault)
        now = datetime(2026, 9, 12, 10, 0)
        self._task(tm, reminder=now + timedelta(days=30))
        self.assertEqual(
            sched.upcoming(tm.tasks(force=True), now,
                           window=timedelta(days=14)), [])

    def test_notification_key_is_stable(self):
        tm = TaskManager(self.vault)
        now = datetime(2026, 9, 12, 10, 0)
        t = self._task(tm, reminder=now + timedelta(hours=1))
        r = sched.build(TaskManager(self.vault).get(t.id), now)
        self.assertEqual(r.key, f"task:{t.id}")

    def test_summary_wording(self):
        tm = TaskManager(self.vault)
        now = datetime(2026, 9, 12, 10, 0)
        self._task(tm, reminder=now - timedelta(minutes=1))
        due = sched.due_now(tm.tasks(force=True), now)
        title, body = sched.summarize(due)
        self.assertEqual(title, "Recordatorio de tarea")
        self.assertTrue(body.startswith("• "))


class TestExpectedFixture(unittest.TestCase):
    """EXPECTED.json must keep matching what the code actually produces."""

    def test_fixture_is_current(self):
        path = CONFORMANCE / "EXPECTED.json"
        if not path.exists():
            self.skipTest("ejecuta: python tests/test_vault_format.py --write")
        stored = json.loads(path.read_text(encoding="utf-8"))

        vault = Path(tempfile.mkdtemp(prefix="nvexp"))
        try:
            ids = _build_sample(vault)
            fresh = expected_values(vault, ids)
        finally:
            shutil.rmtree(vault, ignore_errors=True)

        fresh = json.loads(json.dumps(fresh, sort_keys=True))
        for section in sorted(stored):
            self.assertEqual(
                fresh.get(section), stored[section],
                "«" + section + "» cambió: actualiza docs/VAULT_FORMAT.md y "
                "regenera con --write",
            )


def _build_sample(vault) -> tuple:
    """The canonical sample vault used by the fixture and by its guard."""
    hm = HabitManager(vault)
    day = hm.get_day(FIXED_DAY)
    day.completed["nophone"] = True
    day.completed["bed"] = False
    day.set_subtask("coding", "theory", True)
    day.journal = "Diario de ejemplo.\nSegunda línea."
    hm.save_day(day)
    hm.update_habit("reading", repeat="every:2", start_date=FIXED_DAY.isoformat(),
                    time="21:00", duration_min=30, in_calendar=True,
                    reminder_min=10, colour="#33b679")

    em = ExerciseManager(vault)
    em.mark_done(FIXED_DAY, em.exercises()[0]["id"], True, 60.0, 5, "fácil")

    tm = TaskManager(vault)
    task = tm.create("Ensayo de historia", created=date(2026, 9, 14), subject="Historia",
                     due=date(2026, 9, 20), start=date(2026, 9, 12), priority=2,
                     reminder=datetime(2026, 9, 19, 18, 0))
    tm.update(task.id, body="# Ensayo\n\n- Buscar fuentes\n",
              repeat="weekly:0,3", repeat_until=date(2026, 10, 31))

    ids = {"TASK_ID": task.id}
    ids.update(_build_projects(vault))
    ids.update(_build_goals(vault, hm))
    return ids


LEGACY_PROJECT = (
    "---\nid: p20260901-aaaaaa\nname: \"Tesis de grado\"\nstatus: En curso\n"
    "color: \"#a78bfa\"\ncreated: 2026-09-01\nstart: 2026-09-01\n"
    "start_time: 08:00\ndeadline: 2026-12-15\n---\n\nInvestigación final.\n\n"
    "## Tareas\n- [x] Elegir tema | 2026-09-05\n- [ ] Marco teórico | 2026-10-01\n"
    "- [x] Reunión con tutor\n"
)


def _build_projects(vault) -> dict:
    """Proyectos tipo Jira (FORMAT_VERSION 4), including a migrated v3 file."""
    legacy = vault / fmt.LAYOUT["project_v3"].format(id="p20260901-aaaaaa")
    legacy.parent.mkdir(parents=True, exist_ok=True)
    legacy.write_text(LEGACY_PROJECT, encoding="utf-8")
    from notevault_app.core.project_manager import migrate_projects
    migrate_projects(vault, today=FIXED_DAY)

    pm = ProjectManager(vault)
    project = pm.create("Portafolio web", status=P_ACTIVE, area="programacion",
                        start=date(2026, 9, 1), deadline=date(2026, 10, 30),
                        in_calendar=True, description="Sitio personal.",
                        created=date(2026, 9, 1))
    goal = pm.create_issue(project.id, "Lanzar la home", type="Submeta", priority=3,
                           created=date(2026, 9, 1))
    home = pm.create_issue(project.id, "Maquetar la home", parent=goal.id, priority=4,
                           estimate_min=240, labels=["frontend", "diseño"],
                           start=date(2026, 9, 8), due=date(2026, 9, 10), due_time="17:00",
                           reminder=datetime(2026, 9, 9, 18, 0),
                           description="- [ ] Header\n- [x] Hero", created=date(2026, 9, 2))
    bug = pm.create_issue(project.id, "Menú roto en móvil", parent=goal.id, type="Error",
                          due=date(2026, 9, 20), created=date(2026, 9, 5))
    weekly = pm.create_issue(project.id, "Revisión semanal", repeat="weekly:4",
                             due=date(2026, 9, 11), created=date(2026, 9, 1))
    pm.move(project.id, home.id, "En curso", 0)
    pm.move(project.id, bug.id, "Hecho", 0)
    pm.update_issue(project.id, bug.id, done_at=date(2026, 9, 9))
    return {"PROJECT_ID": project.id, "ISSUE_GOAL": goal.id, "ISSUE_HOME": home.id,
            "ISSUE_BUG": bug.id, "ISSUE_WEEKLY": weekly.id}


GOAL_MONDAY = date(2026, 9, 7)


def _build_goals(vault, hm) -> dict:
    """Áreas y Metas (FORMAT_VERSION 4)."""
    am = AreaManager(vault)
    am.create("Programación", "💻", "#3f51b5")
    gm = GoalManager(vault, hm, am)
    goal = gm.create_goal('Ser "backend"', area="programacion", priority=3,
                          start=GOAL_MONDAY, end=date(2026, 12, 31), icon="💻",
                          colour="#3f51b5", description="Meta de ejemplo.\n\nCon dos párrafos.")
    rep = gm.create_item(goal.id, "Programar 3 horas", repeat="weekly:0,2,4",
                         start=GOAL_MONDAY, due_time="18:00", duration_min=180,
                         in_calendar=True, reminder_min=15, target=3, unit="h",
                         habit_links=["coding"], priority=3, notes="Notas de la submeta")
    branch = gm.create_item(goal.id, "Aprender Django", priority=2)
    child = gm.create_item(goal.id, "Tutorial oficial", parent=branch.id,
                           due=date(2026, 9, 10), priority=4)
    gm.create_item(goal.id, "API de ejemplo", parent=branch.id, target=5, unit="endpoints",
                   value=2.5)
    gm.set_done(goal.id, child.id, date(2026, 9, 10), True)
    gm.set_done(goal.id, rep.id, GOAL_MONDAY, True, at="07:15")
    gm.set_done(goal.id, rep.id, date(2026, 9, 11), False, value=3.5, at="21:40")
    return {"GOAL_ID": goal.id, "ITEM_REPEAT": rep.id, "ITEM_BRANCH": branch.id,
            "ITEM_CHILD": child.id,
            "ITEM_MEASURE": next(i.id for i in gm.items(goal.id) if i.name == "API de ejemplo")}


# ── Fixture generation ────────────────────────────────────────────────────

def write_fixtures():
    """Emit the files the Dart port is verified against.

    The directory is rebuilt from scratch: leaving files from an older layout
    behind would have the Dart port verified against paths that no longer
    exist.
    """
    shutil.rmtree(CONFORMANCE, ignore_errors=True)
    CONFORMANCE.mkdir(parents=True, exist_ok=True)
    vault = Path(tempfile.mkdtemp(prefix="nvfixture"))
    ids = _build_sample(vault)

    def stable_ids(text: str) -> str:
        for name, real in ids.items():
            text = text.replace(real, name)
        return text

    manifest = {}
    for path in sorted(vault.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(vault).as_posix()
        # Ids carry a random suffix; normalise so the fixture is stable.
        stable = stable_ids(rel)
        body = stable_ids(path.read_text(encoding="utf-8"))
        target = CONFORMANCE / stable
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(body, encoding="utf-8")
        manifest[stable] = len(body)

    (CONFORMANCE / "MANIFEST.json").write_text(
        json.dumps({"format_version": fmt.FORMAT_VERSION,
                    "generated_for": FIXED_DAY.isoformat(),
                    "files": manifest}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    # What a correct parser must get out of those bytes. The Dart port is
    # asserted against this file, so both implementations are held to the
    # same expected values instead of to each other's behaviour.
    (CONFORMANCE / "EXPECTED.json").write_text(
        json.dumps(expected_values(vault, ids),
                   indent=2, ensure_ascii=False, sort_keys=True),
        encoding="utf-8",
    )

    shutil.rmtree(vault, ignore_errors=True)
    print(f"{len(manifest)} ficheros + EXPECTED.json en {CONFORMANCE}")


def expected_values(vault, ids: dict) -> dict:
    """Parse the fixtures with the real managers and record the results."""
    task_id = ids["TASK_ID"]
    hm = HabitManager(vault)
    day = hm.get_day(FIXED_DAY)
    habits = hm.habits()

    em = ExerciseManager(vault)
    log = em.get_log(FIXED_DAY)
    first_ex = em.exercises()[0]

    task = TaskManager(vault).get(task_id)

    return {
        "habit_day": {
            "date": FIXED_DAY.isoformat(),
            "completed_true": sorted(k for k, v in day.completed.items() if v),
            "journal": day.journal,
            "subtask_coding_theory": day.subtask_done("coding", "theory"),
            "active_habit_ids": [h["id"] for h in hm.habits_for_day(FIXED_DAY)],
            "completion_pct": round(day.completion_pct(habits), 6),
        },
        "habit_config": {
            "count": len(habits),
            "hairwash_days": next(h["days"] for h in habits if h["id"] == "hairwash"),
            "haircare_days": next(h["days"] for h in habits if h["id"] == "haircare"),
            "coding_subtasks": [s["id"] for h in habits if h["id"] == "coding"
                                for s in h["subtasks"]],
            "reading": next(h for h in habits if h["id"] == "reading"),
            "reading_active": [d.isoformat() for d in _window()
                               if habit_active_on(next(h for h in habits if h["id"] == "reading"), d)],
        },
        "habit_rules": _habit_rule_expectations(),
        "recurrence_rules": _recurrence_expectations(),
        "exercise_day": {
            "exercise_id": first_ex["id"],
            "entry": log.entries[first_ex["id"]],
            "day_pct": round(em.day_pct(FIXED_DAY), 6),
        },
        "exercise_config": {
            "count": len(em.exercises()),
            "per_day": {k: len(em.exercises_for_day(k)) for k in fmt.WEEKDAY_KEYS},
        },
        "task": {
            "name": task.name,
            "subject": task.subject,
            "status": task.status,
            "priority": task.priority,
            "created": task.created.isoformat(),
            "start": task.start.isoformat() if task.start else None,
            "due": task.due.isoformat() if task.due else None,
            "reminder": task.reminder.isoformat(timespec="minutes"),
            "reminder_done": task.reminder_done,
            "body": task.body,
            "repeat": task.repeat,
            "repeat_until": task.repeat_until.isoformat() if task.repeat_until else None,
            "occurs": [d.isoformat() for d in _window(28) if task.occurs_on(d)],
            "roll_forward": _roll_forward_expectation(task),
        },
        "project": _project_expectations(vault, ids),
        "reminder_rules": _reminder_expectations(),
        "store_encoding": _store_expectations(),
        "areas": AreaManager(vault).areas(include_archived=True),
        "goals": _goal_expectations(vault, ids),
    }


def _project_expectations(vault, ids: dict) -> dict:
    from notevault_app.core.project_manager import ProjectStats, ProjectCalendarSource

    def stable(text):
        for name, real in ids.items():
            text = text.replace(real, name)
        return text

    pm = ProjectManager(vault)
    project = pm.get(ids["PROJECT_ID"])
    today = FIXED_DAY
    stats = ProjectStats(pm, project, today)
    days, remaining, ideal = stats.burndown()
    issues = {stable(i.id): i for i in pm.issues(project.id)}
    migrated = pm.get("p20260901-aaaaaa")
    source = ProjectCalendarSource(pm)
    occ = source.occurrences(date(2026, 9, 7), date(2026, 9, 20))

    def view(i):
        return {"key": i.key, "number": i.number, "type": i.type, "parent": stable(i.parent),
                "title": i.title, "status": i.status, "priority": i.priority, "order": i.order,
                "estimate_min": i.estimate_min, "labels": i.labels,
                "start": i.start.isoformat() if i.start else None,
                "due": i.due.isoformat() if i.due else None, "due_time": i.due_time,
                "repeat": i.repeat,
                "reminder": i.reminder.isoformat(timespec="minutes") if i.reminder else None,
                "reminder_done": i.reminder_done,
                "done_at": i.done_at.isoformat() if i.done_at else None,
                "is_done": i.is_done, "overdue_on_fixed_day": i.is_overdue(today),
                "description": i.description,
                "children": [stable(c.id) for c in i.children]}

    return {
        "project": {"key": project.key, "name": project.name, "status": project.status,
                    "area": project.area, "colour": project.colour,
                    "start": project.start.isoformat(), "deadline": project.deadline.isoformat(),
                    "columns": project.columns, "done_column": project.done_column,
                    "in_calendar": project.in_calendar, "description": project.description},
        "issues": {k: view(v) for k, v in sorted(issues.items())},
        "summary": stats.summary(),
        "by_status": stats.by_status(),
        "by_priority": stats.by_priority(),
        "submetas": [[stable(g.id), s] for g, s in stats.submetas()],
        "burndown_last_7": [[d.isoformat(), r] for d, r in list(zip(days, remaining))
                            if d <= today][-7:],
        "burndown_days": len(days),
        "throughput_4": [[d.isoformat(), n] for d, n in stats.throughput(4)],
        "calendar": {d.isoformat(): [stable(o.id) for o in occs] for d, occs in sorted(occ.items())},
        "derive_key": {"Portafolio web": "PW", "Backend": "BAC", "Árbol de él": "ADE",
                       "": "PRY"},
        "migrated": {
            "key": migrated.key, "name": migrated.name, "status": migrated.status,
            "colour": migrated.colour, "description": migrated.description,
            "extra": migrated.extra,
            "issues": [[i.number, i.title, i.status, i.due.isoformat() if i.due else None,
                        i.done_at.isoformat() if i.done_at else None]
                       for i in sorted(pm.issues(migrated.id), key=lambda x: x.number)],
            "legacy_in_trash": (vault / fmt.LAYOUT["trash_dir"] / "proyectos-v3"
                                / "p20260901-aaaaaa.md").exists(),
        },
    }


def _store_expectations() -> dict:
    """Exact frontmatter bytes for every type, including escapes and empties."""
    fields = (("id", "id"), ("name", "str"), ("n", "int"), ("x", "num"), ("y", "num"),
              ("flag", "bool"), ("off", "bool"), ("day", "date"), ("when", "datetime"),
              ("tags", "list"), ("empty", "str"))
    values = {"id": "x20260912-abcdef", "name": 'Comillas "dobles" y \\ barra', "n": 7,
              "x": 2.5, "y": 3.0, "flag": True, "off": False, "day": FIXED_DAY,
              "when": datetime(2026, 9, 12, 18, 5), "tags": ["a", "b c"], "empty": ""}
    text = store.dump_doc(fields, values, {"desconocida": "valor: con dos puntos"},
                          "Cuerpo\n")
    parsed, extra, body = store.parse_doc(text, fields)
    return {
        "fields": [list(f) for f in fields],
        "text": text,
        "parsed": {k: (v.isoformat() if hasattr(v, "isoformat") else v)
                   for k, v in parsed.items()},
        "extra": extra,
        "body": body,
        "no_body": store.dump_doc(fields, {"id": "a"}),
    }


def _goal_expectations(vault, ids: dict) -> dict:
    def stable(text):
        for name, real in ids.items():
            text = text.replace(real, name)
        return text

    hm = HabitManager(vault)
    gm = GoalManager(vault, hm, AreaManager(vault))
    goal = gm.get_goal(ids["GOAL_ID"])
    items = {stable(i.id): i for i in gm.items(goal.id)}
    today = date(2026, 9, 14)

    def item_view(i):
        return {
            "name": i.name, "parent": stable(i.parent), "status": i.status,
            "priority": i.priority, "order": i.order,
            "start": i.start.isoformat() if i.start else None,
            "due": i.due.isoformat() if i.due else None, "due_time": i.due_time,
            "duration_min": i.duration_min, "repeat": i.repeat,
            "in_calendar": i.in_calendar, "reminder_min": i.reminder_min,
            "target": i.target, "unit": i.unit, "value": i.value,
            "habit_links": i.habit_links,
            "done_at": i.done_at.isoformat() if i.done_at else None,
            "notes": i.notes, "is_leaf": i.is_leaf,
            "children": [stable(c.id) for c in i.children],
            "progress_on_14": round(gm.item_progress(i, goal, today), 6),
        }

    rep = items["ITEM_REPEAT"]
    window = [FIXED_DAY - timedelta(days=5) + timedelta(days=n) for n in range(10)]
    return {
        "goal": {"name": goal.name, "area": goal.area, "status": goal.status,
                 "priority": goal.priority, "start": goal.start.isoformat(),
                 "end": goal.end.isoformat(), "icon": goal.icon, "colour": goal.colour,
                 "in_overview": goal.in_overview, "description": goal.description,
                 "overdue_on_2027_01_01": goal.is_overdue(date(2027, 1, 1)),
                 "progress_on_14": round(gm.progress(goal, today), 6)},
        "items": {k: item_view(v) for k, v in sorted(items.items())},
        "tree": [stable(i.id) for i in gm.tree(goal.id)],
        "repeat_done": [d.isoformat() for d in window if gm.is_done_on(rep, d)],
        "repeat_values": {d.isoformat(): gm.value_on(rep, d) for d in window
                          if gm.value_on(rep, d) is not None},
        "streak_on_11": gm.streak(rep, goal, date(2026, 9, 11)),
        "adherence_7_on_14": gm.adherence(goal, 7, today),
        "due_on": {d.isoformat(): [stable(i.id) for _g, i in gm.items_due_on(d, [goal])]
                   for d in window},
        "habit_coding_marked": [d.isoformat() for d in window
                                if hm.get_day(d).completed.get("coding")],
        "log_2026_09_07": stable(gm.log_path(GOAL_MONDAY).read_text(encoding="utf-8")),
    }


def _window(days: int = 21) -> list:
    first = FIXED_DAY - timedelta(days=3)
    return [first + timedelta(days=i) for i in range(days)]


def _recurrence_expectations() -> dict:
    """Rules, as stored, and the days each one lands on inside the window."""
    anchor = FIXED_DAY
    until = FIXED_DAY + timedelta(days=12)
    cases = {
        "none": ("", anchor, None),
        "daily_until": ("daily", anchor, until),
        "weekly_mon_wed_fri": ("weekly:0,2,4", None, None),
        "weekly_all_is_daily": ("weekly:0,1,2,3,4,5,6", None, None),
        "every_3": ("every:3", anchor, None),
        "monthly_1_15_31": ("monthly:1,15,31", None, None),
        "garbage": ("weekly:x", None, None),
    }
    out = {}
    for name, (text, first, last) in cases.items():
        rule = Recurrence.parse(text)
        nxt = rule.next_after(FIXED_DAY, first, last)
        out[name] = {
            "text": text,
            "anchor": first.isoformat() if first else None,
            "until": last.isoformat() if last else None,
            "normalised": rule.to_string(),
            "weekdays_mask": rule.weekdays_mask(),
            "describe": rule.describe(),
            "dates": [d.isoformat() for d in _window(40) if rule.occurs_on(d, first, last)],
            "next_after_fixed_day": nxt.isoformat() if nxt else None,
        }
    out["monthly_31_in_february"] = Recurrence.parse("monthly:31").occurs_on(date(2027, 2, 28))
    return out


def _habit_rule_expectations() -> dict:
    """habit_active_on for the optional habit keys, checked over the window."""
    base = {"id": "h", "name": "h", "icon": "", "subtasks": []}
    cases = {
        "days_only": {**base, "days": [1, 5]},
        "missing_days_means_all": {**base},
        "repeat_wins_over_days": {**base, "days": [0], "repeat": "every:2",
                                  "start_date": FIXED_DAY.isoformat()},
        "start_and_end": {**base, "days": [0, 1, 2, 3, 4, 5, 6],
                          "start_date": (FIXED_DAY + timedelta(days=1)).isoformat(),
                          "end_date": (FIXED_DAY + timedelta(days=4)).isoformat()},
        "paused": {**base, "days": [0, 1, 2, 3, 4, 5, 6],
                   "paused_from": (FIXED_DAY + timedelta(days=2)).isoformat()},
        "monthly": {**base, "days": [0, 1, 2, 3, 4, 5, 6], "repeat": "monthly:12,20"},
    }
    return {name: [d.isoformat() for d in _window() if habit_active_on(h, d)]
            for name, h in cases.items()}


def _roll_forward_expectation(task) -> dict:
    """Completing a repeating task moves due, start and reminder to the next date."""
    vault = Path(tempfile.mkdtemp(prefix="nvroll"))
    try:
        tm = TaskManager(vault)
        clone = tm.create(task.name, start=task.start, due=task.due, reminder=task.reminder,
                          repeat=task.repeat, repeat_until=task.repeat_until)
        tm.update(clone.id, status="Completado")
        moved = TaskManager(vault).get(clone.id)
        return {
            "due": moved.due.isoformat(),
            "start": moved.start.isoformat() if moved.start else None,
            "reminder": moved.reminder.isoformat(timespec="minutes") if moved.reminder else None,
            "reminder_done": moved.reminder_done,
            "status": moved.status,
        }
    finally:
        shutil.rmtree(vault, ignore_errors=True)


class _FakeTask:
    """Minimal stand-in so the rules can be exercised without files."""

    def __init__(self, tid, reminder, done=False, is_done=False):
        self.id = tid
        self.reminder = reminder
        self.reminder_done = done
        self.is_done = is_done
        self.name = tid
        self.subject = ""
        self.due = None


def _reminder_expectations() -> dict:
    """Table-driven cases the Dart scheduler must reproduce exactly."""
    now = datetime(2026, 9, 12, 10, 0)
    cases = {
        "due_5_min_ago":  _FakeTask("a", now - timedelta(minutes=5)),
        "due_in_1_hour":  _FakeTask("b", now + timedelta(hours=1)),
        "stale_10_days":  _FakeTask("c", now - timedelta(days=10)),
        "already_shown":  _FakeTask("d", now - timedelta(minutes=5), done=True),
        "task_completed": _FakeTask("e", now - timedelta(minutes=5), is_done=True),
        "no_reminder":    _FakeTask("f", None),
        "in_30_days":     _FakeTask("g", now + timedelta(days=30)),
    }
    tasks = list(cases.values())
    return {
        "now": now.isoformat(timespec="minutes"),
        "stale_after_days": sched.STALE_AFTER.days,
        "window_days": sched.DEFAULT_WINDOW.days,
        "due_now": [r.task_id for r in sched.due_now(tasks, now)],
        "stale": [r.task_id for r in sched.stale(tasks, now)],
        "upcoming_14d": [r.task_id for r in sched.upcoming(tasks, now)],
        "keys": {name: "task:" + t.id for name, t in cases.items()},
    }


if __name__ == "__main__":
    if "--write" in sys.argv:
        write_fixtures()
    else:
        unittest.main()
