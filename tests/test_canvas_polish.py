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


    def test_canvas_editor_text_backspace_and_delete(self):
        from PySide6.QtGui import QKeyEvent
        from notevault_app.ui.components.notes.canvas.items import NoteNodeItem
        from notevault_app.core.canvas_format import CanvasNode

        # 1. Text node item
        text_node = self.view.add_text_node(QPointF(0, 0), "ABCDEF")
        text_node._begin_edit()
        cur = text_node._text.textCursor()
        cur.movePosition(cur.MoveOperation.End)
        text_node._text.setTextCursor(cur)

        # Backspace should delete 'F'
        ev_bs = QKeyEvent(QKeyEvent.Type.KeyPress, Qt.Key_Backspace, Qt.NoModifier)
        self.view.keyPressEvent(ev_bs)
        self.assertEqual(text_node._text.toPlainText(), "ABCDE")

        # Delete at pos 0 should delete 'A'
        cur.setPosition(0)
        text_node._text.setTextCursor(cur)
        ev_del = QKeyEvent(QKeyEvent.Type.KeyPress, Qt.Key_Delete, Qt.NoModifier)
        self.view.keyPressEvent(ev_del)
        self.assertEqual(text_node._text.toPlainText(), "BCDE")

        # 2. Note node item
        note_file = self.dir / "TestNote.md"
        note_file.write_text("Hello World", encoding="utf-8")
        cnode = CanvasNode(id="n_test", x=100, y=100, width=200, height=150, type="file", file=str(note_file))
        note_item = NoteNodeItem(cnode, note_file, self.view.service)
        self.view._scene.addItem(note_item)

        note_item._enter_edit()
        note_item._proxy.setFocus()
        note_item._editor.setFocus()
        ncur = note_item._editor.textCursor()
        ncur.movePosition(ncur.MoveOperation.End)
        note_item._editor.setTextCursor(ncur)

        self.view.keyPressEvent(ev_bs)
        self.assertEqual(note_item._editor.toPlainText(), "Hello Worl")

    def test_read_only_mode(self):
        item = self.view.add_text_node(QPointF(0, 0), "Tarjeta")
        self.assertFalse(self.view.is_read_only())
        self.assertTrue(bool(item.flags() & QGraphicsObject.ItemIsMovable))

        self.view.set_read_only(True)
        self.assertTrue(self.view.is_read_only())
        self.assertFalse(bool(item.flags() & QGraphicsObject.ItemIsMovable))

        # Adding new node blocked in read-only
        new_item = self.view.add_text_node(QPointF(50, 50), "Bloqueado")
        self.assertIsNone(new_item)

        self.view.set_read_only(False)
        self.assertFalse(self.view.is_read_only())
        self.assertTrue(bool(item.flags() & QGraphicsObject.ItemIsMovable))

    def test_undo_redo_stack(self):
        self.assertEqual(len(self.view._doc.nodes), 0)
        item = self.view.add_text_node(QPointF(0, 0), "Paso 1")
        self.assertEqual(len(self.view._doc.nodes), 1)

        self.view.undo()
        self.assertEqual(len(self.view._doc.nodes), 0)

        self.view.redo()
        self.assertEqual(len(self.view._doc.nodes), 1)

    def test_bottom_toolbar_and_nav_rail(self):
        # There is now a single Excalidraw-style bottom toolbar: the old right
        # navigation rail is gone and its zoom/undo/redo controls live in the
        # same bar as the create tools.
        from notevault_app.ui.components.notes.canvas.view import _ToolButton
        self.assertIsNotNone(self.view._toolbar)
        self.assertIsNone(getattr(self.view, "_nav_rail", None))

        glyphs = [c._icon.text()
                  for c in self.view._toolbar.findChildren(_ToolButton)]
        # Create tools.
        for g in ("📄", "📝", "🖼", "🌐", "🔲"):
            self.assertIn(g, glyphs)
        # View / history controls, now in the same toolbar.
        for g in ("＋", "−", "↶", "↷"):
            self.assertIn(g, glyphs)

    def test_create_group_from_selection(self):
        t1 = self.view.add_text_node(QPointF(100, 100), "A")
        t2 = self.view.add_text_node(QPointF(300, 200), "B")
        t1.setSelected(True)
        t2.setSelected(True)

        grp = self.view.create_group_from_selection()
        self.assertIsNotNone(grp)
        self.assertEqual(grp.node.type, "group")
        self.assertLessEqual(grp.pos().x(), 100)
        self.assertLessEqual(grp.pos().y(), 100)
        self.assertGreaterEqual(grp.pos().x() + grp.node.width, 300)
        self.assertGreaterEqual(grp.pos().y() + grp.node.height, 200)

    def test_snap_to_objects_and_alignment_guides(self):
        t1 = self.view.add_text_node(QPointF(100, 100), "Fijo")
        t2 = self.view.add_text_node(QPointF(500, 500), "Movible")

        # Nudge t2 x near t1 x (100) within 6px threshold
        snapped = t2._snapped_to_objects(QPointF(103, 500))
        self.assertEqual(snapped.x(), 100.0)
        self.assertGreater(len(self.view._align_guides), 0)

        from PySide6.QtWidgets import QGraphicsSceneMouseEvent
        from PySide6.QtCore import QEvent
        ev = QGraphicsSceneMouseEvent(QEvent.GraphicsSceneMouseRelease)
        ev.setButton(Qt.LeftButton)
        t2.mouseReleaseEvent(ev)
        self.assertEqual(len(self.view._align_guides), 0)


if __name__ == "__main__":
    unittest.main()

