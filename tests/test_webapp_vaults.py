"""Switching vaults from the web UI: only recent or picked folders in the
desktop window; every module then reads the new vault."""

import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from notevault_app.webapp.api import ApiError, NoteVaultApi


class TestVaultsApi(unittest.TestCase):
    def setUp(self):
        self.a = Path(tempfile.mkdtemp(prefix="nv_va_"))
        self.b = Path(tempfile.mkdtemp(prefix="nv_vb_"))
        (self.b / "Otra.md").write_text("# Otra\n", encoding="utf-8")
        self.api = NoteVaultApi(self.a)
        patcher = mock.patch("notevault_app.webapp.modules.vaults.AppConfig")
        self.cfg = patcher.start()
        self.addCleanup(patcher.stop)
        self.cfg.get_recent_vaults.return_value = []

    def tearDown(self):
        shutil.rmtree(self.a, ignore_errors=True)
        shutil.rmtree(self.b, ignore_errors=True)

    def test_desktop_window_refuses_unknown_folders(self):
        self.api._window = object()
        with self.assertRaises(ApiError):
            self.api.vault_open(str(self.b))
        self.cfg.get_recent_vaults.return_value = [self.b]
        self.api.vault_open(str(self.b))
        self.cfg.set_active_vault.assert_called_once()

    def test_switch_reloads_every_module(self):
        self.api.tasks_create({"name": "En A"})
        self.api.vault_open(str(self.b))          # no window: dev / tests
        self.assertEqual(self.api.tasks_list(), [])
        self.assertEqual([n["title"] for n in self.api.note_index()], ["Otra"])
        self.assertEqual(self.api.app_info()["vault_name"], self.b.name)

    def test_list_marks_current(self):
        self.cfg.get_recent_vaults.return_value = [self.b]
        rows = self.api.vault_list()
        self.assertTrue(rows[0]["current"])
        self.assertEqual(rows[1]["markdown"], 1)


if __name__ == "__main__":
    unittest.main()
