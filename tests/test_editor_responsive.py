"""A notes editor pane must stay narrow-friendly for split views.

The toolbars, tab row, workspace bar and backlinks footer are allowed to clip
or scroll, so the whole pane can be dragged small in a split instead of being
pinned wide by the sum of its buttons.
"""
import sys
from pathlib import Path

import pytest
from PySide6.QtWidgets import QApplication

from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService
from notevault_app.ui.components.notes.markdown_editor import MarkdownEditor


@pytest.fixture
def app():
    return QApplication.instance() or QApplication(sys.argv)


@pytest.fixture
def vault(tmp_path):
    root = tmp_path / "vault"
    root.mkdir()
    vm = VaultManager(root)
    return vm, NotesService(vm)


def test_editor_pane_minimum_is_narrow(app, vault):
    vm, svc = vault
    ed = MarkdownEditor(vm, svc)
    ed.resize(800, 600)
    app.processEvents()
    # Previously ~379 (tab row) / ~858 (format bar) forced the pane wide.
    assert ed.minimumSizeHint().width() <= 160


def test_editor_pane_minimum_narrow_with_canvas(app, vault, tmp_path):
    vm, svc = vault
    ed = MarkdownEditor(vm, svc)
    ed.resize(800, 600)
    cv = Path(vm.vault_root) / "board.canvas"
    cv.write_text('{"nodes":[],"edges":[]}', encoding="utf-8")
    ed.open_note(cv)
    app.processEvents()
    assert ed.minimumSizeHint().width() <= 160


if __name__ == "__main__":
    import unittest
    unittest.main()
