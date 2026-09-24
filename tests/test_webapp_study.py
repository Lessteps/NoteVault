"""Estudio panel through the web bridge: area detection, queue, ledger and
the error log (resolve), on the knowledge-base examples."""

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from notevault_app.webapp.api import ApiError, NoteVaultApi

ROOT = Path(__file__).resolve().parents[1]
MATH = ROOT / "docs" / "knowledge_base" / "examples" / "Matemáticas"


class TestStudyApi(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_study_web_"))
        self.addCleanup(shutil.rmtree, self.dir, True)
        shutil.copytree(MATH, self.dir / "Matemáticas")
        (self.dir / "Suelta.md").write_text("# nada\n", encoding="utf-8")
        self.api = NoteVaultApi(self.dir)
        self.ex = next(p for p in (self.dir / "Matemáticas").rglob("1.10-E01*.md"))
        self.rel = self.ex.relative_to(self.dir).as_posix()

    def test_area(self):
        area = self.api.study_area(self.rel)
        self.assertEqual(area["subject"], "mathematics")
        self.assertEqual(area["title"], "1 Lógica y demostración")
        self.assertIsNone(self.api.study_area("Suelta.md"))
        with self.assertRaises(ApiError):
            self.api.study_snapshot("Suelta.md")

    def test_snapshot_queue_and_ledger(self):
        snap = self.api.study_snapshot(self.rel)
        json.dumps(snap)                         # all JSON
        self.assertGreater(snap["exercises"], 0)
        self.assertTrue(snap["queue"]["items"])
        first = next(i for i in snap["queue"]["items"] if "exercise" in i)
        self.assertTrue((self.dir / first["exercise"]["path"]).is_file())
        self.assertTrue(snap["ledgers"][0]["skills"])

    def test_errors_can_be_resolved(self):
        reply = json.dumps({"score": 30, "rubric": [False] * 5, "errors": [
            {"category": "logical", "description": "Circular.", "evidence": "x", "fix": "No."}]})
        with mock.patch("notevault_app.webapp.modules.assistant.AppConfig") as cfg, \
                mock.patch("notevault_app.core.ai_client.send_chat", return_value=reply):
            cfg.get_ai_config.return_value = {"provider": "lmstudio", "base_url": "http://127.0.0.1:9/v1", "model": "m"}
            self.api.practice_grade(self.rel, "respuesta")
        errors = self.api.study_snapshot(self.rel)["errors"]
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["source"], self.rel)
        self.api.study_error_resolve(errors[0]["id"])
        self.assertEqual(self.api.study_snapshot(self.rel)["errors"], [])
        self.assertIn("No unresolved errors", self.api.study_error_digest()["text"])
        with self.assertRaises(ApiError):
            self.api.study_card_grade("nope", 4)
        with self.assertRaises(ApiError):
            self.api.study_card_grade("nope", 9)


if __name__ == "__main__":
    unittest.main()
