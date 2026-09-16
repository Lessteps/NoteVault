"""Tests for the reusable SubtasksWidget, task checklist sync, and calendar integration."""

import shutil
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from PySide6.QtWidgets import QApplication

from notevault_app.core import vault_format as fmt
from notevault_app.core.area_manager import AreaManager
from notevault_app.core.goal_manager import GoalManager, GoalCalendarSource
from notevault_app.core.habit_manager import HabitManager
from notevault_app.core.project_manager import (
    ProjectManager, ProjectCalendarSource, P_ACTIVE, P_DONE,
)
from notevault_app.core.schedule_manager import ScheduleManager
from notevault_app.core.task_manager import TaskManager
from notevault_app.ui.components.comun.subtasks_widget import SubtasksWidget
from notevault_app.ui.components.tareas.task_editor import (
    _parse_subtasks_from_markdown, _update_markdown_subtask,
    _remove_markdown_subtask, _append_markdown_subtask,
)

APP = QApplication.instance() or QApplication(sys.argv)
D = date(2026, 9, 14)


class TestSubtasksWidget(unittest.TestCase):
    def test_widget_crud_and_progress(self):
        w = SubtasksWidget("Subtareas", "Añadir subtarea de prueba")
        items = [
            {"id": "1", "title": "Subtarea 1", "done": False},
            {"id": "2", "title": "Subtarea 2", "done": True},
        ]
        w.set_items(items)
        self.assertEqual(len(w._items), 2)
        self.assertEqual(w.count_label.text(), "1/2")

        # Test toggling
        toggled = []
        w.subtask_toggled.connect(lambda sid, d: toggled.append((sid, d)))
        row = w.items_box.itemAt(0).widget()
        row._on_toggle(True)
        self.assertEqual(toggled, [("1", True)])
        self.assertEqual(w.count_label.text(), "2/2")

        # Test quick-add input
        added = []
        w.subtask_added.connect(lambda title: added.append(title))
        w.add_input.setText("Nueva subtarea")
        w._add_from_input()
        self.assertEqual(added, ["Nueva subtarea"])
        self.assertEqual(w.add_input.text(), "")

        # Test delete
        deleted = []
        w.subtask_deleted.connect(lambda sid: deleted.append(sid))
        row.del_btn.click()
        self.assertEqual(deleted, ["1"])


class TestTaskMarkdownChecklists(unittest.TestCase):
    def test_parse_and_sync(self):
        md = "Introducción.\n- [ ] Paso uno\n- [x] Paso dos\nConclusión."
        items = _parse_subtasks_from_markdown(md)
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["title"], "Paso uno")
        self.assertFalse(items[0]["done"])
        self.assertEqual(items[1]["title"], "Paso dos")
        self.assertTrue(items[1]["done"])

        # Mark first done
        updated = _update_markdown_subtask(md, 1, True)
        self.assertIn("- [x] Paso uno", updated)

        # Append third
        appended = _append_markdown_subtask(updated, "Paso tres")
        self.assertIn("- [ ] Paso tres", appended)
        self.assertIn("Introducción.", appended)
        self.assertIn("Conclusión.", appended)


class TestProjectCalendarAndMilestones(unittest.TestCase):
    def setUp(self):
        self.vault = Path(tempfile.mkdtemp(prefix="nvtestcal"))
        self.pm = ProjectManager(self.vault)
        self.sm = ScheduleManager(self.vault, project_mgr=self.pm)
        self.source = ProjectCalendarSource(self.pm)
        self.sm.register_source("proyectos", self.source)

    def tearDown(self):
        shutil.rmtree(self.vault, ignore_errors=True)

    def test_project_deadline_milestone_and_set_done(self):
        proj = self.pm.create("Mi proyecto", deadline=D, in_calendar=True, status=P_ACTIVE)
        day_occs = self.sm.day(D)
        proj_occs = [o for o in day_occs if o.kind == "project"]
        self.assertEqual(len(proj_occs), 1)
        self.assertEqual(proj_occs[0].title, "🏁 Mi proyecto")
        self.assertFalse(proj_occs[0].done)

        # Mark project done from calendar
        self.sm.set_done(D, proj_occs[0].id, True)
        reloaded = self.pm.get(proj.id)
        self.assertEqual(reloaded.status, P_DONE)

        # Mark project undone
        self.sm.set_done(D, proj_occs[0].id, False)
        reloaded2 = self.pm.get(proj.id)
        self.assertEqual(reloaded2.status, P_ACTIVE)


class TestCascadingGoalSetDone(unittest.TestCase):
    def setUp(self):
        self.vault = Path(tempfile.mkdtemp(prefix="nvtestgoal"))
        self.hm = HabitManager(self.vault)
        self.am = AreaManager(self.vault)
        self.gm = GoalManager(self.vault, self.hm, self.am)

    def tearDown(self):
        shutil.rmtree(self.vault, ignore_errors=True)

    def test_branch_cascading_done(self):
        goal = self.gm.create_goal("Objetivo", area="general")
        parent = self.gm.create_item(goal.id, "Fase 1")
        c1 = self.gm.create_item(goal.id, "Paso 1", parent=parent.id)
        c2 = self.gm.create_item(goal.id, "Paso 2", parent=parent.id)

        # Marking parent done cascades to all descendants
        self.gm.set_done(goal.id, parent.id, D, True)
        self.assertTrue(self.gm.is_done_on(self.gm.get_item(goal.id, c1.id), D))
        self.assertTrue(self.gm.is_done_on(self.gm.get_item(goal.id, c2.id), D))
        self.assertTrue(self.gm.branch_done(self.gm.get_item(goal.id, parent.id), D))

        # Marking c1 undone cascades back up: parent is no longer done
        self.gm.set_done(goal.id, c1.id, D, False)
        self.assertFalse(self.gm.is_done_on(self.gm.get_item(goal.id, c1.id), D))
        self.assertFalse(self.gm.branch_done(self.gm.get_item(goal.id, parent.id), D))

    def test_goal_items_and_milestones_in_calendar(self):
        goal = self.gm.create_goal("Aprender Rust", area="code", end=D + timedelta(days=5))
        # Item with date and time (even if in_calendar wasn't explicitly set)
        item1 = self.gm.create_item(goal.id, "Capítulo 1", due=D, due_time="15:30")
        # Item that is a parent branch with scheduled date/time and in_calendar
        branch = self.gm.create_item(goal.id, "Módulo 1", due=D + timedelta(days=1),
                                     due_time="10:00", in_calendar=True)
        child = self.gm.create_item(goal.id, "Subpaso", parent=branch.id)

        sm = ScheduleManager(self.vault, habit_mgr=self.hm)
        sm.register_source("metas", GoalCalendarSource(self.gm))

        occurrences_map = sm.range(D, D + timedelta(days=6))

        # Check item1 on day D
        d_occs = [o for o in occurrences_map.get(D, []) if o.kind == "goal_item"]
        self.assertTrue(any(o.id == f"goal:{goal.id}/{item1.id}" and o.start == "15:30" for o in d_occs))

        # Check branch on day D+1
        d1_occs = [o for o in occurrences_map.get(D + timedelta(days=1), []) if o.kind == "goal_item"]
        self.assertTrue(any(o.id == f"goal:{goal.id}/{branch.id}" and o.start == "10:00" for o in d1_occs))

        # Check goal deadline milestone on day D+5
        d5_occs = [o for o in occurrences_map.get(D + timedelta(days=5), []) if o.kind == "goal_item"]
        self.assertTrue(any(o.id == f"goal:{goal.id}" for o in d5_occs))


class TestTaskManagerStampInvalidation(unittest.TestCase):
    def setUp(self):
        self.vault = Path(tempfile.mkdtemp(prefix="nvtesttask"))
        self.tm = TaskManager(self.vault)

    def tearDown(self):
        shutil.rmtree(self.vault, ignore_errors=True)

    def test_cache_invalidates_on_file_change(self):
        t = self.tm.create("Tarea 1", due=D)
        self.assertEqual(len(self.tm.tasks()), 1)

        # Direct file modification outside TaskManager instance
        path = self.tm._path(t.id)
        content = path.read_text(encoding="utf-8")
        path.write_text(content.replace('name: "Tarea 1"', 'name: "Tarea Modificada"'), encoding="utf-8")

        # tasks() should detect mtime change and reload
        tasks = self.tm.tasks()
        self.assertEqual(tasks[0].name, "Tarea Modificada")


if __name__ == "__main__":
    unittest.main()
