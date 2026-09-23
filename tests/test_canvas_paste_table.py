"""Pasting a table into the canvas keeps it a table.

Copying a rendered table (from a note, a browser or a spreadsheet) puts HTML
plus a flattened plain-text copy on the clipboard. The canvas used to take the
plain text, so every cell ran together in one paragraph. Now the HTML (or TSV)
is converted to a markdown pipe table, both when pasting onto the board and
when pasting inside a card being edited. Driven through the real key-event
chain with QTest, not by calling handlers directly.
"""
import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtCore import QMimeData, QPointF, Qt
from PySide6.QtGui import QTextDocument, QTextTable
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

from notevault_app.core.qt_markdown import clipboard_markdown, prepare_markdown
from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService
from notevault_app.ui.components.notes.canvas.view import CanvasView

_app = QApplication.instance() or QApplication([])

TABLE_MD = ("| Unit | Verbatim Stakeholder Quote |\n|---|---|\n"
            "| **U1** | *\"At Nos Fuimos de Finca...\"* |\n"
            "| **U2** | *\"...through phone calls\"* |\n")


def _put_rendered_table_on_clipboard():
    doc = QTextDocument()
    doc.setMarkdown(prepare_markdown(TABLE_MD))
    mime = QMimeData()
    mime.setHtml(doc.toHtml())
    mime.setText(doc.toPlainText())          # the flattened copy apps also add
    QApplication.clipboard().setMimeData(mime)


def _has_table(item) -> bool:
    doc = item._text.document()
    return any(isinstance(f, QTextTable) for f in doc.rootFrame().childFrames())


class TestClipboardMarkdown(unittest.TestCase):
    def test_html_table_becomes_pipe_table(self):
        _put_rendered_table_on_clipboard()
        mime = QApplication.clipboard().mimeData()
        md = clipboard_markdown(mime.html(), mime.text())
        self.assertTrue(md.startswith("| Unit"))
        self.assertIn("---", md)
        self.assertIn("**U1**", md)
        self.assertNotIn("<span", md)        # no copied font-size wrappers

    def test_tsv_becomes_pipe_table(self):
        md = clipboard_markdown("", "Unit\tQuote\nU1\thola")
        self.assertEqual(md.splitlines()[1], "| --- | --- |")

    def test_plain_text_unchanged(self):
        self.assertEqual(clipboard_markdown("", "solo texto"), "solo texto")


class TestCanvasPaste(unittest.TestCase):
    def setUp(self):
        root = Path(tempfile.mkdtemp()) / "vault"
        root.mkdir()
        vm = VaultManager(root)
        self.view = CanvasView(vm, NotesService(vm))
        self.view.resize(900, 600)
        self.view.show()
        cv = root / "b.canvas"
        cv.write_text('{"nodes":[],"edges":[]}', encoding="utf-8")
        self.view.load(cv)
        _app.processEvents()
        self.assertTrue(self.view.hasFocus())

    def tearDown(self):
        self.view.close()
        self.view.deleteLater()
        _app.processEvents()

    def test_ctrl_v_on_board_creates_table_card(self):
        _put_rendered_table_on_clipboard()
        QTest.keyClick(self.view, Qt.Key_V, Qt.ControlModifier)
        _app.processEvents()
        texts = [n for n in self.view._doc.nodes if n.type == "text"]
        self.assertEqual(len(texts), 1)
        self.assertTrue(texts[0].text.startswith("| Unit"))
        item = self.view._items[texts[0].id]
        self.assertTrue(_has_table(item))
        self.assertGreaterEqual(texts[0].width, 520)   # widened for the columns

    def test_ctrl_v_inside_edited_card_keeps_table(self):
        item = self.view.add_text_node(QPointF(0, 0))
        item._begin_edit()
        _app.processEvents()
        _put_rendered_table_on_clipboard()
        QTest.keyClick(self.view, Qt.Key_V, Qt.ControlModifier)
        _app.processEvents()
        item._end_edit()
        self.assertTrue(item.node.text.lstrip().startswith("| Unit"))
        self.assertTrue(_has_table(item))

    def test_copy_paste_of_cards_still_duplicates(self):
        self.view.add_text_node(QPointF(0, 0), "hola")   # selected
        QTest.keyClick(self.view, Qt.Key_C, Qt.ControlModifier)
        QTest.keyClick(self.view, Qt.Key_V, Qt.ControlModifier)
        _app.processEvents()
        texts = [n for n in self.view._doc.nodes if n.type == "text"]
        self.assertEqual(len(texts), 2)
        self.assertTrue(all(n.text == "hola" for n in texts))


if __name__ == "__main__":
    unittest.main()
