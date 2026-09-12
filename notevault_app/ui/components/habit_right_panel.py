"""
NoteVault Habit Right Panel
Stats panel shown when Habit Tracker mode is active (right side).
View navigation moved to HabitLeftPanel.
"""

from datetime import date
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QFrame,
)
from PySide6.QtCore import Qt
from PySide6.QtGui import QFont

from ...core.habit_manager import HabitManager, MONTH_NAMES


def _tiny(text: str) -> QLabel:
    lbl = QLabel(text.upper())
    lbl.setObjectName("sectionLabel")
    f = lbl.font()
    f.setLetterSpacing(QFont.AbsoluteSpacing, 0.9)
    lbl.setFont(f)
    return lbl


class _MiniStat(QWidget):
    def __init__(self, label: str, value: str, color: str = "#dcdde0", parent=None):
        super().__init__(parent)
        lay = QHBoxLayout(self)
        lay.setContentsMargins(8, 4, 8, 4)
        k = QLabel(label)
        k.setStyleSheet(
            "color:#666672;font-size:11px;background:transparent;border:none;"
        )
        v = QLabel(value)
        v.setStyleSheet(
            f"color:{color};font-weight:600;font-size:11px;background:transparent;"
            "border:none;"
        )
        lay.addWidget(k)
        lay.addStretch()
        lay.addWidget(v)


def _pct_color(pct: float) -> str:
    if pct >= 0.8:
        return "#3fb950"
    if pct >= 0.5:
        return "#e0a13a"
    return "#f2555a"


class HabitRightPanel(QWidget):
    def __init__(self, manager: HabitManager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self.setObjectName("chatPanel")
        self._init_ui()
        self.refresh_stats()

    def _init_ui(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(8, 12, 8, 12)
        lay.setSpacing(6)

        lay.addWidget(_tiny("Estadísticas"))

        self._stats_container = QWidget()
        self._stats_lay = QVBoxLayout(self._stats_container)
        self._stats_lay.setContentsMargins(0, 0, 0, 0)
        self._stats_lay.setSpacing(2)
        lay.addWidget(self._stats_container)

        lay.addStretch()

    def refresh_stats(self):
        while self._stats_lay.count():
            item = self._stats_lay.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        today = date.today()
        m = self.manager

        for label, pct in [
            ("Hoy",                     m.day_pct(today)),
            ("Esta semana",             m.week_pct(today)),
            (MONTH_NAMES[today.month],  m.month_pct(today.year, today.month)),
            (str(today.year),           m.year_pct(today.year)),
        ]:
            self._stats_lay.addWidget(
                _MiniStat(label, f"{pct * 100:.0f}%", _pct_color(pct))
            )

    def set_manager(self, manager: HabitManager):
        self.manager = manager
        self.refresh_stats()
