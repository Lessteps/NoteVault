"""
Unit tests for frontmatter utilities and workspace manager.
"""

import shutil
import tempfile
import unittest
from pathlib import Path

from notevault_app.core.frontmatter_utils import (
    parse_frontmatter, dump_frontmatter, update_frontmatter, sanitize_properties
)
from notevault_app.core.workspace_manager import WorkspaceManager, sanitize_workspace


class TestFrontmatterUtils(unittest.TestCase):
    def test_parse_frontmatter_types(self):
        text = """---
subject: mathematics
topic: derivatives
difficulty: 3
mastery: 0.75
goal_level: 2
status: learning
active: true
tags: [calculus, math, analysis]
---
# Derivadas
Contenido de la nota.
"""
        data, body = parse_frontmatter(text)
        self.assertEqual(data["subject"], "mathematics")
        self.assertEqual(data["topic"], "derivatives")
        self.assertEqual(data["difficulty"], 3)
        self.assertEqual(data["mastery"], 0.75)
        self.assertEqual(data["goal_level"], 2)
        self.assertEqual(data["status"], "learning")
        self.assertTrue(data["active"])
        self.assertEqual(data["tags"], ["calculus", "math", "analysis"])
        self.assertIn("# Derivadas", body)

    def test_dump_frontmatter(self):
        data = {
            "subject": "programming",
            "technology": "python",
            "difficulty": 4,
            "mastery": 0.5,
            "tags": ["python", "algorithms"],
        }
        yaml_str = dump_frontmatter(data)
        self.assertTrue(yaml_str.startswith("---\n"))
        self.assertTrue(yaml_str.endswith("---\n"))
        self.assertIn("subject: programming", yaml_str)
        self.assertIn("tags: [\"python\", \"algorithms\"]", yaml_str)

    def test_update_frontmatter(self):
        original = """---
subject: english
mastery: 0.2
---
Hello world
"""
        updated = update_frontmatter(original, {"mastery": 0.85, "level": "B2"})
        data, body = parse_frontmatter(updated)
        self.assertEqual(data["mastery"], 0.85)
        self.assertEqual(data["level"], "B2")
        self.assertEqual(data["subject"], "english")
        self.assertEqual(body.strip(), "Hello world")

    def test_sanitize_properties(self):
        raw = {
            "mastery": 1.5,
            "difficulty": 10,
            "goal_level": 99,
            "tags": "single-tag",
        }
        clean = sanitize_properties(raw)
        self.assertEqual(clean["mastery"], 1.0)
        self.assertEqual(clean["difficulty"], 5)
        self.assertEqual(clean["goal_level"], 4)
        self.assertEqual(clean["tags"], ["single-tag"])


class TestWorkspaceManager(unittest.TestCase):
    def setUp(self):
        self.vault = Path(tempfile.mkdtemp(prefix="nv_ws_test"))

    def tearDown(self):
        shutil.rmtree(self.vault, ignore_errors=True)

    def test_default_workspaces_initialized(self):
        wm = WorkspaceManager(self.vault)
        workspaces = wm.workspaces()
        ids = {w["id"] for w in workspaces}
        self.assertIn("mathematics", ids)
        self.assertIn("programming", ids)
        self.assertIn("english", ids)
        self.assertIn("general", ids)

    def test_detect_by_path(self):
        wm = WorkspaceManager(self.vault)
        ws_math = wm.detect_for_path("Matemáticas/Cálculo/Derivadas.md")
        self.assertEqual(ws_math["id"], "mathematics")

        ws_prog = wm.detect_for_path("Programación/Frontend/React.md")
        self.assertEqual(ws_prog["id"], "programming")

        ws_eng = wm.detect_for_path("Inglés/Vocabulario/Tech.md")
        self.assertEqual(ws_eng["id"], "english")

        ws_gen = wm.detect_for_path("Personal/Ideas.md")
        self.assertEqual(ws_gen["id"], "general")

    def test_detect_by_frontmatter(self):
        wm = WorkspaceManager(self.vault)
        # Even if stored in another folder, frontmatter subject overrides
        ws = wm.detect_for_path("RandomFolder/Test.md", {"subject": "programming"})
        self.assertEqual(ws["id"], "programming")

    def test_features_config(self):
        wm = WorkspaceManager(self.vault)
        math = wm.get("mathematics")
        self.assertTrue(math["features"]["calculator"])
        self.assertTrue(math["features"]["latex"])
        self.assertFalse(math["features"]["code_execution"])

        prog = wm.get("programming")
        self.assertTrue(prog["features"]["code_execution"])
        self.assertTrue(prog["features"]["debugging"])
        self.assertFalse(prog["features"]["calculator"])

    def test_ensure_folder_creates_structure_and_index(self):
        wm = WorkspaceManager(self.vault)
        r = wm.ensure_folder("mathematics", with_structure=True)
        self.assertTrue(r["created"])
        self.assertTrue(r["path"].is_dir())
        self.assertEqual(r["path"].name, "Matemáticas")
        self.assertTrue(r["index"].exists())
        self.assertGreater(len(r["subfolders"]), 0)
        # The index carries subject: so the mode survives a rename.
        self.assertIn("subject: mathematics", r["index"].read_text(encoding="utf-8"))

    def test_ensure_folder_is_idempotent(self):
        wm = WorkspaceManager(self.vault)
        wm.ensure_folder("english", with_structure=False)
        again = wm.ensure_folder("english", with_structure=False)
        self.assertFalse(again["created"])

    def test_ensure_folder_reuses_name_variant(self):
        # A folder called "Math" already exists → no duplicate "Matemáticas".
        (self.vault / "Math").mkdir()
        wm = WorkspaceManager(self.vault)
        r = wm.ensure_folder("mathematics", with_structure=False)
        self.assertFalse(r["created"])
        self.assertEqual(r["path"].name, "Math")
        self.assertFalse((self.vault / "Matemáticas").exists())

    def test_ensure_folder_without_structure(self):
        wm = WorkspaceManager(self.vault)
        r = wm.ensure_folder("programming", with_structure=False)
        self.assertEqual(r["subfolders"], [])
        self.assertTrue(r["path"].is_dir())

    def test_detect_ignores_deep_folders(self):
        # 'code' in a deep folder must not flip a note to programming.
        wm = WorkspaceManager(self.vault)
        ws = wm.detect_for_path("PROJECTS/app/code/note.md")
        self.assertEqual(ws["id"], "general")

    def test_detect_handles_decomposed_accents(self):
        # Syncthing from Android can deliver NFD-encoded accents.
        import unicodedata
        wm = WorkspaceManager(self.vault)
        nfd = unicodedata.normalize("NFD", "Matemáticas")
        ws = wm.detect_for_path(f"{nfd}/Cálculo/nota.md")
        self.assertEqual(ws["id"], "mathematics")


if __name__ == "__main__":
    unittest.main()
