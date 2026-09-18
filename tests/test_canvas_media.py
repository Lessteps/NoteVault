"""Tests for media nodes on the canvas (C2): image / audio / video."""

import shutil
import tempfile
import unittest
from pathlib import Path

from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QPointF
from PySide6.QtGui import QPixmap, QColor

from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService
from notevault_app.core import canvas_format as cf
from notevault_app.ui.components.notes.canvas import CanvasView
from notevault_app.ui.components.notes.canvas.items import MediaNodeItem

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])


class TestCanvasMedia(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_cm_"))
        self.vault = VaultManager(self.dir)
        self.service = NotesService(self.vault)
        self.path = self.dir / "board.canvas"
        cf.create_empty(self.path)
        # an external image to import
        self.ext = Path(tempfile.mkdtemp(prefix="nv_ext_")) / "foto.png"
        pm = QPixmap(20, 20)
        pm.fill(QColor("#334455"))
        pm.save(str(self.ext), "PNG")
        self.view = CanvasView(self.vault, self.service)
        self.view.load(self.path)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)
        shutil.rmtree(self.ext.parent, ignore_errors=True)

    def test_add_image_imports_into_vault(self):
        item = self.view.add_media_node(self.ext, QPointF(0, 0))
        self.assertIsInstance(item, MediaNodeItem)
        self.assertEqual(item.media_kind, "image")
        self.assertEqual(item.node.nv.get("media"), "image")
        # the file was copied under the vault and referenced relatively
        rel = item.node.file
        self.assertFalse(Path(rel).is_absolute())
        self.assertTrue((self.dir / rel).exists())

    def test_image_already_in_vault_not_duplicated(self):
        inside = self.dir / "attachments" / "ya.png"
        inside.parent.mkdir(parents=True, exist_ok=True)
        QPixmap(10, 10).save(str(inside), "PNG")
        item = self.view.add_media_node(inside, QPointF(0, 0))
        self.assertEqual(item.node.file, "attachments/ya.png")

    def test_reload_image_node(self):
        rel = "attachments/x.png"
        (self.dir / "attachments").mkdir(parents=True, exist_ok=True)
        QPixmap(8, 8).save(str(self.dir / rel), "PNG")
        doc = cf.CanvasDoc(nodes=[cf.CanvasNode(
            id="m1", type="file", file=rel, nv={"media": "image"})])
        cf.dump(self.path, doc)
        self.view.load(self.path)
        self.assertIsInstance(self.view._items["m1"], MediaNodeItem)

    def test_audio_node_created(self):
        audio = self.dir / "son.mp3"
        audio.write_bytes(b"\x00\x00")     # not a real mp3; node must still build
        item = self.view.add_media_node(audio, QPointF(0, 0))
        self.assertIsInstance(item, MediaNodeItem)
        self.assertEqual(item.media_kind, "audio")

    def test_persists(self):
        self.view.add_media_node(self.ext, QPointF(10, 10))
        self.view.flush()
        got = cf.load(self.path)
        self.assertEqual(got.nodes[0].nv.get("media"), "image")


if __name__ == "__main__":
    unittest.main()
