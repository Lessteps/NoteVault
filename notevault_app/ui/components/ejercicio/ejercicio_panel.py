"""
Ejercicio Panel (stacked center panel).
  Index 0 : EjercicioOverview
  Index 1-7: EjercicioTracker (one per day)
  Index 8 : EjercicioManage
"""

from PySide6.QtWidgets import QWidget, QVBoxLayout, QStackedWidget
from PySide6.QtCore import Signal

from ....core.exercise_manager import ExerciseManager
from .ejercicio_overview import EjercicioOverview
from .ejercicio_tracker import EjercicioTracker
from .ejercicio_manage import EjercicioManage
from .ejercicio_registro import EjercicioRegistro
from .ejercicio_video_player import EjercicioVideoPlayer
from .exercise_data import DAYS

VIEW_OVERVIEW = 0
DAYS_KEYS = [d["key"] for d in DAYS]   # indices 1-7
VIEW_MANAGE   = 8
VIEW_REGISTRO = 9
VIEW_VIDEO    = 10


class EjercicioPanel(QWidget):
    def __init__(self, manager: ExerciseManager = None, parent=None):
        super().__init__(parent)
        self.setObjectName("centerPanel")
        self._manager: ExerciseManager | None = manager
        self._trackers: dict[str, EjercicioTracker] = {}
        self._active_day_key: str = "lunes"
        self._init_ui()

    def _init_ui(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)
        self._stack = QStackedWidget()

        self._overview = EjercicioOverview(self._manager or _dummy_manager())
        self._stack.addWidget(self._overview)   # 0

        for day in DAYS:
            tracker = EjercicioTracker(
                self._manager or _dummy_manager(), day["key"]
            )
            tracker.play_video.connect(self._show_video)
            self._trackers[day["key"]] = tracker
            self._stack.addWidget(tracker)      # 1-7

        self._manage = EjercicioManage(self._manager or _dummy_manager())
        self._manage.exercises_changed.connect(self._on_exercises_changed)
        self._stack.addWidget(self._manage)     # 8

        self._registro = EjercicioRegistro(self._manager or _dummy_manager())
        self._stack.addWidget(self._registro)   # 9

        self._video_player = EjercicioVideoPlayer()
        self._video_player.back_requested.connect(self._return_from_video)
        self._stack.addWidget(self._video_player)  # 10

        lay.addWidget(self._stack)

    def show_view(self, key: str):
        """key = 'overview' | 'registro' | 'lunes'…'domingo' | 'manage'"""
        if key == "overview":
            self._stack.setCurrentIndex(VIEW_OVERVIEW)
            self._overview.refresh()
        elif key == "registro":
            self._stack.setCurrentIndex(VIEW_REGISTRO)
            self._registro.refresh()
        elif key == "manage":
            self._stack.setCurrentIndex(VIEW_MANAGE)
            self._manage.refresh()
        elif key in self._trackers:
            self._active_day_key = key
            idx = DAYS_KEYS.index(key) + 1
            self._stack.setCurrentIndex(idx)
            self._trackers[key].refresh()

    def _show_video(self, path: str, name: str, day_key: str):
        """Switch to the embedded video player."""
        self._active_day_key = day_key
        self._video_player.play(path, name, day_key)
        self._stack.setCurrentIndex(VIEW_VIDEO)

    def _return_from_video(self, day_key: str):
        """Come back to the tracker that launched the video."""
        self._video_player.stop()
        self.show_view(day_key)

    def refresh_current(self):
        idx = self._stack.currentIndex()
        widget = self._stack.widget(idx)
        if widget is not None and hasattr(widget, "refresh"):
            widget.refresh()

    def _on_exercises_changed(self):
        self._overview.refresh()
        self._registro.refresh()
        for tracker in self._trackers.values():
            tracker.refresh()

    def set_manager(self, manager: ExerciseManager):
        self._manager = manager
        self._overview.set_manager(manager)
        self._manage.set_manager(manager)
        self._registro.set_manager(manager)
        for tracker in self._trackers.values():
            tracker.set_manager(manager)
        self.show_view("overview")


class _DummyManager:
    """Placeholder until a real ExerciseManager is provided."""
    def exercises(self): return []
    def exercises_for_day(self, k): return []
    def get_log(self, d): from ....core.exercise_manager import ExerciseLog; return ExerciseLog(d, {})
    def save_log(self, l): pass
    def mark_done(self, *a, **k): pass
    def day_pct(self, d): return 0.0
    def range_pct_by_day(self, y): return {}
    def exercise_history(self, eid, y): return {}
    def add_exercise(self, *a, **k): pass
    def update_exercise(self, *a, **k): pass
    def remove_exercise(self, eid): pass


def _dummy_manager() -> ExerciseManager:
    return _DummyManager()   # type: ignore
