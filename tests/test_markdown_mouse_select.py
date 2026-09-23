"""The Markdown source editor must extend a selection on mouse drag.

``NoteSourceEdit.mouseMoveEvent`` calls ``_set_cursor_shape``; that method only
existed on the rich editor's ``_NoteSurface`` mixin, so every mouse-move in
Markdown mode raised ``AttributeError`` before reaching ``super()``. The event
handler then never extended the selection, so a click-drag selected nothing and
only Shift+arrows worked. This locks the method in place.
"""
import os
import unittest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtCore import QEvent, QPointF, Qt
from PySide6.QtGui import QMouseEvent
from PySide6.QtWidgets import QApplication

from notevault_app.ui.components.notes.note_view import NoteSourceEdit

_app = QApplication.instance() or QApplication([])


class TestMarkdownMouseSelect(unittest.TestCase):
    def setUp(self):
        self.ed = NoteSourceEdit()
        self.ed.setPlainText("Hello world this is a plain line of text to drag over.")
        self.ed.resize(400, 120)

    def test_has_cursor_shape_setter(self):
        self.assertTrue(hasattr(self.ed, "_set_cursor_shape"))

    def test_mouse_move_does_not_raise(self):
        # Before the fix this raised AttributeError and swallowed the super()
        # call that drives drag selection.
        pos = QPointF(40, 30)
        ev = QMouseEvent(QEvent.MouseMove, pos, Qt.NoButton,
                         Qt.LeftButton, Qt.NoModifier)
        try:
            self.ed.mouseMoveEvent(ev)
        except AttributeError as exc:
            self.fail(f"mouseMoveEvent raised: {exc}")


if __name__ == "__main__":
    unittest.main()
