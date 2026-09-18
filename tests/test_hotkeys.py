"""Tests for hotkeys override system (Phase 7)."""

import json
import tempfile
import shutil
import unittest
from pathlib import Path
from unittest.mock import patch

from notevault_app import config as _cfg


class TestHotkeysConfig(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.mkdtemp()
        self._orig_settings = _cfg.SETTINGS_FILE
        _cfg.SETTINGS_FILE = Path(self._tmp) / "settings.json"

    def tearDown(self):
        _cfg.SETTINGS_FILE = self._orig_settings
        shutil.rmtree(self._tmp, ignore_errors=True)

    # Re-import AppConfig each time so it sees the patched SETTINGS_FILE
    @property
    def cfg(self):
        from notevault_app.config import AppConfig
        return AppConfig

    def test_get_hotkeys_empty(self):
        self.assertEqual(self.cfg.get_hotkeys(), {})

    def test_set_and_get_hotkey(self):
        self.cfg.set_hotkey("save", "Ctrl+Alt+S")
        self.assertEqual(self.cfg.get_hotkeys().get("save"), "Ctrl+Alt+S")

    def test_clear_hotkey(self):
        self.cfg.set_hotkey("save", "Ctrl+Alt+S")
        self.cfg.clear_hotkey("save")
        self.assertNotIn("save", self.cfg.get_hotkeys())

    def test_set_empty_string_removes_key(self):
        self.cfg.set_hotkey("bold", "Ctrl+Alt+B")
        self.cfg.set_hotkey("bold", "")
        self.assertNotIn("bold", self.cfg.get_hotkeys())

    def test_override_replaces_previous(self):
        self.cfg.set_hotkey("daily_note", "Ctrl+D")
        self.cfg.set_hotkey("daily_note", "Ctrl+Shift+N")
        self.assertEqual(self.cfg.get_hotkeys()["daily_note"], "Ctrl+Shift+N")


if __name__ == "__main__":
    unittest.main()
