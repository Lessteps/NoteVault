"""Templates, the daily note and tags through the web bridge."""

import shutil
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

from notevault_app.webapp.api import ApiError, NoteVaultApi


class TestNotesExtras(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="nv_extras_"))
        self.outside = Path(tempfile.mkdtemp(prefix="nv_out_"))
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.addCleanup(shutil.rmtree, self.outside, True)
        patcher = mock.patch("notevault_app.webapp.modules.notes_extras.AppConfig")
        self.cfg = patcher.start()
        self.addCleanup(patcher.stop)
        self.cfg.get_templates_dir.side_effect = lambda root: root / "Plantillas"
        self.cfg.get_daily_notes_dir.side_effect = lambda root: root / "Diario"
        self.cfg.get_daily_notes_template.return_value = None
        (self.dir / "Plantillas").mkdir()
        (self.dir / "Plantillas" / "Clase.md").write_text("# {{title}}\nFecha: {{date}}\n", encoding="utf-8")
        self.api = NoteVaultApi(self.dir)

    def test_templates(self):
        names = [t["name"] for t in self.api.templates_list()["templates"]]
        self.assertEqual(names, ["Clase.md"])
        text = self.api.template_text("Clase.md", "Álgebra")["text"]
        self.assertIn("# Álgebra", text)
        self.assertIn(date.today().isoformat(), text)
        with self.assertRaises(ApiError):
            self.api.template_text("../secret.md")

    def test_note_from_template(self):
        rel = self.api.note_from_template("Clase.md", "Cálculo\nnext: x", "")["path"]
        raw = (self.dir / rel).read_text(encoding="utf-8")
        self.assertTrue(raw.startswith("# Cálculo next: x"))
        with self.assertRaises(ApiError):
            self.api.note_from_template("Clase.md", "X", "../")

    def test_daily_note_is_idempotent_and_confined(self):
        a = self.api.daily_note()["path"]
        self.assertEqual(a, f"Diario/{date.today().isoformat()}.md")
        (self.dir / a).write_text("hola", encoding="utf-8")
        self.assertEqual(self.api.daily_note()["path"], a)
        self.assertEqual((self.dir / a).read_text(encoding="utf-8"), "hola")
        self.cfg.get_daily_notes_dir.side_effect = lambda root: self.outside
        self.assertEqual(self.api.daily_note()["path"], a)
        self.assertEqual(list(self.outside.iterdir()), [])

    def test_tags(self):
        (self.dir / "a.md").write_text("---\ntags: [mate]\n---\nTexto #fisica\n", encoding="utf-8")
        (self.dir / "b.md").write_text("Nada #mate\n", encoding="utf-8")
        tags = {t["tag"]: t["count"] for t in self.api.tags_list()}
        self.assertEqual(tags.get("mate"), 2)
        self.assertEqual(tags.get("fisica"), 1)
        self.assertEqual([n["title"] for n in self.api.tag_notes("#mate")], ["a", "b"])
        with self.assertRaises(ApiError):
            self.api.tag_notes("a b")


if __name__ == "__main__":
    unittest.main()
