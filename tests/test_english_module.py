"""
Unit tests for English vocabulary and grammar managers.
"""

import shutil
import tempfile
import unittest
from pathlib import Path

from notevault_app.core.english_vocabulary_manager import EnglishVocabularyManager
from notevault_app.core.english_grammar_manager import EnglishGrammarManager


class TestEnglishModule(unittest.TestCase):
    def setUp(self):
        self.vault = Path(tempfile.mkdtemp(prefix="nv_eng_test_"))
        self.vocab_mgr = EnglishVocabularyManager(self.vault)
        self.grammar_mgr = EnglishGrammarManager(self.vault)

    def tearDown(self):
        shutil.rmtree(self.vault, ignore_errors=True)

    def test_add_and_query_vocabulary(self):
        w = self.vocab_mgr.add_word(
            word="seamless",
            meaning="sin interrupciones, fluido",
            part_of_speech="adjective",
            level="B2",
            topic="technology",
            examples=["The system provides a seamless user experience."]
        )
        self.assertEqual(w["word"], "seamless")
        self.assertEqual(w["level"], "B2")

        retrieved = self.vocab_mgr.get("seamless")
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved["meaning"], "sin interrupciones, fluido")

    def test_generate_vocab_exercise_modes(self):
        self.vocab_mgr.add_word(
            word="tackle",
            meaning="afrontar o abordar un problema",
            examples=["We need to tackle this issue immediately."]
        )

        ex_meaning = self.vocab_mgr.generate_practice_exercise("tackle", mode="en_to_meaning")
        self.assertIn("tackle", ex_meaning["prompt"])
        self.assertEqual(ex_meaning["expected_solution"], "afrontar o abordar un problema")

        ex_cloze = self.vocab_mgr.generate_practice_exercise("tackle", mode="cloze")
        self.assertIn("_______", ex_cloze["prompt"])
        self.assertEqual(ex_cloze["expected_solution"], "tackle")

    def test_grammar_rules(self):
        rule = self.grammar_mgr.add_rule(
            rule_name="Present Perfect",
            structure="Subject + have/has + Past Participle",
            explanation="Used for past actions connected to the present.",
            level="B1",
            examples=["I have lived here for five years."],
            common_errors=["I have saw it (incorrect) -> I have seen it (correct)"]
        )
        self.assertEqual(rule["rule_name"], "Present Perfect")
        self.assertEqual(rule["level"], "B1")

        all_rules = self.grammar_mgr.all_rules()
        self.assertEqual(len(all_rules), 1)


if __name__ == "__main__":
    unittest.main()
