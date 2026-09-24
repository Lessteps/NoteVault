"""
UI and integration tests for MarkdownEditor workspace bar and contextual tools.
"""

import shutil
import tempfile
import unittest
from pathlib import Path

from PySide6.QtWidgets import QApplication

from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService
from notevault_app.ui.components.notes.markdown_editor import MarkdownEditor
from notevault_app.ui.components.notes.note_properties_dialog import NotePropertiesDialog

# Ensure QApplication exists in headless / offscreen test
app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])


class TestWorkspaceUI(unittest.TestCase):
    def setUp(self):
        self.vault_dir = Path(tempfile.mkdtemp(prefix="nv_ws_ui_"))
        self.vault = VaultManager(self.vault_dir)
        self.service = NotesService(self.vault)
        self.editor = MarkdownEditor(self.vault, self.service)

    def tearDown(self):
        shutil.rmtree(self.vault_dir, ignore_errors=True)

    def test_workspace_bar_detects_math(self):
        math_folder = self.vault_dir / "Matemáticas"
        math_folder.mkdir(parents=True, exist_ok=True)
        note_file = math_folder / "Derivadas.md"
        note_file.write_text(
            "---\nsubject: mathematics\ntopic: derivadas\ndifficulty: 3\nmastery: 0.7\n---\n# Derivadas\nf'(x) = 2x",
            encoding="utf-8"
        )

        self.editor.open_note(note_file)
        self.assertFalse(self.editor._ws_frame.isHidden())
        self.assertIn("Matemáticas", self.editor._ws_badge.text())
        self.assertEqual(self.editor._current_workspace["id"], "mathematics")

        # Verify buttons
        btn_texts = [
            self.editor._context_actions_lay.itemAt(i).widget().text().strip()
            for i in range(self.editor._context_actions_lay.count())
            if self.editor._context_actions_lay.itemAt(i).widget()
        ]
        self.assertIn("Resolver", btn_texts)
        self.assertIn("Graficar", btn_texts)
        self.assertIn("Ejercicio", btn_texts)

    def test_workspace_bar_detects_programming(self):
        prog_folder = self.vault_dir / "Programación"
        prog_folder.mkdir(parents=True, exist_ok=True)
        note_file = prog_folder / "Recursion.md"
        note_file.write_text(
            "---\nsubject: programming\ntopic: recursion\ndifficulty: 4\nmastery: 0.4\n---\n# Recursión\ndef f(n): ...",
            encoding="utf-8"
        )

        self.editor.open_note(note_file)
        self.assertFalse(self.editor._ws_frame.isHidden())
        self.assertIn("Programación", self.editor._ws_badge.text())
        self.assertEqual(self.editor._current_workspace["id"], "programming")

        btn_texts = [
            self.editor._context_actions_lay.itemAt(i).widget().text().strip()
            for i in range(self.editor._context_actions_lay.count())
            if self.editor._context_actions_lay.itemAt(i).widget()
        ]
        self.assertIn("Ejecutar", btn_texts)
        self.assertIn("Probar", btn_texts)
        self.assertIn("Depurar", btn_texts)

    def test_workspace_bar_detects_english(self):
        eng_folder = self.vault_dir / "Inglés"
        eng_folder.mkdir(parents=True, exist_ok=True)
        note_file = eng_folder / "Vocabulary.md"
        note_file.write_text(
            "---\nsubject: english\nlevel: B2\ntopic: tech\nmastery: 0.6\n---\n# Tech English",
            encoding="utf-8"
        )

        self.editor.open_note(note_file)
        self.assertFalse(self.editor._ws_frame.isHidden())
        self.assertIn("Inglés", self.editor._ws_badge.text())
        self.assertEqual(self.editor._current_workspace["id"], "english")

        btn_texts = [
            self.editor._context_actions_lay.itemAt(i).widget().text().strip()
            for i in range(self.editor._context_actions_lay.count())
            if self.editor._context_actions_lay.itemAt(i).widget()
        ]
        self.assertIn("Vocabulario", btn_texts)
        self.assertIn("Gramática", btn_texts)
        self.assertIn("Listening", btn_texts)

    def test_context_action_signal_emitted(self):
        math_folder = self.vault_dir / "Matemáticas"
        math_folder.mkdir(parents=True, exist_ok=True)
        note_file = math_folder / "Algebra.md"
        note_file.write_text("x^2 + 5x + 6 = 0", encoding="utf-8")

        self.editor.open_note(note_file)

        received = []
        self.editor.context_action_requested.connect(
            lambda act, text, meta: received.append((act, text, meta))
        )

        self.editor._trigger_context_action("solve")
        self.assertEqual(len(received), 1)
        action_id, text, meta = received[0]
        self.assertEqual(action_id, "solve")
        self.assertIn("x^2", text)
        self.assertEqual(meta["workspace"], "mathematics")


if __name__ == "__main__":
    unittest.main()
