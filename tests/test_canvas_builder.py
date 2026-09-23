"""Concept-map generator: a coordinate-free spec compiles to a valid .canvas.

Pure-core, no Qt. Checks validation, sizing, every layout (no overlaps, valid
edges, correct sides), round-trip through canvas_format, and a golden sample.
"""
import math
import tempfile
import unittest
from itertools import combinations
from pathlib import Path

from notevault_app.core import canvas_builder as cb
from notevault_app.core import canvas_format as cf


def _overlap(a: cf.CanvasNode, b: cf.CanvasNode, eps: float = 1.0) -> bool:
    return not (a.x + a.width <= b.x + eps or b.x + b.width <= a.x + eps
                or a.y + a.height <= b.y + eps or b.y + b.height <= a.y + eps)


def _no_overlaps(doc: cf.CanvasDoc):
    return not any(_overlap(a, b) for a, b in combinations(doc.nodes, 2))


PHASE0 = {
    "layout": "radial",
    "nodes": [
        {"id": "center", "title": "Problem Statement", "role": "root", "color": "6"},
        {"id": "who", "title": "Affected Group", "body": "Who suffers the failure."},
        {"id": "when", "title": "Condition / Trigger"},
        {"id": "what", "title": "Observable Consequence"},
        {"id": "cost", "title": "Downstream Effect"},
    ],
    "edges": [{"from": "center", "to": ["who", "when", "what", "cost"]}],
}


class TestValidation(unittest.TestCase):
    def test_empty_nodes(self):
        self.assertTrue(cb.validate_spec({"nodes": []}))

    def test_duplicate_ids(self):
        errs = cb.validate_spec({"nodes": [{"id": "a"}, {"id": "a"}]})
        self.assertTrue(any("duplicate" in e for e in errs))

    def test_dangling_edge(self):
        errs = cb.validate_spec({"nodes": [{"id": "a"}],
                                 "edges": [{"from": "a", "to": "ghost"}]})
        self.assertTrue(any("ghost" in e for e in errs))

    def test_unknown_layout(self):
        errs = cb.validate_spec({"layout": "spiral", "nodes": [{"id": "a"}]})
        self.assertTrue(any("layout" in e for e in errs))

    def test_note_needs_file(self):
        errs = cb.validate_spec({"nodes": [{"id": "a", "kind": "note"}]})
        self.assertTrue(any("file" in e for e in errs))

    def test_valid_spec(self):
        self.assertEqual(cb.validate_spec(PHASE0), [])

    def test_build_rejects_invalid(self):
        with self.assertRaises(ValueError):
            cb.build_canvas({"nodes": []})


class TestSizingAndCompose(unittest.TestCase):
    def test_title_only_text(self):
        w, h = cb._size_node({"title": "Hi"}, cb.DEFAULT_CARD_W)
        self.assertEqual(cb._compose_text("Hi", ""), "# Hi")
        self.assertGreaterEqual(h, 70)

    def test_long_body_is_taller(self):
        short = cb._size_node({"title": "T", "body": "x"}, 240)[1]
        long = cb._size_node({"title": "T", "body": "y" * 600}, 240)[1]
        self.assertGreater(long, short)
        self.assertLessEqual(long, 360)

    def test_title_and_body_compose(self):
        self.assertEqual(cb._compose_text("T", "B"), "# T\n\nB")


class TestLayouts(unittest.TestCase):
    def _spec(self, layout, n=5):
        return {"layout": layout,
                "nodes": [{"id": f"n{i}", "title": f"N{i}"} for i in range(n)],
                "edges": [{"from": "n0", "to": [f"n{i}" for i in range(1, n)]}]}

    def test_column_aligned_no_overlap(self):
        doc = cb.build_canvas(self._spec("column"))
        self.assertEqual(len({round(n.x) for n in doc.nodes}), 1)  # one column
        self.assertTrue(_no_overlaps(doc))

    def test_row_aligned_no_overlap(self):
        doc = cb.build_canvas(self._spec("row"))
        self.assertEqual(len({round(n.y) for n in doc.nodes}), 1)  # one row
        self.assertTrue(_no_overlaps(doc))

    def test_grid_columns_and_no_overlap(self):
        doc = cb.build_canvas(self._spec("grid", n=9))
        xs = sorted({round(n.x) for n in doc.nodes})
        self.assertEqual(len(xs), math.ceil(math.sqrt(9)))
        self.assertTrue(_no_overlaps(doc))

    def test_tree_root_on_top_no_overlap(self):
        doc = cb.build_canvas(self._spec("tree"))
        top = min(n.y for n in doc.nodes)
        # root (n0) sits on the shallowest rank
        self.assertEqual(doc.nodes[0].y, top)
        self.assertTrue(_no_overlaps(doc))

    def test_radial_root_centered_no_overlap(self):
        doc = cb.build_canvas(self._spec("radial"))
        root = doc.nodes[0]
        self.assertAlmostEqual(root.x + root.width / 2, 0.0, delta=0.5)
        self.assertAlmostEqual(root.y + root.height / 2, 0.0, delta=0.5)
        self.assertTrue(_no_overlaps(doc))

    def test_edges_reference_real_nodes_and_sides(self):
        doc = cb.build_canvas(self._spec("row"))
        ids = {n.id for n in doc.nodes}
        for e in doc.edges:
            self.assertIn(e.fromNode, ids)
            self.assertIn(e.toNode, ids)
            self.assertIn(e.fromSide, ("top", "right", "bottom", "left"))
            self.assertIn(e.toSide, ("top", "right", "bottom", "left"))


class TestRoundTripAndGolden(unittest.TestCase):
    def test_roundtrip_through_canvas_format(self):
        doc = cb.build_canvas(PHASE0)
        d = Path(tempfile.mkdtemp()) / "m.canvas"
        cb.write_canvas(d, PHASE0)
        loaded = cf.load(d)
        self.assertEqual(len(loaded.nodes), len(doc.nodes))
        self.assertEqual(len(loaded.edges), len(doc.edges))

    def test_golden_phase0(self):
        doc = cb.build_canvas(PHASE0)
        self.assertEqual(len(doc.nodes), 5)
        self.assertEqual(len(doc.edges), 4)          # fan-out expands to four
        self.assertTrue(_no_overlaps(doc))
        # the root card renders as a heading
        root = doc.nodes[0]
        self.assertTrue(root.text.startswith("# Problem Statement"))

    def test_note_and_shape_kinds(self):
        spec = {"layout": "row", "nodes": [
            {"id": "a", "kind": "note", "file": "Nota.md"},
            {"id": "b", "kind": "shape", "title": "Decide", "shape": "decision"},
        ]}
        doc = cb.build_canvas(spec)
        by = {n.type: n for n in doc.nodes}
        self.assertEqual(by["file"].file, "Nota.md")
        self.assertEqual(by["nv-shape"].nv.get("shape"), "decision")


if __name__ == "__main__":
    unittest.main()
