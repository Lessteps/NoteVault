"""Metas through the web bridge: same files as the Qt module, checks,
measurable sub-goals, linked habits and safe input."""

import shutil
import tempfile
import unittest
from datetime import date
from pathlib import Path

from notevault_app.core.goal_manager import GoalManager
from notevault_app.webapp.api import ApiError, NoteVaultApi


class TestGoalsApi(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_goals_"))
        self.api = NoteVaultApi(self.dir)
        self.g = self.api.goals_create({"name": "Backend", "icon": "💻"}, ["Aprender SQL", "API REST"])
        self.today = date.today().isoformat()

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def _items(self):
        return {i["name"]: i for i in self.api.goals_get(self.g["id"])["items"]}

    def test_create_with_checklist_and_progress(self):
        items = self._items()
        self.assertEqual(set(items), {"Aprender SQL", "API REST"})
        self.api.goals_set_done(self.g["id"], items["API REST"]["id"], self.today, True)
        data = self.api.goals_get(self.g["id"])
        self.assertEqual(data["stats"]["counts"], [1, 2])
        self.assertAlmostEqual(data["stats"]["progress"], 0.5)
        self.assertEqual(GoalManager(self.dir).get_item(self.g["id"], items["API REST"]["id"]).status, "Hecha")

    def test_repeating_item_shows_today_and_ticks_the_day_log(self):
        it = self.api.goals_item_create(self.g["id"], "Leer 20 min", fields={"repeat": "daily"})
        rows = self.api.goals_today(self.today)["rows"]
        self.assertTrue(any(r["item"]["id"] == it["id"] for r in rows))
        self.api.goals_set_done(self.g["id"], it["id"], self.today, True)
        self.assertTrue(next(r for r in self.api.goals_today(self.today)["rows"] if r["item"]["id"] == it["id"])["done"])

    def test_measurable_value(self):
        it = self.api.goals_item_create(self.g["id"], "Correr", fields={"target": "10", "unit": "km"})
        self.api.goals_set_done(self.g["id"], it["id"], self.today, False, "4,5")
        item = self._items()["Correr"]
        self.assertEqual(item["value"], 4.5)
        self.assertAlmostEqual(item["progress"], 0.45)
        with self.assertRaises(ApiError):
            self.api.goals_set_done(self.g["id"], it["id"], self.today, False, "mucho")

    def test_linked_habit_is_ticked_and_unticked(self):
        habit = self.api.habits_add({"name": "Estudiar"})
        it = self.api.goals_item_create(self.g["id"], "Repasar", fields={"repeat": "daily", "habit_links": [habit["id"], "inventado"]})
        self.assertEqual(it["habit_links"], [habit["id"]])
        self.api.goals_set_done(self.g["id"], it["id"], self.today, True)
        self.assertTrue(self.api.habits_day(self.today)["completed"][habit["id"]])
        self.api.goals_set_done(self.g["id"], it["id"], self.today, False)
        self.assertFalse(self.api.habits_day(self.today)["completed"][habit["id"]])

    def test_tree_moves(self):
        items = self._items()
        self.api.goals_item_indent(self.g["id"], items["API REST"]["id"], 1)
        items = self._items()
        self.assertEqual(items["API REST"]["parent"], items["Aprender SQL"]["id"])
        self.api.goals_item_move(self.g["id"], items["API REST"]["id"], "", 0)
        self.assertEqual(self._items()["API REST"]["parent"], "")

    def test_bad_input(self):
        for bad in ({"status": "Quizá"}, {"colour": "blue"}, {"end": "mañana"}):
            with self.subTest(bad=bad), self.assertRaises(ApiError):
                self.api.goals_update(self.g["id"], bad)
        with self.assertRaises(ApiError):
            self.api.goals_list("raro")
        g = self.api.goals_update(self.g["id"], {"name": "a\nstatus: Archivada"})
        self.assertEqual(g["status"], "Activa")

    def test_delete_goes_to_trash(self):
        self.api.goals_delete(self.g["id"])
        self.assertEqual(self.api.goals_list(), [])


if __name__ == "__main__":
    unittest.main()
