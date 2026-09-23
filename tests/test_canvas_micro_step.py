"""Micro-steps in the current standard: header → How-to → Example output,
inside their own group, with every arrow labelled."""
import tempfile
import unittest
from pathlib import Path

from notevault_app.core import canvas_format as cf
from notevault_app.core import canvas_methodology as cm

HOWTO = cm.howto_note(
    ["Take each unit in order.", "Ask the 4 role questions."],
    "Unit | Question Satisfied | Assigned Role",
    "One row per unit of 1.1.1.",
    ["One role per unit.", "Do not purify yet (R3 applies)."],
    "Every unit has exactly one role.")


def _overlap(a, b):
    return a.x < b.x + b.width and b.x < a.x + a.width and a.y < b.y + b.height and b.y < a.y + a.height


class TestMicroStep(unittest.TestCase):
    def setUp(self):
        self.path = Path(tempfile.mkdtemp()) / "m.canvas"
        sub = cf.CanvasNode(id="sub", type="group", x=0, y=0, width=500, height=300,
                            label="Step 1.1 — Lexical Extraction")
        raw = cf.CanvasNode(id="raw", type="text", x=40, y=80, width=250, height=100,
                            text="## Raw Data Extracted from Inputs")
        cf.dump(self.path, cf.CanvasDoc(nodes=[sub, raw]))

    def test_howto_has_the_four_sections(self):
        for section in ("### How to do it", "### How to build the table",
                        "### Restrictions", "### Done when"):
            self.assertIn(section, HOWTO)
        self.assertIn("`Unit | Question Satisfied | Assigned Role`", HOWTO)

    def test_block_structure_and_labels(self):
        r = cm.add_micro_step(self.path, "raw", "1.1.1", "Segmentation", "Cut the narrative.",
                              HOWTO, "Narrative Units Table", "| U | Q |\n|---|---|\n| U1 | a |",
                              "start 1.1.1", parent_group_id="sub")
        doc = cf.load(self.path)
        g, h, t, e = (doc.node_by_id(r[k]) for k in ("group_id", "header_id", "howto_id", "example_id"))
        self.assertEqual(g.label, "1.1.1 — Segmentation")
        self.assertTrue(h.text.startswith("## 1.1.1 — Segmentation"))
        self.assertTrue(e.text.startswith("#### Example output — Narrative Units Table"))
        self.assertLess(h.x, t.x)
        self.assertLess(t.x, e.x)
        for n in (h, t, e):                                   # inside its group
            self.assertTrue(g.x <= n.x and n.x + n.width <= g.x + g.width)
            self.assertTrue(g.y <= n.y and n.y + n.height <= g.y + g.height)
        self.assertFalse(_overlap(h, t) or _overlap(t, e))
        labels = {(x.fromNode, x.toNode): x.label for x in doc.edges}
        self.assertEqual(labels[(h.id, t.id)], "how to execute")
        self.assertEqual(labels[(t.id, e.id)], "produces (example)")
        self.assertEqual(labels[("raw", h.id)], "start 1.1.1")
        sub = doc.node_by_id("sub")                            # parent grew
        self.assertGreaterEqual(sub.x + sub.width, g.x + g.width)

    def test_chain_places_next_block_right_of_previous_group(self):
        common = dict(objective="o", how_to=HOWTO, example_title="T",
                      example_markdown="| a |\n|---|\n| 1 |")
        r = cm.add_micro_steps(self.path, "raw", [
            dict(code="1.1.1", title="A", link_label="start 1.1.1", **common),
            dict(code="1.1.2", title="B", link_label="U1–U7 interrogated", **common),
        ], parent_group_id="sub")
        doc = cf.load(self.path)
        g1, g2 = doc.node_by_id(r[0]["group_id"]), doc.node_by_id(r[1]["group_id"])
        self.assertGreater(g2.x, g1.x + g1.width + 100)        # room for the link label
        self.assertFalse(_overlap(g1, g2))
        link = next(x for x in doc.edges if x.toNode == r[1]["header_id"])
        self.assertEqual((link.fromNode, link.label), (r[0]["example_id"], "U1–U7 interrogated"))


class TestStepGroupGrows(unittest.TestCase):
    """Adding micro-steps must grow the Step around the sub-step too; a Step
    left small is cut through by its own sub-steps."""

    def test_ancestors_contain_new_blocks(self):
        import json
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
        from check_canvas_groups import check
        path = Path(tempfile.mkdtemp()) / "s.canvas"
        step = cf.CanvasNode(id="st", type="group", x=0, y=0, width=700, height=400, label="Step 1 — A")
        sub = cf.CanvasNode(id="sub", type="group", x=20, y=40, width=600, height=300, label="Step 1.1 — B")
        raw = cf.CanvasNode(id="raw", type="text", x=40, y=100, width=200, height=80, text="## Raw Data")
        cf.dump(path, cf.CanvasDoc(nodes=[step, sub, raw]))
        common = dict(objective="o", how_to=HOWTO, example_title="T", example_markdown="| a |\n|---|\n| 1 |")
        cm.add_micro_steps(path, "raw", [dict(code="1.1.1", title="A", **common),
                                         dict(code="1.1.2", title="B", **common)],
                           parent_group_id="sub")
        data = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(check(data), [])


if __name__ == "__main__":
    unittest.main()
