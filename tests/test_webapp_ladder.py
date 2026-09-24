"""Escalera de demostración through the web bridge: levels, hidden steps
never sent, local L2 check, AI grading and progression."""

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from notevault_app.webapp.api import ApiError, NoteVaultApi

ROOT = Path(__file__).resolve().parents[1]
THEOREM = next((ROOT / "docs" / "knowledge_base" / "examples" / "Matemáticas" / "1 Lógica y demostración"
                / "1.10 Inducción matemática" / "Demostraciones").glob("1.10-T01*.md"))


class TestLadderApi(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_ladder_web_"))
        self.addCleanup(shutil.rmtree, self.dir, True)
        shutil.copy(THEOREM, self.dir / "T.md")
        (self.dir / "Plain.md").write_text("# x\n", encoding="utf-8")
        self.api = NoteVaultApi(self.dir)
        p = mock.patch("notevault_app.webapp.modules.assistant.AppConfig")
        self.addCleanup(p.stop)
        p.start().get_ai_config.return_value = {"provider": "lmstudio", "base_url": "http://127.0.0.1:9/v1", "model": "m"}

    def test_load_and_levels(self):
        data = self.api.ladder_load("T.md")
        self.assertEqual(data["state"]["current"], 1)
        self.assertGreaterEqual(data["steps"], 2)
        with self.assertRaises(ApiError):
            self.api.ladder_load("Plain.md")
        with self.assertRaises(ApiError):
            self.api.ladder_level("T.md", 9)

    def test_hidden_steps_are_not_sent(self):
        from notevault_app.core.practice import ladder
        self._pass_l1()
        n = self.api.ladder_load("T.md")["steps"]
        self.api.ladder_grade("T.md", 2, {"order": list(range(n))})
        proof = ladder.parse_proof((self.dir / "T.md").read_text(encoding="utf-8"))
        lv3 = self.api.ladder_level("T.md", 3)
        for i in lv3["hidden"]:
            self.assertEqual(lv3["steps"][i]["text"], "")
            self.assertNotIn(proof.steps[i].text, json.dumps(lv3, ensure_ascii=False))

    def _pass_l1(self):
        reply = json.dumps({"score": 90, "rubric": [True, True, True]})
        with mock.patch("notevault_app.core.ai_client.send_chat", return_value=reply):
            self.api.ladder_grade("T.md", 1, {"fields": ["Inducción."]})

    def test_order_level_is_checked_locally_and_unlocks(self):
        n = self.api.ladder_load("T.md")["steps"]
        with self.assertRaises(ApiError):                     # locked until L1 is passed
            self.api.ladder_grade("T.md", 2, {"order": list(range(n))})
        self._pass_l1()
        out = self.api.ladder_grade("T.md", 2, {"order": list(range(n)), "fields": []}, 30)
        self.assertTrue(out["passed"])
        self.assertEqual(out["result"]["score"], 100)
        self.assertEqual(self.api.ladder_load("T.md")["state"]["current"], 3)
        with self.assertRaises(ApiError):
            self.api.ladder_grade("T.md", 2, {"order": [0, 0]})

    def test_ai_levels(self):
        reply = json.dumps({"score": 90, "verdict": "correct", "rubric": [True, True, True], "errors": [],
                            "feedback": "Bien.", "next_step": "", "example": ""})
        with mock.patch("notevault_app.core.ai_client.send_chat", return_value=reply):
            out = self.api.ladder_grade("T.md", 1, {"fields": ["Inducción sobre n; la idea es sumar n+1."]}, 60)
        self.assertTrue(out["passed"])
        self.assertIn("L2", out["message"])
        self.assertEqual(self.api.ladder_load("T.md")["state"]["current"], 2)
        with self.assertRaises(ApiError):
            self.api.ladder_grade("T.md", 1, {"fields": [""]})

    def test_handoff_and_give_up(self):
        out = self.api.ladder_grade("T.md", 1, {"fields": ["prueba"]}, via="handoff")
        self.assertEqual(self.api.ladder_load("T.md")["pending"]["level"], 1)
        reply = json.dumps({"score": 40, "rubric": [True, False, False]})
        Path(out["response_file"]).write_text(reply, encoding="utf-8")
        done = self.api.ladder_reply("T.md", out["request"])
        self.assertFalse(done["passed"])
        g = self.api.ladder_give_up("T.md", 1, {"fields": [""]})
        self.assertIn("Paso", g["proof"])


if __name__ == "__main__":
    unittest.main()
