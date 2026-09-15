"""
Calendario centre panel: navigation bar, the four views, and the floating
event editor that every view opens.
"""

from datetime import date, datetime, time, timedelta

from PySide6.QtCore import Qt, Signal, QEvent, QPoint, QRect, QSize
from PySide6.QtGui import QKeySequence, QShortcut
from PySide6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QStackedWidget, QFrame, QMenu,
)

from ....config import AppConfig
from ....core.recurrence import Recurrence, parse_date
from ....core.schedule_manager import ScheduleManager, HABIT_PREFIX
from ....core.vault_format import WEEKDAY_KEYS
from .rejilla_horaria import TimeGridView
from .vista_dia import VistaDia
from .vista_semana import VistaSemana
from .vista_mes import VistaMes
from .vista_agenda import VistaAgenda
from .evento_popover import EventPopover
from . import month_name, parse_hm

VIEW_DIA = 0
VIEW_SEMANA = 1
VIEW_MES = 2
VIEW_AGENDA = 3

VIEW_KEYS = {
    "dia": VIEW_DIA,
    "semana": VIEW_SEMANA,
    "mes": VIEW_MES,
    "agenda": VIEW_AGENDA,
}

NAV_QSS = """
QPushButton#calToday {
    background: transparent; border: 1px solid #3a3a4a; border-radius: 18px;
    color: #e6e6e6; font-size: 14px; font-weight: 600; padding: 0px 20px; min-width: 0px;
}
QPushButton#calToday:hover { background: #2a2a2a; }
QPushButton#calArrow {
    background: transparent; border: none; border-radius: 18px; color: #dcdde0;
    font-size: 22px; padding: 0px 0px 4px 0px; min-width: 36px; max-width: 36px;
}
QPushButton#calArrow:hover { background: #2a2a2a; }
"""


MODULE_NAMES = {"metas": "Metas", "proyectos": "Proyectos", "finanzas": "Finanzas"}

MENU_QSS = (
    "QMenu { background: #202020; border: 1px solid #2f2f2f; padding: 6px 0px;"
    " color: #e6e6e6; font-size: 14px; }"
    "QMenu::item { padding: 8px 28px 8px 16px; }"
    "QMenu::item:selected { background: #2a2a2a; }"
    "QMenu::item:disabled { color: #9b9b9b; }")


def _int_or_none(value):
    return value if isinstance(value, int) and not isinstance(value, bool) else None


class CalendarioPanel(QWidget):
    """Main center panel for Calendario module."""

    data_changed = Signal()
    notify_requested = Signal(str, str)
    view_changed = Signal(str)
    date_changed = Signal(date)
    status_message = Signal(str)
    open_habits_requested = Signal(str)    # habit id, or "" for the module
    open_module_requested = Signal(str, dict)   # source ("metas"…), link

    def __init__(self, schedule_mgr: ScheduleManager, parent=None):
        super().__init__(parent)
        self.schedule_mgr = schedule_mgr
        self.setObjectName("centerPanel")

        self.current_date = date.today()
        self.current_view_idx = VIEW_SEMANA
        self.filters: dict = AppConfig.get_calendar_filters()
        self._filtering = False

        self._build_ui()
        self._setup_shortcuts()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self.top_bar = QFrame()
        self.top_bar.setFixedHeight(60)
        self.top_bar.setStyleSheet("QFrame { background-color: #191919; border: none; }" + NAV_QSS)
        bar = QHBoxLayout(self.top_bar)
        bar.setContentsMargins(18, 0, 18, 0)
        bar.setSpacing(6)

        self.today_btn = QPushButton("Hoy")
        self.today_btn.setObjectName("calToday")
        self.today_btn.setFixedHeight(36)
        self.today_btn.setCursor(Qt.PointingHandCursor)
        self.today_btn.clicked.connect(self._nav_today)
        bar.addWidget(self.today_btn)
        bar.addSpacing(10)

        self.prev_btn = QPushButton("‹")
        self.next_btn = QPushButton("›")
        for btn, tip, slot in ((self.prev_btn, "Anterior", self._nav_prev),
                               (self.next_btn, "Siguiente", self._nav_next)):
            btn.setObjectName("calArrow")
            btn.setFixedSize(36, 36)
            btn.setToolTip(tip)
            btn.setCursor(Qt.PointingHandCursor)
            btn.clicked.connect(slot)
            bar.addWidget(btn)
        bar.addSpacing(12)

        self.title_label = QLabel()
        self.title_label.setStyleSheet("font-size: 22px; color: #e6e6e6; background: transparent;")
        bar.addWidget(self.title_label)
        bar.addStretch()
        layout.addWidget(self.top_bar)

        self.stack = QStackedWidget()
        self.vista_dia = VistaDia(self.schedule_mgr)
        self.vista_semana = VistaSemana(self.schedule_mgr)
        self.vista_mes = VistaMes(self.schedule_mgr)
        self.vista_agenda = VistaAgenda(self.schedule_mgr)
        for view in (self.vista_dia, self.vista_semana, self.vista_mes, self.vista_agenda):
            self.stack.addWidget(view)
            view.filters = self.filters

        for grid in (self.vista_dia, self.vista_semana):
            grid.create_requested.connect(self._create_from_grid)
            grid.occurrence_clicked.connect(self._open_occurrence)
            grid.occurrence_moved.connect(self._move_occurrence)
            grid.day_clicked.connect(self._open_day)
        self.vista_mes.day_selected.connect(self._open_day)
        self.vista_agenda.occurrence_clicked.connect(self._open_occurrence)
        self.vista_agenda.data_changed.connect(self.data_changed.emit)

        layout.addWidget(self.stack, stretch=1)
        self.stack.setCurrentIndex(VIEW_SEMANA)

        self.popover = EventPopover(self)
        self.popover.save_requested.connect(self._save_popover)
        self.popover.delete_requested.connect(self._delete_from_popover)
        self.popover.closed.connect(self._popover_closed)
        self.popover.draft_changed.connect(self._sync_draft)
        self.popover.refit.connect(self._clamp_popover)

        self._update_header_title()

    def _setup_shortcuts(self):
        keys = {
            "T": self._nav_today, "N": self._nav_next, "P": self._nav_prev,
            "J": self._nav_next, "K": self._nav_prev, "C": lambda: self.create_new("event"),
            "D": lambda: self.show_view("dia"), "W": lambda: self.show_view("semana"),
            "M": lambda: self.show_view("mes"), "A": lambda: self.show_view("agenda"),
        }
        for key, slot in keys.items():
            sc = QShortcut(QKeySequence(key), self)
            sc.setContext(Qt.WidgetWithChildrenShortcut)
            sc.activated.connect(slot)

    # ── Navigation & Views ────────────────────────────────────────────────

    def show_view(self, key_or_idx):
        self.close_popover()
        if isinstance(key_or_idx, str):
            idx = VIEW_KEYS.get(key_or_idx.lower(), VIEW_SEMANA)
        else:
            idx = key_or_idx
        key_name = next(k for k, v in VIEW_KEYS.items() if v == idx)

        self.current_view_idx = idx
        self.stack.setCurrentIndex(idx)
        view = self.stack.currentWidget()
        view.filters = self.filters
        view.set_date(self.current_date)
        self._update_header_title()
        self.view_changed.emit(key_name)

    def set_date(self, d: date):
        self.close_popover()
        self.current_date = d
        self.stack.currentWidget().set_date(d)
        self._update_header_title()
        self.date_changed.emit(d)

    def set_filters(self, filters: dict):
        self.filters = filters
        view = self.stack.currentWidget()
        view.set_filters(filters)

    def refresh_current(self):
        self.schedule_mgr.task_mgr.tasks(force=True)
        self.stack.currentWidget().refresh()
        self._update_header_title()

    def set_manager(self, mgr: ScheduleManager):
        self.close_popover()
        self.schedule_mgr = mgr
        for view in (self.vista_dia, self.vista_semana, self.vista_mes, self.vista_agenda):
            view.schedule_mgr = mgr
        self.refresh_current()

    def _step(self, sign: int):
        d = self.current_date
        if self.current_view_idx == VIEW_DIA:
            self.set_date(d + timedelta(days=sign))
        elif self.current_view_idx in (VIEW_SEMANA, VIEW_AGENDA):
            self.set_date(d + timedelta(days=7 * sign))
        else:
            month = d.month - 1 + sign
            self.set_date(date(d.year + month // 12, month % 12 + 1, 1))

    def _nav_prev(self):
        self._step(-1)

    def _nav_next(self):
        self._step(1)

    def _nav_today(self):
        self.set_date(date.today())

    def _open_day(self, d: date):
        self.current_date = d
        self.show_view("dia")
        self.date_changed.emit(d)

    def _update_header_title(self):
        d = self.current_date
        idx = self.current_view_idx
        if idx == VIEW_DIA:
            text = f"{d.day} de {month_name(d)} de {d.year}"
        elif idx == VIEW_SEMANA:
            first = d - timedelta(days=d.weekday())
            last = first + timedelta(days=6)
            if first.month == last.month:
                text = f"{month_name(first).capitalize()} de {first.year}"
            elif first.year == last.year:
                text = f"{month_name(first)[:3].capitalize()} – {month_name(last)[:3]} de {last.year}"
            else:
                text = (f"{month_name(first)[:3].capitalize()} de {first.year} – "
                        f"{month_name(last)[:3]} de {last.year}")
        elif idx == VIEW_MES:
            text = f"{month_name(d).capitalize()} de {d.year}"
        else:
            text = "Agenda"
        self.title_label.setText(text)

    # ── Floating editor ───────────────────────────────────────────────────

    def _grid(self):
        view = self.stack.currentWidget()
        return view if isinstance(view, TimeGridView) else None

    def create_new(self, kind: str = "event"):
        """The Crear button: next full hour on the day in view."""
        self.close_popover()
        grid = self._grid()
        today = date.today()
        day = today if (grid is None or today in grid.days()) else self.current_date
        if grid is not None and day not in grid.days():
            day = grid.days()[0]
        start = min(23 * 60, (datetime.now().hour + 1) * 60)
        self.popover.open_create(day, start, start + 60, kind)
        rect = grid.draft_rect(day, start, start + 60) if grid is not None else None
        self._show_popover(rect)

    def _create_from_grid(self, day, start, end, rect: QRect):
        self.popover.open_create(day, start, end)
        self._show_popover(rect)

    def _open_occurrence(self, occ, rect: QRect):
        self.close_popover()
        if occ.kind == "habit":
            self._habit_menu(occ, rect)
            return
        if occ.source in MODULE_NAMES:
            self._module_menu(occ, rect)
            return
        info = self._edit_info(occ)
        if info is None:
            self.status_message.emit(f"«{occ.title}» se edita desde su propio módulo")
            return
        self.popover.open_edit(info)
        self._show_popover(rect)

    def _habit_menu(self, occ, rect: QRect):
        menu = QMenu(self)
        menu.setStyleSheet(
            "QMenu { background: #202020; border: 1px solid #2f2f2f; padding: 6px 0px;"
            " color: #e6e6e6; font-size: 14px; }"
            "QMenu::item { padding: 8px 28px 8px 16px; }"
            "QMenu::item:selected { background: #2a2a2a; }"
            "QMenu::item:disabled { color: #9b9b9b; }")
        title = menu.addAction(occ.title)
        title.setEnabled(False)
        menu.addSeparator()
        habit_id = occ.id[len(HABIT_PREFIX):] if occ.id.startswith(HABIT_PREFIX) else ""
        if habit_id:
            label = "Desmarcar" if occ.done else "Marcar como hecho"
            menu.addAction(label).triggered.connect(
                lambda: self._set_habit_done(occ, not occ.done))
            menu.addAction("Editar hábito…").triggered.connect(
                lambda: self.open_habits_requested.emit(habit_id))
        else:
            menu.addAction("Abrir Hábitos").triggered.connect(
                lambda: self.open_habits_requested.emit(""))
        menu.exec(QPoint(rect.right() + 4, rect.top()))

    def _module_menu(self, occ, rect: QRect):
        """Blocks that belong to Metas, Proyectos or Finanzas: tick them here,
        edit them in their own module."""
        menu = QMenu(self)
        menu.setStyleSheet(MENU_QSS)
        title = menu.addAction(occ.title)
        title.setEnabled(False)
        menu.addSeparator()
        label = "Desmarcar" if occ.done else "Marcar como hecho"
        menu.addAction(label).triggered.connect(lambda: self._set_habit_done(occ, not occ.done))
        link = occ.links[0] if occ.links else {}
        menu.addAction(f"Abrir en {MODULE_NAMES[occ.source]}").triggered.connect(
            lambda: self.open_module_requested.emit(occ.source, dict(link)))
        menu.exec(QPoint(rect.right() + 4, rect.top()))

    def _set_habit_done(self, occ, done: bool):
        self.schedule_mgr.set_done(occ.date, occ.id, done)
        self.refresh_current()
        self.data_changed.emit()
        self.status_message.emit(f"{occ.title}: {'hecho' if done else 'pendiente'}")

    def _show_popover(self, global_rect):
        pop = self.popover
        pop.show()
        pop.raise_()
        pop.layout().activate()
        pop.adjustSize()
        margin = 12
        if global_rect is None:
            x = (self.width() - pop.width()) // 2
            y = self.top_bar.height() + margin
        else:
            r = QRect(self.mapFromGlobal(global_rect.topLeft()), global_rect.size())
            x = r.right() + margin
            if x + pop.width() > self.width() - margin:
                x = r.left() - margin - pop.width()
            if x < margin:
                x = (self.width() - pop.width()) // 2
            y = r.top() - 60
        pop.move(x, y)
        self._clamp_popover()
        QApplication.instance().installEventFilter(self)
        pop.focus_title()

    def _clamp_popover(self):
        pop = self.popover
        margin = 12
        top = self.top_bar.height() + 6
        x = max(margin, min(self.width() - pop.width() - margin, pop.x()))
        y = min(pop.y(), self.height() - pop.height() - margin)
        pop.move(x, max(top, y))

    def close_popover(self):
        self.popover.dismiss()

    def _popover_closed(self):
        QApplication.instance().removeEventFilter(self)
        for grid in (self.vista_dia, self.vista_semana):
            grid.clear_draft()

    def _sync_draft(self):
        grid = self._grid()
        for other in (self.vista_dia, self.vista_semana):
            if other is not grid:
                other.clear_draft()
        if grid is None:
            return
        if self.popover.mode != "create":
            grid.clear_draft()
            return
        day, start, end, title, colour = self.popover.draft()
        grid.set_draft(day, start, end, title, colour)

    def eventFilter(self, obj, event):
        # A click outside the editor closes it, as in Google Calendar; when the
        # click lands on the calendar itself it is swallowed so it does not
        # also start a new event.
        if event.type() == QEvent.MouseButtonPress and self.popover.isVisible() \
                and isinstance(obj, QWidget):
            if obj.window() is not self.window():
                return False
            if obj is self.popover or self.popover.isAncestorOf(obj):
                return False
            inside = obj is self or self.isAncestorOf(obj)
            self.close_popover()
            return inside
        return False

    # ── Reading an item for editing ───────────────────────────────────────

    def _find_event(self, d: date, event_id: str):
        for ev in self.schedule_mgr.get_day_file(d).get("events", []):
            if ev.get("id") == event_id:
                return dict(ev)
        return None

    def _edit_info(self, occ):
        sm = self.schedule_mgr
        if occ.kind == "event":
            ev = self._find_event(occ.date, occ.id)
            if ev is None:
                return None
            return dict(kind="event", id=occ.id, date=occ.date, title=ev.get("title", ""),
                        start=ev.get("start"), duration=ev.get("duration_min"),
                        location=ev.get("location", ""), description=ev.get("notes", ""),
                        reminder_min=_int_or_none(ev.get("reminder_min")),
                        colour=ev.get("colour"), repeat="", until=None, subject="")
        if occ.kind == "routine":
            rt = next((r for r in sm.routines() if r.get("id") == occ.id), None)
            if rt is None:
                return None
            rule = Recurrence.parse(rt.get("repeat"))
            if not rule.repeats:
                rule = Recurrence.from_weekdays(
                    WEEKDAY_KEYS.index(k) for k in rt.get("days", []) if k in WEEKDAY_KEYS)
            return dict(kind="routine", id=occ.id, date=occ.date, title=rt.get("title", ""),
                        start=rt.get("start"), duration=rt.get("duration_min"),
                        location=rt.get("location", ""), description=rt.get("notes", ""),
                        reminder_min=_int_or_none(rt.get("reminder_min")),
                        colour=rt.get("colour"), repeat=rule.to_string(),
                        until=parse_date(rt.get("active_until")), subject="")
        if occ.kind == "task":
            task_id = occ.id[len("task_"):]
            task = sm.task_mgr.get(task_id)
            if task is None:
                return None
            clock = task.due_time if task.due == occ.date else task.start_time
            reminder = None
            start = parse_hm(clock)
            if task.reminder and start is not None and not task.reminder_done:
                begins = datetime.combine(occ.date, time(start // 60, start % 60))
                reminder = max(0, int((begins - task.reminder).total_seconds() // 60))
            return dict(kind="task", id=task_id, date=task.due or occ.date, title=task.name,
                        start=clock, duration=None, location="", description=task.body,
                        reminder_min=reminder, colour=None, repeat=task.repeat,
                        until=task.repeat_until, subject=task.subject)
        return None

    # ── Writing ───────────────────────────────────────────────────────────

    def _after_write(self, message: str):
        self.close_popover()
        self.refresh_current()
        self.data_changed.emit()
        self.status_message.emit(message)

    def _save_popover(self, p: dict):
        sm = self.schedule_mgr
        orig = p["orig"]
        orig_kind = orig.get("kind")

        if p["kind"] == "task":
            self._save_task(p)
            self._after_write("Tarea guardada")
            return

        fields = dict(title=p["title"], start=p["start"], duration_min=p["duration"],
                      colour=p["colour"], notes=p["description"], location=p["location"],
                      reminder_min=p["reminder_min"])
        if not p["repeat"]:
            if orig_kind == "routine":
                sm.remove_routine(orig["id"])
                sm.add_event(p["date"], **fields)
            elif orig_kind == "event":
                if p["date"] != orig["date"]:
                    event = self._find_event(orig["date"], orig["id"]) or {}
                    sm.remove_event(orig["date"], orig["id"])
                    event.update(fields)
                    sm.add_event(p["date"], **event)
                else:
                    sm.update_event(orig["date"], orig["id"], **fields)
            else:
                sm.add_event(p["date"], **fields)
            self._after_write("Evento guardado")
            return

        routine = dict(fields, days=p["days"], repeat=p["repeat"],
                       active_until=p["until"].isoformat() if p["until"] else None)
        if orig_kind == "routine":
            sm.update_routine(orig["id"], **routine)
        else:
            if orig_kind == "event":
                sm.remove_event(orig["date"], orig["id"])
            sm.add_routine(active_from=p["date"].isoformat(), **routine)
        self._after_write("Evento periódico guardado en tus rutinas")

    def _save_task(self, p: dict):
        tm = self.schedule_mgr.task_mgr
        reminder = None
        start = parse_hm(p["start"])
        if start is not None and p["reminder_min"] is not None:
            reminder = datetime.combine(p["date"], time(start // 60, start % 60)) \
                - timedelta(minutes=p["reminder_min"])
        fields = dict(due=p["date"], due_time=p["start"], body=p["description"],
                      subject=p["subject"], reminder=reminder, reminder_done=False,
                      repeat=p["repeat"], repeat_until=p["until"] if p["repeat"] else None)
        if p["mode"] == "edit":
            task = tm.get(p["orig"]["id"])
            if task is not None and task.start == task.due:
                fields["start"] = p["date"]
            tm.update(p["orig"]["id"], name=p["title"], **fields)
        else:
            tm.create(p["title"], start=p["date"], **fields)

    def _delete_from_popover(self, orig: dict, scope: str):
        sm = self.schedule_mgr
        kind = orig.get("kind")
        if kind == "event":
            sm.remove_event(orig["date"], orig["id"])
        elif kind == "routine":
            if scope == "one":
                sm.skip(orig["date"], orig["id"])
            else:
                sm.remove_routine(orig["id"])
        elif kind == "task":
            sm.task_mgr.delete(orig["id"])
        self._after_write("Eliminado")

    def _move_occurrence(self, occ, day: date, start_min: int, duration: int):
        sm = self.schedule_mgr
        start = f"{start_min // 60:02d}:{start_min % 60:02d}"
        if occ.kind == "event":
            if day != occ.date:
                event = self._find_event(occ.date, occ.id)
                if event is not None:
                    sm.remove_event(occ.date, occ.id)
                    event.update(start=start, duration_min=duration)
                    sm.add_event(day, **event)
            else:
                sm.update_event(occ.date, occ.id, start=start, duration_min=duration)
        elif occ.kind == "routine":
            sm.move(occ.date, occ.id, start, duration)
        elif occ.kind == "task":
            task_id = occ.id[len("task_"):]
            task = sm.task_mgr.get(task_id)
            if task is None:
                return
            if task.due == occ.date:
                fields = dict(due=day, due_time=start)
                if task.start == task.due:
                    fields["start"] = day
            else:
                fields = dict(start=day, start_time=start)
            sm.task_mgr.update(task_id, **fields)
        self.refresh_current()
        self.data_changed.emit()
