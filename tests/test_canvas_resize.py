"""Canvas cards resize from any border or corner, not only the grip.

Dragging the right or bottom edge grows the card in place; dragging the left or
top edge grows it while pinning the opposite edge (the origin moves). A minimum
size is always respected.
"""
import os
import unittest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtCore import QEvent, QPointF, Qt
from PySide6.QtWidgets import QApplication, QGraphicsScene, QGraphicsSceneMouseEvent

from notevault_app.core import canvas_format as cf
from notevault_app.ui.components.notes.canvas.items import TextNodeItem, MIN_W, MIN_H

_app = QApplication.instance() or QApplication([])


def _node():
    return cf.CanvasNode(id="n1", type="text", x=100.0, y=100.0,
                         width=200.0, height=150.0, text="hi")


class TestCanvasResize(unittest.TestCase):
    def _drag(self, item, local, scene_start, scene_end):
        press = QGraphicsSceneMouseEvent(QEvent.GraphicsSceneMousePress)
        press.setButton(Qt.LeftButton)
        press.setPos(QPointF(*local))
        press.setScenePos(QPointF(*scene_start))
        item.mousePressEvent(press)
        move = QGraphicsSceneMouseEvent(QEvent.GraphicsSceneMouseMove)
        move.setScenePos(QPointF(*scene_end))
        item.mouseMoveEvent(move)
        rel = QGraphicsSceneMouseEvent(QEvent.GraphicsSceneMouseRelease)
        item.mouseReleaseEvent(rel)

    def setUp(self):
        self.item = TextNodeItem(_node())
        self.scene = QGraphicsScene()
        self.scene.addItem(self.item)

    def test_right_edge_grows_width_in_place(self):
        # press on the right border away from the midpoint port, drag +40 right
        self._drag(self.item, (200, 40), (300, 140), (340, 140))
        self.assertAlmostEqual(self.item.node.width, 240.0, delta=0.5)
        self.assertAlmostEqual(self.item.node.height, 150.0, delta=0.5)
        self.assertAlmostEqual(self.item.pos().x(), 100.0, delta=0.5)

    def test_bottom_edge_grows_height_in_place(self):
        self._drag(self.item, (60, 150), (160, 250), (160, 300))
        self.assertAlmostEqual(self.item.node.height, 200.0, delta=0.5)
        self.assertAlmostEqual(self.item.pos().y(), 100.0, delta=0.5)

    def test_left_edge_moves_origin(self):
        # press on the left border, drag 30 to the left -> wider, origin -30
        self._drag(self.item, (0, 40), (100, 140), (70, 140))
        self.assertAlmostEqual(self.item.node.width, 230.0, delta=0.5)
        self.assertAlmostEqual(self.item.pos().x(), 70.0, delta=0.5)

    def test_top_left_corner(self):
        self._drag(self.item, (0, 0), (100, 100), (80, 60))
        self.assertAlmostEqual(self.item.node.width, 220.0, delta=0.5)
        self.assertAlmostEqual(self.item.node.height, 190.0, delta=0.5)
        self.assertAlmostEqual(self.item.pos().x(), 80.0, delta=0.5)
        self.assertAlmostEqual(self.item.pos().y(), 60.0, delta=0.5)

    def test_minimum_size_enforced(self):
        # drag the right edge far left, past the minimum
        self._drag(self.item, (200, 75), (300, 175), (0, 175))
        self.assertGreaterEqual(self.item.node.width, MIN_W)

    def test_edge_detection_tags(self):
        self.assertEqual(self.item._edge_at(QPointF(0, 0)), "tl")
        self.assertEqual(self.item._edge_at(QPointF(200, 150)), "br")
        self.assertEqual(self.item._edge_at(QPointF(200, 75)), "r")
        self.assertEqual(self.item._edge_at(QPointF(100, 0)), "t")
        self.assertEqual(self.item._edge_at(QPointF(100, 75)), "")  # interior


if __name__ == "__main__":
    unittest.main()
