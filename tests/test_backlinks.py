"""Tests for backlinks/mentions: clickable rows that jump to the line, and
automatic refresh after a note is saved."""

import shutil
import tempfile
import unittest
from pathlib import Path

from PySide6.QtWidgets import QApplication, QPushButton
from PySide6.QtCore import Qt

from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService
from notevault_app.ui.components.notes.markdown_editor import MarkdownEditor

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])


class TestBacklinks(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_bl_"))
        (self.dir / "Target.md").write_text("# Target\n\ncuerpo\n", encoding="utf-8")
        (self.dir / "Source.md").write_text(
            "# Source\n\nlinea dos\nenlaza a [[Target]] aqui\n", encoding="utf-8")
        self.vault = VaultManager(self.dir)
        self.service = NotesService(self.vault)
        self.editor = MarkdownEditor(self.vault, self.service)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def _target_note(self):
        return next(n for n in self.service.index.notes() if n.title == "Target")

    def test_mentions_detects_link_and_line(self):
        linked, unlinked = self.service.mentions(self._target_note())
        self.assertEqual(len(linked), 1)
        self.assertEqual(linked[0].title, "Source")
        self.assertEqual(linked[0].line_no, 4)   # the [[Target]] line

    def test_row_click_emits_path_and_line(self):
        linked, unlinked = self.service.mentions(self._target_note())
        foot = self.editor._mentions
        foot._show_results(foot._generation, linked, unlinked)

        received = []
        foot.open_requested.connect(lambda p, ln: received.append((Path(p), ln)))

        btns = self._buttons(foot._body)
        rows = [b for b in btns if "·" in b.text()]
        self.assertTrue(rows)
        rows[0].click()

        self.assertEqual(len(received), 1)
        self.assertEqual(received[0][0], self.dir / "Source.md")
        self.assertEqual(received[0][1], 4)

    def test_open_from_mention_jumps_to_line(self):
        # Opening via a mention should switch to the note and place the cursor
        # on the given line without raising.
        self.editor._open_from_mention(self.dir / "Source.md", 4)
        self.assertEqual(self.editor.current_path(), self.dir / "Source.md")

    def test_save_schedules_mentions_refresh(self):
        self.editor.open_note(self.dir / "Target.md")
        self.assertFalse(self.editor._mentions_refresh.isActive())
        self.editor.note_saved.emit(self.dir / "Target.md")
        self.assertTrue(self.editor._mentions_refresh.isActive())

    def test_wikilink_plain_click_follows(self):
        # A plain left-click (no Ctrl) on a [[wikilink]] must follow it now.
        from PySide6.QtGui import QMouseEvent
        from PySide6.QtCore import QPointF, QEvent
        from notevault_app.ui.components.notes.note_view import NoteTextEdit

        edit = NoteTextEdit()
        edit.load_markdown("ver [[Target]] aqui")
        fired = []
        edit.note_link_activated.connect(fired.append)
        # Pretend the cursor under the click sits on the wikilink.
        edit._wikilink_under = lambda pos: "Target"
        ev = QMouseEvent(QEvent.MouseButtonPress, QPointF(5, 5),
                         Qt.LeftButton, Qt.LeftButton, Qt.NoModifier)
        self.assertTrue(edit._follow_wikilink(ev))
        self.assertEqual(fired, ["Target"])

    def _buttons(self, layout):
        out = []
        for i in range(layout.count()):
            it = layout.itemAt(i)
            w = it.widget()
            if isinstance(w, QPushButton):
                out.append(w)
            elif it.layout():
                out.extend(self._buttons(it.layout()))
        return out


    def test_mentions_detects_subfolder_and_ext_links(self):
        (self.dir / "Subfolder").mkdir(exist_ok=True)
        (self.dir / "OtherSource.md").write_text(
            "# Other\n\nEnlace: [[Subfolder/Target.md]]\n", encoding="utf-8")
        self.service.index.clear()
        linked, unlinked = self.service.mentions(self._target_note())
        titles = [m.title for m in linked]
        self.assertIn("OtherSource", titles)

    def test_prepare_for_reading_shows_only_filename(self):
        from notevault_app.core.qt_markdown import prepare_for_reading
        src = "1. [[PHASE_0_PROBLEM_RECOGNITION/1.Problem_Statement.md]] (D1)\n2. [[path/to/note.md|Mi Alias]]"
        res = prepare_for_reading(src)
        self.assertIn("[1.Problem_Statement.md](<nv-note:PHASE_0_PROBLEM_RECOGNITION/1.Problem_Statement.md>)", res)
        self.assertIn("[Mi Alias](<nv-note:path/to/note.md>)", res)

    def test_clean_mention_line_shows_only_filename(self):
        line = "1. [[PHASE_0_PROBLEM_RECOGNITION/1.Problem_Statement.md]] (D1)"
        cleaned = self.editor._mentions._clean_mention_line(line)
        self.assertEqual(cleaned, "1. [[1.Problem_Statement.md]] (D1)")

    def test_highlighter_wikilink_collapsing(self):
        from notevault_app.ui.components.notes.note_view import NoteSourceEdit
        edit = NoteSourceEdit()
        edit.setPlainText("Line 0: [[folder/file.md]]\nLine 1: [[folder2/file2.md]]")
        hl = edit._highlighter

        # Block 0 active, block 1 inactive
        hl.active_block = 0
        hl.rehighlight()
        b0_fmts = hl.document().findBlockByNumber(0).layout().formats()
        b1_fmts = hl.document().findBlockByNumber(1).layout().formats()
        # Active line has 1 format (full link), inactive line has 3 (hide, show, hide)
        self.assertEqual(len(b0_fmts), 1)
        self.assertEqual(len(b1_fmts), 3)

        # Now switch active block to 1
        hl.active_block = 1
        hl.rehighlight()
        b0_fmts_after = hl.document().findBlockByNumber(0).layout().formats()
        b1_fmts_after = hl.document().findBlockByNumber(1).layout().formats()
        self.assertEqual(len(b0_fmts_after), 3)
        self.assertEqual(len(b1_fmts_after), 1)


if __name__ == "__main__":
    unittest.main()
