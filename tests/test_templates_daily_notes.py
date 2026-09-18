"""Tests for core/templates.py and core/daily_notes.py (Phase 2)."""

import shutil
import tempfile
import unittest
from datetime import date
from pathlib import Path

from notevault_app.core.templates import expand_template, list_templates, read_and_expand
from notevault_app.core.daily_notes import today_path, open_or_create_today


class TestExpandTemplate(unittest.TestCase):
    def test_title_substitution(self):
        result = expand_template("# {{title}}", {"title": "Mi nota"})
        self.assertEqual(result, "# Mi nota")

    def test_date_default(self):
        today = date.today().isoformat()
        result = expand_template("{{date}}")
        self.assertEqual(result, today)

    def test_date_custom_format(self):
        d = date.today()
        expected = d.strftime("%d/%m/%Y")
        result = expand_template("{{date:%d/%m/%Y}}")
        self.assertEqual(result, expected)

    def test_unknown_variable_kept(self):
        result = expand_template("{{unknown}}")
        self.assertEqual(result, "{{unknown}}")

    def test_multiple_vars(self):
        result = expand_template("{{title}} — {{date}}", {"title": "T"})
        today = date.today().isoformat()
        self.assertEqual(result, f"T — {today}")

    def test_no_vars(self):
        result = expand_template("Sin variables")
        self.assertEqual(result, "Sin variables")


class TestListTemplates(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.mkdtemp()
        self.tmpl_dir = Path(self._tmp) / "Plantillas"
        self.tmpl_dir.mkdir()

    def tearDown(self):
        shutil.rmtree(self._tmp, ignore_errors=True)

    def test_empty_dir(self):
        self.assertEqual(list_templates(self.tmpl_dir), [])

    def test_lists_md_files(self):
        (self.tmpl_dir / "a.md").write_text("# A", encoding="utf-8")
        (self.tmpl_dir / "b.md").write_text("# B", encoding="utf-8")
        names = [p.name for p in list_templates(self.tmpl_dir)]
        self.assertEqual(names, ["a.md", "b.md"])

    def test_ignores_non_md(self):
        (self.tmpl_dir / "readme.txt").write_text("txt", encoding="utf-8")
        self.assertEqual(list_templates(self.tmpl_dir), [])

    def test_nonexistent_dir_returns_empty(self):
        self.assertEqual(list_templates(Path(self._tmp) / "nope"), [])


class TestReadAndExpand(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self._tmp, ignore_errors=True)

    def test_reads_and_expands(self):
        p = Path(self._tmp) / "t.md"
        p.write_text("# {{title}}", encoding="utf-8")
        result = read_and_expand(p, {"title": "Hola"})
        self.assertEqual(result, "# Hola")


class TestTodayPath(unittest.TestCase):
    def test_name_matches_today(self):
        d = Path("/fake/dir")
        p = today_path(d)
        self.assertEqual(p.name, f"{date.today().isoformat()}.md")


class TestOpenOrCreateToday(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.mkdtemp()
        self.vault = Path(self._tmp)
        self.daily_dir = self.vault / "Diario"

    def tearDown(self):
        shutil.rmtree(self._tmp, ignore_errors=True)

    def test_creates_note(self):
        p = open_or_create_today(self.vault, self.daily_dir)
        self.assertTrue(p.exists())
        self.assertIn(date.today().isoformat(), p.name)

    def test_idempotent(self):
        p1 = open_or_create_today(self.vault, self.daily_dir)
        content = p1.read_text(encoding="utf-8")
        p2 = open_or_create_today(self.vault, self.daily_dir)
        self.assertEqual(p1, p2)
        self.assertEqual(p2.read_text(encoding="utf-8"), content)

    def test_with_template(self):
        tmpl = self.vault / "t.md"
        tmpl.write_text("# {{title}} — {{date}}", encoding="utf-8")
        p = open_or_create_today(self.vault, self.daily_dir, tmpl)
        text = p.read_text(encoding="utf-8")
        self.assertIn(date.today().isoformat(), text)


if __name__ == "__main__":
    unittest.main()
