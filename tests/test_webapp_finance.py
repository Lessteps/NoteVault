"""Finanzas through the web bridge: the same day files, goals and categories
as the Qt module; amounts in cents; untrusted input refused."""

import shutil
import tempfile
import unittest
from datetime import date
from pathlib import Path

from notevault_app.core.finance_manager import FinanceManager
from notevault_app.webapp.api import ApiError, NoteVaultApi


class TestFinanceApi(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_fin_"))
        self.api = NoteVaultApi(self.dir)
        self.today = date.today().isoformat()

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_defaults_and_expense(self):
        cats = self.api.fin_meta()["categories"]
        self.assertTrue(any(c["id"] == "comida" for c in cats))
        m = self.api.fin_add(self.today, {"type": "gasto", "amount_cents": 1250000, "what": "Almuerzo\ncategory: x", "category": "comida"})
        day = FinanceManager(self.dir).day(date.today())
        self.assertEqual(day[0]["amount_cents"], 1250000)
        self.assertEqual(day[0]["what"], "Almuerzo category: x")
        self.assertEqual(self.api.fin_sidebar()["month"]["gasto"], 1250000)
        self.api.fin_update(self.today, m["id"], {"type": "gasto", "amount_cents": 900000, "category": "transporte"})
        self.assertEqual(FinanceManager(self.dir).day(date.today())[0]["category"], "transporte")

    def test_goal_savings_and_status(self):
        g = self.api.fin_goal_save("", {"name": "Moto", "target_cents": 1000000, "suggested_cents": 500000,
                                        "cadence": {"mode": "period", "period": "week"}, "show_in_daily": True})
        checks = self.api.fin_due_checks(self.today)
        self.assertEqual([c["goal"]["id"] for c in checks], [g["id"]])
        self.api.fin_add(self.today, {"type": "ahorro", "amount_cents": 1000000, "goal": g["id"]})
        data = self.api.fin_goal(g["id"])
        self.assertEqual(data["pace"]["saved"], 1000000)
        self.assertEqual(data["goal"]["status"], "Cumplida")
        self.assertTrue(self.api.fin_due_checks(self.today)[0]["checked"] if self.api.fin_due_checks(self.today) else True)

    def test_move_to_another_day(self):
        m = self.api.fin_add(self.today, {"type": "ingreso", "amount_cents": 100, "category": "salario"})
        self.api.fin_update(self.today, m["id"], {"type": "ingreso", "amount_cents": 100, "category": "salario"}, "2026-01-02")
        self.assertEqual(FinanceManager(self.dir).day(date(2026, 1, 2))[0]["id"], m["id"])

    def test_bad_input(self):
        for bad in ({"type": "robo", "amount_cents": 1}, {"type": "gasto", "amount_cents": -5},
                    {"type": "gasto", "amount_cents": 0}, {"type": "gasto", "amount_cents": "12,5"},
                    {"type": "gasto", "amount_cents": 1, "category": "inventada"},
                    {"type": "gasto", "amount_cents": 1, "time": "8pm"},
                    {"type": "gasto", "amount_cents": 1, "attachments": ["../x.png"]}):
            with self.subTest(bad=bad), self.assertRaises(ApiError):
                self.api.fin_add(self.today, bad)
        with self.assertRaises(ApiError):
            self.api.fin_range("2020-01-01", "2026-01-01")
        with self.assertRaises(ApiError):
            self.api.fin_category_save("", {"name": "X", "colour": "red"})

    def test_category_budget(self):
        c = self.api.fin_category_save("", {"name": "Mascotas", "icon": "🐶", "colour": "#aa00aa", "budget_month_cents": 5000000})
        self.api.fin_add(self.today, {"type": "gasto", "amount_cents": 6000000, "category": c["id"]})
        d = date.today()
        budgets = self.api.fin_month_extras(d.year, d.month)["budgets"]
        row = next(b for b in budgets if b["category"]["id"] == c["id"])
        self.assertEqual((row["used"], row["budget"]), (6000000, 5000000))


if __name__ == "__main__":
    unittest.main()
