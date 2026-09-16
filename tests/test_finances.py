"""Core tests for Finanzas (Fase 3)."""

import json
import shutil
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from notevault_app.core import vault_format as fmt                        # noqa: E402
from notevault_app.core.finance_manager import (                          # noqa: E402
    FinanceManager, FinanceCalendarSource, totals, format_money, GASTO, INGRESO, AHORRO, RETIRO,
    G_DONE, G_ACTIVE,
)
from notevault_app.core.schedule_manager import ScheduleManager           # noqa: E402

D = date(2026, 9, 14)   # Monday


class Case(unittest.TestCase):
    def setUp(self):
        self.vault = Path(tempfile.mkdtemp(prefix="nvfin"))
        self.fm = FinanceManager(self.vault)

    def tearDown(self):
        shutil.rmtree(self.vault, ignore_errors=True)


class TestMovements(Case):
    def test_day_file_shape_and_order(self):
        m = self.fm.add(D, GASTO, 1250000, category="comida", what="Almuerzo", reason="Oficina",
                        time="13:10", created="2026-09-14T13:12")
        text = self.fm.day_path(D).read_text(encoding="utf-8")
        self.assertEqual(json.loads(text), {"movements": [{
            "id": m["id"], "type": "gasto", "amount_cents": 1250000, "currency": "COP",
            "category": "comida", "what": "Almuerzo", "reason": "Oficina", "time": "13:10",
            "attachments": [], "created": "2026-09-14T13:12"}]})
        self.assertEqual(list(json.loads(text)["movements"][0]), [
            "id", "type", "amount_cents", "currency", "category", "what", "reason", "time",
            "attachments", "created"])
        self.assertTrue(text.endswith("}\n"))

    def test_totals_are_exact_integers(self):
        self.fm.add(D, INGRESO, 350000000)
        self.fm.add(D, GASTO, 1)
        self.fm.add(D, GASTO, 99999999999)
        self.fm.add(D, AHORRO, 5000000)
        self.fm.add(D, RETIRO, 2000000)
        t = totals(self.fm.day(D))
        self.assertEqual(t["balance"], 350000000 - 1 - 99999999999 - 5000000 + 2000000)
        self.assertEqual(totals([])["balance"], 0)

    def test_update_move_delete(self):
        m = self.fm.add(D, GASTO, 100, what="x", reason="r")
        self.fm.update(D, m["id"], reason="", amount_cents=200)
        got = self.fm.get(D, m["id"])
        self.assertNotIn("reason", got)
        self.assertEqual(got["amount_cents"], 200)
        self.fm.move(m["id"], D, D + timedelta(days=1))
        self.assertFalse(self.fm.day_path(D).exists())
        self.assertEqual(len(self.fm.day(D + timedelta(days=1))), 1)
        self.fm.delete(D + timedelta(days=1), m["id"])
        self.assertEqual(self.fm.all_days(), [])

    def test_month_ranges_and_by_month(self):
        self.fm.add(date(2026, 2, 28), GASTO, 100, category="comida")
        self.fm.add(date(2026, 3, 1), GASTO, 50, category="ocio")
        self.fm.add(date(2026, 3, 31), GASTO, 25, category="comida")
        self.assertEqual(len(self.fm.month(2026, 2)), 1)
        self.assertEqual(self.fm.by_category(self.fm.month(2026, 3)), {"ocio": 50, "comida": 25})
        months = dict(self.fm.by_month(2026))
        self.assertEqual((months[2][GASTO], months[3][GASTO], months[4][GASTO]), (100, 75, 0))
        this, prev = self.fm.compare_month(2026, 3)
        self.assertEqual((this[GASTO], prev[GASTO]), (75, 100))

    def test_default_categories_and_budget(self):
        self.assertTrue(self.fm.ensure_defaults())
        self.assertFalse(self.fm.ensure_defaults())
        names = [c["name"] for c in self.fm.categories(GASTO)]
        self.assertEqual(names[0], "Comida")
        self.assertEqual(len(self.fm.categories(INGRESO)), 3)
        self.fm.update_category("comida", budget_month_cents=60000000)
        self.fm.add(D, GASTO, 1000000, category="comida")
        used = [(c["id"], u, b) for c, u, b in self.fm.budget_used(2026, 9)]
        self.assertEqual(used, [("comida", 1000000, 60000000)])

    def test_money_format(self):
        self.assertEqual(format_money(1250000), "$ 12.500")
        self.assertEqual(format_money(-120000000), "-$ 1.200.000")
        self.assertEqual(format_money(1250, "USD"), "$ 12,50")
        self.assertEqual(format_money(0), "$ 0")


class TestGoals(Case):
    def test_saved_status_history_and_pace(self):
        g = self.fm.create_goal("Moto", 10000000, deadline="2026-09-23", start="2026-09-01",
                                cadence={"mode": "rule", "rule": "weekly:0"}, suggested_cents=2500000)
        self.fm.add(D, AHORRO, 6000000, goal=g["id"])
        self.fm.add(D + timedelta(days=1), RETIRO, 1000000, goal=g["id"])
        self.assertEqual(self.fm.saved(g["id"]), 5000000)
        pace = self.fm.pace(g["id"], D)
        self.assertEqual((pace["remaining"], pace["per_day"]), (5000000, 500000))
        hist = self.fm.history(g["id"])
        self.assertEqual(hist["months"], [("2026-09", 5000000)])
        self.fm.add(D + timedelta(days=2), AHORRO, 5000000, goal=g["id"])
        self.assertEqual(self.fm.get_goal(g["id"])["status"], G_DONE)
        self.fm.add(D + timedelta(days=3), RETIRO, 1, goal=g["id"])
        self.assertEqual(self.fm.get_goal(g["id"])["status"], G_ACTIVE)

    def test_due_checks_rule_period_and_visibility(self):
        rule = self.fm.create_goal("Moto", 100, cadence={"mode": "rule", "rule": "weekly:0"}, start="2026-09-01")
        week = self.fm.create_goal("Viaje", 100, cadence={"mode": "period", "period": "week"}, start="2026-09-01")
        hidden = self.fm.create_goal("Oculta", 100, show_in_daily=False, start="2026-09-01")
        names = lambda d: [(g["name"], c) for g, c, _ in self.fm.due_checks(d)]  # noqa: E731
        self.assertEqual(sorted(names(D)), [("Moto", False), ("Viaje", False)])
        self.assertEqual(names(D + timedelta(days=1)), [("Viaje", False)])
        self.fm.add(D + timedelta(days=2), AHORRO, 10, goal=week["id"])
        self.assertEqual(names(D + timedelta(days=4)), [("Viaje", True)])
        self.assertEqual(names(D + timedelta(days=7)), [("Moto", False), ("Viaje", False)])
        self.fm.update_goal(hidden["id"], show_in_daily=True)
        self.assertIn(("Oculta", False), names(D))

    def test_goal_file_shape(self):
        g = self.fm.create_goal("Moto", 1200000000, icon="🏍", colour="#33b679", start="2026-09-14",
                                deadline="2027-06-30", cadence={"mode": "rule", "rule": "weekly:4"},
                                suggested_cents=5000000, created="2026-09-14")
        data = json.loads(self.fm.goal_path(g["id"]).read_text(encoding="utf-8"))
        self.assertEqual(list(data), list(fmt.FINANCE_GOAL_KEYS))
        self.assertEqual(data["cadence"], {"mode": "rule", "rule": "weekly:4"})

    def test_calendar_source(self):
        g = self.fm.create_goal("Moto", 100, cadence={"mode": "rule", "rule": "daily"},
                                start=date.today().isoformat(), suggested_cents=40)
        sm = ScheduleManager(self.vault)
        sm.register_source("finanzas", FinanceCalendarSource(self.fm))
        today = date.today()
        occ = [o for o in sm.day(today) if o.kind == "saving"]
        self.assertEqual(len(occ), 1)
        sm.set_done(today, occ[0].id, True)
        self.assertEqual(self.fm.saved(g["id"]), 40)
        sm.set_done(today, occ[0].id, False)
        self.assertEqual(self.fm.saved(g["id"]), 0)


if __name__ == "__main__":
    unittest.main()
