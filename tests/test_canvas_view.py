"""Offscreen tests for the CanvasView (C0 scaffolding)."""

import shutil
import tempfile
import unittest
from pathlib import Path

from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QPointF

from notevault_app.core import canvas_format as cf
from notevault_app.ui.components.notes.canvas import CanvasView

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])


class TestCanvasView(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_cv_"))
        self.path = self.dir / "board.canvas"
        cf.create_empty(self.path)
        self.view = CanvasView()

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_load_empty(self):
        self.view.load(self.path)
        self.assertEqual(self.view.current_path(), self.path)
        self.assertEqual(len(self.view._items), 0)

    def test_add_text_node_persists(self):
        self.view.load(self.path)
        item = self.view.add_text_node(QPointF(100, 120), "hola")
        self.assertEqual(len(self.view._doc.nodes), 1)
        self.view.flush()
        got = cf.load(self.path)
        self.assertEqual(len(got.nodes), 1)
        self.assertEqual(got.nodes[0].text, "hola")
        self.assertAlmostEqual(got.nodes[0].x, 100, delta=1)

    def test_move_node_updates_model(self):
        self.view.load(self.path)
        item = self.view.add_text_node(QPointF(0, 0), "x")
        item.setPos(250, 300)
        self.assertAlmostEqual(item.node.x, 250, delta=1)
        self.assertAlmostEqual(item.node.y, 300, delta=1)

    def test_reload_renders_nodes(self):
        doc = cf.CanvasDoc(nodes=[
            cf.CanvasNode(id="n1", type="text", x=0, y=0, text="uno"),
            cf.CanvasNode(id="n2", type="text", x=300, y=0, text="dos"),
        ])
        cf.dump(self.path, doc)
        self.view.load(self.path)
        self.assertEqual(len(self.view._items), 2)

    def test_delete_selected(self):
        self.view.load(self.path)
        item = self.view.add_text_node(QPointF(0, 0), "x")
        item.setSelected(True)
        self.view._delete_selected()
        self.assertEqual(len(self.view._doc.nodes), 0)


if __name__ == "__main__":
    unittest.main()
