"""Tests for canvas freehand drawing (Fase C5)."""

import shutil
import tempfile
import unittest
from pathlib import Path

from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QPointF

from notevault_app.core import canvas_format as cf
from notevault_app.ui.components.notes.canvas import CanvasView
from notevault_app.ui.components.notes.canvas.items import DrawingNodeItem
from notevault_app.ui.components.notes.canvas.drawing import (
    stroke_to_path, calculate_bounds, hit_test_stroke
)

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])


class TestCanvasDrawing(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_drawing_"))
        self.path = self.dir / "sketch.canvas"
        cf.create_empty(self.path)
        self.view = CanvasView()
        self.view.load(self.path)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_stroke_to_path_and_bounds(self):
        pts = [[0.0, 0.0], [50.0, 100.0], [120.0, 40.0]]
        path = stroke_to_path(pts)
        self.assertFalse(path.isEmpty())

        bounds = calculate_bounds([{"points": pts, "width": 4.0}])
        min_x, min_y, max_x, max_y = bounds
        self.assertLess(min_x, 0.0)
        self.assertGreater(max_x, 120.0)

    def test_hit_test_stroke(self):
        stroke = {"points": [[0.0, 0.0], [100.0, 0.0]], "width": 4.0}
        # Point close to the line
        self.assertTrue(hit_test_stroke(stroke, QPointF(50.0, 2.0), threshold=6.0))
        # Point far from the line
        self.assertFalse(hit_test_stroke(stroke, QPointF(50.0, 50.0), threshold=6.0))

    def test_add_drawing_stroke_persists(self):
        pts = [[10.0, 10.0], [60.0, 60.0], [100.0, 20.0]]
        item = self.view.add_drawing_stroke(pts, color="5", width=4.0)

        self.assertIsInstance(item, DrawingNodeItem)
        self.assertEqual(item.node.type, "nv-drawing")
        strokes = item.node.nv.get("strokes", [])
        self.assertEqual(len(strokes), 1)
        self.assertEqual(strokes[0]["color"], "5")
        self.assertEqual(strokes[0]["width"], 4.0)

        self.view.flush()
        doc = cf.load(self.path)
        self.assertEqual(len(doc.nodes), 1)
        n = doc.nodes[0]
        self.assertEqual(n.type, "nv-drawing")
        self.assertEqual(len(n.nv.get("strokes", [])), 1)

    def test_drawing_node_item_remove_stroke(self):
        node = cf.CanvasNode(
            id="d1", type="nv-drawing", x=0, y=0, width=200, height=200,
            nv={"strokes": [
                {"points": [[10.0, 10.0], [50.0, 10.0]], "width": 2.0},
                {"points": [[10.0, 80.0], [50.0, 80.0]], "width": 2.0},
            ]}
        )
        item = DrawingNodeItem(node)
        # Hit first stroke
        hit = item.remove_stroke_at(QPointF(30.0, 10.0))
        self.assertTrue(hit)
        self.assertEqual(len(item.node.nv["strokes"]), 1)
        # Second stroke is untouched
        self.assertAlmostEqual(item.node.nv["strokes"][0]["points"][0][1], 80.0)

    def test_erase_at_removes_node_when_empty(self):
        pts = [[100.0, 100.0], [200.0, 100.0]]
        self.view.add_drawing_stroke(pts, color="1", width=4.0)
        self.assertEqual(len(self.view._items), 1)

        # Erase at the stroke center in view coordinates
        view_pt = self.view.mapFromScene(QPointF(150.0, 100.0))
        self.view._erase_at(view_pt)

        self.assertEqual(len(self.view._doc.nodes), 0)
        self.assertEqual(len(self.view._items), 0)

    def test_reload_drawing_node(self):
        doc = cf.CanvasDoc(nodes=[
            cf.CanvasNode(
                id="d1", type="nv-drawing", x=10, y=20, width=150, height=80,
                nv={"strokes": [{"points": [[0, 0], [50, 50]], "color": "2", "width": 3}]}
            )
        ])
        cf.dump(self.path, doc)
        self.view.load(self.path)

        self.assertEqual(len(self.view._items), 1)
        item = list(self.view._items.values())[0]
        self.assertIsInstance(item, DrawingNodeItem)


if __name__ == "__main__":
    unittest.main()
