"""Tests for vault_manager.move_path (Phase 1 — drag & drop)."""

import shutil
import tempfile
import unittest
from pathlib import Path

from notevault_app.core.vault_manager import VaultManager


class TestMovePathNote(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.mkdtemp()
        self.vault = VaultManager(Path(self._tmp))
        self.root = self.vault.vault_root

    def tearDown(self):
        shutil.rmtree(self._tmp, ignore_errors=True)

    def _note(self, rel: str, body: str = "# hi") -> Path:
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(f"---\ntitle: {p.stem}\n---\n\n{body}\n", encoding="utf-8")
        return p

    def _folder(self, rel: str) -> Path:
        p = self.root / rel
        p.mkdir(parents=True, exist_ok=True)
        return p

    def test_move_note_to_folder(self):
        note = self._note("note.md")
        dest = self._folder("sub")
        new = self.vault.move_path(note, dest)
        self.assertEqual(new, dest / "note.md")
        self.assertTrue(new.exists())
        self.assertFalse(note.exists())

    def test_move_note_collision_adds_suffix(self):
        self._note("sub/note.md", body="original")
        src = self._note("note.md", body="copy")
        dest = self._folder("sub")
        new = self.vault.move_path(src, dest)
        self.assertNotEqual(new, dest / "note.md")
        self.assertTrue(new.name.startswith("note"))
        self.assertTrue(new.exists())
        self.assertTrue((dest / "note.md").exists())   # original untouched

    def test_move_folder(self):
        inner = self._folder("inner")
        self._note("inner/a.md")
        outer = self._folder("outer")
        new = self.vault.move_path(inner, outer)
        self.assertEqual(new, outer / "inner")
        self.assertTrue((new / "a.md").exists())
        self.assertFalse(inner.exists())

    def test_move_folder_into_itself_is_noop(self):
        folder = self._folder("myfolder")
        # Should silently return src without raising
        result = self.vault.move_path(folder, folder)
        self.assertEqual(result, folder)
        self.assertTrue(folder.exists())

    def test_cannot_move_into_notevault(self):
        note = self._note("note.md")
        reserved = self.root / ".notevault"
        reserved.mkdir(exist_ok=True)
        with self.assertRaises((ValueError, Exception)):
            self.vault.move_path(note, reserved)

    def test_move_already_in_place_is_noop(self):
        note = self._note("note.md")
        result = self.vault.move_path(note, self.root)
        self.assertEqual(result, note)
        self.assertTrue(note.exists())


if __name__ == "__main__":
    unittest.main()
