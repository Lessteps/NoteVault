"""Tests for canvas polish features (Fase C6): groups, links, locking, snap, clipboard, and PNG export."""

import shutil
import tempfile
import unittest
from pathlib import Path

from PySide6.QtWidgets import QApplication, QGraphicsObject
from PySide6.QtCore import QPointF, Qt

from notevault_app.core import canvas_format as cf
from notevault_app.ui.components.notes.canvas import CanvasView
from notevault_app.ui.components.notes.canvas.items import (
    GroupNodeItem, LinkNodeItem, TextNodeItem
)

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])


class TestCanvasPolish(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_polish_"))
        self.path = self.dir / "board.canvas"
        cf.create_empty(self.path)
        self.view = CanvasView()
        self.view.load(self.path)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_group_node_creation_and_persistence(self):
        item = self.view.add_group_node(QPointF(50, 50), "Mi Grupo")
        self.assertIsInstance(item, GroupNodeItem)
        self.assertEqual(item.node.type, "group")
        self.assertEqual(item.node.label, "Mi Grupo")

        self.view.flush()
        doc = cf.load(self.path)
        self.assertEqual(len(doc.nodes), 1)
        self.assertEqual(doc.nodes[0].type, "group")
        self.assertEqual(doc.nodes[0].label, "Mi Grupo")

    def test_link_node_creation_and_persistence(self):
        item = self.view.add_link_node(QPointF(100, 100), "https://github.com")
        self.assertIsInstance(item, LinkNodeItem)
        self.assertEqual(item.node.type, "link")
        self.assertEqual(item.node.url, "https://github.com")

        self.view.flush()
        doc = cf.load(self.path)
        self.assertEqual(len(doc.nodes), 1)
        self.assertEqual(doc.nodes[0].type, "link")
        self.assertEqual(doc.nodes[0].url, "https://github.com")

    def test_locking_nodes(self):
        item = self.view.add_text_node(QPointF(0, 0), "Texto editable")
        self.assertFalse(item.is_locked)
        self.assertTrue(bool(item.flags() & QGraphicsObject.ItemIsMovable))

        item.set_locked(True)
        self.assertTrue(item.is_locked)
        self.assertFalse(bool(item.flags() & QGraphicsObject.ItemIsMovable))

        self.view.flush()
        doc = cf.load(self.path)
        self.assertTrue((doc.nodes[0].nv or {}).get("locked", False))

        item.set_locked(False)
        self.assertFalse(item.is_locked)
        self.assertTrue(bool(item.flags() & QGraphicsObject.ItemIsMovable))

    def test_snap_to_grid_toggle(self):
        self.assertFalse(self.view._snap_to_grid)
        self.view._toggle_snap()
        self.assertTrue(self.view._snap_to_grid)

        # Test snapping via itemChange
        item = self.view.add_text_node(QPointF(0, 0), "Snap test")
        snapped_pos = item.itemChange(QGraphicsObject.ItemPositionChange, QPointF(27.4, 38.9))
        self.assertEqual(snapped_pos.x(), 20.0)
        self.assertEqual(snapped_pos.y(), 40.0)

        self.view._toggle_snap()
        self.assertFalse(self.view._snap_to_grid)

    def test_clipboard_duplicate(self):
        t1 = self.view.add_text_node(QPointF(0, 0), "Nodo 1")
        t2 = self.view.add_text_node(QPointF(200, 0), "Nodo 2")
        self.view.add_edge(t1.node.id, t2.node.id)

        self.assertEqual(len(self.view._doc.nodes), 2)
        self.assertEqual(len(self.view._doc.edges), 1)

        t1.setSelected(True)
        t2.setSelected(True)
        self.view.duplicate_selected()

        self.assertEqual(len(self.view._doc.nodes), 4)
        self.assertEqual(len(self.view._doc.edges), 2)

    def test_export_to_png(self):
        self.view.add_text_node(QPointF(10, 10), "Export Test")
        out_png = self.dir / "canvas.png"
        res = self.view.export_to_png(out_png)
        self.assertIsNotNone(res)
        self.assertTrue(out_png.exists())
        self.assertGreater(out_png.stat().st_size, 100)

    def test_zoom_to_fit(self):
        self.view.add_text_node(QPointF(0, 0), "A")
        self.view.add_text_node(QPointF(1000, 1000), "B")
        self.view.zoom_to_fit()
        # Ensure no exception and transform is non-identity
        self.assertIsNotNone(self.view.transform())

    def test_wheel_scroll_vertical_and_zoom(self):
        from PySide6.QtGui import QWheelEvent
        from PySide6.QtCore import QPoint

        self.view.resize(800, 600)
        self.view.show()
        app.processEvents()

        initial_v = self.view.verticalScrollBar().value()
        # Scroll up (angleDelta.y = 120)
        ev_up = QWheelEvent(
            QPointF(400, 300), QPointF(400, 300), QPoint(0, 0), QPoint(0, 120),
            Qt.NoButton, Qt.NoModifier, Qt.ScrollUpdate, False
        )
        self.view.wheelEvent(ev_up)
        self.assertEqual(self.view.verticalScrollBar().value(), initial_v - 120)

        # Scroll down (angleDelta.y = -120)
        ev_down = QWheelEvent(
            QPointF(400, 300), QPointF(400, 300), QPoint(0, 0), QPoint(0, -120),
            Qt.NoButton, Qt.NoModifier, Qt.ScrollUpdate, False
        )
        self.view.wheelEvent(ev_down)
        self.assertEqual(self.view.verticalScrollBar().value(), initial_v)

        # Zoom with Ctrl + Wheel
        scale_before = self.view.transform().m11()
        ev_zoom = QWheelEvent(
            QPointF(400, 300), QPointF(400, 300), QPoint(0, 0), QPoint(0, 120),
            Qt.NoButton, Qt.ControlModifier, Qt.ScrollUpdate, False
        )
        self.view.wheelEvent(ev_zoom)
        self.assertGreater(self.view.transform().m11(), scale_before)


if __name__ == "__main__":
    unittest.main()

