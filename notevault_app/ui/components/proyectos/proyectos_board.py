"""Tablero de proyectos: a dashboard card per project, grouped by area or status."""

from datetime import date

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QScrollArea, QFrame, QLayout, QMenu,
)

from ....core.project_manager import (
    ProjectStats, PROJECT_STATUSES, PROJECT_STATUS_COLORS, P_ACTIVE, P_DONE,
)
from ..comun import (
    BG_PAGE, TEXT, TEXT_DIM, TEXT_FAINT, RED, ORANGE, GREEN, label, chip, clear_layout, combo,
    primary_btn, line_edit, fmt_short,
)
from ..comun.widgets import DashboardCard, BlockProgress
from ..comun.charts import Sparkline

CARD_W = 300


class ProyectosBoard(QWidget):
    project_opened = Signal(str)
    new_requested = Signal()
    edit_requested = Signal(str)
    data_changed = Signal()

    def __init__(self, manager, area_mgr=None, parent=None):
        super().__init__(parent)
        self.manager = manager
        self.area_mgr = area_mgr
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
        top.addWidget(label("◫  Proyectos", TEXT, 22, True))
        top.addStretch()
        self.search = line_edit("🔎  Buscar proyecto…", 30)
        self.search.setFixedWidth(200)
        self.search.textChanged.connect(lambda _t: self.refresh())
        top.addWidget(self.search)
        self.status = combo([("Estado: todos", "")] + [(s, s) for s in PROJECT_STATUSES], 30)
        self.status.setFixedWidth(150)
        self.status.currentIndexChanged.connect(lambda _i: self.refresh())
        top.addWidget(self.status)
        self.group = combo([("Agrupar por estado", "estado"), ("Agrupar por área", "area"),
                            ("Sin agrupar", "")], 30)
        self.group.setFixedWidth(170)
        self.group.currentIndexChanged.connect(lambda _i: self.refresh())
        top.addWidget(self.group)
        new = primary_btn("+  Nuevo proyecto", 30)
        new.clicked.connect(self.new_requested.emit)
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
        self._timer = QTimer(self)
        self._timer.setSingleShot(True)
        self._timer.timeout.connect(self._reflow)

    def set_manager(self, manager, area_mgr=None):
        self.manager = manager
        if area_mgr is not None:
            self.area_mgr = area_mgr
        self.refresh()

    def resizeEvent(self, e):
        super().resizeEvent(e)
        self._timer.start(120)

    def _reflow(self):
        cols = max(1, (self.width() - 44) // (CARD_W + 14))
        if cols != self._columns:
            self._columns = cols
            self.refresh()

    def refresh(self):
        clear_layout(self.sections)
        projects = self.manager.filtered(self.search.text(), self.status.currentData() or "")
        all_p = self.manager.projects()
        active = sum(1 for p in all_p if p.status == P_ACTIVE)
        done = sum(1 for p in all_p if p.status == P_DONE)
        self.summary.setText(f"{len(projects)} de {len(all_p)} proyectos · {active} en curso · {done} terminados")
        if not projects:
            empty = label("Todavía no hay proyectos.\nUn proyecto reúne submetas, tareas y errores en un "
                          "tablero Kanban, con estadísticas y calendario propios.", TEXT_FAINT, 13, wrap=True)
            empty.setAlignment(Qt.AlignCenter)
            empty.setMinimumHeight(160)
            self.sections.addWidget(empty)
            return
        mode = self.group.currentData()
        groups = []
        if mode == "estado":
            for s in PROJECT_STATUSES:
                items = [p for p in projects if p.status == s]
                if items:
                    groups.append((s, PROJECT_STATUS_COLORS.get(s, TEXT_DIM), items))
        elif mode == "area" and self.area_mgr is not None:
            areas = self.area_mgr.areas()
            for a in areas:
                items = [p for p in projects if p.area == a["id"]]
                if items:
                    groups.append((f"{a['icon']}  {a['name']}".strip(), a["colour"], items))
            known = {a["id"] for a in areas}
            rest = [p for p in projects if p.area not in known]
            if rest:
                groups.append(("Sin área", TEXT_DIM, rest))
        else:
            groups.append(("", TEXT_DIM, projects))
        today = date.today()
        for title, colour, items in groups:
            box = QWidget()
            box.setStyleSheet("background:transparent;")
            v = QVBoxLayout(box)
            v.setContentsMargins(0, 0, 0, 0)
            v.setSpacing(10)
            if title:
                head = QHBoxLayout()
                head.addWidget(label(title, colour, 15, True))
                head.addWidget(label(str(len(items)), TEXT_FAINT, 12))
                head.addStretch()
                v.addLayout(head)
            grid = QGridLayout()
            grid.setSpacing(14)
            for i, p in enumerate(items):
                grid.addWidget(self._card(p, today), i // self._columns, i % self._columns)
            for c in range(self._columns):
                grid.setColumnStretch(c, 1)
            v.addLayout(grid)
            self.sections.addWidget(box)

    def _card(self, p, today):
        stats = ProjectStats(self.manager, p, today)
        s = stats.summary()
        card = DashboardCard(p.colour)
        card.setMinimumWidth(CARD_W - 40)
        card.clicked.connect(lambda pid=p.id: self.project_opened.emit(pid))
        card.setContextMenuPolicy(Qt.CustomContextMenu)
        card.customContextMenuRequested.connect(lambda pos, proj=p, c=card: self._menu(proj, c.mapToGlobal(pos)))
        b = card.body
        head = QHBoxLayout()
        head.setSpacing(8)
        head.addWidget(label(p.icon or "◫", TEXT, 20))
        names = QVBoxLayout()
        names.setSpacing(0)
        names.addWidget(label(p.key, TEXT_FAINT, 10, True))
        names.addWidget(label(p.name, TEXT, 14, True, wrap=True))
        head.addLayout(names, 1)
        head.addWidget(chip(p.status, PROJECT_STATUS_COLORS.get(p.status, TEXT_DIM)), 0, Qt.AlignTop)
        b.addLayout(head)
        prow = QHBoxLayout()
        prow.addWidget(BlockProgress(s["progress"], p.colour))
        prow.addStretch()
        prow.addWidget(label(f"{s['done']}/{s['total']} issues", TEXT_DIM, 11))
        b.addLayout(prow)
        info = QHBoxLayout()
        info.addWidget(label(f"{s['open']} abiertas", TEXT_DIM, 11))
        if s["overdue"]:
            info.addWidget(label(f"· {s['overdue']} vencidas", RED, 11))
        info.addStretch()
        info.addWidget(Sparkline([n for _d, n in stats.throughput(8)], p.colour, 80, 22))
        b.addLayout(info)
        nxt = stats.next_due()
        if nxt:
            late = nxt.due < today
            b.addWidget(label(f"Próximo: {nxt.key} {nxt.title} · {fmt_short(nxt.due)}",
                              RED if late else TEXT_DIM, 11))
        foot = QHBoxLayout()
        left = p.days_left(today)
        if left is not None:
            if p.is_overdue(today):
                foot.addWidget(chip(f"⏰ entrega vencida hace {-left} d", RED))
            else:
                foot.addWidget(chip(f"⏰ {left} días a la entrega", ORANGE if left <= 7 else TEXT_DIM))
        area = self.area_mgr.get(p.area) if (self.area_mgr and p.area) else None
        if area and not area["archived"]:
            foot.addWidget(chip(f"{area['icon']} {area['name']}".strip(), area["colour"]))
        foot.addStretch()
        b.addLayout(foot)
        return card

    def _menu(self, p, pos):
        menu = QMenu(self)
        menu.addAction("Abrir").triggered.connect(lambda: self.project_opened.emit(p.id))
        menu.addAction("Editar…").triggered.connect(lambda: self.edit_requested.emit(p.id))
        status = menu.addMenu("Estado")
        for s in PROJECT_STATUSES:
            status.addAction(s).triggered.connect(
                lambda _c=False, st=s: (self.manager.update(p.id, status=st), self.data_changed.emit(),
                                        self.refresh()))
        menu.exec(pos)
