import shutil
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from notevault_app.core.schedule_manager import Occurrence, ScheduleManager
from notevault_app.core.task_manager import TaskManager
from notevault_app.core.project_manager import ProjectManager


class TestScheduleManager(unittest.TestCase):
    def setUp(self):
        self.vault = Path(tempfile.mkdtemp(prefix="nv_sched_test"))
        self.sm = ScheduleManager(self.vault)
        self.today = date(2026, 9, 14)

    def tearDown(self):
        shutil.rmtree(self.vault, ignore_errors=True)

    def test_routines_crud(self):
        rt = self.sm.add_routine(
            title="Estudio backend",
            days=["lunes", "martes", "miercoles"],
            start="07:30",
            duration_min=90,
        )
        self.assertTrue(rt["id"].startswith("rt_"))
        routines = self.sm.routines()
        self.assertEqual(len(routines), 1)
        self.assertEqual(routines[0]["title"], "Estudio backend")

        # Update
        updated = self.sm.update_routine(rt["id"], title="Estudio Python")
        self.assertEqual(updated["title"], "Estudio Python")

        # Remove
        self.assertTrue(self.sm.remove_routine(rt["id"]))
        self.assertEqual(len(self.sm.routines()), 0)

    def test_day_events_and_overrides(self):
        rt = self.sm.add_routine(
            title="Rutina diaria",
            days=["lunes"],
            start="08:00",
            duration_min=60,
        )
        ev = self.sm.add_event(self.today, title="Reunión", start="11:00", duration_min=45)

        # Query day (2026-09-14 is a Monday)
        occs = self.sm.day(self.today)
        self.assertTrue(any(o.id == rt["id"] for o in occs))
        self.assertTrue(any(o.id == ev["id"] for o in occs))

        # Test move
        self.sm.move(self.today, rt["id"], "09:00", 90)
        occs_moved = self.sm.day(self.today)
        rt_occ = next(o for o in occs_moved if o.id == rt["id"])
        self.assertEqual(rt_occ.start, "09:00")
        self.assertEqual(rt_occ.duration_min, 90)

        # Test skip
        self.sm.skip(self.today, rt["id"])
        occs_skipped = self.sm.day(self.today)
        self.assertFalse(any(o.id == rt["id"] for o in occs_skipped))

    def test_derived_occurrences(self):
        tm = TaskManager(self.vault)
        t = tm.create("Tarea con hora", due=self.today, due_time="14:00")
        
        pm = ProjectManager(self.vault)
        p = pm.create("Proyecto activo", start=self.today, deadline=self.today + timedelta(days=5))

        occs = self.sm.day(self.today)
        task_occ = next((o for o in occs if o.kind == "task"), None)
        self.assertIsNotNone(task_occ)
        self.assertEqual(task_occ.start, "14:00")
        self.assertTrue(task_occ.editable)

        proj_occ = next((o for o in occs if o.kind == "project"), None)
        self.assertIsNotNone(proj_occ)

    def test_range_performance(self):
        # Create routines and events
        self.sm.add_routine(title="Morning routine", days=["lunes", "martes", "miercoles", "jueves", "viernes"])
        self.sm.add_event(self.today, title="Event 1")

        first = date(2026, 9, 1)
        last = date(2026, 9, 30)

        # Benchmark range() execution time
        import time
        start_t = time.perf_counter()
        res = self.sm.range(first, last)
        elapsed_ms = (time.perf_counter() - start_t) * 1000.0

        self.assertEqual(len(res), 30)
        self.assertLess(elapsed_ms, 50.0, f"range() took {elapsed_ms:.2f} ms, target is < 50ms")
        print(f"ScheduleManager.range() over 30 days took {elapsed_ms:.2f} ms")


if __name__ == "__main__":
    unittest.main()
