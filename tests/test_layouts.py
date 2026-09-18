"""Tests for layout save/restore (Phase 8)."""

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from notevault_app.core.layouts import (
    capture_layout, delete_layout, list_layouts, load_layout, save_layout,
)
from notevault_app.core.vault_format import DATA_DIR


class TestLayouts(unittest.TestCase):
    def setUp(self):
        self._tmp = Path(tempfile.mkdtemp())
        (self._tmp / DATA_DIR).mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        shutil.rmtree(self._tmp, ignore_errors=True)

    def _vault(self):
        return self._tmp

    def test_list_empty(self):
        self.assertEqual(list_layouts(self._vault()), [])

    def test_save_and_list(self):
        data = capture_layout([220, 800, 340], True, True, ["Notas/a.md"], "Notas/a.md")
        save_layout(self._vault(), "Mi layout", data)
        self.assertIn("Mi layout", list_layouts(self._vault()))

    def test_load_returns_data(self):
        data = capture_layout([220, 800, 340], True, False, ["b.md"])
        save_layout(self._vault(), "test", data)
        loaded = load_layout(self._vault(), "test")
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded["splitter_sizes"], [220, 800, 340])
        self.assertTrue(loaded["left_visible"])
        self.assertFalse(loaded["right_visible"])
        self.assertEqual(loaded["open_notes"], ["b.md"])

    def test_load_missing_returns_none(self):
        self.assertIsNone(load_layout(self._vault(), "ghost"))

    def test_overwrite(self):
        save_layout(self._vault(), "x", capture_layout([100, 800, 100], True, True, []))
        save_layout(self._vault(), "x", capture_layout([200, 700, 100], True, False, []))
        loaded = load_layout(self._vault(), "x")
        self.assertEqual(loaded["splitter_sizes"][0], 200)

    def test_delete(self):
        save_layout(self._vault(), "del_me", capture_layout([0, 900, 0], False, False, []))
        self.assertIn("del_me", list_layouts(self._vault()))
        delete_layout(self._vault(), "del_me")
        self.assertNotIn("del_me", list_layouts(self._vault()))

    def test_delete_missing_returns_false(self):
        self.assertFalse(delete_layout(self._vault(), "nope"))

    def test_list_sorted(self):
        for name in ["beta", "alpha", "gamma"]:
            save_layout(self._vault(), name, capture_layout([0, 0, 0], False, False, []))
        self.assertEqual(list_layouts(self._vault()), ["alpha", "beta", "gamma"])

    def test_capture_layout_version(self):
        data = capture_layout([0, 0, 0], False, False, [])
        self.assertEqual(data["version"], 1)

    def test_name_with_slashes_sanitized(self):
        save_layout(self._vault(), "a/b", capture_layout([0, 0, 0], False, False, []))
        names = list_layouts(self._vault())
        self.assertIn("a_b", names)
        self.assertNotIn("a/b", names)

    def test_active_note_stored(self):
        data = capture_layout([220, 800, 0], True, False, ["x.md", "y.md"], "y.md")
        save_layout(self._vault(), "with_active", data)
        loaded = load_layout(self._vault(), "with_active")
        self.assertEqual(loaded["active_note"], "y.md")


if __name__ == "__main__":
    unittest.main()
