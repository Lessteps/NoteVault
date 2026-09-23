"""Alt+click duplicates a card, and a connection snaps to the nearest node.

Alt+click over any card clones it (fresh id, offset, selected). A connection
drag that is released near — not exactly on — a card still connects to it, so a
node does not have to be pinpointed.
"""
import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtCore import QEvent, QPointF, Qt
from PySide6.QtGui import QMouseEvent
from PySide6.QtWidgets import QApplication

from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService
from notevault_app.ui.components.notes.canvas.view import CanvasView

_app = QApplication.instance() or QApplication([])


class TestDuplicateAndConnect(unittest.TestCase):
    def setUp(self):
        root = Path(tempfile.mkdtemp()) / "vault"
        root.mkdir()
        vm = VaultManager(root)
        self.view = CanvasView(vm, NotesService(vm))
        self.view.resize(800, 600)
        cv = root / "board.canvas"
        cv.write_text('{"nodes":[],"edges":[]}', encoding="utf-8")
        self.view.load(cv)

    def test_alt_click_duplicates_card(self):
        card = self.view.add_text_node(QPointF(100, 100), text="hola")
        before = len([n for n in self.view._doc.nodes if n.type == "text"])
        view_pt = self.view.mapFromScene(QPointF(140, 130))
        ev = QMouseEvent(QEvent.MouseButtonPress, QPointF(view_pt),
                         Qt.LeftButton, Qt.LeftButton, Qt.AltModifier)
        self.view.mousePressEvent(ev)
        texts = [n for n in self.view._doc.nodes if n.type == "text"]
        self.assertEqual(len(texts), before + 1)
        # the clone carries the same content and a distinct id
        ids = {n.id for n in texts}
        self.assertEqual(len(ids), len(texts))
        self.assertEqual(sum(1 for n in texts if n.text == "hola"), 2)

    def test_connection_snaps_to_nearest_node(self):
        src = self.view.add_text_node(QPointF(0, 0))
        dst = self.view.add_text_node(QPointF(400, 0))
        # nearest-node lookup finds dst from a point that is off the card but
        # within reach, and misses when far away.
        near = QPointF(dst.node.x - 60, dst.node.y + 20)   # 60px to its left
        far = QPointF(1000, 600)                           # far from both cards
        self.assertIs(self.view._nearest_node_item(near, max_dist=140.0,
                                                    exclude=self.view._items[src.node.id]),
                      self.view._items[dst.node.id])
        self.assertIsNone(self.view._nearest_node_item(far, max_dist=140.0))


if __name__ == "__main__":
    unittest.main()
