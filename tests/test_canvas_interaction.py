"""Canvas interaction fixes: corner resize, text-card hit-through, group hollow.

- Grabbing near a corner resizes on both axes (a diagonal handle), with a
  generous catch radius.
- A text card's rendered text does not swallow mouse/hover, so the border
  resize handles and cursor work over it (and it accepts the mouse again only
  while being edited).
- A group is clickable on its border and title only; its hollow interior lets
  clicks reach the nodes inside (or start a rubber-band).
"""
import os
import unittest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtCore import QPointF, Qt
from PySide6.QtWidgets import QApplication, QGraphicsScene

from notevault_app.core import canvas_format as cf
from notevault_app.ui.components.notes.canvas.items import TextNodeItem, GroupNodeItem

_app = QApplication.instance() or QApplication([])


class TestCanvasInteraction(unittest.TestCase):
    def setUp(self):
        self.scene = QGraphicsScene()

    def _text(self):
        n = cf.CanvasNode(id="t", type="text", x=0, y=0, width=250, height=150, text="hi")
        it = TextNodeItem(n)
        self.scene.addItem(it)
        return it

    def test_corner_gives_diagonal_handle(self):
        it = self._text()
        # A point ~15px inside the bottom-right corner still counts as "br".
        self.assertEqual(it._edge_at(QPointF(238, 138)), "br")
        self.assertEqual(it._edge_at(QPointF(12, 12)), "tl")
        # A point mid-edge is a single-axis handle.
        self.assertEqual(it._edge_at(QPointF(250, 75)), "r")

    def test_text_child_ignores_mouse_until_edit(self):
        it = self._text()
        self.assertEqual(it._text.acceptedMouseButtons(), Qt.NoButton)
        self.assertFalse(it._text.acceptHoverEvents())
        it._begin_edit()
        self.assertNotEqual(it._text.acceptedMouseButtons(), Qt.NoButton)
        it._end_edit()
        self.assertEqual(it._text.acceptedMouseButtons(), Qt.NoButton)

    def test_group_interior_is_hollow(self):
        n = cf.CanvasNode(id="g", type="group", x=0, y=0, width=400, height=300, label="G")
        g = GroupNodeItem(n)
        self.scene.addItem(g)
        shape = g.shape()
        self.assertFalse(shape.contains(QPointF(200, 160)))   # deep interior
        self.assertTrue(shape.contains(QPointF(1, 150)))       # left border band
        self.assertTrue(shape.contains(QPointF(200, 4)))       # title strip


if __name__ == "__main__":
    unittest.main()
