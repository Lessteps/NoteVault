"""
Ctrl+P command palette for the notes editor.

A floating search box over the editor, like Obsidian's and VS Code's: type
to filter, arrows to move, Enter to run, Esc to close. Commands that do not
apply right now (a table command outside a table) are listed but disabled,
so the palette also teaches what exists.
"""

import unicodedata
from dataclasses import dataclass
from typing import Callable

from PySide6.QtCore import Qt, QEvent
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QLineEdit, QListWidget, QListWidgetItem, QLabel,
    QFrame,
)

BG      = "#202024"
BORDER  = "#33333e"
TEXT    = "#dcdde0"
DIM     = "#888895"
FAINT   = "#666672"
ACCENT  = "#7c5af0"


@dataclass
class Command:
    title: str
    group: str
    run: Callable[[], object]
    shortcut: str = ""
    enabled: Callable[[], bool] = lambda: True
    id: str = ""            # stable id for hotkey overrides; defaults to title


# Providers of commands that exist everywhere, not only inside a note (the
# WEB module is opened from here). MainWindow registers them at start-up.
_GLOBAL_PROVIDERS: list = []


def register_global_commands(provider: Callable[[], list]):
    if provider not in _GLOBAL_PROVIDERS:
        _GLOBAL_PROVIDERS.append(provider)


def global_commands() -> list:
    out = []
    for provider in _GLOBAL_PROVIDERS:
        try:
            out.extend(provider())
        except Exception:
            pass
    return out


def _fold(text: str) -> str:
    """Lowercase without accents, so "tabla" finds "Tablá" and "anadir"
    finds "Añadir"."""
    norm = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in norm if not unicodedata.combining(ch))


def matches(query: str, command: Command) -> bool:
    words = _fold(query).split()
    haystack = _fold(f"{command.group} {command.title}")
    return all(w in haystack for w in words)


class CommandPalette(QDialog):
    def __init__(self, commands: list, parent=None):
        super().__init__(parent, Qt.Popup | Qt.FramelessWindowHint)
        self.setAttribute(Qt.WA_TranslucentBackground, False)
        self._commands = commands
        self._shown: list = []
        self.chosen: Command = None
        self.setFixedWidth(560)

        frame = QFrame(self)
        frame.setObjectName("paletteFrame")
        frame.setStyleSheet(
            f"QFrame#paletteFrame{{background:{BG};border:1px solid {BORDER};"
            "border-radius:10px;}"
        )
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addWidget(frame)

        lay = QVBoxLayout(frame)
        lay.setContentsMargins(10, 10, 10, 8)
        lay.setSpacing(6)

        self._input = QLineEdit()
        self._input.setPlaceholderText("Escribe un comando…  (web, tabla, checklist, imagen…)")
        self._input.setStyleSheet(
            f"QLineEdit{{background:#1a1a1e;border:1px solid {BORDER};border-radius:7px;"
            f"color:{TEXT};font-family:'Segoe UI Variable Text','Segoe UI';"
            "font-size:14px;padding:8px 10px;}"
            f"QLineEdit:focus{{border-color:{ACCENT};}}"
        )
        self._input.textChanged.connect(self._refilter)
        self._input.installEventFilter(self)
        lay.addWidget(self._input)

        self._list = QListWidget()
        self._list.setFrameShape(QListWidget.NoFrame)
        self._list.setStyleSheet(
            f"QListWidget{{background:transparent;border:none;color:{TEXT};"
            "font-family:'Segoe UI Variable Text','Segoe UI';font-size:13px;outline:0;}"
            "QListWidget::item{padding:7px 8px;border-radius:6px;}"
            f"QListWidget::item:selected{{background:rgba(124, 90, 240, 0.22);color:{TEXT};}}"
            f"QListWidget::item:disabled{{color:{FAINT};}}"
        )
        self._list.setMinimumHeight(320)
        self._list.itemActivated.connect(self._run_item)
        self._list.itemClicked.connect(self._run_item)
        lay.addWidget(self._list)

        hint = QLabel("↑↓ para moverte   ·   Enter para ejecutar   ·   Esc para cerrar")
        hint.setStyleSheet(f"color:{FAINT};font-size:10px;background:transparent;border:none;")
        lay.addWidget(hint)

        self._refilter("")

    def _refilter(self, text: str):
        self._list.clear()
        self._shown = [c for c in self._commands if matches(text, c)]
        first_enabled = None
        for i, cmd in enumerate(self._shown):
            label = f"{cmd.group}:  {cmd.title}"
            if cmd.shortcut:
                label += f"      {cmd.shortcut}"
            item = QListWidgetItem(label)
            item.setData(Qt.UserRole, i)
            if not cmd.enabled():
                item.setFlags(Qt.NoItemFlags)
            elif first_enabled is None:
                first_enabled = item
            self._list.addItem(item)
        if first_enabled is not None:
            self._list.setCurrentItem(first_enabled)

    def _step(self, delta: int):
        count = self._list.count()
        if not count:
            return
        row = self._list.currentRow()
        for _ in range(count):
            row = (row + delta) % count
            if self._list.item(row).flags() & Qt.ItemIsEnabled:
                self._list.setCurrentRow(row)
                return

    def eventFilter(self, obj, event):
        if obj is self._input and event.type() == QEvent.KeyPress:
            key = event.key()
            if key == Qt.Key_Down:
                self._step(1)
                return True
            if key == Qt.Key_Up:
                self._step(-1)
                return True
            if key in (Qt.Key_Return, Qt.Key_Enter):
                item = self._list.currentItem()
                if item is not None:
                    self._run_item(item)
                return True
            if key == Qt.Key_Escape:
                self.reject()
                return True
        return super().eventFilter(obj, event)

    def _run_item(self, item: QListWidgetItem):
        if not item.flags() & Qt.ItemIsEnabled:
            return
        self.chosen = self._shown[item.data(Qt.UserRole)]
        self.accept()

    def popup_over(self, widget):
        """Show near the top of widget, horizontally centred, and focus the box."""
        top_left = widget.mapToGlobal(widget.rect().topLeft())
        x = top_left.x() + max(0, (widget.width() - self.width()) // 2)
        self.move(x, top_left.y() + 60)
        self._input.setFocus()
        return self.exec()
