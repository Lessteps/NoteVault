"""
NoteVault Habit Left Panel
Left-side navigation panel for Habit Tracker views.
"""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QFrame,
)
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont

from ...core.habit_manager import HabitManager
from .habit_tracker.habit_tracker_panel import (
    VIEW_DAILY, VIEW_OVERVIEW, VIEW_WEEKLY, VIEW_MONTHLY, VIEW_ANNUAL, VIEW_MANAGE,
)


def _section_label(text: str) -> QLabel:
    lbl = QLabel(text.upper())
    lbl.setObjectName("sectionLabel")
    f = lbl.font()
    f.setLetterSpacing(QFont.AbsoluteSpacing, 0.9)
    lbl.setFont(f)
    lbl.setStyleSheet("background:transparent;border:none;padding-left:6px;")
    return lbl


class _NavBtn(QPushButton):
    def __init__(self, icon: str, label: str, parent=None):
        super().__init__(parent)
        self.setCheckable(True)
        self.setFixedHeight(38)
        self.setCursor(Qt.PointingHandCursor)

        row = QHBoxLayout(self)
        row.setContentsMargins(12, 0, 12, 0)
        row.setSpacing(10)

        self._ico = QLabel(icon)
        self._ico.setStyleSheet("font-size:14px;background:transparent;border:none;")
        self._ico.setFixedWidth(20)
        row.addWidget(self._ico)

        self._txt = QLabel(label)
        self._txt.setStyleSheet("background:transparent;border:none;")
        row.addWidget(self._txt, stretch=1)

        self.setStyleSheet("""
            QPushButton {
                background: transparent;
                border: none;
                border-radius: 6px;
                text-align: left;
                color: #888895;
            }
            QPushButton:hover {
                background: #26262e;
                color: #dcdde0;
            }
            QPushButton:checked {
                background: rgba(35,131,226,0.15);
                color: #2383e2;
            }
        """)


def _divider() -> QFrame:
    f = QFrame()
    f.setFixedHeight(1)
    f.setObjectName("vaultPopupDivider")
    return f


class HabitLeftPanel(QWidget):
    view_requested = Signal(int)

    def __init__(self, manager: HabitManager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self.setObjectName("sidebarPanel")
        self._active_view = VIEW_OVERVIEW
        self._btns: dict[int, _NavBtn] = {}
        self._init_ui()

    def _init_ui(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(8, 16, 8, 12)
        lay.setSpacing(2)

        lay.addWidget(_section_label("Hábitos"))
        lay.addSpacing(6)

        for idx, icon, label in [
            (VIEW_OVERVIEW, "◈",  "Vista General"),
            (VIEW_DAILY,    "📋", "Diaria"),
            (VIEW_WEEKLY,   "📅", "Semanal"),
            (VIEW_MONTHLY,  "📆", "Mensual"),
            (VIEW_ANNUAL,   "🏆", "Anual"),
        ]:
            btn = _NavBtn(icon, label)
            btn.setChecked(idx == self._active_view)
            btn.clicked.connect(lambda _, i=idx: self._switch(i))
            lay.addWidget(btn)
            self._btns[idx] = btn

        lay.addSpacing(6)
        lay.addWidget(_divider())
        lay.addSpacing(6)

        manage_btn = _NavBtn("⚙", "Gestionar hábitos")
        manage_btn.clicked.connect(lambda: self._switch(VIEW_MANAGE))
        lay.addWidget(manage_btn)
        self._btns[VIEW_MANAGE] = manage_btn

        lay.addStretch()

    def _switch(self, index: int):
        self._active_view = index
        for i, btn in self._btns.items():
            btn.setChecked(i == index)
        self.view_requested.emit(index)

    def set_active(self, index: int):
        self._active_view = index
        for i, btn in self._btns.items():
            btn.setChecked(i == index)
