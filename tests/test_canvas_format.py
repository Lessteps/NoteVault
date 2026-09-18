"""Tests for the .canvas file format (Obsidian-compatible + nv extensions)."""

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from notevault_app.core import canvas_format as cf


class TestCanvasFormat(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_canvas_"))

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_empty_roundtrip(self):
        p = self.dir / "a.canvas"
        cf.create_empty(p)
        doc = cf.load(p)
        self.assertEqual(doc.nodes, [])
        self.assertEqual(doc.edges, [])

    def test_missing_reads_empty(self):
        doc = cf.load(self.dir / "ghost.canvas")
        self.assertEqual(doc.nodes, [])

    def test_node_roundtrip(self):
        doc = cf.CanvasDoc(nodes=[
            cf.CanvasNode(id="n1", type="text", x=10, y=20, width=200,
                          height=80, text="hola", color="3"),
            cf.CanvasNode(id="n2", type="file", x=300, y=0, file="Nota.md"),
        ], edges=[
            cf.CanvasEdge(id="e1", fromNode="n1", toNode="n2", label="link"),
        ])
        p = self.dir / "b.canvas"
        cf.dump(p, doc)
        got = cf.load(p)
        self.assertEqual(len(got.nodes), 2)
        self.assertEqual(got.nodes[0].text, "hola")
        self.assertEqual(got.nodes[0].color, "3")
        self.assertEqual(got.nodes[1].file, "Nota.md")
        self.assertEqual(got.edges[0].label, "link")
        self.assertEqual(got.edges[0].fromNode, "n1")

    def test_obsidian_compatible_keys(self):
        # A standard text+file canvas must serialise with only standard keys,
        # so Obsidian can still open it.
        doc = cf.CanvasDoc(nodes=[
            cf.CanvasNode(id="n1", type="text", text="x"),
            cf.CanvasNode(id="n2", type="file", file="F.md"),
        ], edges=[cf.CanvasEdge(id="e1", fromNode="n1", toNode="n2")])
        p = self.dir / "c.canvas"
        cf.dump(p, doc)
        raw = json.loads(p.read_text(encoding="utf-8"))
        self.assertEqual(set(raw.keys()), {"nodes", "edges"})
        for n in raw["nodes"]:
            self.assertNotIn("nv", n)
        for n in raw["nodes"]:
            self.assertIn("id", n)
            self.assertIn("type", n)

    def test_nv_extension_preserved(self):
        doc = cf.CanvasDoc(nodes=[
            cf.CanvasNode(id="s1", type="nv-shape", text="Inicio",
                          nv={"shape": "start_end"}),
        ])
        p = self.dir / "d.canvas"
        cf.dump(p, doc)
        got = cf.load(p)
        self.assertEqual(got.nodes[0].nv.get("shape"), "start_end")
        self.assertEqual(got.nodes[0].text, "Inicio")

    def test_corrupt_reads_empty(self):
        p = self.dir / "bad.canvas"
        p.write_text("{ not json", encoding="utf-8")
        doc = cf.load(p)
        self.assertEqual(doc.nodes, [])

    def test_kind_for_canvas(self):
        from notevault_app.core.file_kinds import kind_for
        self.assertEqual(kind_for("board.canvas"), "canvas")
        self.assertEqual(kind_for("note.md"), "note")


if __name__ == "__main__":
    unittest.main()
