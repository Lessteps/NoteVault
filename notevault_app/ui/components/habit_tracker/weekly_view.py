"""
Habit Tracker — Vista Semanal ("Esta Semana")
Notion-style table: one row per day, one column per habit.
"""

from datetime import date, timedelta
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QScrollArea, QFrame,
)
from PySide6.QtCore import Qt, Signal

from ....core.habit_manager import HabitManager, HabitDay, habit_active_on, habit_days, DAY_NAMES_ES, MONTH_NAMES
from .notion_widgets import (
    ProgressBlocks, NotionCheck, SectionHeader, ViewPill, NavButton,
    card_frame, table_row, cell, notes_edit, vsep, check_container,
    COL_DATE, COL_PROG, COL_HABIT, BG_PAGE, TEXT, TEXT_DIM, TEXT_FAINT, HEAD_H,
)


def format_date(d: date) -> str:
    return f"{d.day} {MONTH_NAMES[d.month]}, {d.year}"



def _habit_tooltip(h: dict) -> str:
    """Name of the habit plus the weekdays it runs on, shown on hover."""
    days = habit_days(h)
    when = ("todos los días" if len(days) == 7
            else ", ".join(DAY_NAMES_ES[d] for d in sorted(days)))
    return f"{h['icon']}  {h['name']} — {when}"

class WeeklyView(QWidget):
    data_changed = Signal()

    def __init__(self, manager: HabitManager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self._ref_date = date.today()
        self._init_ui()

    # ── Layout skeleton (built once) ──────────────────────────────────────

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

        self._header = SectionHeader("🗓", "Esta Semana")
        self._prev = NavButton("←")
        self._next = NavButton("→")
        self._range = QLabel()
        self._range.setStyleSheet(
            f"color:{TEXT_DIM};font-size:12px;background:transparent;"
        )
        self._prev.clicked.connect(self._prev_week)
        self._next.clicked.connect(self._next_week)
        self._header.row.addWidget(self._range)
        self._header.row.addSpacing(10)
        self._header.row.addWidget(self._prev)
        self._header.row.addWidget(self._next)
        card_lay.addWidget(self._header)

        pill_row = QHBoxLayout()
        pill_row.addWidget(ViewPill("▦", "Tabla"))
        pill_row.addStretch()
        card_lay.addLayout(pill_row)

        self._table = QVBoxLayout()
        self._table.setContentsMargins(0, 0, 0, 0)
        self._table.setSpacing(0)
        card_lay.addLayout(self._table)

        page.addWidget(card)
        page.addStretch()
        scroll.setWidget(content)
        outer.addWidget(scroll)

    # ── Navigation ────────────────────────────────────────────────────────

    def _prev_week(self):
        self._ref_date -= timedelta(weeks=1)
        self.refresh()

    def _next_week(self):
        self._ref_date += timedelta(weeks=1)
        self.refresh()

    # ── Data render ───────────────────────────────────────────────────────

    def refresh(self):
        while self._table.count():
            item = self._table.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        habits = self.manager.habits()
        days = self._days = self.manager.get_week(self._ref_date)
        today = date.today()

        monday = self._ref_date - timedelta(days=self._ref_date.weekday())
        sunday = monday + timedelta(days=6)
        self._range.setText(f"{format_date(monday)} — {format_date(sunday)}")

        self._table.addWidget(self._header_row(habits))
        for day in days:
            self._table.addWidget(self._day_row(day, habits, today))
        self._table.addWidget(self._average_row(days, habits, today))

    def _header_row(self, habits) -> QWidget:
        w, lay = table_row(height=HEAD_H)
        lay.addWidget(cell("▦  Fecha", COL_DATE, color=TEXT_FAINT, size=11))
        lay.addWidget(vsep())
        lay.addWidget(cell("◷  Progreso", COL_PROG, color=TEXT_FAINT, size=11))
        lay.addWidget(vsep())
        for h in habits:
            ico = cell(h["icon"], COL_HABIT, Qt.AlignCenter, TEXT_FAINT, 12)
            ico.setToolTip(_habit_tooltip(h))
            lay.addWidget(ico)
            lay.addWidget(vsep())
        lay.addWidget(cell("✎  Notas", 0, color=TEXT_FAINT, size=11))
        return w

    def _day_row(self, day: HabitDay, habits, today: date) -> QWidget:
        w, lay = table_row()
        future = day.date > today
        is_today = day.date == today

        color = TEXT_FAINT if future else TEXT
        lay.addWidget(cell(format_date(day.date), COL_DATE,
                           color=color, bold=is_today))
        lay.addWidget(vsep())

        bar = ProgressBlocks(day.completion_pct(habits))
        bar.setFixedWidth(COL_PROG)
        lay.addWidget(bar)
        lay.addWidget(vsep())

        for h in habits:
            if not habit_active_on(h, day.date):
                lay.addWidget(check_container(
                    cell("·", 0, Qt.AlignCenter, TEXT_FAINT, 13)))
                lay.addWidget(vsep())
                continue
            chk = NotionCheck(day.completed.get(h["id"], False))
            if future:
                chk.setEnabled(False)
            chk.toggled_habit.connect(
                self._make_toggle(day, h["id"], bar, habits)
            )
            lay.addWidget(check_container(chk))
            lay.addWidget(vsep())

        notes = notes_edit(day.notes)
        if future:
            notes.setEnabled(False)
        notes.editingFinished.connect(self._make_notes(day, notes))
        lay.addWidget(notes, stretch=1)
        return w

    def _average_row(self, days, habits, today: date) -> QWidget:
        w, lay = table_row(separator=False)
        self._avg_labels = []

        lay.addWidget(cell("", COL_DATE))
        lay.addWidget(cell("", 1))
        lay.addWidget(cell("AVERAGE", COL_PROG, Qt.AlignRight,
                           TEXT_FAINT, 10))
        lay.addWidget(cell("", 1))
        for h in habits:
            lbl = cell("0", COL_HABIT, Qt.AlignCenter, TEXT_DIM, 12)
            self._avg_labels.append(lbl)
            lay.addWidget(lbl)
            lay.addWidget(cell("", 1))
        lay.addWidget(cell("", 0))
        self._update_averages(days, habits, today)
        return w

    def _update_averages(self, days, habits, today: date):
        past = [d for d in days if d.date <= today]
        for lbl, h in zip(self._avg_labels, habits):
            done = sum(1 for d in past
                       if habit_active_on(h, d.date)
                       and d.completed.get(h["id"], False))
            lbl.setText(str(done))

    # ── Persistence helpers ───────────────────────────────────────────────

    def _make_toggle(self, day: HabitDay, habit_id: str,
                     bar: ProgressBlocks, habits):
        def handler(state: bool):
            day.completed[habit_id] = state
            self.manager.save_day(day)
            bar.set_pct(day.completion_pct(habits))
            self._update_averages(self._days, habits, date.today())
            self.data_changed.emit()
        return handler

    def _make_notes(self, day: HabitDay, editor):
        def handler():
            if day.notes != editor.text():
                day.notes = editor.text()
                self.manager.save_day(day)
        return handler

    def set_manager(self, manager: HabitManager):
        self.manager = manager
        self.refresh()
