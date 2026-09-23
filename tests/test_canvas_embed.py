"""Tests for embedding a .canvas inside another .canvas (read-only preview)."""

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
from notevault_app.ui.components.notes.canvas.items import (
    CanvasEmbedItem, render_canvas_doc_to_pixmap,
)

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])


class TestCanvasEmbed(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_ce_"))
        self.vault = VaultManager(self.dir)
        self.service = NotesService(self.vault)
        self.child = self.dir / "child.canvas"
        cf.dump(self.child, cf.CanvasDoc(
            nodes=[cf.CanvasNode(id="a", type="text", x=0, y=0, text="Hola"),
                   cf.CanvasNode(id="b", type="text", x=300, y=0, text="Mundo")],
            edges=[cf.CanvasEdge(id="e", fromNode="a", toNode="b")]))
        self.parent = self.dir / "parent.canvas"
        cf.create_empty(self.parent)
        self.view = CanvasView(self.vault, self.service)
        self.view.load(self.parent)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_add_canvas_node_creates_embed_item(self):
        item = self.view.add_canvas_node(self.child, QPointF(0, 0))
        self.assertIsInstance(item, CanvasEmbedItem)
        self.assertEqual(item.node.type, "file")
        self.assertEqual((item.node.nv or {}).get("embed"), "canvas")

    def test_embed_persists_and_reloads_as_embed_item(self):
        self.view.add_canvas_node(self.child, QPointF(0, 0))
        self.view.flush()
        got = cf.load(self.parent)
        self.assertEqual(got.nodes[0].file, "child.canvas")
        self.assertEqual((got.nodes[0].nv or {}).get("embed"), "canvas")
        self.view.load(self.parent)
        self.assertTrue(any(isinstance(it, CanvasEmbedItem)
                            for it in self.view._items.values()))

    def test_open_requested_emits_child_path(self):
        item = self.view.add_canvas_node(self.child, QPointF(0, 0))
        got = []
        item.open_requested.connect(got.append)
        item.open_requested.emit(item.abs_path)
        self.assertEqual(got, [item.abs_path])

    def test_preview_pixmap_renders_nonempty(self):
        item = self.view.add_canvas_node(self.child, QPointF(0, 0))
        self.assertIsNotNone(item._pixmap)
        self.assertFalse(item._pixmap.isNull())

    def test_self_referencing_canvas_does_not_hang(self):
        """A canvas that embeds itself must render a placeholder, not recurse."""
        selfref = self.dir / "loop.canvas"
        cf.dump(selfref, cf.CanvasDoc(nodes=[
            cf.CanvasNode(id="s", type="file", x=0, y=0, file="loop.canvas",
                          nv={"embed": "canvas"})]))
        item = self.view.add_canvas_node(selfref, QPointF(0, 0))
        self.assertIsInstance(item, CanvasEmbedItem)
        self.assertIsNotNone(item._pixmap)   # completed without infinite recursion

    def test_render_empty_doc_returns_null_pixmap(self):
        self.assertTrue(render_canvas_doc_to_pixmap(cf.CanvasDoc()).isNull())


if __name__ == "__main__":
    unittest.main()
