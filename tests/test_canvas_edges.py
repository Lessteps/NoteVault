"""Tests for canvas edges / connection lines (Fase C3)."""

import shutil
import tempfile
import unittest
from pathlib import Path

from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QPointF

from notevault_app.core import canvas_format as cf
from notevault_app.ui.components.notes.canvas import CanvasView
from notevault_app.ui.components.notes.canvas.edges import EdgeItem
from notevault_app.ui.components.notes.canvas.items import TextNodeItem

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])


class TestCanvasEdges(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_edges_"))
        self.path = self.dir / "test.canvas"
        cf.create_empty(self.path)
        self.view = CanvasView()
        self.view.load(self.path)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_add_edge_persists(self):
        n1 = self.view.add_text_node(QPointF(0, 0), "Origen")
        n2 = self.view.add_text_node(QPointF(300, 0), "Destino")
        edge_item = self.view.add_edge(
            n1.node.id, n2.node.id,
            from_side="right", to_side="left",
            label="depende de", color="3", style="dashed", routing="straight"
        )
        self.assertIsNotNone(edge_item)
        self.assertEqual(len(self.view._doc.edges), 1)
        self.assertEqual(len(self.view._edge_items), 1)

        self.view.flush()
        doc = cf.load(self.path)
        self.assertEqual(len(doc.edges), 1)
        e = doc.edges[0]
        self.assertEqual(e.fromNode, n1.node.id)
        self.assertEqual(e.toNode, n2.node.id)
        self.assertEqual(e.label, "depende de")
        self.assertEqual(e.color, "3")
        self.assertEqual(e.nv.get("style"), "dashed")
        self.assertEqual(e.nv.get("routing"), "straight")

    def test_edge_reroutes_on_node_move(self):
        n1 = self.view.add_text_node(QPointF(0, 0), "A")
        n2 = self.view.add_text_node(QPointF(200, 0), "B")
        edge_item = self.view.add_edge(n1.node.id, n2.node.id, from_side="right", to_side="left")
        p1_before = QPointF(edge_item._p1)

        # Move node A
        n1.setPos(100, 150)
        p1_after = edge_item._p1
        self.assertNotEqual(p1_before, p1_after)
        self.assertAlmostEqual(p1_after.x(), 100 + n1.node.width, delta=2)
        self.assertAlmostEqual(p1_after.y(), 150 + n1.node.height / 2, delta=2)

    def test_edge_routing_types(self):
        node_a = cf.CanvasNode(id="na", type="text", x=0, y=0, width=100, height=50)
        node_b = cf.CanvasNode(id="nb", type="text", x=200, y=200, width=100, height=50)
        item_a = TextNodeItem(node_a)
        item_b = TextNodeItem(node_b)

        # Bezier
        edge_bez = cf.CanvasEdge(id="e1", fromNode="na", toNode="nb", nv={"routing": "bezier"})
        item_bez = EdgeItem(edge_bez, item_a, item_b)
        self.assertFalse(item_bez.path().isEmpty())

        # Straight
        edge_str = cf.CanvasEdge(id="e2", fromNode="na", toNode="nb", nv={"routing": "straight"})
        item_str = EdgeItem(edge_str, item_a, item_b)
        self.assertFalse(item_str.path().isEmpty())

        # Orthogonal
        edge_ortho = cf.CanvasEdge(id="e3", fromNode="na", toNode="nb", nv={"routing": "orthogonal"})
        item_ortho = EdgeItem(edge_ortho, item_a, item_b)
        self.assertFalse(item_ortho.path().isEmpty())

    def test_delete_selected_edge(self):
        n1 = self.view.add_text_node(QPointF(0, 0), "A")
        n2 = self.view.add_text_node(QPointF(200, 0), "B")
        edge_item = self.view.add_edge(n1.node.id, n2.node.id)

        self.view._scene.clearSelection()
        edge_item.setSelected(True)
        self.view._delete_selected()

        self.assertEqual(len(self.view._doc.edges), 0)
        self.assertEqual(len(self.view._edge_items), 0)
        self.assertEqual(len(self.view._doc.nodes), 2)

    def test_delete_node_cascades_edge(self):
        n1 = self.view.add_text_node(QPointF(0, 0), "A")
        n2 = self.view.add_text_node(QPointF(200, 0), "B")
        self.view.add_edge(n1.node.id, n2.node.id)

        self.view._scene.clearSelection()
        n1.setSelected(True)
        self.view._delete_selected()

        self.assertEqual(len(self.view._doc.nodes), 1)
        self.assertEqual(len(self.view._doc.edges), 0)
        self.assertEqual(len(self.view._edge_items), 0)

    def test_reload_rebuilds_edges(self):
        doc = cf.CanvasDoc(
            nodes=[
                cf.CanvasNode(id="n1", type="text", x=0, y=0, width=100, height=50),
                cf.CanvasNode(id="n2", type="text", x=300, y=0, width=100, height=50),
            ],
            edges=[
                cf.CanvasEdge(id="e1", fromNode="n1", toNode="n2", label="enlace")
            ]
        )
        cf.dump(self.path, doc)
        self.view.load(self.path)

        self.assertEqual(len(self.view._items), 2)
        self.assertEqual(len(self.view._edge_items), 1)
        self.assertEqual(self.view._edge_items["e1"].edge.label, "enlace")


if __name__ == "__main__":
    unittest.main()
