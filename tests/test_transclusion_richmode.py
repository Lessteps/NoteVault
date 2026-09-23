"""A note that only carries note transclusions can still use the rich Editor.

Note transclusions ``![[Nota]]`` used to be downgraded to ``[[Nota]]`` links on
the Editor's round-trip, so any note with one was forced into Markdown mode —
and its tables showed as a monospace grid instead of a real rendered table.
Travelling transclusions as embeds keeps them intact, so such notes open in the
rich Editor where tables render as a grid, and the ``![[Nota]]`` text survives a
save.
"""
import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtGui import QTextTable
from PySide6.QtWidgets import QApplication

from notevault_app.core import qt_markdown as qm
from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService
from notevault_app.ui.components.notes.markdown_editor import MarkdownEditor, MODE_RICH

_app = QApplication.instance() or QApplication([])

NOTE = (
    "# Título\n\n"
    "| Code | Category |\n"
    "|------|----------|\n"
    "| C1   | Tech     |\n\n"
    "![[OtraNota]]\n"
)


class TestTransclusionRichMode(unittest.TestCase):
    def test_transclusion_note_is_not_blocked(self):
        self.assertIsNone(qm.rich_edit_problem(NOTE))

    def test_transclusion_survives_roundtrip(self):
        self.assertIn("![[OtraNota]]", qm.roundtrip_markdown(NOTE))

    def test_note_opens_in_rich_editor_with_a_real_table(self):
        root = Path(tempfile.mkdtemp()) / "vault"
        root.mkdir()
        vm = VaultManager(root)
        ed = MarkdownEditor(vm, NotesService(vm))
        note = root / "n.md"
        note.write_text(NOTE, encoding="utf-8")
        ed.open_note(note)
        _app.processEvents()
        self.assertEqual(ed._stack.currentIndex(), MODE_RICH)
        # the rich document holds a real QTextTable, not monospace pipes
        doc = ed._rich.document()
        found = any(isinstance(o, QTextTable)
                    for o in doc.rootFrame().childFrames())
        self.assertTrue(found)


if __name__ == "__main__":
    unittest.main()
