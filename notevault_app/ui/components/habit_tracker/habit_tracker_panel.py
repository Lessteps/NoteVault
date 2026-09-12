"""
Habit Tracker Panel
Center panel holding all habit views, switched from HabitLeftPanel.
"""

from PySide6.QtWidgets import QWidget, QVBoxLayout, QStackedWidget
from PySide6.QtCore import Signal

from ....core.habit_manager import HabitManager
from .overview_view import OverviewView
from .weekly_view import WeeklyView
from .monthly_view import MonthlyView
from .annual_view import AnnualView
from .daily_view import DailyView
from .habit_manage_view import HabitManageView

VIEW_OVERVIEW = 0
VIEW_WEEKLY   = 1
VIEW_MONTHLY  = 2
VIEW_ANNUAL   = 3
VIEW_DAILY    = 4
VIEW_MANAGE   = 5


class HabitTrackerPanel(QWidget):
    data_changed  = Signal()
    habits_changed = Signal()   # emitted when habit list is added/removed
    view_changed  = Signal(int)  # emitted when the visible view changes

    def __init__(self, manager: HabitManager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self.setObjectName("centerPanel")
        self._loaded: set[int] = set()
        self._init_ui()
        self.show_view(VIEW_OVERVIEW)

    def _init_ui(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)

        self._stack = QStackedWidget()
        self._overview = OverviewView(self.manager)
        self._weekly   = WeeklyView(self.manager)
        self._monthly  = MonthlyView(self.manager)
        self._annual   = AnnualView(self.manager)
        self._daily    = DailyView(self.manager)
        self._manage   = HabitManageView(self.manager)

        self._views = [
            self._overview,  # 0
            self._weekly,    # 1
            self._monthly,   # 2
            self._annual,    # 3
            self._daily,     # 4
            self._manage,    # 5
        ]
        for v in self._views:
            self._stack.addWidget(v)
            if hasattr(v, "data_changed"):
                v.data_changed.connect(self.data_changed.emit)

        # Annual view month click → navigate to monthly view for that month
        self._annual.month_requested.connect(self.show_monthly_for)

        # Manage view habit changes → refresh all views + notify
        self._manage.habits_changed.connect(self._on_habits_changed)

        lay.addWidget(self._stack)

    def show_view(self, index: int):
        self._stack.setCurrentIndex(index)
        self._views[index].refresh()
        self._loaded.add(index)
        self.view_changed.emit(index)

    def show_monthly_for(self, year: int, month: int):
        """Navigate directly to monthly view for a specific year/month."""
        self._monthly.set_month(year, month)
        self.show_view(VIEW_MONTHLY)

    def _on_habits_changed(self):
        # Clear day cache so habit list changes are reflected in all views
        self.manager._day_cache.clear()
        self.habits_changed.emit()

    def refresh_all(self):
        """Force-refresh the currently visible view after habit list changes."""
        idx = self._stack.currentIndex()
        self._loaded.discard(idx)
        self.show_view(idx)

    def set_manager(self, manager: HabitManager):
        self.manager = manager
        self._loaded.clear()
        for v in self._views:
            if hasattr(v, "set_manager"):
                v.set_manager(manager)
        self.show_view(self._stack.currentIndex())
