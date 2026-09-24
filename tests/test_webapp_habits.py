"""Hábitos through the web bridge: same files as the Qt app, safe input,
and per-habit rates counted over the days each habit is scheduled."""

import shutil
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from notevault_app.core.habit_manager import HabitManager
from notevault_app.webapp.api import ApiError, NoteVaultApi


class TestHabitsApi(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_habits_"))
        self.api = NoteVaultApi(self.dir)
        # Start from a known, small set instead of the 15 defaults.
        for h in self.api.habits_list():
            self.api.habits_remove(h["id"])
        self.every = self.api.habits_add({"name": "Agua", "icon": "💧"})
        self.mwf = self.api.habits_add({"name": "Pelo", "icon": "🧴", "days": [0, 2, 4]})

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_check_in_writes_the_same_day_file(self):
        today = date.today().isoformat()
        self.api.habits_set_done(today, self.every["id"], True)
        mgr = HabitManager(self.dir)
        self.assertTrue(mgr.get_day(date.today()).completed[self.every["id"]])
        day = self.api.habits_day(today)
        self.assertTrue(day["completed"][self.every["id"]])

    def test_range_knows_active_days(self):
        monday = date(2026, 1, 5)
        rows = self.api.habits_range(monday.isoformat(), (monday + timedelta(days=1)).isoformat())
        self.assertIn(self.mwf["id"], rows[0]["active"])        # Monday
        self.assertNotIn(self.mwf["id"], rows[1]["active"])     # Tuesday
        with self.assertRaises(ApiError):
            self.api.habits_range("2020-01-01", "2026-01-01")

    def test_rates_count_only_scheduled_days(self):
        # A Mon/Wed/Fri habit done every time it was due is at 100 %, not 3/7.
        ref = date(2026, 1, 11)        # a Sunday
        d = ref - timedelta(days=6)    # Monday
        while d <= ref:
            if d.weekday() in (0, 2, 4):
                self.api.habits_set_done(d.isoformat(), self.mwf["id"], True)
            d += timedelta(days=1)
        stats = self.api.habits_stats(ref.isoformat())
        self.assertEqual(stats["habits"][self.mwf["id"]]["week"], 1.0)
        self.assertIsNone(stats["habits"][self.mwf["id"]]["day"])   # not due on Sunday

    def test_streak(self):
        today = date.today()
        for i in range(3):
            self.api.habits_set_done((today - timedelta(days=i)).isoformat(), self.every["id"], True)
        streak = self.api.habits_stats()["streak"]
        self.assertEqual(streak, min(3, today.timetuple().tm_yday))

    def test_subtasks(self):
        sub = self.api.habits_add_subtask(self.every["id"], "Primer vaso")
        today = date.today().isoformat()
        self.api.habits_set_subtask(today, self.every["id"], sub["id"], True)
        self.assertTrue(self.api.habits_day(today)["subtasks"][self.every["id"]][sub["id"]])
        with self.assertRaises(ApiError):
            self.api.habits_set_subtask(today, self.every["id"], "nope", True)

    def test_day_notes_cannot_break_the_file(self):
        today = date.today().isoformat()
        self.api.habits_set_done(today, self.every["id"], True)
        self.api.habits_set_day_text(today, 'bien"\ncompleted:\n  agua: false', "diario\n---\nx: 1")
        mgr = HabitManager(self.dir)
        day = mgr.get_day(date.today())
        self.assertTrue(day.completed[self.every["id"]])
        self.assertNotIn("\n", day.notes)
        self.assertIn("diario", day.journal)

    def test_edit_schedule_and_options(self):
        up = self.api.habits_update(self.every["id"], {
            "repeat": "every:2", "time": "07:30", "start_date": "2026-01-01", "colour": "#33b679"})
        self.assertEqual(up["repeat"], "every:2")
        self.assertIn("07:30", up["schedule"])
        for bad in ({"time": "7h"}, {"colour": "red;"}, {"start_date": "ayer"}):
            with self.subTest(bad=bad), self.assertRaises(ApiError):
                self.api.habits_update(self.every["id"], bad)

    def test_reorder_and_remove(self):
        ids = [self.mwf["id"], self.every["id"]]
        self.api.habits_reorder(ids)
        self.assertEqual([h["id"] for h in self.api.habits_list()], ids)
        with self.assertRaises(ApiError):
            self.api.habits_reorder([self.mwf["id"]])
        self.api.habits_remove(self.mwf["id"])
        self.assertEqual([h["id"] for h in self.api.habits_list()], [self.every["id"]])

    def test_removing_every_habit_does_not_bring_the_defaults_back(self):
        for h in self.api.habits_list():
            self.api.habits_remove(h["id"])
        self.assertEqual(NoteVaultApi(self.dir).habits_list(), [])
        self.assertEqual(HabitManager(self.dir).habits(), [])


if __name__ == "__main__":
    unittest.main()
