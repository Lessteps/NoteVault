"""Resumen: stat tiles, charts and one row per Submeta — the first thing a project shows."""

from datetime import date

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QScrollArea, QFrame, QLayout,
)

from ....core.project_manager import ProjectStats, TYPE_ICONS
from ..comun import (
    BG_PAGE, BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, GREEN, RED, ORANGE, BLUE,
    PRIORITY_NAMES, PRIORITY_COLOURS, label, clear_layout, flat_btn, fmt_short,
)
from ..comun.widgets import StatTile, BlockProgress
from ..comun.charts import BarChart, DonutChart, LineChart

STATUS_COLOURS = ("#8b8b96", "#2383e2", "#a78bfa", "#ff9632", "#38bdf8", "#facc15", "#fb7185")


def _panel() -> tuple:
    f = QFrame()
    f.setObjectName("resPanel")
    f.setAttribute(Qt.WA_StyledBackground, True)
    f.setStyleSheet(f"QFrame#resPanel{{background:{BG_CARD};border:1px solid {BORDER};border-radius:10px;}}")
    lay = QVBoxLayout(f)
    lay.setContentsMargins(14, 12, 14, 12)
    lay.setSpacing(8)
    return f, lay


class ProyectoResumen(QWidget):
    show_in_board = Signal(str)      # submeta id
    open_issue = Signal(str)

    def __init__(self, manager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self.project = None
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet(f"QScrollArea{{background:{BG_PAGE};border:none;}}")
        content = QWidget()
        content.setStyleSheet(f"background:{BG_PAGE};")
        self.page = QVBoxLayout(content)
        self.page.setContentsMargins(0, 8, 0, 8)
        self.page.setSpacing(12)
        self.page.setSizeConstraint(QLayout.SetMinimumSize)
        scroll.setWidget(content)
        outer.addWidget(scroll)

        tiles = QHBoxLayout()
        tiles.setSpacing(10)
        self.t_progress = StatTile("0 %", "Progreso", GREEN)
        self.t_open = StatTile("0", "Abiertas", BLUE)
        self.t_overdue = StatTile("0", "Vencidas", RED)
        self.t_week = StatTile("0", "Hechas esta semana", GREEN)
        self.t_deadline = StatTile("—", "Días a la entrega")
        self.t_cycle = StatTile("—", "Ciclo medio (días)")
        for t in (self.t_progress, self.t_open, self.t_overdue, self.t_week, self.t_deadline, self.t_cycle):
            tiles.addWidget(t)
        self.page.addLayout(tiles)

        charts = QGridLayout()
        charts.setSpacing(12)
        p1, l1 = _panel()
        self.donut = DonutChart("Por estado", 190)
        l1.addWidget(self.donut)
        p2, l2 = _panel()
        self.prio = BarChart("Abiertas por prioridad", height=190)
        l2.addWidget(self.prio)
        p3, l3 = _panel()
        self.burn = LineChart("Burndown · pendientes por día", 210)
        l3.addWidget(self.burn)
        p4, l4 = _panel()
        self.through = BarChart("Rendimiento · hechas por semana", GREEN, 210)
        l4.addWidget(self.through)
        charts.addWidget(p1, 0, 0)
        charts.addWidget(p2, 0, 1)
        charts.addWidget(p3, 1, 0)
        charts.addWidget(p4, 1, 1)
        charts.setColumnStretch(0, 1)
        charts.setColumnStretch(1, 1)
        self.page.addLayout(charts)

        subs, self.subs = _panel()
        self.page.addWidget(subs)
        self.page.addStretch()

    def load(self, project):
        self.project = project
        self.refresh()

    def refresh(self):
        if self.project is None:
            return
        today = date.today()
        stats = ProjectStats(self.manager, self.project, today)
        s = stats.summary()
        self.t_progress.set(f"{round(s['progress'] * 100)} %")
        self.t_open.set(str(s["open"]))
        self.t_overdue.set(str(s["overdue"]), RED if s["overdue"] else TEXT_DIM)
        self.t_week.set(str(s["done_this_week"]))
        left = s["days_left"]
        if left is None:
            self.t_deadline.set("—", TEXT_DIM, "sin fecha de entrega")
        elif left < 0 and not self.project.is_done:
            self.t_deadline.set(str(left), RED, f"venció el {self.project.deadline.strftime('%d/%m/%Y')}", RED)
        else:
            self.t_deadline.set(str(left), ORANGE if left <= 7 else TEXT,
                                f"entrega {self.project.deadline.strftime('%d/%m/%Y')}")
        cycle = stats.cycle_days()
        self.t_cycle.set("—" if cycle is None else f"{cycle:g}")
        est, est_done = s["estimate_min"], s["estimate_done_min"]
        self.t_open.set(str(s["open"]), BLUE,
                        f"{round((est - est_done) / 60, 1):g} h estimadas pendientes" if est else "")

        cols = self.project.columns
        self.donut.set_data([(c, n, GREEN if c == self.project.done_column else STATUS_COLOURS[i % len(STATUS_COLOURS)])
                             for i, (c, n) in enumerate(stats.by_status())],
                            f"{s['total']}\nissues")
        prio = stats.by_priority()
        self.prio.set_data([PRIORITY_NAMES[p] for p, _n in prio], [n for _p, n in prio],
                           [PRIORITY_COLOURS[p] for p, _n in prio])
        days, remaining, ideal = stats.burndown()
        series = [("Pendientes", remaining, self.project.colour)]
        if ideal:
            series.append(("Ideal", ideal, TEXT_FAINT, True))
        self.burn.set_data([d.strftime("%d/%m") for d in days], series)
        through = stats.throughput(8)
        self.through.set_data([fmt_short(d) for d, _n in through], [n for _d, n in through],
                              highlight={len(through) - 1})

        clear_layout(self.subs)
        head = QHBoxLayout()
        head.addWidget(label("◆  Submetas", TEXT, 14, True))
        head.addStretch()
        self.subs.addLayout(head)
        rows = stats.submetas()
        if not rows:
            self.subs.addWidget(label("Crea issues de tipo «Submeta» y cuelga tareas de ellas para ver "
                                      "aquí su avance por separado.", TEXT_FAINT, 12, wrap=True))
        grid = QGridLayout()
        grid.setHorizontalSpacing(14)
        grid.setVerticalSpacing(6)
        for c, text in enumerate(("Submeta", "Progreso", "Hechas", "Vencidas", "Estimado", "")):
            grid.addWidget(label(text.upper(), TEXT_FAINT, 10, True), 0, c)
        for r, (goal, gs) in enumerate(rows, start=1):
            name = label(f"{goal.key}  {goal.title}", TEXT, 12)
            name.setCursor(Qt.PointingHandCursor)
            name.mousePressEvent = lambda _e, gid=goal.id: self.open_issue.emit(gid)
            grid.addWidget(name, r, 0)
            grid.addWidget(BlockProgress(gs["progress"], self.project.colour), r, 1)
            grid.addWidget(label(f"{gs['done']}/{gs['total']}", TEXT_DIM, 12), r, 2)
            grid.addWidget(label(str(gs["overdue"]), RED if gs["overdue"] else TEXT_FAINT, 12), r, 3)
            est = gs["estimate_min"]
            grid.addWidget(label(f"{round(gs['estimate_done_min'] / 60, 1):g}/{round(est / 60, 1):g} h"
                                 if est else "—", TEXT_DIM, 12), r, 4)
            btn = flat_btn("Ver en tablero", height=24)
            btn.clicked.connect(lambda _c=False, gid=goal.id: self.show_in_board.emit(gid))
            grid.addWidget(btn, r, 5)
        grid.setColumnStretch(0, 1)
        self.subs.addLayout(grid)
