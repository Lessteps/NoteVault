"""Calendario through the web bridge: the same files and rules as the Qt
calendar, and untrusted input refused."""

import shutil
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from notevault_app.core.schedule_manager import ScheduleManager
from notevault_app.core.task_manager import TaskManager
from notevault_app.webapp.api import ApiError, NoteVaultApi

MON = date(2026, 1, 5)


def _find(rows, day, **match):
    return [o for o in rows[day.isoformat()] if all(o.get(k) == v for k, v in match.items())]


class TestCalendarApi(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_cal_"))
        self.api = NoteVaultApi(self.dir)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def _event(self, **extra):
        payload = dict(mode="create", kind="event", title="Dentista", date=MON.isoformat(),
                       start="09:00", duration=45, colour="#33b679", repeat="", orig={})
        payload.update(extra)
        return self.api.cal_save(payload)

    def test_event_round_trip(self):
        self._event(location="Centro", description="traer carnet")
        rows = self.api.cal_range(MON.isoformat(), MON.isoformat())
        ev = _find(rows, MON, kind="event")[0]
        self.assertEqual((ev["start"], ev["duration_min"], ev["colour"]), ("09:00", 45, "#33b679"))
        info = self.api.cal_item(MON.isoformat(), ev["id"], "event")
        self.assertEqual(info["location"], "Centro")
        # Same file the Qt calendar reads.
        self.assertEqual(ScheduleManager(self.dir).get_day_file(MON)["events"][0]["title"], "Dentista")

    def test_moving_an_event_to_another_day(self):
        self._event()
        ev = _find(self.api.cal_range(MON.isoformat(), MON.isoformat()), MON, kind="event")[0]
        tue = MON + timedelta(days=1)
        self.api.cal_move(ev, tue.isoformat(), "11:30", 90)
        rows = self.api.cal_range(MON.isoformat(), tue.isoformat())
        self.assertFalse(_find(rows, MON, kind="event"))
        moved = _find(rows, tue, kind="event")[0]
        self.assertEqual((moved["start"], moved["duration_min"]), ("11:30", 90))

    def test_repeating_event_becomes_a_routine(self):
        self._event(title="Gym", repeat="weekly:0,2")
        rows = self.api.cal_range(MON.isoformat(), (MON + timedelta(days=6)).isoformat())
        self.assertTrue(_find(rows, MON, kind="routine", title="Gym"))
        self.assertTrue(_find(rows, MON + timedelta(days=2), kind="routine"))
        self.assertFalse(_find(rows, MON + timedelta(days=1), kind="routine"))
        rid = self.api.cal_routines()[0]["id"]
        # Skip one day only, then tick another.
        self.api.cal_delete({"kind": "routine", "id": rid, "date": MON.isoformat()}, "one")
        wed = MON + timedelta(days=2)
        self.api.cal_set_done(wed.isoformat(), rid, True)
        rows = self.api.cal_range(MON.isoformat(), wed.isoformat())
        self.assertFalse(_find(rows, MON, kind="routine"))
        self.assertTrue(_find(rows, wed, kind="routine")[0]["done"])

    def test_task_created_from_the_calendar(self):
        self.api.cal_save(dict(mode="create", kind="task", title="Entregar", date=MON.isoformat(),
                               start="18:00", subject="Física", reminder_min=30, colour="#039be5",
                               orig={}))
        task = TaskManager(self.dir).tasks()[0]
        self.assertEqual((task.due, task.due_time, task.subject), (MON, "18:00", "Física"))
        occ = _find(self.api.cal_range(MON.isoformat(), MON.isoformat()), MON, kind="task")[0]
        self.api.cal_set_done(MON.isoformat(), occ["id"], True)
        self.assertTrue(TaskManager(self.dir).get(task.id).is_done)

    def test_habit_blocks_are_merged_and_tickable(self):
        h = self.api.habits_add({"name": "Leer", "in_calendar": True, "time": "07:00"})
        occ = _find(self.api.cal_range(MON.isoformat(), MON.isoformat()), MON, id=f"habit:{h['id']}")[0]
        self.assertTrue(occ["checkable"])
        self.api.cal_set_done(MON.isoformat(), occ["id"], True)
        self.assertTrue(self.api.habits_day(MON.isoformat())["completed"][h["id"]])

    def test_bad_input_is_refused(self):
        for bad in (dict(colour="red;"), dict(start="25:00"), dict(date="ayer"), dict(kind="habit")):
            with self.subTest(bad=bad), self.assertRaises(ApiError):
                self._event(**bad)
        with self.assertRaises(ApiError):
            self.api.cal_range("2020-01-01", "2026-01-01")
        with self.assertRaises(ApiError):
            self.api.cal_routine_save(None, {"title": "x", "repeat": ""})

    def test_titles_are_one_line(self):
        self._event(title="a\nb")
        ev = _find(self.api.cal_range(MON.isoformat(), MON.isoformat()), MON, kind="event")[0]
        self.assertEqual(ev["title"], "a b")


if __name__ == "__main__":
    unittest.main()
