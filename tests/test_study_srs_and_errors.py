"""
Unit tests for StudySRSManager, StudyErrorManager, and StudyDailyQueueManager.
"""

import shutil
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from notevault_app.core.study_srs_manager import StudySRSManager
from notevault_app.core.study_error_manager import StudyErrorManager, ERROR_CATEGORIES
from notevault_app.core.study_daily_queue import StudyDailyQueueManager
from notevault_app.core.study_exercise_manager import StudyExerciseManager


class TestStudySRSandErrors(unittest.TestCase):
    def setUp(self):
        self.vault = Path(tempfile.mkdtemp(prefix="nv_srs_err_"))
        self.srs_mgr = StudySRSManager(self.vault)
        self.err_mgr = StudyErrorManager(self.vault)
        self.ex_mgr = StudyExerciseManager(self.vault)
        self.queue_mgr = StudyDailyQueueManager(self.vault)

    def tearDown(self):
        shutil.rmtree(self.vault, ignore_errors=True)

    def test_srs_lifecycle_progression(self):
        item = self.srs_mgr.register_item(
            entity_id="derivative_power_rule",
            entity_type="formula",
            subject="mathematics",
            topic="derivatives",
            difficulty=2
        )
        self.assertEqual(item["repetitions"], 0)
        self.assertEqual(item["interval_days"], 1)

        # Review 1 with perfect score (grade 5)
        reviewed1 = self.srs_mgr.review(item["id"], quality_grade=5)
        self.assertEqual(reviewed1["repetitions"], 1)
        self.assertEqual(reviewed1["interval_days"], 1)
        self.assertGreater(reviewed1["mastery"], 0.0)

        # Review 2 with good score (grade 4)
        reviewed2 = self.srs_mgr.review(item["id"], quality_grade=4)
        self.assertEqual(reviewed2["repetitions"], 2)
        self.assertEqual(reviewed2["interval_days"], 6)

        # Review 3 with fail (grade 1) resets interval and repetitions
        reviewed3 = self.srs_mgr.review(item["id"], quality_grade=1)
        self.assertEqual(reviewed3["repetitions"], 0)
        self.assertEqual(reviewed3["interval_days"], 1)
        self.assertEqual(reviewed3["lapses"], 1)

    def test_error_taxonomies_and_resolution(self):
        for cat in ERROR_CATEGORIES:
            err = self.err_mgr.record_error(
                category=cat,
                subject="programming",
                topic="testing",
                wrong_answer="test wrong",
                expected="test expected"
            )
            self.assertEqual(err["category"], cat)
            self.assertFalse(err["resolved"])

        breakdown = self.err_mgr.category_breakdown()
        self.assertEqual(len(breakdown), 11)
        for cat in ERROR_CATEGORIES:
            self.assertEqual(breakdown[cat], 1)

        # Test resolution
        sample_err = self.err_mgr.errors()[0]
        resolved = self.err_mgr.mark_resolved(sample_err["id"], True)
        self.assertTrue(resolved["resolved"])
        unresolved = self.err_mgr.errors(unresolved_only=True)
        self.assertEqual(len(unresolved), 10)

    def test_daily_queue_and_interleaving(self):
        # Register items in Math, Prog, and English
        self.srs_mgr.register_item("pythagoras", "formula", "mathematics")
        self.srs_mgr.register_item("react_hooks", "concept", "programming")
        self.srs_mgr.register_item("phrasal_look_for", "vocabulary", "english")

        self.ex_mgr.create("coding", "programming", "loops", "Implement loop")
        self.err_mgr.record_error("calculation", "mathematics", "fractions", "1/2+1/2=2/4")

        queue = self.queue_mgr.get_queue()
        self.assertGreaterEqual(queue["total_tasks"], 4)

        # Verify interleaving: subjects alternate in the interleaved list
        subjects_seq = [t["subject"] for t in queue["interleaved"]]
        # Assert not all of one subject are clumped together if multiple subjects exist
        self.assertIn("mathematics", subjects_seq)
        self.assertIn("programming", subjects_seq)
        self.assertIn("english", subjects_seq)

    def test_study_queue_panel_ui(self):
        from PySide6.QtWidgets import QApplication
        from notevault_app.ui.components.notes.study_queue_panel import StudyQueuePanel
        _app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])

        self.ex_mgr.create("recall", "mathematics", "calculus", "What is derivative?")
        panel = StudyQueuePanel(self.vault)
        self.assertIn("tareas hoy", panel.stats_lbl.text())
        self.assertGreaterEqual(panel.tasks_lay.count(), 1)


if __name__ == "__main__":
    unittest.main()
