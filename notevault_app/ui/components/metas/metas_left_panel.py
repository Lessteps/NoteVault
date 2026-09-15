"""Metas sidebar: create buttons, views, areas with counters and status filters."""

from datetime import date

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QScrollArea, QFrame, QMenu

from ....core import goal_manager as gm
from ..comun import primary_btn, flat_btn, clear_layout, GREEN
from ..comun.nav import NavButton, NavGroup, section_label

ACCENT = "#33b679"

VIEWS = (("tablero", "▦", "Tablero"), ("hoy", "☀", "Hoy"), ("calendario", "📅", "Calendario"))
FILTERS = ((gm.FILTER_ALL, "Todas"), (gm.FILTER_ACTIVE, "Activas"), (gm.FILTER_PAUSED, "En pausa"),
           (gm.FILTER_DONE, "Completadas"), (gm.FILTER_OVERDUE, "Vencidas"),
           (gm.FILTER_ARCHIVED, "Archivadas"))


class MetasLeftPanel(QWidget):
    view_requested = Signal(str)
    area_selected = Signal(str)          # "*" all, "" sin área, or area id
    filter_changed = Signal(str)
    new_goal_requested = Signal()
    new_area_requested = Signal()
    edit_area_requested = Signal(str)

    def __init__(self, goal_mgr, area_mgr, parent=None):
        super().__init__(parent)
        self.setObjectName("sidebarPanel")
        self.goal_mgr = goal_mgr
        self.area_mgr = area_mgr
        self.view = "tablero"
        self.area = "*"
        self.filter = gm.FILTER_ALL
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet("QScrollArea{background:transparent;border:none;}")
        inner = QWidget()
        inner.setObjectName("sidebarPanel")
        self._lay = QVBoxLayout(inner)
        self._lay.setContentsMargins(8, 14, 8, 12)
        self._lay.setSpacing(2)
        scroll.setWidget(inner)
        outer.addWidget(scroll)
        self.refresh()

    def set_managers(self, goal_mgr, area_mgr):
        self.goal_mgr, self.area_mgr = goal_mgr, area_mgr
        self.area = "*"
        self.refresh()

    def refresh(self):
        clear_layout(self._lay)
        top = QHBoxLayout()
        top.setSpacing(6)
        new = primary_btn("+  Nueva meta", height=32)
        new.clicked.connect(self.new_goal_requested.emit)
        top.addWidget(new, stretch=1)
        area_btn = flat_btn("+ Área", height=32)
        area_btn.clicked.connect(self.new_area_requested.emit)
        top.addWidget(area_btn)
        self._lay.addLayout(top)
        self._lay.addSpacing(10)

        self._lay.addWidget(section_label("Vistas"))
        self.views = NavGroup()
        for key, icon, text in VIEWS:
            b = self.views.add(key, NavButton(icon, text, accent=ACCENT))
            b.clicked.connect(lambda _c=False, k=key: self._view(k))
            self._lay.addWidget(b)
        today_count = len(self.goal_mgr.items_due_on(date.today()))
        self.views.buttons["hoy"].set_count(str(today_count) if today_count else "")
        self.views.set_active(self.view)
        self._lay.addSpacing(10)

        self._lay.addWidget(section_label("Áreas"))
        self.areas = NavGroup()
        goals = self.goal_mgr.goals(gm.FILTER_ALL)
        entries = [("*", "◎", "Todas", len(goals), "")]
        for a in self.area_mgr.areas():
            n = sum(1 for g in goals if g.area == a["id"])
            entries.append((a["id"], a["icon"] or "●", a["name"], n, a["colour"]))
        known = {a["id"] for a in self.area_mgr.areas()}
        entries.append(("", "○", "Sin área", sum(1 for g in goals if g.area not in known), ""))
        for key, icon, text, n, colour in entries:
            b = self.areas.add(key, NavButton(icon, text, str(n) if n else "", ACCENT, colour))
            b.clicked.connect(lambda _c=False, k=key: self._area(k))
            if key not in ("*", ""):
                b.setContextMenuPolicy(Qt.CustomContextMenu)
                b.customContextMenuRequested.connect(
                    lambda pos, k=key, btn=b: self._area_menu(k, btn.mapToGlobal(pos)))
                b.setToolTip("Clic derecho para editar o archivar")
            self._lay.addWidget(b)
        if not self.area_mgr.areas():
            sug = flat_btn("Crear áreas sugeridas", height=28)
            sug.setToolTip("Programación, Estudio, Salud, Finanzas y Personal")
            sug.clicked.connect(self._suggested)
            self._lay.addWidget(sug)
        self.areas.set_active(self.area)
        self._lay.addSpacing(10)

        self._lay.addWidget(section_label("Estado"))
        self.filters = NavGroup()
        for key, text in FILTERS:
            n = len(self.goal_mgr.goals(key))
            b = self.filters.add(key, NavButton("", text, str(n) if n else "", ACCENT))
            b.clicked.connect(lambda _c=False, k=key: self._filter(k))
            self._lay.addWidget(b)
        self.filters.set_active(self.filter)
        self._lay.addStretch()

    def _view(self, key):
        self.view = key
        self.views.set_active(key)
        self.view_requested.emit(key)

    def set_view(self, key):
        self.view = key
        self.views.set_active(key)

    def _area(self, key):
        self.area = key
        self.areas.set_active(key)
        if self.view != "tablero":
            self._view("tablero")
        self.area_selected.emit(key)

    def _filter(self, key):
        self.filter = key
        self.filters.set_active(key)
        if self.view != "tablero":
            self._view("tablero")
        self.filter_changed.emit(key)

    def _area_menu(self, key, pos):
        menu = QMenu(self)
        menu.addAction("Editar área…").triggered.connect(lambda: self.edit_area_requested.emit(key))
        menu.exec(pos)

    def _suggested(self):
        self.area_mgr.create_suggested()
        self.refresh()
