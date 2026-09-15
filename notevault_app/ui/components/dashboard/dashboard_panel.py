"""
Vista General — el panel de inicio.

Reúne en una sola pantalla lo que toca hoy:
  · hábitos programados para el día
  · ejercicios de la rutina de hoy
  · tareas con fecha límite hoy (y las atrasadas)
  · tareas de proyectos con fecha para hoy
  · accesos rápidos al resto de módulos
"""

from datetime import date
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel, QFrame,
    QScrollArea, QPushButton, QCheckBox, QLayout,
)
from PySide6.QtCore import Qt, Signal

from ....core.habit_manager import HabitManager, MONTH_NAMES, DAY_NAMES_ES
from ....core.exercise_manager import ExerciseManager
from ....core.task_manager import TaskManager, STATUS_DONE, STATUS_TODO
from ....core.project_manager import ProjectManager
from ..tareas.tareas_common import (
    BG_PAGE, BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT,
    BLUE, GREEN, ORANGE, RED, STAR, flat_btn,
)

DAY_KEYS = ["lunes", "martes", "miercoles", "jueves",
            "viernes", "sabado", "domingo"]

CARD_MIN_H = 210


def _check(checked: bool, accent: str = GREEN) -> QCheckBox:
    cb = QCheckBox()
    cb.setChecked(checked)
    cb.setCursor(Qt.PointingHandCursor)
    cb.setFixedWidth(22)
    cb.setStyleSheet(
        "QCheckBox{background:transparent;}"
        "QCheckBox::indicator{width:15px;height:15px;border-radius:3px;"
        f"border:1px solid {accent if checked else '#6a6a72'};}}"
        f"QCheckBox::indicator:checked{{background:{accent};border-color:{accent};}}"
    )
    return cb


class DashboardPanel(QWidget):
    """Read-write summary of the day."""

    go_habits    = Signal()
    go_ejercicio = Signal()
    go_tareas    = Signal()
    go_proyectos = Signal()
    go_notas     = Signal()
    go_metas     = Signal()
    goal_opened  = Signal(str)
    data_changed = Signal()

    def __init__(self, habits: HabitManager, exercises: ExerciseManager,
                 tasks: TaskManager, projects: ProjectManager, goals=None, areas=None,
                 parent=None):
        super().__init__(parent)
        self.setObjectName("centerPanel")
        self.habits = habits
        self.exercises = exercises
        self.tasks = tasks
        self.projects = projects
        self.goals = goals
        self.areas = areas
        self._init_ui()

    # ── UI ────────────────────────────────────────────────────────────────

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
        self._page = QVBoxLayout(content)
        self._page.setContentsMargins(20, 18, 20, 20)
        self._page.setSpacing(14)
        self._page.setSizeConstraint(QLayout.SetMinimumSize)

        scroll.setWidget(content)
        outer.addWidget(scroll)

    # ── Render ────────────────────────────────────────────────────────────

    def refresh(self):
        while self._page.count():
            item = self._page.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
            elif item.layout():
                self._clear(item.layout())

        today = date.today()

        # ── Header ────────────────────────────────────────────────────────
        head = QHBoxLayout()
        title = QLabel("◎  Vista General")
        title.setStyleSheet(
            f"color:{TEXT};font-size:22px;font-weight:700;"
            "background:transparent;border:none;"
        )
        head.addWidget(title)
        head.addStretch()
        stamp = QLabel(
            f"{DAY_NAMES_ES[today.weekday()]}, {today.day} de "
            f"{MONTH_NAMES[today.month].lower()} de {today.year}"
        )
        stamp.setStyleSheet(
            f"color:{TEXT_DIM};font-size:13px;background:transparent;border:none;"
        )
        head.addWidget(stamp)
        self._page.addLayout(head)

        self._page.addWidget(self._summary_strip(today))

        # ── Two-column grid of cards ──────────────────────────────────────
        grid = QGridLayout()
        grid.setSpacing(14)
        top = 0
        if self.goals is not None:
            grid.addWidget(self._goals_card(today), 0, 0, 1, 2)
            top = 1
        grid.addWidget(self._habits_card(today),   top, 0)
        grid.addWidget(self._exercise_card(today), top, 1)
        grid.addWidget(self._tasks_card(today),    top + 1, 0)
        grid.addWidget(self._projects_card(today), top + 1, 1)
        grid.setColumnStretch(0, 1)
        grid.setColumnStretch(1, 1)
        self._page.addLayout(grid)

        self._page.addWidget(self._quick_access())
        self._page.addStretch()

    # ── Summary strip ─────────────────────────────────────────────────────

    def _summary_strip(self, today: date) -> QWidget:
        habits = self.habits.habits_for_day(today)
        day = self.habits.get_day(today)
        h_done = sum(1 for h in habits if day.completed.get(h["id"], False))

        day_key = DAY_KEYS[today.weekday()]
        exs = self.exercises.exercises_for_day(day_key)
        log = self.exercises.get_log(today)
        e_done = sum(1 for e in exs if log.is_done(e["id"]))

        due_today = [t for t in self.tasks.tasks() if t.due == today and not t.is_done]
        overdue = [t for t in self.tasks.tasks() if t.is_overdue]
        p_steps = self.projects.steps_due_on(today)

        strip = QFrame()
        strip.setAttribute(Qt.WA_StyledBackground, True)
        strip.setObjectName("summaryStrip")
        strip.setStyleSheet(
            f"QFrame#summaryStrip{{background:{BG_CARD};border:1px solid {BORDER};"
            "border-radius:10px;}"
        )
        lay = QHBoxLayout(strip)
        lay.setContentsMargins(18, 12, 18, 12)
        lay.setSpacing(0)

        cells = [
            ("Hábitos",   f"{h_done}/{len(habits)}", GREEN if habits and h_done == len(habits) else BLUE),
            ("Ejercicio", f"{e_done}/{len(exs)}",    GREEN if exs and e_done == len(exs) else ORANGE),
            ("Tareas hoy", str(len(due_today)),      BLUE if due_today else TEXT_DIM),
            ("Atrasadas", str(len(overdue)),         RED if overdue else TEXT_DIM),
            ("Proyectos hoy", str(len(p_steps)),     "#a78bfa" if p_steps else TEXT_DIM),
        ]
        for i, (label, value, color) in enumerate(cells):
            box = QVBoxLayout()
            box.setSpacing(2)
            v = QLabel(value)
            v.setStyleSheet(
                f"color:{color};font-size:20px;font-weight:700;"
                "background:transparent;border:none;"
            )
            box.addWidget(v)
            l = QLabel(label)
            l.setStyleSheet(
                f"color:{TEXT_FAINT};font-size:10px;letter-spacing:0.6px;"
                "background:transparent;border:none;"
            )
            box.addWidget(l)
            lay.addLayout(box)
            if i < len(cells) - 1:
                lay.addStretch()
        return strip

    # ── Cards ─────────────────────────────────────────────────────────────

    def _card(self, icon: str, title: str, accent: str, subtitle: str = ""):
        card = QFrame()
        card.setAttribute(Qt.WA_StyledBackground, True)
        card.setObjectName("dashCard")
        card.setMinimumHeight(CARD_MIN_H)
        card.setStyleSheet(
            f"QFrame#dashCard{{background:{BG_CARD};border:1px solid {BORDER};"
            f"border-top:2px solid {accent};border-radius:10px;}}"
        )
        lay = QVBoxLayout(card)
        lay.setContentsMargins(16, 13, 16, 14)
        lay.setSpacing(7)

        hdr = QHBoxLayout()
        t = QLabel(f"{icon}  {title}")
        t.setStyleSheet(
            f"color:{TEXT};font-size:14px;font-weight:600;"
            "background:transparent;border:none;"
        )
        hdr.addWidget(t)
        hdr.addStretch()
        if subtitle:
            s = QLabel(subtitle)
            s.setStyleSheet(
                f"color:{accent};font-size:11px;background:transparent;border:none;"
            )
            hdr.addWidget(s)
        lay.addLayout(hdr)
        return card, lay

    def _empty(self, text: str) -> QLabel:
        lbl = QLabel(text)
        lbl.setWordWrap(True)
        lbl.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:12px;background:transparent;border:none;"
        )
        return lbl

    # Habits ------------------------------------------------------------

    def _habits_card(self, today: date) -> QWidget:
        habits = self.habits.habits_for_day(today)
        day = self.habits.get_day(today)
        done = sum(1 for h in habits if day.completed.get(h["id"], False))
        card, lay = self._card("⊙", "Hábitos de hoy", GREEN,
                               f"{done}/{len(habits)}")

        if not habits:
            lay.addWidget(self._empty("No hay hábitos programados para hoy."))
        for h in habits:
            row = QWidget()
            row.setFixedHeight(26)
            row.setStyleSheet("background:transparent;")
            r = QHBoxLayout(row)
            r.setContentsMargins(0, 0, 0, 0)
            r.setSpacing(8)

            checked = day.completed.get(h["id"], False)
            cb = _check(checked)
            cb.setToolTip(f"Marcar «{h['name']}»")
            cb.toggled.connect(
                lambda v, _id=h["id"]: self._toggle_habit(_id, v)
            )
            r.addWidget(cb)

            ico = QLabel(h["icon"])
            ico.setFixedWidth(20)
            ico.setToolTip(h["name"])
            ico.setStyleSheet(
                "font-size:13px;background:transparent;border:none;"
            )
            r.addWidget(ico)

            name = QLabel(h["name"])
            name.setToolTip(h["name"])
            name.setStyleSheet(
                f"color:{'#63636c' if checked else TEXT};font-size:12px;"
                "background:transparent;border:none;"
            )
            r.addWidget(name, stretch=1)

            subs = h.get("subtasks") or []
            if subs:
                d, t = day.subtask_progress(h)
                chip = QLabel(f"{d}/{t}")
                chip.setStyleSheet(
                    f"color:{GREEN if d == t else TEXT_FAINT};font-size:10px;"
                    "background:transparent;border:none;"
                )
                r.addWidget(chip)
            lay.addWidget(row)

        lay.addStretch()
        return card

    # Exercise ----------------------------------------------------------

    def _exercise_card(self, today: date) -> QWidget:
        day_key = DAY_KEYS[today.weekday()]
        exs = self.exercises.exercises_for_day(day_key)
        log = self.exercises.get_log(today)
        done = sum(1 for e in exs if log.is_done(e["id"]))
        card, lay = self._card("🏋", f"Ejercicio — {DAY_NAMES_ES[today.weekday()]}",
                               ORANGE, f"{done}/{len(exs)}")

        if not exs:
            lay.addWidget(self._empty("Hoy no hay rutina programada."))
        for e in exs:
            row = QWidget()
            row.setFixedHeight(26)
            row.setStyleSheet("background:transparent;")
            r = QHBoxLayout(row)
            r.setContentsMargins(0, 0, 0, 0)
            r.setSpacing(8)

            entry = log.entries.get(e["id"], {})
            checked = bool(entry.get("done"))
            cb = _check(checked, ORANGE)
            cb.setToolTip(f"Marcar «{e['name']}»")
            cb.toggled.connect(
                lambda v, _e=e: self._toggle_exercise(_e, v)
            )
            r.addWidget(cb)

            name = QLabel(e["name"])
            name.setToolTip(e.get("how_to", "") or e["name"])
            name.setStyleSheet(
                f"color:{'#63636c' if checked else TEXT};font-size:12px;"
                "background:transparent;border:none;"
            )
            r.addWidget(name, stretch=1)

            sets = QLabel(e.get("series_reps", ""))
            sets.setStyleSheet(
                f"color:{TEXT_FAINT};font-size:11px;background:transparent;border:none;"
            )
            r.addWidget(sets)
            lay.addWidget(row)

        lay.addStretch()
        return card

    # Tasks -------------------------------------------------------------

    def _tasks_card(self, today: date) -> QWidget:
        tasks = self.tasks.tasks()
        due_today = [t for t in tasks if t.due == today and not t.is_done]
        overdue = [t for t in tasks if t.is_overdue]
        card, lay = self._card("☑", "Tareas para hoy", BLUE,
                               f"{len(due_today)} hoy")

        if not due_today and not overdue:
            lay.addWidget(self._empty("Nada pendiente para hoy. 🎉"))

        for t in overdue[:4]:
            lay.addWidget(self._task_row(t, late=True))
        for t in due_today[:6]:
            lay.addWidget(self._task_row(t, late=False))

        extra = max(0, len(due_today) - 6) + max(0, len(overdue) - 4)
        if extra:
            lay.addWidget(self._empty(f"+{extra} tarea(s) más en el módulo Tareas."))

        lay.addStretch()
        return card

    def _task_row(self, t, late: bool) -> QWidget:
        row = QWidget()
        row.setFixedHeight(26)
        row.setStyleSheet("background:transparent;")
        r = QHBoxLayout(row)
        r.setContentsMargins(0, 0, 0, 0)
        r.setSpacing(8)

        cb = _check(t.is_done, BLUE)
        cb.setToolTip("Marcar como completada")
        cb.toggled.connect(lambda v, _t=t: self._toggle_task(_t, v))
        r.addWidget(cb)

        name = QLabel(t.name)
        name.setToolTip(f"{t.name} — {t.status}")
        name.setStyleSheet(
            f"color:{TEXT};font-size:12px;background:transparent;border:none;"
        )
        r.addWidget(name, stretch=1)

        if t.subject:
            s = QLabel(t.subject)
            s.setStyleSheet(
                f"color:{BLUE};font-size:10px;background:#252525;border:none;"
                "border-radius:4px;padding:1px 6px;"
            )
            r.addWidget(s)

        stars = QLabel("★" * max(1, min(3, t.priority)))
        stars.setStyleSheet(
            f"color:{STAR};font-size:10px;background:transparent;border:none;"
        )
        r.addWidget(stars)

        if late:
            lbl = QLabel(f"⚠ {t.due.strftime('%d/%m')}")
            lbl.setToolTip("Fecha límite pasada")
            lbl.setStyleSheet(
                f"color:{RED};font-size:10px;background:transparent;border:none;"
            )
            r.addWidget(lbl)
        return row

    # Projects ----------------------------------------------------------

    def _projects_card(self, today: date) -> QWidget:
        pairs = self.projects.steps_due_on(today)
        active = self.projects.active_projects()
        card, lay = self._card("◫", "Proyectos — tareas de hoy", "#a78bfa",
                               f"{len(pairs)} hoy")

        if not pairs:
            if active:
                lay.addWidget(self._empty(
                    "Ninguna tarea de proyecto vence hoy. Proyectos en curso:"
                ))
                for p in active[:5]:
                    row = QWidget()
                    row.setFixedHeight(24)
                    row.setStyleSheet("background:transparent;")
                    r = QHBoxLayout(row)
                    r.setContentsMargins(0, 0, 0, 0)
                    r.setSpacing(8)
                    dot = QLabel("●")
                    dot.setFixedWidth(12)
                    dot.setStyleSheet(
                        f"color:{p.color};font-size:11px;"
                        "background:transparent;border:none;"
                    )
                    r.addWidget(dot)
                    n = QLabel(p.name)
                    n.setStyleSheet(
                        f"color:{TEXT_DIM};font-size:12px;"
                        "background:transparent;border:none;"
                    )
                    r.addWidget(n, stretch=1)
                    pr = QLabel(f"{int(round(p.progress * 100))}%")
                    pr.setStyleSheet(
                        f"color:{TEXT_FAINT};font-size:11px;"
                        "background:transparent;border:none;"
                    )
                    r.addWidget(pr)
                    lay.addWidget(row)
            else:
                lay.addWidget(self._empty(
                    "Aún no hay proyectos. Créalos en el módulo Proyectos "
                    "y sus tareas del día aparecerán aquí."
                ))
            lay.addStretch()
            return card

        for proj, step in pairs[:8]:
            idx = proj.steps.index(step)
            row = QWidget()
            row.setFixedHeight(26)
            row.setStyleSheet("background:transparent;")
            r = QHBoxLayout(row)
            r.setContentsMargins(0, 0, 0, 0)
            r.setSpacing(8)

            cb = _check(step.done, proj.color)
            cb.setToolTip(f"Marcar «{step.name}»")
            cb.toggled.connect(
                lambda v, _p=proj.id, _i=idx: self._toggle_step(_p, _i, v)
            )
            r.addWidget(cb)

            n = QLabel(step.name)
            n.setStyleSheet(
                f"color:{TEXT};font-size:12px;background:transparent;border:none;"
            )
            r.addWidget(n, stretch=1)

            tag = QLabel(proj.name)
            tag.setStyleSheet(
                f"color:{proj.color};font-size:10px;background:#252525;border:none;"
                "border-radius:4px;padding:1px 6px;"
            )
            r.addWidget(tag)
            lay.addWidget(row)

        lay.addStretch()
        return card

    # Goals -------------------------------------------------------------

    def _goals_card(self, today: date) -> QWidget:
        from ..metas.metas_hoy import TodayList
        from ..comun.widgets import BlockProgress
        from ....core.goal_manager import FILTER_ACTIVE

        goals = [g for g in self.goals.goals(FILTER_ACTIVE) if g.in_overview]
        pairs = self.goals.items_due_on(today, goals)
        done = sum(1 for _g, i in pairs if self.goals.is_done_on(i, today))
        card, lay = self._card("🎯", "Metas", "#33b679", f"{done}/{len(pairs)} hoy")
        if not goals:
            card.setMinimumHeight(84)
            lay.addWidget(self._empty(
                "Aún no hay metas en la Vista General. Créalas en el módulo Metas "
                "y marca «Mostrar en la Vista General»."))
            lay.addStretch()
            return card

        cols = QHBoxLayout()
        cols.setSpacing(24)
        left = QVBoxLayout()
        left.setSpacing(6)
        for g in goals[:6]:
            row = QWidget()
            row.setFixedHeight(26)
            row.setStyleSheet("background:transparent;")
            row.setCursor(Qt.PointingHandCursor)
            row.mousePressEvent = lambda _e, gid=g.id: self.goal_opened.emit(gid)
            r = QHBoxLayout(row)
            r.setContentsMargins(0, 0, 0, 0)
            r.setSpacing(8)
            name = QLabel(f"{g.icon}  {g.name}".strip())
            name.setToolTip(f"Abrir «{g.name}»")
            name.setStyleSheet(f"color:{RED if g.is_overdue(today) else TEXT};font-size:12px;"
                               "background:transparent;border:none;")
            r.addWidget(name, stretch=1)
            r.addWidget(BlockProgress(self.goals.progress(g, today), g.colour, blocks=10, block=9))
            left.addWidget(row)
        left.addStretch()
        cols.addLayout(left, 1)

        right = QVBoxLayout()
        right.setSpacing(2)
        title = QLabel("Submetas de hoy")
        title.setStyleSheet(f"color:{TEXT_FAINT};font-size:11px;background:transparent;border:none;")
        right.addWidget(title)
        items = TodayList(self.goals, self.areas, compact=True)
        items.limit = 7
        items.refresh()
        items.data_changed.connect(self._goal_toggled)
        items.goal_opened.connect(self.goal_opened.emit)
        right.addWidget(items)
        right.addStretch()
        cols.addLayout(right, 1)
        lay.addLayout(cols)
        return card

    def _goal_toggled(self):
        self.data_changed.emit()
        from PySide6.QtCore import QTimer
        QTimer.singleShot(0, self.refresh)

    # ── Quick access ──────────────────────────────────────────────────────

    def _quick_access(self) -> QWidget:
        box = QFrame()
        box.setAttribute(Qt.WA_StyledBackground, True)
        box.setObjectName("quickBox")
        box.setStyleSheet(
            f"QFrame#quickBox{{background:{BG_CARD};border:1px solid {BORDER};"
            "border-radius:10px;}"
        )
        lay = QHBoxLayout(box)
        lay.setContentsMargins(16, 12, 16, 12)
        lay.setSpacing(8)

        lbl = QLabel("Acceso rápido")
        lbl.setStyleSheet(
            f"color:{TEXT_FAINT};font-size:11px;background:transparent;border:none;"
        )
        lay.addWidget(lbl)
        lay.addSpacing(6)

        for text, accent, signal in [
            ("⊙  Hábitos",   GREEN,     self.go_habits),
            ("🏋  Ejercicio", ORANGE,    self.go_ejercicio),
            ("☑  Tareas",    BLUE,      self.go_tareas),
            ("◫  Proyectos", "#a78bfa", self.go_proyectos),
            ("🎯  Metas",    "#33b679", self.go_metas),
            ("✎  Notas",     TEXT_DIM,  self.go_notas),
        ]:
            b = flat_btn(text, TEXT_DIM, accent, height=30)
            b.clicked.connect(signal.emit)
            lay.addWidget(b)

        lay.addStretch()
        return box

    # ── Mutations ─────────────────────────────────────────────────────────

    def _toggle_habit(self, habit_id: str, value: bool):
        day = self.habits.get_day(date.today())
        day.completed[habit_id] = value
        self.habits.save_day(day)
        self.data_changed.emit()
        self.refresh()

    def _toggle_exercise(self, ex: dict, value: bool):
        today = date.today()
        entry = self.exercises.get_log(today).entries.get(ex["id"], {})
        self.exercises.mark_done(
            today, ex["id"], value,
            entry.get("weight", 0.0), entry.get("reps", 0), entry.get("notes", ""),
        )
        self.data_changed.emit()
        self.refresh()

    def _toggle_task(self, task, value: bool):
        self.tasks.update(task.id, status=STATUS_DONE if value else STATUS_TODO)
        self.tasks.tasks(force=True)
        self.data_changed.emit()
        self.refresh()

    def _toggle_step(self, pid: str, index: int, value: bool):
        self.projects.set_step(pid, index, done=value)
        self.projects.projects(force=True)
        self.data_changed.emit()
        self.refresh()

    # ── Plumbing ──────────────────────────────────────────────────────────

    def _clear(self, layout):
        while layout.count():
            item = layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
            elif item.layout():
                self._clear(item.layout())

    def set_managers(self, habits, exercises, tasks, projects, goals=None, areas=None):
        self.habits = habits
        self.exercises = exercises
        self.tasks = tasks
        self.projects = projects
        self.goals = goals
        self.areas = areas
        self.refresh()
