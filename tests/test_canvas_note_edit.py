"""A canvas note card opens the full note from its header.

The card lays a rendered ``NoteTextBrowser`` over the body so the note text
stays selectable there (double-click selects a word, as in any reader); the
thin header bar is the affordance that opens the note in the main editor.
"""
import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtCore import QEvent, QPointF, Qt
from PySide6.QtWidgets import QApplication, QGraphicsScene, QGraphicsSceneMouseEvent

from notevault_app.core import canvas_format as cf
from notevault_app.ui.components.notes.canvas.items import NoteNodeItem, HEADER_H

_app = QApplication.instance() or QApplication([])


class TestCanvasNoteEdit(unittest.TestCase):
    def setUp(self):
        d = Path(tempfile.mkdtemp())
        self.f = d / "Card.md"
        self.f.write_text("# Title\n\nbody\n", encoding="utf-8")
        node = cf.CanvasNode(id="n1", type="file", x=0, y=0,
                             width=240, height=160, file="Card.md")
        self.item = NoteNodeItem(node, self.f, service=None)
        self.scene = QGraphicsScene()
        self.scene.addItem(self.item)

    def test_body_double_click_does_not_enter_edit(self):
        # The rendered viewer keeps its own double-click (word selection); the
        # card must not steal it to switch into editing.
        self.assertFalse(self.item._editing)
        self.assertFalse(hasattr(self.item._viewer, "edit_requested"))

    def test_header_double_click_opens_note(self):
        opened = []
        self.item.open_requested.connect(opened.append)
        ev = QGraphicsSceneMouseEvent(QEvent.GraphicsSceneMouseDoubleClick)
        ev.setButton(Qt.LeftButton)
        ev.setPos(QPointF(40, HEADER_H / 2))
        self.item.mouseDoubleClickEvent(ev)
        self.assertEqual(opened, [self.f])
        self.assertFalse(self.item._editing)


if __name__ == "__main__":
    unittest.main()
