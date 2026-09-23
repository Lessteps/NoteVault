"""Every canvas change is one undo step, with a deep history.

A move or a resize snapshots once per gesture (not per pixel), identical
snapshots are skipped so plain clicks don't fill the stack, and the history
keeps up to 100 steps.
"""
import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtCore import QEvent, QPointF, Qt
from PySide6.QtWidgets import QApplication, QGraphicsSceneMouseEvent

from notevault_app.core import canvas_format as cf
from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService
from notevault_app.ui.components.notes.canvas.view import CanvasView

_app = QApplication.instance() or QApplication([])


class TestCanvasUndo(unittest.TestCase):
    def setUp(self):
        root = Path(tempfile.mkdtemp()) / "vault"
        root.mkdir()
        vm = VaultManager(root)
        self.view = CanvasView(vm, NotesService(vm))
        self.view.resize(800, 600)
        cv = root / "b.canvas"
        cv.write_text('{"nodes":[],"edges":[]}', encoding="utf-8")
        self.view.load(cv)
        self.item = self.view.add_text_node(QPointF(0, 0))   # a card to drag

    def test_dedup_skips_identical(self):
        self.view._undo_stack.clear()
        self.view.push_undo()
        n = len(self.view._undo_stack)
        self.view.push_undo()                # nothing changed
        self.assertEqual(len(self.view._undo_stack), n)

    def test_history_cap_is_100(self):
        self.view._undo_stack.clear()
        for i in range(130):
            self.view._doc.nodes.append(cf.CanvasNode(id=cf.new_id(), type="text",
                                                      text=str(i)))
            self.view.push_undo()
        self.assertLessEqual(len(self.view._undo_stack), self.view.UNDO_LIMIT)

    def test_drag_is_one_undo_step(self):
        before = len(self.view._undo_stack)
        press = QGraphicsSceneMouseEvent(QEvent.GraphicsSceneMousePress)
        press.setButton(Qt.LeftButton)
        press.setPos(QPointF(120, 40))           # card interior → move
        press.setScenePos(QPointF(120, 40))
        self.item.mousePressEvent(press)
        for dx in (10, 20, 30):                   # several move events, one gesture
            mv = QGraphicsSceneMouseEvent(QEvent.GraphicsSceneMouseMove)
            mv.setButtons(Qt.LeftButton)
            mv.setScenePos(QPointF(120 + dx, 40))
            self.item.mouseMoveEvent(mv)
        self.assertEqual(len(self.view._undo_stack), before + 1)

    def test_center_on_content_uses_bounds(self):
        # add a node far from origin, then centre
        self.view.add_text_node(QPointF(1000, 800))
        self.view.center_on_content()
        c = self.view.mapToScene(self.view.viewport().rect().center())
        bounds = self.view._scene.itemsBoundingRect().center()
        self.assertAlmostEqual(c.x(), bounds.x(), delta=60)
        self.assertAlmostEqual(c.y(), bounds.y(), delta=60)


if __name__ == "__main__":
    unittest.main()
