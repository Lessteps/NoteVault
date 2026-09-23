"""Live Preview table rendering in the Markdown source highlighter.

A table is set in a monospace face (so columns line up into a grid), its pipes
are made invisible on inactive rows (the painted grid lines take over), and the
``|---|`` alignment row is concealed unless the caret is on it. The document
bytes never change.
"""
import os
import unittest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtWidgets import QApplication
from PySide6.QtGui import QTextDocument, QTextCharFormat, QFont

from notevault_app.ui.components.notes.md_highlighter import MarkdownHighlighter

_app = QApplication.instance() or QApplication([])

TABLE = (
    "intro\n"
    "| A | B |\n"
    "|---|---|\n"
    "| 1 | 2 |\n"
)


class TestTableGrid(unittest.TestCase):
    def setUp(self):
        self.doc = QTextDocument()
        self.doc.setPlainText(TABLE)
        self.hl = MarkdownHighlighter(self.doc)
        self.header_line = len("intro\n")          # "| A | B |"
        self.sep_line = len("intro\n| A | B |\n")   # "|---|---|"

    def _fmt(self, pos) -> QTextCharFormat:
        block = self.doc.findBlock(pos)
        off = pos - block.position()
        merged = QTextCharFormat()
        for fr in block.layout().formats():
            if fr.start <= off < fr.start + fr.length:
                merged.merge(fr.format)
        return merged

    def test_table_rows_are_monospace(self):
        self.hl.active_block = 0
        self.hl.rehighlight()
        fams = self._fmt(self.header_line + 2).fontFamilies()  # the 'A' cell
        self.assertTrue(fams and "Cascadia Mono" in fams)

    def test_pipes_hidden_on_inactive_row(self):
        self.hl.active_block = 0            # caret outside the table
        self.hl.rehighlight()
        pipe = self._fmt(self.header_line)  # first '|'
        self.assertEqual(pipe.foreground().color().alpha(), 0)

    def test_pipes_visible_on_active_row(self):
        self.hl.active_block = 1            # caret on the header row
        self.hl.rehighlight()
        pipe = self._fmt(self.header_line)
        self.assertNotEqual(pipe.foreground().color().alpha(), 0)

    def test_separator_row_concealed_when_inactive(self):
        self.hl.active_block = 0
        self.hl.rehighlight()
        ps = self._fmt(self.sep_line).fontPointSize()
        self.assertTrue(0 < ps <= 0.5)

    def test_separator_row_visible_when_active(self):
        self.hl.active_block = 2            # caret on the |---| row
        self.hl.rehighlight()
        ps = self._fmt(self.sep_line).fontPointSize()
        self.assertFalse(0 < ps <= 0.5)

    def test_document_text_unchanged(self):
        for blk in range(4):
            self.hl.active_block = blk
            self.hl.rehighlight()
            self.assertEqual(self.doc.toPlainText(), TABLE)


if __name__ == "__main__":
    unittest.main()
