"""
Habit Tracker — Vista Anual
Expandable year sections, each showing 12 month cards.
Clicking a month navigates to that month in the monthly view.
"""

import calendar
from datetime import date
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QScrollArea, QFrame,
    QGridLayout, QSizePolicy, QPushButton, QLayout,
)
from PySide6.QtCore import Qt, Signal

from ....core.habit_manager import HabitManager, MONTH_NAMES
from .notion_widgets import (
    ProgressBlocks, SectionHeader, ViewPill, card_frame,
    letter_spaced, BG_PAGE, BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT,
    BLOCK_FILL,
)

CARD_WHITE_H = 100
COLUMNS = 4


def _name_font_size(name: str) -> tuple[int, float]:
    n = len(name)
    if n <= 5:
        return 18, 4.5
    if n <= 7:
        return 15, 3.0
    if n <= 9:
        return 12, 1.8
    return 10, 1.0


class _MonthCard(QFrame):
    clicked = Signal(int, int)   # year, month

    def __init__(self, year: int, month: int, pct: float,
                 manager: HabitManager, parent=None):
        super().__init__(parent)
        self._month = month
        self._year = year
        self._manager = manager
        self.setCursor(Qt.PointingHandCursor)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        self.setStyleSheet("background:transparent;")

        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)

        # White plate
        plate = QFrame()
        plate.setAttribute(Qt.WA_StyledBackground, True)
        plate.setFixedHeight(CARD_WHITE_H)
        plate.setStyleSheet(
            "background:#ffffff;border-top-left-radius:6px;"
            "border-top-right-radius:6px;"
        )
        plate_lay = QVBoxLayout(plate)
        plate_lay.setContentsMargins(6, 0, 6, 0)
        size, spacing = _name_font_size(MONTH_NAMES[month])
        plate_lay.addWidget(letter_spaced(MONTH_NAMES[month], size, spacing, "#111111"))
        lay.addWidget(plate)

        # Dark footer
        footer = QFrame()
        footer.setAttribute(Qt.WA_StyledBackground, True)
        footer.setStyleSheet(
            "background:#252525;border-bottom-left-radius:6px;"
            "border-bottom-right-radius:6px;"
        )
        f_lay = QVBoxLayout(footer)
        f_lay.setContentsMargins(8, 6, 8, 7)
        f_lay.setSpacing(4)

        name_row = QHBoxLayout()
        name_row.setSpacing(4)
        ico = QLabel("🗓")
        ico.setStyleSheet(
            f"font-size:10px;color:{TEXT_FAINT};background:transparent;border:none;"
        )
        name_row.addWidget(ico)
        nm = QLabel(MONTH_NAMES[month])
        nm.setStyleSheet(
            f"font-size:10px;color:{TEXT_DIM};background:transparent;border:none;"
        )
        name_row.addWidget(nm)
        name_row.addStretch()
        f_lay.addLayout(name_row)

        today = date.today()
        future = year > today.year or (year == today.year and month > today.month)
        if not future:
            f_lay.addWidget(ProgressBlocks(pct))

        lay.addWidget(footer)

    def mousePressEvent(self, event):
        self.clicked.emit(self._year, self._month)
        super().mousePressEvent(event)


class _YearSection(QWidget):
    """Collapsible section for one year."""
    month_clicked = Signal(int, int)   # year, month

    def __init__(self, year: int, manager: HabitManager,
                 expanded: bool = False, parent=None):
        super().__init__(parent)
        self._year = year
        self._manager = manager
        self._expanded = expanded
        self._build()

    def _build(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(8)

        # Year header button
        hdr = QPushButton()
        hdr.setCursor(Qt.PointingHandCursor)
        hdr.setFixedHeight(36)
        hdr.setStyleSheet(
            f"QPushButton{{background:#252525;border:1px solid {BORDER};"
            "border-radius:8px;text-align:left;padding:0 14px;"
            f"color:{TEXT};font-size:15px;font-weight:600;}}"
            f"QPushButton:hover{{background:#2a2a2a;}}"
        )
        self._arrow = QLabel("▾" if self._expanded else "▸")
        self._arrow.setStyleSheet(
            f"color:{TEXT_DIM};font-size:13px;background:transparent;border:none;"
        )
        self._year_lbl = QLabel(str(self._year))
        self._year_lbl.setStyleSheet(
            f"color:{TEXT};font-size:15px;font-weight:600;"
            "background:transparent;border:none;"
        )

        hdr_row = QHBoxLayout(hdr)
        hdr_row.setContentsMargins(14, 0, 14, 0)
        hdr_row.setSpacing(10)
        hdr_row.addWidget(self._arrow)
        hdr_row.addWidget(self._year_lbl)
        hdr_row.addStretch()
        lay.addWidget(hdr)
        hdr.clicked.connect(self._toggle)

        # Grid of months
        self._grid_widget = QWidget()
        self._grid_widget.setStyleSheet("background:transparent;")
        grid = QGridLayout(self._grid_widget)
        grid.setSpacing(10)
        grid.setContentsMargins(0, 0, 0, 0)

        summary = manager_year_summary(self._manager, self._year)
        for i, (month, pct) in enumerate(summary):
            card = _MonthCard(self._year, month, pct, self._manager)
            card.clicked.connect(self.month_clicked.emit)
            grid.addWidget(card, i // COLUMNS, i % COLUMNS,
                           alignment=Qt.AlignTop)

        lay.addWidget(self._grid_widget)
        self._grid_widget.setVisible(self._expanded)

    def _toggle(self):
        self._expanded = not self._expanded
        self._grid_widget.setVisible(self._expanded)
        self._arrow.setText("▾" if self._expanded else "▸")


def manager_year_summary(manager: HabitManager, year: int):
    """Return (month, pct) pairs for all 12 months of year."""
    import calendar as _cal
    habits = manager.habits()
    today = date.today()
    result = []
    for m in range(1, 13):
        days = [d for d in manager.get_month(year, m) if d.date <= today]
        avg = (
            sum(d.completion_pct(habits) for d in days) / len(days)
            if days else 0.0
        )
        result.append((m, avg))
    return result


class AnnualView(QWidget):
    month_requested = Signal(int, int)   # year, month → navigate to monthly view

    def __init__(self, manager: HabitManager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self._init_ui()

    def _init_ui(self):
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet(f"QScrollArea{{background:{BG_PAGE};border:none;}}")

        content = QWidget()
        content.setStyleSheet(f"background:{BG_PAGE};")
        page = QVBoxLayout(content)
        page.setContentsMargins(20, 18, 20, 20)
        page.setSpacing(0)
        # Keep rows at their natural height; let the area scroll.
        page.setSizeConstraint(QLayout.SetMinimumSize)

        card = card_frame()
        card_lay = QVBoxLayout(card)
        card_lay.setContentsMargins(22, 18, 22, 18)
        card_lay.setSpacing(14)

        hdr = SectionHeader("🗓", "Resumen Mensual")
        card_lay.addWidget(hdr)

        pill_row = QHBoxLayout()
        pill_row.addWidget(ViewPill("⊞", "Vista de galería"))
        pill_row.addStretch()
        card_lay.addLayout(pill_row)

        self._sections_lay = QVBoxLayout()
        self._sections_lay.setSpacing(12)
        card_lay.addLayout(self._sections_lay)

        page.addWidget(card)
        page.addStretch()
        scroll.setWidget(content)
        outer.addWidget(scroll)

    def refresh(self):
        while self._sections_lay.count():
            item = self._sections_lay.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        today = date.today()
        current_year = today.year

        # Show previous year collapsed, current year and next expanded
        for year in [current_year - 1, current_year, current_year + 1]:
            expanded = year >= current_year
            section = _YearSection(year, self.manager, expanded=expanded)
            section.month_clicked.connect(self.month_requested.emit)
            self._sections_lay.addWidget(section)

    def set_manager(self, manager: HabitManager):
        self.manager = manager
        self.refresh()
