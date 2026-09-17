"""
Unit tests for StudyExerciseManager.
"""

import shutil
import tempfile
import unittest
from pathlib import Path

from notevault_app.core.study_exercise_manager import StudyExerciseManager, EXERCISE_TYPES


class TestStudyExerciseManager(unittest.TestCase):
    def setUp(self):
        self.vault = Path(tempfile.mkdtemp(prefix="nv_study_ex_"))
        self.mgr = StudyExerciseManager(self.vault)

    def tearDown(self):
        shutil.rmtree(self.vault, ignore_errors=True)

    def test_create_and_retrieve_exercise(self):
        ex = self.mgr.create(
            exercise_type="coding",
            subject="programming",
            topic="arrays",
            prompt="Implementa una función para invertir un array in-place.",
            expected_solution="def reverse(arr): arr.reverse()",
            difficulty=3,
            goal_level=2,
            skill="problem_decomposition",
            source_note="Programación/Arrays.md",
        )
        self.assertTrue(ex["id"].startswith("ex_"))
        self.assertEqual(ex["type"], "coding")
        self.assertEqual(ex["subject"], "programming")
        self.assertEqual(ex["difficulty"], 3)
        self.assertEqual(ex["status"], "pending")

        retrieved = self.mgr.get(ex["id"])
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved["prompt"], ex["prompt"])

    def test_all_11_types_allowed(self):
        for t in EXERCISE_TYPES:
            ex = self.mgr.create(
                exercise_type=t,
                subject="general",
                topic="test",
                prompt=f"Test for {t}",
            )
            self.assertEqual(ex["type"], t)

    def test_filter_exercises(self):
        self.mgr.create("recall", "mathematics", "calculus", "P1")
        self.mgr.create("problem_solving", "mathematics", "algebra", "P2")
        self.mgr.create("coding", "programming", "python", "P3")

        math_all = self.mgr.exercises(subject="mathematics")
        self.assertEqual(len(math_all), 2)

        prog_all = self.mgr.exercises(subject="programming")
        self.assertEqual(len(prog_all), 1)

        calc = self.mgr.exercises(topic="calculus")
        self.assertEqual(len(calc), 1)

    def test_record_attempt_lifecycle(self):
        ex = self.mgr.create("recall", "english", "verbs", "What is the past of go?")
        # First attempt: failed
        self.mgr.record_attempt(ex["id"], user_answer="goed", is_correct=False, score=0.0, error_category="grammar")
        updated1 = self.mgr.get(ex["id"])
        self.assertEqual(updated1["attempts_count"], 1)
        self.assertEqual(updated1["success_rate"], 0.0)
        self.assertEqual(updated1["status"], "failed")

        # Second attempt: correct
        self.mgr.record_attempt(ex["id"], user_answer="went", is_correct=True, score=1.0)
        updated2 = self.mgr.get(ex["id"])
        self.assertEqual(updated2["attempts_count"], 2)
        self.assertEqual(updated2["success_rate"], 0.5)
        self.assertEqual(updated2["status"], "completed")
        self.assertEqual(len(updated2["history"]), 2)

    def test_exercise_dialog_interaction(self):
        from PySide6.QtWidgets import QApplication
        from notevault_app.ui.components.notes.study_exercise_dialog import StudyExerciseDialog
        _app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])

        ex = self.mgr.create(
            "multiple_choice", "mathematics", "algebra",
            "¿Cuál es el valor de x en 2x + 4 = 10?",
            expected_solution="3",
            options=["2", "3", "4", "5"],
            correct_option_index=1,
        )
        dlg = StudyExerciseDialog(ex, self.mgr)
        self.assertEqual(dlg.options_group.buttons()[1].text(), "3")
        # Check option 1
        dlg.options_group.buttons()[1].setChecked(True)
        dlg._submit()
        self.assertTrue(dlg._submitted)
        updated = self.mgr.get(ex["id"])
        self.assertEqual(updated["status"], "completed")
        self.assertEqual(updated["success_rate"], 1.0)


if __name__ == "__main__":
    unittest.main()
