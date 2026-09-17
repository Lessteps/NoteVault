"""
Unit tests for AI modes and prompt building in ai_client.py.
"""

import unittest
from notevault_app.core.ai_client import AIConfig, build_messages, AI_MODES


class TestAIModes(unittest.TestCase):
    def test_all_6_modes_defined(self):
        expected_modes = {"tutor", "socratic", "examiner", "evaluator", "generator", "debugger"}
        self.assertEqual(set(AI_MODES.keys()), expected_modes)

    def test_build_messages_with_mode_and_workspace(self):
        cfg = AIConfig(include_note=True)
        messages = build_messages(
            cfg,
            history=[],
            question="¿Cómo resolver esta integral?",
            note_title="Cálculo 1",
            note_body="f(x) = x^2",
            mode="socratic",
            workspace_prompt="Act as mathematics tutor."
        )

        sys_msg = messages[0]["content"]
        self.assertIn("Modo Socrático", sys_msg)
        self.assertIn("Act as mathematics tutor.", sys_msg)

        # Context message
        ctx_msg = messages[1]["content"]
        self.assertIn("Cálculo 1", ctx_msg)
        self.assertIn("f(x) = x^2", ctx_msg)

        # User question
        user_msg = messages[2]["content"]
        self.assertEqual(user_msg, "¿Cómo resolver esta integral?")


if __name__ == "__main__":
    unittest.main()
