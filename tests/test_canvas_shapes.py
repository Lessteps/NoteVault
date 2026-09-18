"""Tests for canvas flowchart shapes (Fase C4)."""

import shutil
import tempfile
import unittest
from pathlib import Path

from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QPointF

from notevault_app.core import canvas_format as cf
from notevault_app.ui.components.notes.canvas import CanvasView
from notevault_app.ui.components.notes.canvas.items import ShapeNodeItem
from notevault_app.ui.components.notes.canvas.shapes import (
    SHAPE_INFO, shape_path, shape_internal_paths
)

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])


class TestCanvasShapes(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_shapes_"))
        self.path = self.dir / "diagram.canvas"
        cf.create_empty(self.path)
        self.view = CanvasView()
        self.view.load(self.path)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_all_10_shape_paths_generate(self):
        for kind in cf.SHAPE_KINDS:
            p = shape_path(kind, 160.0, 60.0)
            self.assertFalse(p.isEmpty(), f"Path for {kind} should not be empty")
            rect = p.boundingRect()
            self.assertGreater(rect.width(), 0)
            self.assertGreater(rect.height(), 0)
            internals = shape_internal_paths(kind, 160.0, 60.0)
            self.assertIsInstance(internals, list)

    def test_add_shape_node_persists(self):
        item = self.view.add_shape_node("decision", QPointF(100, 150), "¿Condición?")
        self.assertIsInstance(item, ShapeNodeItem)
        self.assertEqual(item.node.type, "nv-shape")
        self.assertEqual(item.node.nv.get("shape"), "decision")
        self.assertEqual(item.node.text, "¿Condición?")

        self.view.flush()
        doc = cf.load(self.path)
        self.assertEqual(len(doc.nodes), 1)
        n = doc.nodes[0]
        self.assertEqual(n.type, "nv-shape")
        self.assertEqual(n.nv.get("shape"), "decision")
        self.assertEqual(n.text, "¿Condición?")

    def test_connect_shapes_with_edge(self):
        s1 = self.view.add_shape_node("start_end", QPointF(0, 0), "Inicio")
        s2 = self.view.add_shape_node("process", QPointF(200, 100), "Calcular")
        edge = self.view.add_edge(s1.node.id, s2.node.id, from_side="bottom", to_side="top")

        self.assertIsNotNone(edge)
        self.assertEqual(len(self.view._doc.edges), 1)
        p1_orig = QPointF(edge._p1)

        # Moving s1 should reroute edge
        s1.setPos(50, 50)
        self.assertNotEqual(edge._p1, p1_orig)

    def test_all_10_shapes_render_in_view(self):
        nodes = []
        for i, kind in enumerate(cf.SHAPE_KINDS):
            nodes.append(cf.CanvasNode(
                id=f"sh_{i}",
                type="nv-shape",
                x=i * 50.0,
                y=i * 50.0,
                width=160.0,
                height=60.0,
                text=SHAPE_INFO[kind]["name"],
                nv={"shape": kind}
            ))
        doc = cf.CanvasDoc(nodes=nodes)
        cf.dump(self.path, doc)

        self.view.load(self.path)
        self.assertEqual(len(self.view._items), 10)
        for it in self.view._items.values():
            self.assertIsInstance(it, ShapeNodeItem)

    def test_shape_in_place_edit(self):
        item = self.view.add_shape_node("database", QPointF(0, 0), "SQL")
        item._begin_edit()
        self.assertTrue(item._editing)
        item._text.setPlainText("PostgreSQL")
        item._end_edit()
        self.assertFalse(item._editing)
        self.assertEqual(item.node.text, "PostgreSQL")


if __name__ == "__main__":
    unittest.main()
