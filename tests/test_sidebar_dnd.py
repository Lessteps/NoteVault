"""Tests for the notes sidebar drag & drop tree updates (incremental move)."""

import shutil
import tempfile
import unittest
from pathlib import Path

from PySide6.QtWidgets import QApplication
from PySide6.QtCore import Qt

from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService
from notevault_app.ui.components.notes.notes_sidebar import NotesSidebar

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])


class TestSidebarDnD(unittest.TestCase):
    def setUp(self):
        self.vault_dir = Path(tempfile.mkdtemp(prefix="nv_dnd_"))
        (self.vault_dir / "A").mkdir()
        (self.vault_dir / "B").mkdir()
        (self.vault_dir / "A" / "nota.md").write_text("# nota\n", encoding="utf-8")
        self.vault = VaultManager(self.vault_dir)
        self.service = NotesService(self.vault)
        self.sidebar = NotesSidebar(self.vault, self.service)

    def tearDown(self):
        shutil.rmtree(self.vault_dir, ignore_errors=True)

    def _paths_in_tree(self):
        return {str(it.data(0, Qt.UserRole).get("path"))
                for it in self.sidebar._iter_items()
                if (it.data(0, Qt.UserRole) or {}).get("path")}

    def test_drop_moves_file_on_disk(self):
        src = self.vault_dir / "A" / "nota.md"
        self.sidebar._on_tree_drop([src], self.vault_dir / "B")
        self.assertFalse(src.exists())
        self.assertTrue((self.vault_dir / "B" / "nota.md").exists())

    def test_drop_emits_note_moved(self):
        received = []
        self.sidebar.note_moved.connect(lambda o, n: received.append((o, n)))
        src = self.vault_dir / "A" / "nota.md"
        self.sidebar._on_tree_drop([src], self.vault_dir / "B")
        self.assertEqual(len(received), 1)
        self.assertEqual(received[0][1], self.vault_dir / "B" / "nota.md")

    def test_drop_updates_tree_incrementally(self):
        # Expand B so its children are loaded, then move the note into it.
        b_item = self.sidebar._find_item(self.vault_dir / "B")
        b_item.setExpanded(True)
        src = self.vault_dir / "A" / "nota.md"
        self.sidebar._on_tree_drop([src], self.vault_dir / "B")
        paths = self._paths_in_tree()
        self.assertIn(str(self.vault_dir / "B" / "nota.md"), paths)
        self.assertNotIn(str(src), paths)

    def test_drop_to_root(self):
        src = self.vault_dir / "A" / "nota.md"
        self.sidebar._on_tree_drop([src], None)
        self.assertTrue((self.vault_dir / "nota.md").exists())
        self.assertFalse(src.exists())

    def test_noop_drop_same_folder(self):
        received = []
        self.sidebar.note_moved.connect(lambda o, n: received.append((o, n)))
        src = self.vault_dir / "A" / "nota.md"
        self.sidebar._on_tree_drop([src], self.vault_dir / "A")
        self.assertEqual(received, [])
        self.assertTrue(src.exists())

    def test_multi_drop(self):
        (self.vault_dir / "A" / "otra.md").write_text("# otra\n", encoding="utf-8")
        self.sidebar.populate_tree()
        srcs = [self.vault_dir / "A" / "nota.md", self.vault_dir / "A" / "otra.md"]
        self.sidebar._on_tree_drop(srcs, self.vault_dir / "B")
        self.assertTrue((self.vault_dir / "B" / "nota.md").exists())
        self.assertTrue((self.vault_dir / "B" / "otra.md").exists())


if __name__ == "__main__":
    unittest.main()
