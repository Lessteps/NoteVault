"""
Habit Tracker — Vista General
Four summary cards (day / week / month / year) + per-habit breakdown with
a progress bar for each period.
"""

from datetime import date
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QScrollArea, QFrame,
)
from PySide6.QtCore import Qt

from ....core.habit_manager import HabitManager, MONTH_NAMES
from .notion_widgets import (
    ProgressBlocks, SectionHeader, ViewPill, card_frame, table_row, cell,
    BG_PAGE, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLOCK_FILL,
)
from .streak_widget import StreakGrid


def _pct_color(pct: float) -> str:
    if pct >= 0.8:
        return BLOCK_FILL
    if pct >= 0.5:
        return "#e0a13a"
    return "#f2555a"


class _StatCard(QFrame):
    def __init__(self, title: str, pct: float, parent=None):
        super().__init__(parent)
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.setMinimumHeight(112)
        self.setStyleSheet(
            f"QFrame{{background:#252525;border:1px solid {BORDER};"
            "border-radius:10px;}"
        )
        lay = QVBoxLayout(self)
        lay.setContentsMargins(16, 14, 16, 14)
        lay.setSpacing(8)

        t = QLabel(title)
        t.setStyleSheet(
            f"font-size:11px;color:{TEXT_FAINT};background:transparent;border:none;"
        )
        lay.addWidget(t)

        v = QLabel(f"{pct * 100:.0f}%")
        v.setStyleSheet(
            f"font-size:30px;font-weight:700;color:{_pct_color(pct)};"
            "background:transparent;border:none;"
        )
        lay.addWidget(v)
        lay.addWidget(ProgressBlocks(pct))


class OverviewView(QWidget):
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

        card = card_frame()
        card_lay = QVBoxLayout(card)
        card_lay.setContentsMargins(22, 18, 22, 18)
        card_lay.setSpacing(12)

        card_lay.addWidget(SectionHeader("🗓", "Vista General"))

        pill_row = QHBoxLayout()
        pill_row.addWidget(ViewPill("◈", "Resumen"))
        pill_row.addStretch()
        card_lay.addLayout(pill_row)

        self._body = QVBoxLayout()
        self._body.setContentsMargins(0, 0, 0, 0)
        self._body.setSpacing(0)
        card_lay.addLayout(self._body)

        # Streak heatmap card
        streak_card = card_frame()
        streak_lay = QVBoxLayout(streak_card)
        streak_lay.setContentsMargins(22, 18, 22, 18)
        self._streak = StreakGrid("Habit Streak")
        self._streak.year_changed.connect(self._on_streak_year)
        streak_lay.addWidget(self._streak)

        page.addWidget(card)
        page.addSpacing(14)
        page.addWidget(streak_card)
        page.addStretch()
        scroll.setWidget(content)
        outer.addWidget(scroll)

    def refresh(self):
        while self._body.count():
            item = self._body.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
            elif item.layout():
                self._clear_layout(item.layout())

        today = date.today()
        m = self.manager
        habits = m.habits()

        # ── 4 summary cards ───────────────────────────────────────────────
        cards_row = QHBoxLayout()
        cards_row.setSpacing(12)
        for title, pct in [
            ("Hoy",                      m.day_pct(today)),
            ("Esta semana",              m.week_pct(today)),
            (MONTH_NAMES[today.month],   m.month_pct(today.year, today.month)),
            (str(today.year),            m.year_pct(today.year)),
        ]:
            cards_row.addWidget(_StatCard(title, pct))
        self._body.addLayout(cards_row)

        spacer = QWidget()
        spacer.setFixedHeight(18)
        self._body.addWidget(spacer)

        # ── Per-habit table header ────────────────────────────────────────
        COL_NAME = 180
        COL_BAR  = 120
        head, head_lay = table_row(height=30)
        head_lay.addWidget(cell("HÁBITO", COL_NAME, color=TEXT_FAINT, size=10))
        for lbl in ["HOY", "SEMANA", "MES", "AÑO"]:
            head_lay.addWidget(cell(lbl, COL_BAR, Qt.AlignCenter, TEXT_FAINT, 10))
        head_lay.addStretch()
        self._body.addWidget(head)

        # ── Pre-compute ranges ────────────────────────────────────────────
        today_day   = m.get_day(today)
        week_days   = m.get_week(today)
        month_days  = m.get_month(today.year, today.month)
        past_month  = [d for d in month_days if d.date <= today]
        year_months = m.get_year_summary(today.year)
        year_pct    = (
            sum(p for _, p in year_months if p > 0)
            / max(1, sum(1 for _, p in year_months if p > 0))
        )

        # Refresh streak heatmap
        self._refresh_streak(today.year)

        for h in habits:
            hid = h["id"]
            day_val   = 1 if today_day.completed.get(hid, False) else 0
            week_done = sum(1 for d in week_days if d.completed.get(hid, False))
            mon_done  = sum(1 for d in past_month if d.completed.get(hid, False))

            week_pct  = week_done / max(1, sum(1 for d in week_days if d.date <= today))
            month_pct = mon_done / max(1, len(past_month))

            # Year pct per habit
            year_habit_pct = self._habit_year_pct(hid, today)

            row, rlay = table_row()
            rlay.addWidget(
                cell(f"{h['icon']}   {h['name']}", COL_NAME, color=TEXT, size=12)
            )
            for pct in [float(day_val), week_pct, month_pct, year_habit_pct]:
                bar_w = QWidget()
                bar_w.setFixedWidth(COL_BAR)
                bar_w.setStyleSheet("background:transparent;")
                blay = QHBoxLayout(bar_w)
                blay.setContentsMargins(8, 0, 8, 0)
                blay.addWidget(ProgressBlocks(pct))
                rlay.addWidget(bar_w)
            rlay.addStretch()
            self._body.addWidget(row)

    def _refresh_streak(self, year: int):
        from datetime import timedelta
        start = date(year, 1, 1)
        end   = min(date(year, 12, 31), date.today())
        data: dict[date, float] = {}
        current = start
        while current <= end:
            data[current] = self.manager.day_pct(current)
            current += timedelta(days=1)
        self._streak.set_year_data(year, data)

    def _on_streak_year(self, year: int):
        self._refresh_streak(year)

    def _habit_year_pct(self, habit_id: str, today: date) -> float:
        """Average daily completion rate for this habit across the current year."""
        total, done = 0, 0
        from datetime import timedelta
        start = date(today.year, 1, 1)
        current = start
        while current <= today:
            day = self.manager.get_day(current)
            total += 1
            if day.completed.get(habit_id, False):
                done += 1
            current += timedelta(days=1)
        return done / total if total else 0.0

    def _clear_layout(self, layout):
        while layout.count():
            item = layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
            elif item.layout():
                self._clear_layout(item.layout())

    def set_manager(self, manager: HabitManager):
        self.manager = manager
        self.refresh()
