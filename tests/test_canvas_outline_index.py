"""The canvas index (📑) follows the step numbering and never goes stale.

- A group drawn inside another but numbered as a sibling ("4. Final" inside
  "Step 3") is listed at its own level, not as a sub-step.
- With 🔗 on, a group lists only its own cards, never those of sub-groups.
- Renaming or moving a group refreshes the index without reopening.
"""
import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

from notevault_app.core import canvas_format as cf
from notevault_app.core.notes_service import NotesService
from notevault_app.core.vault_manager import VaultManager
from notevault_app.ui.components.notes.canvas.outline import CanvasOutlineWidget
from notevault_app.ui.components.notes.canvas.view import CanvasView

_app = QApplication.instance() or QApplication([])


def _group(gid, label, x, y, w, h):
    return {"id": gid, "type": "group", "label": label, "x": x, "y": y, "width": w, "height": h}


def _text(tid, text, x, y):
    return {"id": tid, "type": "text", "text": text, "x": x, "y": y, "width": 200, "height": 80}


def _tree(outline):
    def walk(item, depth, out):
        out.append(("  " * depth) + item.text(0))
        for i in range(item.childCount()):
            walk(item.child(i), depth + 1, out)
    out = []
    for i in range(outline._tree.topLevelItemCount()):
        walk(outline._tree.topLevelItem(i), 0, out)
    return out


class TestOutlineIndex(unittest.TestCase):
    def setUp(self):
        import json
        root = Path(tempfile.mkdtemp())
        self.path = root / "c.canvas"
        self.path.write_text(json.dumps({"nodes": [
            _group("s3", "Step 3 — Assembly", 0, 0, 2000, 1200),
            _group("s31", "Step 3.1 — Metadata", 50, 50, 800, 400),
            _group("s32", "Step 3.2 — Table", 50, 500, 800, 400),
            _group("fin", "4. Final Deliverable", 1000, 600, 900, 500),
            _group("s2", "Step 2 — Scope", 0, -1500, 900, 900),
            _text("a", "## 3.1.1 — Collect", 100, 100),
            _text("b", "Partial output: fields", 400, 100),
            _text("c", "## Step 3 header", 60, 1000),
        ], "edges": [
            {"id": "e1", "fromNode": "a", "toNode": "b", "label": "produces"},
            {"id": "e2", "fromNode": "c", "toNode": "a"},
        ]}), encoding="utf-8")
        vm = VaultManager(root)
        self.view = CanvasView(vm, NotesService(vm))
        self.view.resize(900, 600)
        self.view.load(self.path)
        self.outline = self.view.findChildren(CanvasOutlineWidget)[0]

    def tearDown(self):
        self.view.close()
        self.view.deleteLater()
        _app.processEvents()

    def test_numbering_decides_level_and_order(self):
        self.outline.rebuild_index()
        self.assertEqual(_tree(self.outline), [
            "Step 2 — Scope",
            "Step 3 — Assembly",
            "  Step 3.1 — Metadata",
            "  Step 3.2 — Table",
            "4. Final Deliverable",
        ])

    def test_connections_list_only_own_cards_with_edge_labels(self):
        self.outline._show_connections = True
        self.outline.rebuild_index()
        lines = _tree(self.outline)
        i = lines.index("  Step 3.1 — Metadata")
        self.assertEqual(lines[i + 1:i + 4], [
            "    ▸ 3.1.1 — Collect",
            "      ← Step 3 header",
            '      → Partial output: fields — "produces"',
        ])
        # the Step 3 group lists its own header card, not 3.1's cards again
        own = [l for l in lines if l.startswith("  ▸ ")]
        self.assertEqual(own, ["  ▸ Step 3 header"])

    def test_rename_refreshes_without_reopening(self):
        self.outline.rebuild_index()
        item = self.view._items["s32"]
        item.node.label = "Step 3.2 — Anatomy table"
        item.edited.emit()
        QTest.qWait(600)
        self.assertIn("  Step 3.2 — Anatomy table", _tree(self.outline))


if __name__ == "__main__":
    unittest.main()
