"""
Tareas Panel — center stack holding the Tabla, Calendario and
Recordatorios views, plus the background reminder watcher.
"""

from PySide6.QtWidgets import QWidget, QVBoxLayout, QStackedWidget
from PySide6.QtCore import Signal, QTimer

from ....core.task_manager import TaskManager
from .tareas_table import TareasTable
from .tareas_calendar import TareasCalendar
from .tareas_reminders import TareasReminders

VIEW_TABLA        = 0
VIEW_CALENDARIO   = 1
VIEW_RECORDATORIOS = 2

VIEW_KEYS = {"tabla": VIEW_TABLA,
             "calendario": VIEW_CALENDARIO,
             "recordatorios": VIEW_RECORDATORIOS}

CHECK_INTERVAL_MS = 30_000


class TareasPanel(QWidget):
    data_changed     = Signal()
    reminders_changed = Signal(int)      # number of pending reminders
    notify_requested = Signal(str, str)  # (title, body) -> Windows notification

    def __init__(self, manager: TaskManager, parent=None):
        super().__init__(parent)
        self.setObjectName("centerPanel")
        self.manager = manager
        self._init_ui()
        self._init_watcher()

    def _init_ui(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)

        self._stack = QStackedWidget()
        self._table     = TareasTable(self.manager)
        self._calendar  = TareasCalendar(self.manager)
        self._reminders = TareasReminders(self.manager)

        self._views = [self._table, self._calendar, self._reminders]
        for v in self._views:
            self._stack.addWidget(v)
            v.data_changed.connect(self._on_data_changed)

        lay.addWidget(self._stack)
        self._table.refresh()

    def _init_watcher(self):
        self._timer = QTimer(self)
        self._timer.setInterval(CHECK_INTERVAL_MS)
        self._timer.timeout.connect(self._check_reminders)
        self._timer.start()
        QTimer.singleShot(2500, self._check_reminders)

    # ── Views ─────────────────────────────────────────────────────────────

    def show_view(self, key: str):
        idx = VIEW_KEYS.get(key, VIEW_TABLA)
        self._stack.setCurrentIndex(idx)
        self._views[idx].refresh()

    def refresh_current(self):
        self.manager.tasks(force=True)
        self._views[self._stack.currentIndex()].refresh()
        self._emit_reminder_count()

    def _on_data_changed(self):
        self.data_changed.emit()
        self._emit_reminder_count()

    def _emit_reminder_count(self):
        pending = len(self.manager.upcoming_reminders())
        self.reminders_changed.emit(pending)

    # ── Reminder notifications ────────────────────────────────────────────

    def _check_reminders(self):
        self.manager.tasks(force=True)
        due = self.manager.due_reminders()
        self._emit_reminder_count()
        if not due:
            return

        lines = []
        for t in due:
            when = t.reminder.strftime("%H:%M") if t.reminder else ""
            subj = f" · {t.subject}" if t.subject else ""
            limit = f" · vence {t.due.strftime('%d/%m')}" if t.due else ""
            lines.append(f"• {t.name}{subj}{limit}  ({when})")
            self.manager.mark_reminder_shown(t.id)

        title = ("Recordatorio de tarea" if len(due) == 1
                 else f"{len(due)} recordatorios de tareas")
        self.notify_requested.emit(title, "\n".join(lines))

        self.manager.tasks(force=True)
        current = self._stack.currentIndex()
        self._views[current].refresh()
        self._emit_reminder_count()

    # ── Vault switch ──────────────────────────────────────────────────────

    def set_manager(self, manager: TaskManager):
        self.manager = manager
        for v in self._views:
            v.set_manager(manager)
        self.show_view("tabla")
