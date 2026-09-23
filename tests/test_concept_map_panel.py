"""The concept-map panel builds the prompt and writes a .canvas from YAML.

The AI call itself is not exercised (no network in tests); the deterministic
pieces are: the prompt carries the schema, template, context and order; and a
valid YAML spec is compiled and written to the chosen destination.
"""
import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtWidgets import QApplication

from notevault_app.core import canvas_format as cf
from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService
from notevault_app.ui.components.notes.concept_map_panel import ConceptMapPanel

_app = QApplication.instance() or QApplication([])

SPEC_YAML = """\
layout: radial
nodes:
  - id: root
    title: Centro
    role: root
  - id: a
    title: Uno
  - id: b
    title: Dos
edges:
  - from: root
    to: [a, b]
"""


class TestConceptMapPanel(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp()) / "vault"
        self.root.mkdir()
        vm = VaultManager(self.root)
        self.panel = ConceptMapPanel(vm, NotesService(vm))

    def test_build_prompt_has_all_parts(self):
        prompt = self.panel._build_prompt(
            order="mapa de X", context_texts=[("ctx.md", "contenido de contexto")],
            extra="usa colores", template_yaml="layout: radial")
        self.assertIn("SPEC", prompt)
        self.assertIn("USER ORDER:", prompt)
        self.assertIn("mapa de X", prompt)
        self.assertIn("ctx.md", prompt)
        self.assertIn("contenido de contexto", prompt)
        self.assertIn("usa colores", prompt)
        self.assertIn("layout: radial", prompt)

    def test_extract_yaml_strips_fences(self):
        got = self.panel._extract_yaml("```yaml\nlayout: radial\n```")
        self.assertEqual(got, "layout: radial")

    def test_build_from_yaml_writes_canvas(self):
        self.panel._name.setText("MiMapa")
        ok = self.panel._build_from_yaml_text(SPEC_YAML)
        self.assertTrue(ok)
        out = self.root / "MiMapa.canvas"
        self.assertTrue(out.exists())
        doc = cf.load(out)
        self.assertEqual(len(doc.nodes), 3)
        self.assertEqual(len(doc.edges), 2)

    def test_invalid_yaml_reports_and_writes_nothing(self):
        ok = self.panel._build_from_yaml_text("nodes:\n  - id: a\n    kind: note\n")
        self.assertFalse(ok)   # note without 'file' is invalid

    def test_paste_flow_builds(self):
        self.panel._paste.setPlainText(SPEC_YAML)
        self.panel._on_paste_build()
        self.assertIsNotNone(self.panel._last_path)


if __name__ == "__main__":
    unittest.main()
