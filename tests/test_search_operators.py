"""Tests for advanced search operators (Phase 4)."""

import shutil
import tempfile
import unittest
from pathlib import Path

from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService


def _make_note(vault_root: Path, rel: str, content: str):
    p = vault_root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    return p


class TestParseQuery(unittest.TestCase):
    def _parse(self, q):
        return NotesService._parse_query(q)

    def test_plain_terms(self):
        f = self._parse("hello world")
        self.assertEqual(f["terms"], ["hello", "world"])

    def test_tag_operator(self):
        f = self._parse("tag:python")
        self.assertIn("python", f["tags"])

    def test_path_operator(self):
        f = self._parse("path:carpeta")
        self.assertIn("carpeta", f["path_frags"])

    def test_property_operator(self):
        f = self._parse("property:author")
        self.assertIn("author", f["properties"])

    def test_quoted_phrase(self):
        f = self._parse('"hello world"')
        self.assertIn("hello world", f["phrases"])

    def test_combined(self):
        f = self._parse('tag:math "equation" path:Matematicas')
        self.assertIn("math", f["tags"])
        self.assertIn("equation", f["phrases"])
        self.assertIn("matematicas", f["path_frags"])


class TestSearchOperators(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.mkdtemp()
        self.vault = VaultManager(Path(self._tmp))
        self.service = NotesService(self.vault)
        root = self.vault.vault_root

        _make_note(root, "Matematicas/algebra.md",
                   "---\ntitle: Algebra\ntags: [math, algebra]\n---\n\n# Algebra\n\n"
                   "Las ecuaciones son importantes.\n")
        _make_note(root, "Programacion/python.md",
                   "---\ntitle: Python\ntags: [code, python]\nauthor: Julian\n---\n\n"
                   "# Python\n\n#python es genial.\n")
        _make_note(root, "Notas/general.md",
                   "---\ntitle: General\n---\n\nNota general sin tags.\n")

        # Force index to load
        self.service.index.notes()

    def tearDown(self):
        shutil.rmtree(self._tmp, ignore_errors=True)

    def test_plain_search(self):
        hits = self.service.search("algebra")
        paths = {h.path.name for h in hits}
        self.assertIn("algebra.md", paths)

    def test_tag_operator(self):
        hits = self.service.search("tag:math")
        paths = {h.path.name for h in hits}
        self.assertIn("algebra.md", paths)
        self.assertNotIn("python.md", paths)

    def test_path_operator(self):
        hits = self.service.search("path:Matematicas")
        paths = {h.path.name for h in hits}
        self.assertIn("algebra.md", paths)
        self.assertNotIn("python.md", paths)

    def test_property_operator(self):
        hits = self.service.search("property:author")
        paths = {h.path.name for h in hits}
        self.assertIn("python.md", paths)
        self.assertNotIn("algebra.md", paths)

    def test_quoted_phrase(self):
        hits = self.service.search('"son importantes"')
        paths = {h.path.name for h in hits}
        self.assertIn("algebra.md", paths)

    def test_and_combination(self):
        hits = self.service.search("tag:code path:Programacion")
        paths = {h.path.name for h in hits}
        self.assertIn("python.md", paths)
        self.assertNotIn("algebra.md", paths)

    def test_empty_query_returns_empty(self):
        hits = self.service.search("")
        self.assertEqual(hits, [])


if __name__ == "__main__":
    unittest.main()
