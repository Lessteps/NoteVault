"""Tests for note nodes on the canvas (C1): embed a note, edit it in place."""

import shutil
import tempfile
import unittest
from pathlib import Path

from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QPointF

from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService
from notevault_app.core import canvas_format as cf
from notevault_app.ui.components.notes.canvas import CanvasView
from notevault_app.ui.components.notes.canvas.items import NoteNodeItem

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])


class TestCanvasNotes(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_cn_"))
        (self.dir / "Nota.md").write_text(
            "---\ntitle: Nota\n---\nCuerpo original\n", encoding="utf-8")
        self.vault = VaultManager(self.dir)
        self.service = NotesService(self.vault)
        self.path = self.dir / "board.canvas"
        cf.create_empty(self.path)
        self.view = CanvasView(self.vault, self.service)
        self.view.load(self.path)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_add_note_node_relative_path(self):
        item = self.view.add_note_node(self.dir / "Nota.md", QPointF(0, 0))
        self.assertIsInstance(item, NoteNodeItem)
        self.assertEqual(item.node.type, "file")
        self.assertEqual(item.node.file, "Nota.md")
        self.view.flush()
        got = cf.load(self.path)
        self.assertEqual(got.nodes[0].file, "Nota.md")

    def test_note_node_loads_body_without_frontmatter(self):
        item = self.view.add_note_node(self.dir / "Nota.md", QPointF(0, 0))
        self.assertEqual(item._editor.toPlainText().strip(), "Cuerpo original")

    def test_edit_saves_and_preserves_frontmatter(self):
        item = self.view.add_note_node(self.dir / "Nota.md", QPointF(0, 0))
        item._editor.setPlainText("Cuerpo editado desde el canvas")
        item.flush()
        raw = (self.dir / "Nota.md").read_text(encoding="utf-8")
        self.assertIn("title: Nota", raw)          # frontmatter kept
        self.assertIn("Cuerpo editado desde el canvas", raw)
        self.assertNotIn("Cuerpo original", raw)

    def test_open_requested_emits_path(self):
        item = self.view.add_note_node(self.dir / "Nota.md", QPointF(0, 0))
        got = []
        item.open_requested.connect(got.append)
        item.open_requested.emit(item.abs_path)
        self.assertEqual(got, [self.dir / "Nota.md"])

    def test_reload_file_node_becomes_note_item(self):
        doc = cf.CanvasDoc(nodes=[
            cf.CanvasNode(id="f1", type="file", x=0, y=0, file="Nota.md")])
        cf.dump(self.path, doc)
        self.view.load(self.path)
        item = self.view._items["f1"]
        self.assertIsInstance(item, NoteNodeItem)


if __name__ == "__main__":
    unittest.main()
