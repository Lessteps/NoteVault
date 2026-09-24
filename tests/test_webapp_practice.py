"""Práctica through the web bridge: grading over HTTP, the web-chat/handoff
flow, giving up and calculation drills, all recorded like the classic app."""

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from notevault_app.core.practice.attempts import PracticeAttemptStore
from notevault_app.webapp.api import ApiError, NoteVaultApi

ROOT = Path(__file__).resolve().parents[1]
MATH = next((ROOT / "docs" / "knowledge_base" / "examples" / "Matemáticas" / "1 Lógica y demostración"
             / "1.10 Inducción matemática" / "Ejercicios").glob("1.10-E01*.md"))
DRILL = next((ROOT / "docs" / "knowledge_base" / "examples" / "practice").glob("P-DRILL-01*.md"))
REPLY = json.dumps({"score": 80, "verdict": "partial", "rubric": [True, True, True, False, True],
                    "errors": [{"category": "logical", "description": "x", "evidence": "y", "fix": "z"}],
                    "feedback": "Bien.", "next_step": "Repasa.", "example": "k^2"})


class TestPracticeApi(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_practice_web_"))
        self.addCleanup(shutil.rmtree, self.dir, True)
        shutil.copy(MATH, self.dir / "Impares.md")
        shutil.copy(DRILL, self.dir / "Drill.md")
        (self.dir / "Plain.md").write_text("# nada\n", encoding="utf-8")
        self.api = NoteVaultApi(self.dir)
        self.cfg = {"provider": "lmstudio", "base_url": "http://127.0.0.1:1234/v1", "model": "m"}
        p = mock.patch("notevault_app.webapp.modules.assistant.AppConfig")
        self.addCleanup(p.stop)
        p.start().get_ai_config.side_effect = lambda: dict(self.cfg)

    def test_load(self):
        ex = self.api.practice_load("Impares.md")
        self.assertEqual(ex["mode"]["id"], "prove")
        self.assertEqual(len(ex["hints"]), 3)
        self.assertEqual(len(ex["rubric"]), 5)
        self.assertEqual(ex["timer"]["kind"], "countdown")
        self.assertNotIn("solution", ex)
        with self.assertRaises(ApiError):
            self.api.practice_load("Plain.md")
        with self.assertRaises(ApiError):
            self.api.practice_load("../x.md")

    def test_http_grading_records_the_attempt(self):
        with mock.patch("notevault_app.core.ai_client.send_chat", return_value=REPLY) as send:
            out = self.api.practice_grade("Impares.md", "Caso base... paso inductivo...", 1, 300, False)
        self.assertTrue(out["graded"])
        self.assertEqual(out["result"]["score"], 80)
        self.assertEqual(len(out["history"]), 1)
        messages = send.call_args[0][1]
        self.assertIn("Caso base", messages[-1]["content"])
        att = PracticeAttemptStore(self.dir).attempts("mat.logica.induccion.e01")[0]
        self.assertEqual((att["hints_used"], att["seconds"], att["transport"]), (1, 300, "http"))
        with self.assertRaises(ApiError):
            self.api.practice_grade("Impares.md", "   ")

    def test_bad_ai_reply_is_an_error_not_a_grade(self):
        with mock.patch("notevault_app.core.ai_client.send_chat", return_value="no sé"):
            with self.assertRaises(ApiError):
                self.api.practice_grade("Impares.md", "respuesta")
        self.assertEqual(PracticeAttemptStore(self.dir).attempts("mat.logica.induccion.e01"), [])

    def test_bridge_request_then_pasted_reply(self):
        from notevault_app.core.ai_client import BRIDGE_CHATGPT
        self.cfg["provider"] = BRIDGE_CHATGPT
        out = self.api.practice_grade("Impares.md", "mi demostración", 0, 60, False)
        self.assertFalse(out["graded"])
        self.assertTrue(out["bridge"])
        self.assertIn("mi demostración", out["prompt"])
        req = out["request"]
        # Reopening the exercise resumes the pending request.
        self.assertEqual(self.api.practice_load("Impares.md")["pending"]["id"], req)
        self.assertTrue(self.api.practice_reply("Impares.md", req)["waiting"])
        done = self.api.practice_reply("Impares.md", req, "```json\n" + REPLY + "\n```")
        self.assertEqual(done["result"]["score"], 80)
        self.assertIsNone(self.api.practice_load("Impares.md")["pending"])
        with self.assertRaises(ApiError):
            self.api.practice_reply("Impares.md", "../../x")

    def test_handoff_file_answered_by_an_agent(self):
        out = self.api.practice_grade("Impares.md", "respuesta", via="handoff")
        Path(out["response_file"]).write_text(REPLY, encoding="utf-8")
        self.assertTrue(self.api.practice_reply("Impares.md", out["request"])["graded"])

    def test_give_up_shows_solution_and_records_zero(self):
        out = self.api.practice_give_up("Impares.md", 30)
        self.assertIn("Caso base", out["solution"])
        self.assertEqual(out["result"]["score"], 0)

    def test_drill(self):
        ex = self.api.practice_load("Drill.md")
        self.assertEqual(ex["mode"]["answer_kind"], "drill")
        s = self.api.practice_drill_start("Drill.md")
        self.assertEqual(len(s["prompts"]), ex["drill"]["items"])
        first = self.api.practice_drill_check(s["session"], 0, "0")
        self.assertIn("answer", first)
        with self.assertRaises(ApiError):
            self.api.practice_drill_check(s["session"], 5, "1")
        out = self.api.practice_drill_finish(s["session"], 40)
        self.assertTrue(out["graded"])
        with self.assertRaises(ApiError):
            self.api.practice_drill_finish(s["session"])


if __name__ == "__main__":
    unittest.main()
