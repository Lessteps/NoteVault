"""Tests for MainWindow responsive layout breakpoints (Feature C)."""

import pytest
from PySide6.QtWidgets import QApplication

from notevault_app.ui.main_window import MainWindow, MODE_NOTAS

app = QApplication.instance() or QApplication(["test", "-platform", "offscreen"])


@pytest.fixture
def main_win():
    win = MainWindow()
    win._switch_mode(MODE_NOTAS)
    win._assistant_visible = True
    win._apply_mode_layout()
    win.resize(1280, 800)
    win.show()
    return win


def test_breakpoints_auto_collapse_and_restore(main_win):
    # At 1280px, both side panels are visible
    assert main_win.width() == 1280
    assert main_win._left_stack.isVisible()
    assert main_win._right_stack.isVisible()

    # Below 900px: right stack (assistant) auto-collapses
    main_win.resize(850, 800)
    assert main_win.width() == 850
    assert main_win._left_stack.isVisible()
    assert not main_win._right_stack.isVisible()

    # Below 680px: left stack also auto-collapses
    main_win.resize(600, 800)
    assert main_win.width() == 600
    assert not main_win._left_stack.isVisible()
    assert not main_win._right_stack.isVisible()

    # Down to 520px: window can shrink cleanly
    main_win.resize(520, 800)
    assert main_win.width() == 520

    # Back to 1280px: both panels are restored
    main_win.resize(1280, 800)
    assert main_win.width() == 1280
    assert main_win._left_stack.isVisible()
    assert main_win._right_stack.isVisible()


def test_user_manual_hide_preserved_across_breakpoints(main_win):
    # User manually closes assistant
    main_win.toggle_assistant()
    assert not main_win._right_stack.isVisible()
    assert main_win._user_hidden_right

    # Shrink to 600px
    main_win.resize(600, 800)
    assert not main_win._left_stack.isVisible()
    assert not main_win._right_stack.isVisible()

    # Expand to 1280px: left stack restores, but right stack remains hidden because user hid it
    main_win.resize(1280, 800)
    assert main_win._left_stack.isVisible()
    assert not main_win._right_stack.isVisible(), "User-hidden panel should not auto-reopen"
