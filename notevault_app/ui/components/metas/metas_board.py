"""Tablero de metas: one section per area, a dashboard card per goal."""

from datetime import date

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QScrollArea, QFrame, QMenu, QLayout,
)

from ....core import goal_manager as gm
from ..comun import (
    BG_PAGE, TEXT, TEXT_DIM, TEXT_FAINT, RED, GREEN, ORANGE, label, chip, priority_chip,
    clear_layout, combo, primary_btn, line_edit, fmt_short,
)
from ..comun.widgets import DashboardCard, BlockProgress
from ..comun.charts import Sparkline

CARD_W = 300
SORTS = (("Prioridad", "priority"), ("Fecha de fin", "end"), ("Progreso", "progress"),
         ("Nombre", "name"), ("Manual", "manual"))
FILTER_TITLES = {gm.FILTER_ALL: "", gm.FILTER_ACTIVE: "Activas", gm.FILTER_PAUSED: "En pausa",
                 gm.FILTER_DONE: "Completadas", gm.FILTER_OVERDUE: "Vencidas",
                 gm.FILTER_ARCHIVED: "Archivadas"}


def date_line(goal, today: date):
    """('14 sep → 31 dic · faltan 20 días', colour)"""
    span = ""
    if goal.start or goal.end:
        span = f"{fmt_short(goal.start) if goal.start else '…'} → {fmt_short(goal.end) if goal.end else '…'}"
    if goal.is_overdue(today):
        return (f"{span} · Vencida" if span else "Vencida"), RED
    left = goal.days_left(today)
    if left is None:
        return span or "Sin fechas", TEXT_FAINT
    if goal.status == gm.STATUS_DONE:
        return span, GREEN
    word = "hoy" if left == 0 else ("falta 1 día" if left == 1 else f"faltan {left} días")
    return f"{span} · {word}", ORANGE if left <= 7 else TEXT_DIM


class MetasBoard(QWidget):
    goal_opened = Signal(str)
    new_goal_requested = Signal()
    edit_goal_requested = Signal(str)
    data_changed = Signal()

    def __init__(self, goal_mgr, area_mgr, habit_mgr, parent=None):
        super().__init__(parent)
        self.goal_mgr, self.area_mgr, self.habit_mgr = goal_mgr, area_mgr, habit_mgr
        self.area = "*"
        self.filter = gm.FILTER_ALL
        self.query = ""
        self._columns = 3
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet(f"QScrollArea{{background:{BG_PAGE};border:none;}}")
        content = QWidget()
        content.setStyleSheet(f"background:{BG_PAGE};")
        self.page = QVBoxLayout(content)
        self.page.setContentsMargins(22, 18, 22, 22)
        self.page.setSpacing(14)
        self.page.setSizeConstraint(QLayout.SetMinimumSize)

        top = QHBoxLayout()
        top.setSpacing(8)
        self.title = label("🎯  Metas", TEXT, 22, True)
        top.addWidget(self.title)
        top.addStretch()
        self.search = line_edit("🔎  Buscar meta…", 30)
        self.search.setFixedWidth(200)
        self.search.textChanged.connect(self._searched)
        top.addWidget(self.search)
        self.sort = combo([(f"Ordenar: {t}", k) for t, k in SORTS], 30)
        self.sort.setFixedWidth(170)
        self.sort.currentIndexChanged.connect(lambda _i: self.refresh())
        top.addWidget(self.sort)
        new = primary_btn("+  Nueva meta", 30)
        new.clicked.connect(self.new_goal_requested.emit)
        top.addWidget(new)
        self.page.addLayout(top)
        self.summary = label("", TEXT_FAINT, 11)
        self.page.addWidget(self.summary)
        self.sections = QVBoxLayout()
        self.sections.setSpacing(20)
        self.page.addLayout(self.sections)
        self.page.addStretch()
        scroll.setWidget(content)
        outer.addWidget(scroll)
        self._resize_timer = QTimer(self)
        self._resize_timer.setSingleShot(True)
        self._resize_timer.timeout.connect(self._maybe_reflow)

    def set_managers(self, goal_mgr, area_mgr, habit_mgr):
        self.goal_mgr, self.area_mgr, self.habit_mgr = goal_mgr, area_mgr, habit_mgr
        self.area = "*"
        self.refresh()

    def set_area(self, area):
        self.area = area
        self.refresh()

    def set_filter(self, key):
        self.filter = key
        self.refresh()

    def _searched(self, text):
        self.query = text.strip().lower()
        self.refresh()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._resize_timer.start(120)

    def _maybe_reflow(self):
        cols = max(1, (self.width() - 44) // (CARD_W + 14))
        if cols != self._columns:
            self._columns = cols
            self.refresh()

    # ── Render ────────────────────────────────────────────────────────────

    def _sorted(self, goals, today):
        key = self.sort.currentData()
        if key == "end":
            return sorted(goals, key=lambda g: (g.end or date.max, -g.priority))
        if key == "progress":
            return sorted(goals, key=lambda g: -self.goal_mgr.progress(g, today))
        if key == "name":
            return sorted(goals, key=lambda g: g.name.lower())
        if key == "manual":
            return sorted(goals, key=lambda g: (g.order if g.order is not None else 1e9, g.name.lower()))
        return goals

    def refresh(self):
        clear_layout(self.sections)
        today = date.today()
        groups = self.goal_mgr.area_goals(self.filter)
        if self.area != "*":
            groups = [(a, gs) for a, gs in groups
                      if (a is None and self.area == "") or (a is not None and a["id"] == self.area)]
        if self.query:
            groups = [(a, [g for g in gs if self.query in g.name.lower()
                           or self.query in g.description.lower()]) for a, gs in groups]
            groups = [(a, gs) for a, gs in groups if gs]
        total = sum(len(gs) for _a, gs in groups)
        extra = FILTER_TITLES.get(self.filter, "")
        self.summary.setText(f"{total} meta{'s' if total != 1 else ''}"
                             + (f" · {extra.lower()}" if extra else ""))
        if not total:
            empty = label("No hay metas aquí todavía.\nCrea una con «+ Nueva meta»; "
                          "divídela en submetas y conéctala a tus hábitos.", TEXT_FAINT, 13, wrap=True)
            empty.setAlignment(Qt.AlignCenter)
            empty.setMinimumHeight(160)
            self.sections.addWidget(empty)
            return
        for area, goals in groups:
            self.sections.addWidget(self._section(area, self._sorted(goals, today), today))

    def _section(self, area, goals, today) -> QWidget:
        box = QWidget()
        box.setStyleSheet("background:transparent;")
        v = QVBoxLayout(box)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(10)
        head = QHBoxLayout()
        colour = area["colour"] if area else TEXT_DIM
        name = f"{area['icon']}  {area['name']}".strip() if area else "Sin área"
        head.addWidget(label(name, colour, 15, True))
        avg = sum(self.goal_mgr.progress(g, today) for g in goals) / len(goals)
        head.addSpacing(10)
        head.addWidget(BlockProgress(avg, colour, blocks=10, block=9))
        head.addWidget(label(f"{len(goals)} meta{'s' if len(goals) != 1 else ''}", TEXT_FAINT, 11))
        head.addStretch()
        v.addLayout(head)
        grid = QGridLayout()
        grid.setHorizontalSpacing(14)
        grid.setVerticalSpacing(14)
        for i, goal in enumerate(goals):
            grid.addWidget(self._card(goal, today), i // self._columns, i % self._columns)
        for c in range(self._columns):
            grid.setColumnStretch(c, 1)
        v.addLayout(grid)
        return box

    def _card(self, goal, today) -> QWidget:
        card = DashboardCard(goal.colour)
        card.setMinimumWidth(CARD_W - 40)
        card.clicked.connect(lambda gid=goal.id: self.goal_opened.emit(gid))
        card.setContextMenuPolicy(Qt.CustomContextMenu)
        card.customContextMenuRequested.connect(
            lambda pos, g=goal, c=card: self._menu(g, c.mapToGlobal(pos)))
        b = card.body

        head = QHBoxLayout()
        head.setSpacing(8)
        head.addWidget(label(goal.icon or "🎯", TEXT, 20))
        name = label(goal.name, TEXT, 14, True, wrap=True)
        head.addWidget(name, stretch=1)
        head.addWidget(priority_chip(goal.priority), 0, Qt.AlignTop)
        b.addLayout(head)

        text, colour = date_line(goal, today)
        status = "" if goal.status == gm.STATUS_ACTIVE else f"{goal.status} · "
        b.addWidget(label(status + text, colour, 11))

        progress = self.goal_mgr.progress(goal, today)
        prow = QHBoxLayout()
        prow.addWidget(BlockProgress(progress, goal.colour))
        prow.addStretch()
        done, total = self.goal_mgr.counts(goal, today)
        prow.addWidget(label(f"{done}/{total} submetas", TEXT_DIM, 11))
        b.addLayout(prow)

        stats = QHBoxLayout()
        adh = self.goal_mgr.adherence(goal, 7, today)
        stats.addWidget(label("Adherencia 7 d: " + (f"{round(adh * 100)} %" if adh is not None else "—"),
                              TEXT_FAINT, 11))
        stats.addStretch()
        stats.addWidget(Sparkline(self.goal_mgr.daily_counts(goal, 14, today), goal.colour, 80, 22))
        b.addLayout(stats)

        nxt = self.goal_mgr.next_item(goal, today)
        if nxt:
            item, d = nxt
            when = "hoy" if d == today else ("vencida" if d < today else fmt_short(d))
            b.addWidget(label(f"Siguiente: {item.name} · {when}",
                              RED if d < today else TEXT_DIM, 11))
        overdue = len(self.goal_mgr.overdue(goal, today))
        links = []
        for item in self.goal_mgr.leaves(goal.id):
            for hid in item.habit_links:
                if hid not in links:
                    links.append(hid)
        if links or overdue:
            chips = QHBoxLayout()
            chips.setSpacing(4)
            if overdue:
                chips.addWidget(chip(f"⚠ {overdue} vencida{'s' if overdue != 1 else ''}", RED))
            for hid in links[:4]:
                h = self.habit_mgr.get_habit(hid) if self.habit_mgr else None
                if h:
                    chips.addWidget(chip(f"{h.get('icon', '')} {h['name']}", "#7c5af0"))
            chips.addStretch()
            b.addLayout(chips)
        return card

    def _menu(self, goal, pos):
        menu = QMenu(self)
        menu.addAction("Abrir").triggered.connect(lambda: self.goal_opened.emit(goal.id))
        menu.addAction("Editar…").triggered.connect(lambda: self.edit_goal_requested.emit(goal.id))
        menu.addSeparator()
        for status in (gm.STATUS_ACTIVE, gm.STATUS_PAUSED, gm.STATUS_DONE, gm.STATUS_ARCHIVED):
            if status != goal.status:
                menu.addAction(f"Marcar «{status}»").triggered.connect(
                    lambda _c=False, s=status: self._set(goal.id, status=s))
        if self.sort.currentData() == "manual":
            menu.addSeparator()
            menu.addAction("Mover antes").triggered.connect(lambda: self._shift(goal, -1))
            menu.addAction("Mover después").triggered.connect(lambda: self._shift(goal, 1))
        menu.exec(pos)

    def _set(self, gid, **fields):
        self.goal_mgr.update_goal(gid, **fields)
        self.data_changed.emit()
        self.refresh()

    def _shift(self, goal, step):
        goals = self._sorted([g for _a, gs in self.goal_mgr.area_goals(self.filter) for g in gs
                              if g.area == goal.area], date.today())
        i = next(n for n, g in enumerate(goals) if g.id == goal.id)
        j = max(0, min(len(goals) - 1, i + step))
        goals.insert(j, goals.pop(i))
        for n, g in enumerate(goals, start=1):
            if g.order != n:
                self.goal_mgr.update_goal(g.id, order=n)
        self.refresh()
