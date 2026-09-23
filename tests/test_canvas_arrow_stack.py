"""Arrow keys fan text cards out of the selected node.

Every card links back to the selected node (not to each other); cards on the
same side stack perpendicular to the arrow (→ repeatedly = a column of cards to
the right). The selected node stays selected the whole time. The slot index is
read from the node's live edges, so deleting a card frees its slot with no
stored history.
"""
import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtCore import QEvent, QPointF, Qt
from PySide6.QtGui import QKeyEvent
from PySide6.QtWidgets import QApplication

from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService
from notevault_app.ui.components.notes.canvas.view import CanvasView

_app = QApplication.instance() or QApplication([])


class TestCanvasArrowFan(unittest.TestCase):
    def setUp(self):
        root = Path(tempfile.mkdtemp()) / "vault"
        root.mkdir()
        vm = VaultManager(root)
        self.view = CanvasView(vm, NotesService(vm))
        self.view.resize(800, 600)
        cv = root / "board.canvas"
        cv.write_text('{"nodes":[],"edges":[]}', encoding="utf-8")
        self.view.load(cv)

    def _press(self, key):
        self.view.keyPressEvent(QKeyEvent(QEvent.KeyPress, key, Qt.NoModifier))

    def _texts(self):
        return [n for n in self.view._doc.nodes if n.type == "text"]

    def _anchor(self):
        # A fixed anchor card, selected.
        a = self.view.add_text_node(QPointF(0, 0))
        return a.node

    def test_seed_when_nothing_selected(self):
        self._press(Qt.Key_Down)
        self.assertEqual(len(self._texts()), 1)
        self.assertEqual(len(self.view._doc.edges), 0)

    def test_right_fans_into_a_vertical_column_linked_to_anchor(self):
        a = self._anchor()
        for _ in range(3):
            self._press(Qt.Key_Right)
        cards = [n for n in self._texts() if n.id != a.id]
        self.assertEqual(len(cards), 3)
        # all to the right of the anchor, one column (same x), stacked down
        self.assertTrue(all(c.x > a.x + a.width - 1 for c in cards))
        self.assertEqual(len({round(c.x) for c in cards}), 1)
        ys = sorted(c.y for c in cards)
        for lo, hi in zip(ys, ys[1:]):
            self.assertGreater(hi, lo)
        # every edge comes FROM the anchor's right side (fan-out, not a chain)
        self.assertEqual(len(self.view._doc.edges), 3)
        self.assertTrue(all(e.fromNode == a.id and e.fromSide == "right"
                            for e in self.view._doc.edges))

    def test_down_fans_into_a_horizontal_row(self):
        a = self._anchor()
        for _ in range(3):
            self._press(Qt.Key_Down)
        cards = [n for n in self._texts() if n.id != a.id]
        self.assertTrue(all(c.y > a.y + a.height - 1 for c in cards))
        self.assertEqual(len({round(c.y) for c in cards}), 1)   # one row
        self.assertTrue(all(e.fromSide == "bottom" for e in self.view._doc.edges))

    def test_anchor_stays_selected(self):
        a = self._anchor()
        for _ in range(3):
            self._press(Qt.Key_Right)
        selected = [n.id for n in self.view._doc.nodes
                    if self.view._items[n.id].isSelected()]
        self.assertEqual(selected, [a.id])

    def test_deleting_a_card_frees_its_slot(self):
        a = self._anchor()
        for _ in range(2):
            self._press(Qt.Key_Right)          # two cards, slots 0 and 1
        last = [n for n in self._texts() if n.id != a.id][-1]
        self.view._scene.clearSelection()
        self.view._items[last.id].setSelected(True)
        self.view._delete_selected()           # removes that card and its edge
        # The node now has one right-edge; the next arrow refills the freed slot
        # instead of remembering the old count — no stale history.
        self.view._scene.clearSelection()
        self.view._items[a.id].setSelected(True)
        self._press(Qt.Key_Right)
        right_edges = [e for e in self.view._doc.edges
                       if e.fromNode == a.id and e.fromSide == "right"]
        self.assertEqual(len(right_edges), 2)


if __name__ == "__main__":
    unittest.main()
