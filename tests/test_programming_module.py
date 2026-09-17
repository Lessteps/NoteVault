"""
Unit tests for code runner sandbox and market skill manager.
"""

import shutil
import tempfile
import unittest
from pathlib import Path

from notevault_app.core.code_runner import run_code
from notevault_app.core.market_skill_manager import MarketSkillManager


class TestProgrammingModule(unittest.TestCase):
    def setUp(self):
        self.vault = Path(tempfile.mkdtemp(prefix="nv_prog_test_"))
        self.skill_mgr = MarketSkillManager(self.vault)

    def tearDown(self):
        shutil.rmtree(self.vault, ignore_errors=True)

    def test_code_runner_python_success(self):
        code = "a = 5\nb = 10\nprint(f'SUM={a+b}')"
        res = run_code(code, language="python")
        self.assertTrue(res["success"])
        self.assertIn("SUM=15", res["stdout"])
        self.assertEqual(res["exit_code"], 0)
        self.assertFalse(res["timed_out"])

    def test_code_runner_syntax_error(self):
        code = "def bad_syntax(: return 42"
        res = run_code(code, language="python")
        self.assertFalse(res["success"])
        self.assertNotEqual(res["exit_code"], 0)
        self.assertIn("SyntaxError", res["stderr"])

    def test_code_runner_timeout(self):
        code = "import time\ntime.sleep(3)\nprint('done')"
        res = run_code(code, language="python", timeout_seconds=1)
        self.assertFalse(res["success"])
        self.assertTrue(res["timed_out"])

    def test_market_skills_defaults_and_update(self):
        skills = self.skill_mgr.skills()
        self.assertGreaterEqual(len(skills), 5)

        decomp = self.skill_mgr.get("problem_decomposition")
        self.assertIsNotNone(decomp)
        self.assertEqual(decomp["category"], "logic")

        updated = self.skill_mgr.update_mastery("problem_decomposition", 0.85)
        self.assertEqual(updated["mastery"], 0.85)
        self.assertEqual(self.skill_mgr.get("problem_decomposition")["mastery"], 0.85)


if __name__ == "__main__":
    unittest.main()
