"""Tests for canvas v2: read-only, undo/redo, group-from-selection, snap-to-objects."""

import shutil
import tempfile
import unittest
from pathlib import Path

from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QPointF

from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService
from notevault_app.core import canvas_format as cf
from notevault_app.ui.components.notes.canvas import CanvasView
from notevault_app.ui.components.notes.canvas.items import GroupNodeItem

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])


class TestCanvasV2(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_c2_"))
        self.vault = VaultManager(self.dir)
        self.service = NotesService(self.vault)
        self.path = self.dir / "board.canvas"
        cf.create_empty(self.path)
        self.view = CanvasView(self.vault, self.service)
        self.view.load(self.path)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    # ── B3 read-only ────────────────────────────────────────────────────
    def test_read_only_blocks_add(self):
        self.view.set_read_only(True)
        item = self.view.add_text_node(QPointF(0, 0), "x")
        self.assertIsNone(item)
        self.assertEqual(len(self.view._doc.nodes), 0)

    def test_read_only_allows_after_toggle_off(self):
        self.view.set_read_only(True)
        self.view.set_read_only(False)
        item = self.view.add_text_node(QPointF(0, 0), "x")
        self.assertIsNotNone(item)

    # ── C3 undo/redo ────────────────────────────────────────────────────
    def test_undo_redo_add_node(self):
        self.view.add_text_node(QPointF(0, 0), "hola")
        self.assertEqual(len(self.view._doc.nodes), 1)
        self.view.undo()
        self.assertEqual(len(self.view._doc.nodes), 0)
        self.view.redo()
        self.assertEqual(len(self.view._doc.nodes), 1)

    def test_undo_redo_delete(self):
        item = self.view.add_text_node(QPointF(0, 0), "hola")
        item.setSelected(True)
        self.view._delete_selected()
        self.assertEqual(len(self.view._doc.nodes), 0)
        self.view.undo()
        self.assertEqual(len(self.view._doc.nodes), 1)

    # ── A2 group from selection ─────────────────────────────────────────
    def test_create_group_from_selection_wraps_nodes(self):
        a = self.view.add_text_node(QPointF(0, 0), "a")
        b = self.view.add_text_node(QPointF(400, 300), "b")
        a.setSelected(True)
        b.setSelected(True)
        group = self.view.create_group_from_selection()
        self.assertIsInstance(group, GroupNodeItem)
        grect = group.mapRectToScene(group._node_rect())
        self.assertTrue(grect.contains(a.mapRectToScene(a._node_rect())))
        self.assertTrue(grect.contains(b.mapRectToScene(b._node_rect())))

    # ── A1 subgroups: outer group drags inner group + its contents ──────
    def test_outer_group_drags_nested_group_and_contents(self):
        # inner group at (50,50) sized 200x150 with a note inside it
        inner = self.view.add_group_node(QPointF(50, 50))
        inner.node.width, inner.node.height = 200, 150
        child = self.view.add_text_node(QPointF(70, 70), "c")
        # outer group fully containing the inner group
        outer = self.view.add_group_node(QPointF(0, 0))
        outer.node.width, outer.node.height = 400, 400
        outer.prepareGeometryChange(); outer.update()
        # simulate press (captures contained descendants) then move
        from PySide6.QtCore import QPointF as P
        outer._drag_start_pos = outer.pos()
        outer._dragged_children = []
        grect = outer.mapRectToScene(outer._node_rect())
        for it in self.view._scene.items():
            from notevault_app.ui.components.notes.canvas.items import BaseNodeItem
            if it is outer or not isinstance(it, BaseNodeItem):
                continue
            if grect.contains(it.mapRectToScene(it._node_rect())):
                outer._dragged_children.append((it, it.pos() - outer.pos()))
        captured = {id(c) for c, _ in outer._dragged_children}
        self.assertIn(id(inner), captured)
        self.assertIn(id(child), captured)

    # ── B2 snap to objects ──────────────────────────────────────────────
    def test_snap_to_objects_aligns_left_edges(self):
        a = self.view.add_text_node(QPointF(0, 0), "a")   # left edge x=0
        b = self.view.add_text_node(QPointF(200, 200), "b")
        # b near x=3 should snap its left edge to a's left edge (x=0)
        snapped = b._snapped_to_objects(QPointF(3, 200))
        self.assertAlmostEqual(snapped.x(), 0.0, delta=0.01)


if __name__ == "__main__":
    unittest.main()
