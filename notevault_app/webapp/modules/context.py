"""One set of core managers per vault, wired the way the Qt main window
wires them, so every module (and the calendar that merges them) shares the
same instances."""

from __future__ import annotations

from pathlib import Path

from ...core.area_manager import AreaManager
from ...core.exercise_manager import ExerciseManager
from ...core.finance_manager import FinanceCalendarSource, FinanceManager
from ...core.goal_manager import GoalCalendarSource, GoalManager
from ...core.habit_manager import HabitManager
from ...core.project_manager import ProjectCalendarSource, ProjectManager
from ...core.schedule_manager import ScheduleManager
from ...core.task_manager import TaskManager


class Managers:
    def __init__(self, root: Path):
        self.root = root
        self.habits = HabitManager(root)
        self.exercise = ExerciseManager(root)
        self.tasks = TaskManager(root)
        self.projects = ProjectManager(root)
        self.areas = AreaManager(root)
        self.goals = GoalManager(root, habit_mgr=self.habits, area_mgr=self.areas)
        self.finances = FinanceManager(root)
        self.schedule = ScheduleManager(
            root, habit_mgr=self.habits, exercise_mgr=self.exercise,
            task_mgr=self.tasks, project_mgr=self.projects)
        self.schedule.register_source("metas", GoalCalendarSource(self.goals))
        self.schedule.register_source("proyectos", ProjectCalendarSource(self.projects))
        self.schedule.register_source("finanzas", FinanceCalendarSource(self.finances))

    def fresh(self) -> "Managers":
        """Forget in-memory caches that are not checked against the disk:
        the classic app may have written in between."""
        self.habits.reload()
        self.exercise._exercises = None
        self.exercise._log_cache.clear()
        self.goals._goals_cache = None
        self.goals._items_cache.clear()
        return self


class ManagersMixin:
    """Mixed into NoteVaultApi; relies on its _root."""

    def _mgrs(self) -> Managers:
        m = getattr(self, "_managers", None)
        if m is None or m.root != self._root:
            m = self._managers = Managers(self._root)
            return m
        return m.fresh()
