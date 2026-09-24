"""Tareas through the web bridge: behaviour matches the Qt app, and nothing
the page sends can corrupt a task file."""

import shutil
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from notevault_app.core.task_manager import STATUS_DONE, STATUS_TODO, TaskManager
from notevault_app.webapp.api import ApiError, NoteVaultApi


class TestTasksApi(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_tasks_"))
        self.api = NoteVaultApi(self.dir)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_create_list_update(self):
        t = self.api.tasks_create({"name": "Ensayo", "subject": "Historia", "priority": 3,
                                   "due": "2026-09-20", "due_time": "18:30"})
        self.assertEqual(t["priority"], 3)
        self.assertEqual(t["due"], "2026-09-20")
        listed = self.api.tasks_list()
        self.assertEqual([x["id"] for x in listed], [t["id"]])
        up = self.api.tasks_update(t["id"], {"status": "En progreso", "body": "- [ ] leer"})
        self.assertEqual(up["status"], "En progreso")
        self.assertEqual(up["body"], "- [ ] leer")
        self.assertIn("Historia", self.api.tasks_meta()["subjects"])
        # Written by the same TaskManager the Qt app uses.
        again = TaskManager(self.dir).get(t["id"])
        self.assertEqual(again.subject, "Historia")

    def test_completing_a_repeating_task_rolls_forward(self):
        today = date.today()
        t = self.api.tasks_create({"name": "Diaria", "due": today.isoformat(), "repeat": "daily"})
        up = self.api.tasks_update(t["id"], {"status": STATUS_DONE})
        self.assertEqual(up["status"], STATUS_TODO)
        self.assertEqual(up["due"], (today + timedelta(days=1)).isoformat())

    def test_range_includes_repeats(self):
        start = date(2026, 1, 5)       # a Monday
        t = self.api.tasks_create({"name": "Lunes", "due": start.isoformat(), "repeat": "weekly:0"})
        hits = self.api.tasks_in_range("2026-01-01", "2026-01-31")
        days = sorted(h["date"] for h in hits if h["id"] == t["id"])
        self.assertEqual(days, ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"])
        with self.assertRaises(ApiError):
            self.api.tasks_in_range("2026-01-01", "2027-01-01")

    def test_delete_goes_to_trash(self):
        t = self.api.tasks_create({"name": "Borrar"})
        self.api.tasks_delete(t["id"])
        self.assertEqual(self.api.tasks_list(), [])
        self.assertEqual(len(list((self.dir / ".trash").glob("*.md"))), 1)

    def test_reminders(self):
        t = self.api.tasks_create({"name": "Aviso", "reminder": "2000-01-01T09:00"})
        due = self.api.tasks_due_reminders()
        self.assertEqual([x["id"] for x in due], [t["id"]])
        self.api.tasks_mark_reminder_shown(t["id"])
        self.assertEqual(self.api.tasks_due_reminders(), [])

    def test_newlines_cannot_inject_frontmatter(self):
        t = self.api.tasks_create({"name": 'x\nstatus: Completado\npriority: 3',
                                   "subject": "a\r\nreminder: 2000-01-01T00:00"})
        again = TaskManager(self.dir).get(t["id"])
        self.assertEqual(again.status, STATUS_TODO)
        self.assertEqual(again.priority, 1)
        self.assertIsNone(again.reminder)
        self.assertNotIn("\n", again.name)

    def test_body_cannot_close_the_frontmatter(self):
        t = self.api.tasks_create({"name": "B"})
        self.api.tasks_update(t["id"], {"body": "texto\n---\nstatus: Completado"})
        again = TaskManager(self.dir).get(t["id"])
        self.assertEqual(again.status, STATUS_TODO)

    def test_invalid_values_are_refused(self):
        t = self.api.tasks_create({"name": "V"})
        for bad in ({"status": "Hackeado"}, {"due": "mañana"}, {"due_time": "25:00"},
                    {"reminder": "no"}):
            with self.subTest(bad=bad), self.assertRaises(ApiError):
                self.api.tasks_update(t["id"], bad)
        self.assertEqual(self.api.tasks_update(t["id"], {"priority": 99})["priority"], 3)
        with self.assertRaises(ApiError):
            self.api.tasks_update("no-existe", {"name": "x"})


if __name__ == "__main__":
    unittest.main()
