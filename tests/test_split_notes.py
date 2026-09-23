"""Tests for SplitNotes multi-directional splitting, active pane indicator, and drag-and-drop tab transfer."""

import sys
from pathlib import Path
import pytest
from PySide6.QtCore import QPoint, Qt
from PySide6.QtWidgets import QApplication

from notevault_app.ui.components.notes.split_notes import SplitNotes, _DropOverlay
from notevault_app.ui.components.notes.markdown_editor import MarkdownEditor, _OpenNote
from notevault_app.core.vault_manager import VaultManager
from notevault_app.core.notes_service import NotesService


@pytest.fixture
def app():
    instance = QApplication.instance()
    if instance is None:
        instance = QApplication(sys.argv)
    return instance


@pytest.fixture
def temp_vault(tmp_path):
    root = tmp_path / "vault"
    root.mkdir()
    vm = VaultManager(root)
    svc = NotesService(vm)
    return vm, svc


def test_split_notes_initial_state(app, temp_vault):
    vm, svc = temp_vault
    split = SplitNotes(vm, svc)
    assert len(split._panes) == 1
    assert split._active is split._panes[0]
    assert split._active._tab_row.styleSheet().find("border-top:2px solid") != -1


def test_split_notes_horizontal_split(app, temp_vault):
    vm, svc = temp_vault
    split = SplitNotes(vm, svc)
    first_pane = split._panes[0]

    # Create dummy note file
    note_path = vm.vault_root / "Test.md"
    note_path.write_text("# Test\nContent", encoding="utf-8")
    first_pane.open_note(note_path)

    # Perform horizontal split
    second_pane = split.split_pane(orientation=Qt.Horizontal)
    assert len(split._panes) == 2
    assert split._active is second_pane
    assert second_pane.current_path() == note_path
    assert second_pane._tab_row.styleSheet().find("border-top:2px solid") != -1
    # First pane is no longer active
    assert first_pane._tab_row.styleSheet().find("border-top:2px solid transparent") != -1


def test_split_notes_vertical_split(app, temp_vault):
    vm, svc = temp_vault
    split = SplitNotes(vm, svc)
    first_pane = split._panes[0]

    # Perform vertical split
    second_pane = split.split_pane(orientation=Qt.Vertical)
    assert len(split._panes) == 2
    assert split._active is second_pane

    # Parent splitter of second_pane should be Qt.Vertical
    parent_sp = split._parent_splitter(second_pane)
    assert parent_sp is not None
    assert parent_sp.orientation() == Qt.Vertical


def test_split_notes_tab_detach_and_attach(app, temp_vault):
    vm, svc = temp_vault
    split = SplitNotes(vm, svc)
    first_pane = split._panes[0]

    note1 = vm.vault_root / "Note1.md"
    note1.write_text("# Note 1", encoding="utf-8")
    note2 = vm.vault_root / "Note2.md"
    note2.write_text("# Note 2", encoding="utf-8")

    first_pane.open_note(note1)
    first_pane.open_note(note2, new_tab=True)
    assert len(first_pane._open) == 2

    # Split to second pane
    second_pane = split.split_pane(orientation=Qt.Horizontal)
    # Detach Note 2 from first pane
    detached = first_pane.detach_note(1)
    assert detached is not None
    assert detached.path == note2
    assert len(first_pane._open) == 1

    # Attach to second pane
    second_pane.attach_note(detached)
    assert second_pane.current_path() == note2


def test_split_notes_hit_test(app, temp_vault):
    vm, svc = temp_vault
    split = SplitNotes(vm, svc)
    split.resize(800, 600)
    split.show()
    app.processEvents()

    first_pane = split._panes[0]
    first_pane.resize(800, 600)

    # Center zone
    pane, zone, rect, label = split._hit_test_drop(QPoint(400, 300))
    assert pane is first_pane
    assert zone == "center"
    assert label == "Mover a pestaña"

    # Left zone (< 25% of 800 = < 200)
    pane, zone, rect, label = split._hit_test_drop(QPoint(50, 300))
    assert zone == "left"
    assert label == "Dividir a la izquierda"

    # Right zone (> 75% of 800 = > 600)
    pane, zone, rect, label = split._hit_test_drop(QPoint(750, 300))
    assert zone == "right"
    assert label == "Dividir a la derecha"

    # Top zone (< 25% of 600 = < 150)
    pane, zone, rect, label = split._hit_test_drop(QPoint(400, 50))
    assert zone == "top"
    assert label == "Dividir arriba"

    # Bottom zone (> 75% of 600 = > 450)
    pane, zone, rect, label = split._hit_test_drop(QPoint(400, 550))
    assert zone == "bottom"
    assert label == "Dividir abajo"

    split.close()


def test_split_notes_close_pane(app, temp_vault):
    vm, svc = temp_vault
    split = SplitNotes(vm, svc)
    first_pane = split._panes[0]
    second_pane = split.split_pane(orientation=Qt.Horizontal)
    assert len(split._panes) == 2

    # Closing second pane leaves only first pane
    split._close_pane(second_pane)
    assert len(split._panes) == 1
    assert split._panes[0] is first_pane
    assert split._active is first_pane

    # Cannot close the only remaining pane
    split._close_pane(first_pane)
    assert len(split._panes) == 1


def test_split_notes_nested_split(app, temp_vault):
    vm, svc = temp_vault
    split = SplitNotes(vm, svc)
    p1 = split._panes[0]

    # Split horizontally: p1, p2
    p2 = split.split_pane(p1, orientation=Qt.Horizontal)
    assert len(split._panes) == 2

    # Split p2 vertically: p2, p3
    p3 = split.split_pane(p2, orientation=Qt.Vertical)
    assert len(split._panes) == 3

    # Close p3: sub-splitter should collapse back
    split._close_pane(p3)
    assert len(split._panes) == 2
    assert p3 not in split._panes
    assert split._active is p2 or split._active in split._panes

