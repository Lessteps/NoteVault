"""A deliverable canvas built from a JSON spec follows the reference standard:
groups nest by number, every arrow is labelled and readable, nothing overlaps."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from check_canvas_groups import check  # noqa: E402
from notevault_app.core import canvas_format as cf  # noqa: E402
from notevault_app.core.deliverable_canvas import build  # noqa: E402


def _micro(code, link):
    return {"code": code, "title": f"Title {code}", "objective": "Do one thing.",
            "how_to": {"steps": ["Read the input.", "Mark each match."],
                       "table_columns": "Element | Verdict", "table_rules": "One row per element.",
                       "restrictions": ["No new facts (R3)."], "done_when": "4 verdicts."},
            "example_title": "Example Table",
            "example": "| Element | Verdict |\n|---|---|\n| Actor | `CLEAN` |",
            "link_label": link}


SPEC = {
    "phase": "Phase 0", "deliverable_code": "D2", "deliverable": "Problem Classification",
    "purpose": "Classify the problem.", "inputs": "- D1 Problem Statement",
    "steps": [
        {"code": "1", "title": "First", "summary": "s", "substeps": [
            {"code": "1.1", "title": "A", "objective": "o", "input": "- x", "raw_data": "- y",
             "exit_label": "COMPLETE → 1.2",
             "micro": [_micro("1.1.1", "units go to 1.1.2"), _micro("1.1.2", "")]},
            {"code": "1.2", "title": "B", "objective": "o", "input": "- x", "raw_data": "- y",
             "exit_label": "APPROVED → Step 2",
             "micro": [_micro("1.2.1", "")]},
        ]},
        {"code": "2", "title": "Second", "summary": "s", "substeps": [
            {"code": "2.1", "title": "C", "objective": "o", "input": "- x", "raw_data": "- y",
             "exit_label": "PUBLISHABLE → final",
             "micro": [_micro("2.1.1", "")]},
        ]},
    ],
    "final": {"title": "Final Deliverable — 02. Problem Classification.md", "markdown": "# D2"},
}


def _overlap(a, b):
    return a.x < b.x + b.width and b.x < a.x + a.width and a.y < b.y + b.height and b.y < a.y + a.height


class TestDeliverableCanvas(unittest.TestCase):
    def setUp(self):
        self.doc = build(SPEC)

    def test_groups_nest_by_number(self):
        data = {"nodes": [n.to_dict() for n in self.doc.nodes]}
        self.assertEqual(check(data), [])

    def test_every_arrow_labelled_and_chain_complete(self):
        self.assertTrue(all(e.label for e in self.doc.edges if
                            e.label is not None and e.label != ""))
        by_text = {n.id: n.text for n in self.doc.nodes}
        labels = [e.label for e in self.doc.edges]
        for needed in ("how to execute", "produces (example)", "consumes", "extract the raw data",
                       "start 1.1.1", "units go to 1.1.2", "COMPLETE → 1.2", "APPROVED → Step 2",
                       "PUBLISHABLE → final", "sub-step 2.1"):
            self.assertIn(needed, labels)
        self.assertTrue(any(by_text[e.toNode].startswith("# D2") for e in self.doc.edges))

    def test_no_notes_overlap(self):
        notes = [n for n in self.doc.nodes if n.type != "group"]
        for i, a in enumerate(notes):
            for b in notes[i + 1:]:
                self.assertFalse(_overlap(a, b), (a.text[:30], b.text[:30]))

    def test_cli_and_spacing_tool_agree(self):
        tmp = Path(tempfile.mkdtemp())
        spec, out = tmp / "s.json", tmp / "d2.canvas"
        spec.write_text(json.dumps(SPEC), encoding="utf-8")
        subprocess.run([sys.executable, "-m", "notevault_app.core.deliverable_canvas",
                        str(spec), str(out)], cwd=ROOT, check=True, capture_output=True)
        before = out.read_text(encoding="utf-8")
        res = subprocess.run([sys.executable, str(ROOT / "tools" / "space_canvas_labels.py"),
                              str(out), str(tmp / "spaced.canvas")],
                             cwd=ROOT, check=True, capture_output=True, text=True, encoding="utf-8")
        self.assertIn("still tight: 0", res.stdout)
        self.assertTrue(cf.load(out).nodes and before)


if __name__ == "__main__":
    unittest.main()
