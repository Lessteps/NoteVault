"""
Componente reutilizable de subtareas / tareas hijas / checklist.
Diseñado para alojarse en múltiples interfaces (Detalle de Issue en Proyectos,
Editor de Tareas, Metas, etc.).
"""

from typing import List, Dict, Any, Optional
from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit, QPushButton, QFrame,
)

from . import (
    TEXT, TEXT_DIM, TEXT_FAINT, GREEN, BLUE, RED, BORDER, UI_FONT,
    label, clear_layout, line_edit,
)
from .widgets import Check, BlockProgress


class SubtaskRow(QWidget):
    toggled = Signal(str, bool)
    deleted = Signal(str)
    clicked = Signal(str)
    renamed = Signal(str, str)

    def __init__(self, item_id: str, title: str, done: bool = False,
                 badge: str = "", colour: str = GREEN, parent=None):
        super().__init__(parent)
        self.item_id = item_id
        self._done = done
        self._colour = colour
        self.setStyleSheet("background: transparent;")

        lay = QHBoxLayout(self)
        lay.setContentsMargins(4, 2, 4, 2)
        lay.setSpacing(8)

        # Checkbox
        self.cb = Check(done, colour, size=15)
        self.cb.toggled_by_user.connect(self._on_toggle)
        lay.addWidget(self.cb)

        # Title Label
        self.title_lbl = QLabel(title)
        self.title_lbl.setCursor(Qt.PointingHandCursor)
        self.title_lbl.mousePressEvent = lambda _e: self.clicked.emit(self.item_id)
        lay.addWidget(self.title_lbl, 1)

        # Optional Badge (e.g. status or key)
        if badge:
            self.badge_lbl = QLabel(badge)
            self.badge_lbl.setStyleSheet(f"color: {TEXT_DIM}; font-size: 10px; font-family: {UI_FONT};")
            lay.addWidget(self.badge_lbl)

        # Delete Button (✕)
        self.del_btn = QPushButton("✕")
        self.del_btn.setFixedSize(20, 20)
        self.del_btn.setCursor(Qt.PointingHandCursor)
        self.del_btn.setToolTip("Eliminar subtarea")
        self.del_btn.setStyleSheet(
            f"QPushButton {{ background: transparent; border: none; color: #55555e; "
            f"font-size: 11px; font-weight: bold; border-radius: 3px; }}"
            f"QPushButton:hover {{ color: {RED}; background: rgba(242, 85, 90, 0.15); }}"
        )
        self.del_btn.clicked.connect(lambda: self.deleted.emit(self.item_id))
        lay.addWidget(self.del_btn)

        self._update_style()

    def set_done(self, done: bool):
        self._done = done
        self.cb.set_checked(done)
        self._update_style()

    def _on_toggle(self, checked: bool):
        self._done = checked
        self._update_style()
        self.toggled.emit(self.item_id, checked)

    def _update_style(self):
        colour = TEXT_FAINT if self._done else TEXT
        strike = "text-decoration: line-through;" if self._done else ""
        self.title_lbl.setStyleSheet(
            f"color: {colour}; font-size: 12px; font-family: {UI_FONT}; {strike} background: transparent;"
        )


class SubtasksWidget(QWidget):
    """
    Subtasks / Checklist widget that can be embedded into any panel or dialog.

    Signals:
        subtask_added(title)
        subtask_toggled(id, done)
        subtask_deleted(id)
        subtask_clicked(id)
        changed()
    """

    subtask_added = Signal(str)
    subtask_toggled = Signal(str, bool)
    subtask_deleted = Signal(str)
    subtask_clicked = Signal(str)
    changed = Signal()

    def __init__(self, title: str = "SUBTAREAS", colour: str = GREEN,
                 can_add: bool = True, parent=None,
                 placeholder: str = "+ Añadir subtarea (Enter)..."):
        super().__init__(parent)
        self._title_text = title
        self._colour = colour
        self._can_add = can_add
        self._placeholder = placeholder
        self._items: List[Dict[str, Any]] = []

        self._build_ui()

    def _build_ui(self):
        self.lay = QVBoxLayout(self)
        self.lay.setContentsMargins(0, 4, 0, 4)
        self.lay.setSpacing(6)

        # ── Header ──────────────────────────────────────────
        self.header_layout = QHBoxLayout()
        self.header_layout.setSpacing(8)

        self.title_label = label(self._title_text.upper(), TEXT_FAINT, 10, bold=True)
        self.header_layout.addWidget(self.title_label)

        self.progress_bar = BlockProgress(0.0, self._colour, blocks=10, block=8)
        self.header_layout.addWidget(self.progress_bar)

        self.count_label = label("0/0", TEXT_DIM, 11)
        self.header_layout.addWidget(self.count_label)

        self.header_layout.addStretch()
        self.lay.addLayout(self.header_layout)

        # ── Subtasks Container ──────────────────────────────
        self.items_box = QVBoxLayout()
        self.items_box.setContentsMargins(0, 0, 0, 0)
        self.items_box.setSpacing(2)
        self.lay.addLayout(self.items_box)

        # ── Quick Inline Add Input ──────────────────────────
        if self._can_add:
            add_row = QHBoxLayout()
            add_row.setSpacing(6)

            self.add_input = line_edit("", height=28)
            self.add_input.setPlaceholderText(self._placeholder)
            self.add_input.setStyleSheet(
                f"QLineEdit {{ background: #202020; border: 1px solid {BORDER}; "
                f"border-radius: 5px; color: {TEXT}; font-size: 12px; padding: 2px 8px; "
                f"font-family: {UI_FONT}; }}"
                f"QLineEdit:focus {{ border-color: {BLUE}; background: #252525; }}"
            )
            self.add_input.returnPressed.connect(self._add_from_input)
            add_row.addWidget(self.add_input, 1)

            add_btn = QPushButton("+")
            add_btn.setFixedSize(28, 28)
            add_btn.setCursor(Qt.PointingHandCursor)
            add_btn.setToolTip("Añadir")
            add_btn.setStyleSheet(
                f"QPushButton {{ background: #252525; border: 1px solid {BORDER}; "
                f"border-radius: 5px; color: {TEXT_DIM}; font-size: 14px; font-weight: bold; }}"
                f"QPushButton:hover {{ background: #2d2d2d; color: {TEXT}; border-color: {BLUE}; }}"
            )
            add_btn.clicked.connect(self._add_from_input)
            add_row.addWidget(add_btn)

            self.lay.addLayout(add_row)

    def set_title(self, text: str):
        self._title_text = text
        self.title_label.setText(text.upper())

    def set_items(self, items: List[Dict[str, Any]]):
        """
        items: list of dicts:
            [{"id": str, "title": str, "done": bool, "badge": str (optional)}]
        """
        self._items = list(items)
        self._render()

    def _render(self):
        clear_layout(self.items_box)
        total = len(self._items)
        done_count = sum(1 for it in self._items if it.get("done"))

        # Update Progress
        fraction = (done_count / total) if total > 0 else 0.0
        self.progress_bar.set_fraction(fraction)
        self.progress_bar.setVisible(total > 0)
        self.count_label.setText(f"{done_count}/{total}" if total > 0 else "")
        self.count_label.setVisible(total > 0)

        for it in self._items:
            iid = str(it.get("id", ""))
            title = str(it.get("title", ""))
            done = bool(it.get("done", False))
            badge = str(it.get("badge", ""))

            row = SubtaskRow(iid, title, done, badge=badge, colour=self._colour)
            row.toggled.connect(self._on_item_toggled)
            row.deleted.connect(self._on_item_deleted)
            row.clicked.connect(self.subtask_clicked.emit)
            self.items_box.addWidget(row)

    def _on_item_toggled(self, item_id: str, done: bool):
        for it in self._items:
            if str(it.get("id")) == item_id:
                it["done"] = done
                break
        total = len(self._items)
        done_count = sum(1 for it in self._items if it.get("done"))
        fraction = (done_count / total) if total > 0 else 0.0
        self.progress_bar.set_fraction(fraction)
        self.count_label.setText(f"{done_count}/{total}")

        self.subtask_toggled.emit(item_id, done)
        self.changed.emit()

    def _on_item_deleted(self, item_id: str):
        self._items = [it for it in self._items if str(it.get("id")) != item_id]
        self._render()
        self.subtask_deleted.emit(item_id)
        self.changed.emit()

    def _add_from_input(self):
        if not hasattr(self, "add_input"):
            return
        text = self.add_input.text().strip()
        if not text:
            return
        self.add_input.clear()
        self.add_input.setFocus()
        self.subtask_added.emit(text)
