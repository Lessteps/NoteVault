"""Free text cards on the canvas render their markdown.

A text node used to show its raw source, so ``# Title`` appeared with the hash
visible. It now renders headings, bold and lists like a note, and only reveals
the raw markdown while it is being edited in place.
"""
import os
import unittest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtWidgets import QApplication, QGraphicsScene

from notevault_app.core import canvas_format as cf
from notevault_app.ui.components.notes.canvas.items import TextNodeItem

_app = QApplication.instance() or QApplication([])


def _node(text):
    return cf.CanvasNode(id="t", type="text", x=0, y=0,
                         width=250, height=120, text=text)


class TestCanvasTextMarkdown(unittest.TestCase):
    def setUp(self):
        self.scene = QGraphicsScene()

    def test_heading_renders_without_hash(self):
        it = TextNodeItem(_node("# Phase 0\n\n## Sub\n\nnormal **bold**"))
        self.scene.addItem(it)
        doc = it._text.document()
        self.assertNotIn("#", doc.toPlainText())
        self.assertEqual(doc.firstBlock().blockFormat().headingLevel(), 1)

    def test_edit_shows_raw_then_rerenders(self):
        it = TextNodeItem(_node("# Titulo"))
        self.scene.addItem(it)
        it._begin_edit()
        self.assertIn("#", it._text.toPlainText())     # raw while editing
        it._end_edit()
        self.assertNotIn("#", it._text.document().toPlainText())   # rendered again

    def test_edit_preserves_text(self):
        it = TextNodeItem(_node("# Titulo"))
        self.scene.addItem(it)
        it._begin_edit()
        it._end_edit()
        self.assertEqual(it.node.text, "# Titulo")


if __name__ == "__main__":
    unittest.main()


class TestTableTolerance(unittest.TestCase):
    def test_table_without_separator_still_renders(self):
        from PySide6.QtGui import QTextTable
        from notevault_app.ui.components.notes.canvas.items import TextNodeItem, _tolerant_table_md
        md = "| Unit | Quote |\n| U1 | hola |\n| U2 | chao |"   # NO |---| separator
        fixed = _tolerant_table_md(md)
        self.assertIn("---", fixed)                              # separator inserted
        it = TextNodeItem(_node(md))
        sc = QGraphicsScene(); sc.addItem(it)
        tables = [o for o in it._text.document().rootFrame().childFrames()
                  if isinstance(o, QTextTable)]
        self.assertEqual(len(tables), 1)

    def test_plain_text_is_untouched(self):
        from notevault_app.ui.components.notes.canvas.items import _tolerant_table_md
        self.assertEqual(_tolerant_table_md("# Hola\n\nsin tablas"), "# Hola\n\nsin tablas")


class TestTableToleranceRows(unittest.TestCase):
    """A table must keep exactly its own rows: no separator rows sneaking in
    between data rows (they rendered as bogus '---' rows)."""

    def test_valid_table_is_unchanged(self):
        from notevault_app.ui.components.notes.canvas.items import _tolerant_table_md
        md = "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |"
        self.assertEqual(_tolerant_table_md(md), md)

    def test_missing_separator_gets_exactly_one(self):
        from notevault_app.ui.components.notes.canvas.items import _tolerant_table_md
        md = "| A | B |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |"
        out = _tolerant_table_md(md).splitlines()
        self.assertEqual(len(out), 5)                 # 4 rows + 1 separator
        self.assertEqual(sum("---" in l for l in out), 1)
        self.assertIn("---", out[1])

    def test_rendered_table_has_only_real_rows(self):
        from PySide6.QtGui import QTextTable
        from notevault_app.ui.components.notes.canvas.items import TextNodeItem
        md = "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |"
        it = TextNodeItem(_node(md))
        sc = QGraphicsScene(); sc.addItem(it)
        t = [f for f in it._text.document().rootFrame().childFrames()
             if isinstance(f, QTextTable)][0]
        self.assertEqual(t.rows(), 3)                 # header + 2 data rows
