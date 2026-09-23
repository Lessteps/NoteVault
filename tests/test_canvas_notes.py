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
        self.assertEqual(item._body.strip(), "Cuerpo original")

    def test_edit_saves_and_preserves_frontmatter(self):
        item = self.view.add_note_node(self.dir / "Nota.md", QPointF(0, 0))
        item._enter_edit()                          # double-click body → edit mode
        item._editor.setPlainText("Cuerpo editado desde el canvas")
        item.flush()                                # commits + saves + re-renders
        raw = (self.dir / "Nota.md").read_text(encoding="utf-8")
        self.assertIn("title: Nota", raw)          # frontmatter kept
        self.assertIn("Cuerpo editado desde el canvas", raw)
        self.assertNotIn("Cuerpo original", raw)

    def test_edit_mode_disables_and_restores_move_flag(self):
        # D1: entering edit must stop the card from dragging so clicks place the
        # caret; committing restores movability.
        from PySide6.QtWidgets import QGraphicsObject
        item = self.view.add_note_node(self.dir / "Nota.md", QPointF(0, 0))
        self.assertTrue(bool(item.flags() & QGraphicsObject.ItemIsMovable))
        item._enter_edit()
        self.assertFalse(bool(item.flags() & QGraphicsObject.ItemIsMovable))
        item._commit_edit()
        self.assertTrue(bool(item.flags() & QGraphicsObject.ItemIsMovable))

    def test_scroll_content_returns_false_when_nothing_to_scroll(self):
        # D2: a short note has no scrollbar range, so the canvas keeps the wheel.
        item = self.view.add_note_node(self.dir / "Nota.md", QPointF(0, 0))
        self.assertFalse(item.scroll_content(120))

    def test_body_renders_headings(self):
        (self.dir / "Doc.md").write_text(
            "---\ntitle: Doc\n---\n# Titulo\n## Subtitulo\n", encoding="utf-8")
        item = self.view.add_note_node(self.dir / "Doc.md", QPointF(0, 0))
        # The rendered document must not contain the raw '#' markers.
        rendered = item._viewer.toPlainText()
        self.assertIn("Titulo", rendered)
        self.assertNotIn("# Titulo", rendered)

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

    def test_add_canvas_node_persists_as_embed(self):
        sub = self.dir / "sub.canvas"
        cf.create_empty(sub)
        item = self.view.add_canvas_node(sub, QPointF(50, 50))
        self.assertEqual(item.node.type, "file")
        self.assertEqual(item.node.file, "sub.canvas")
        self.assertEqual((item.node.nv or {}).get("embed"), "canvas")
        self.assertEqual(item.node.width, 360)
        self.assertEqual(item.node.height, 260)
        self.view.flush()
        got = cf.load(self.path)
        self.assertEqual(got.nodes[0].file, "sub.canvas")
        self.assertEqual(got.nodes[0].nv.get("embed"), "canvas")

    def test_toolbar_has_add_canvas_button(self):
        # The embedded-canvas tool is now a first-class one-click cell (key A),
        # not an entry hidden in an overflow menu.
        from notevault_app.ui.components.notes.canvas.view import _ToolButton
        cells = self.view._toolbar.findChildren(_ToolButton)
        glyphs = [c._icon.text() for c in cells]
        caps = [c._cap.text() for c in cells]
        self.assertIn("⧉", glyphs)
        self.assertIn("A", caps)

    def test_vault_manager_canvas_paths(self):
        sub = self.dir / "another.canvas"
        cf.create_empty(sub)
        canvases = self.vault.canvas_paths()
        self.assertIn(self.path, canvases)
        self.assertIn(sub, canvases)


if __name__ == "__main__":
    unittest.main()
