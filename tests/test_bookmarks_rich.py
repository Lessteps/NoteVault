"""Tests for rich bookmarks format (Phase 6)."""

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService, BOOKMARKS_FILE


def _make_note(vault_root: Path, rel: str):
    p = vault_root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(f"---\ntitle: {p.stem}\n---\n\n# {p.stem}\n", encoding="utf-8")
    return p


class TestBookmarksRich(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.mkdtemp()
        self.vault = VaultManager(Path(self._tmp))
        self.service = NotesService(self.vault)
        self.root = self.vault.vault_root

    def tearDown(self):
        shutil.rmtree(self._tmp, ignore_errors=True)

    def test_toggle_adds_note_bookmark(self):
        p = _make_note(self.root, "nota.md")
        self.service.toggle_bookmark(p)
        bms = self.service.bookmarks_rich()
        self.assertEqual(len(bms), 1)
        self.assertEqual(bms[0]["type"], "note")
        self.assertIn("nota.md", bms[0]["target"])

    def test_toggle_removes_note_bookmark(self):
        p = _make_note(self.root, "nota.md")
        self.service.toggle_bookmark(p)
        self.service.toggle_bookmark(p)
        self.assertEqual(self.service.bookmarks_rich(), [])

    def test_add_search_bookmark(self):
        self.service.add_bookmark("search", "tag:math", "Buscar math")
        bms = self.service.bookmarks_rich()
        self.assertEqual(bms[0]["type"], "search")
        self.assertEqual(bms[0]["target"], "tag:math")

    def test_add_heading_bookmark(self):
        p = _make_note(self.root, "nota.md")
        rel = str(p.relative_to(self.root)).replace("\\", "/")
        self.service.add_bookmark("heading", f"{rel}#Introduccion", "Introduccion")
        bms = self.service.bookmarks_rich()
        self.assertEqual(bms[0]["type"], "heading")

    def test_duplicate_skipped(self):
        self.service.add_bookmark("search", "query", "Q")
        self.service.add_bookmark("search", "query", "Q2")
        self.assertEqual(len(self.service.bookmarks_rich()), 1)

    def test_remove_bookmark_rich(self):
        self.service.add_bookmark("search", "q", "Q")
        self.service.remove_bookmark_rich("search", "q")
        self.assertEqual(self.service.bookmarks_rich(), [])

    def test_migration_from_old_format(self):
        _make_note(self.root, "vieja.md")
        bm_file = self.root / BOOKMARKS_FILE
        bm_file.write_text(json.dumps(["vieja.md"]), encoding="utf-8")
        bms = self.service.bookmarks_rich()
        self.assertEqual(bms[0]["type"], "note")
        self.assertEqual(bms[0]["target"], "vieja.md")

    def test_bookmarks_backward_compat(self):
        p = _make_note(self.root, "nota.md")
        self.service.toggle_bookmark(p)
        paths = self.service.bookmarks()
        self.assertIn(p, paths)


if __name__ == "__main__":
    unittest.main()
