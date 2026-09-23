"""Deterministic replication of a methodology sub-step onto a canvas."""
import tempfile
import unittest
from pathlib import Path

from notevault_app.core import canvas_format as cf
from notevault_app.core import canvas_methodology as cm


class TestSubstepBlock(unittest.TestCase):
    def setUp(self):
        self.path = Path(tempfile.mkdtemp()) / "b.canvas"
        anchor = cf.CanvasNode(id="anchor", type="text", x=100, y=100,
                               width=300, height=150, text="## 1.1.1 — Seg")
        cf.dump(self.path, cf.CanvasDoc(nodes=[anchor]))

    def test_block_adds_three_nodes_and_edges(self):
        res = cm.add_substep_block(
            self.path, "anchor", "1.1.2", "Heuristic interrogation",
            "Assign each unit to a role.", "Subject each unit to four questions.",
            "Role Assignment Table (Unit | Question | Role)")
        doc = cf.load(self.path)
        self.assertEqual(len(doc.nodes), 4)          # anchor + 3
        self.assertEqual(len(doc.edges), 3)          # anchor→sub, sub→op, sub→out
        sub = doc.node_by_id(res["substep_id"])
        self.assertTrue(sub.text.startswith("## 1.1.2 — Heuristic interrogation"))
        out = doc.node_by_id(res["output_id"])
        self.assertTrue(out.text.startswith("Partial output: Role Assignment"))

    def test_block_hangs_under_anchor(self):
        res = cm.add_substep_block(self.path, "anchor", "1.1.2", "t",
                                   "o", "op", "po")
        doc = cf.load(self.path)
        anchor = doc.node_by_id("anchor")
        sub = doc.node_by_id(res["substep_id"])
        self.assertGreater(sub.y, anchor.y + anchor.height)   # below
        self.assertAlmostEqual(sub.x, anchor.x, delta=1)       # same column

    def test_chain_links_each_under_previous(self):
        results = cm.add_substeps(self.path, "anchor", [
            {"code": "1.1.2", "title": "a", "objective": "o", "operation": "p", "partial_output": "x"},
            {"code": "1.1.3", "title": "b", "objective": "o", "operation": "p", "partial_output": "y"},
        ])
        doc = cf.load(self.path)
        s2 = doc.node_by_id(results[0]["substep_id"])
        s3 = doc.node_by_id(results[1]["substep_id"])
        self.assertGreater(s3.y, s2.y)               # 1.1.3 below 1.1.2
        # there is an edge from s2 to s3
        self.assertTrue(any(e.fromNode == s2.id and e.toNode == s3.id
                            for e in doc.edges))

    def test_horizontal_chain_with_tables(self):
        table_md = "| A | B |\n|---|---|\n| 1 | 2 |"
        res = cm.add_substeps(self.path, "anchor", [
            {"code": "1.1.2", "title": "t2", "objective": "o2", "operation": "op2",
             "partial_output": "out2", "table_markdown": table_md},
            {"code": "1.1.3", "title": "t3", "objective": "o3", "operation": "op3",
             "partial_output": "out3", "table_markdown": table_md},
        ])
        doc = cf.load(self.path)
        # 1 anchor + 2 * (sub + op + out + table) = 1 + 8 = 9 nodes
        self.assertEqual(len(doc.nodes), 9)
        t2_id = res[0]["table_id"]
        s3_id = res[1]["substep_id"]
        # There should be an edge from Table 1.1.2 right to Substep 1.1.3 left
        self.assertTrue(any(e.fromNode == t2_id and e.toNode == s3_id and
                            e.fromSide == "right" and e.toSide == "left"
                            for e in doc.edges))


if __name__ == "__main__":
    unittest.main()
