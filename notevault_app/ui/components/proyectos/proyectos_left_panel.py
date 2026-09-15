"""Proyectos sidebar: new project, board, and the list of projects with their progress."""

from datetime import date

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QWidget, QVBoxLayout, QScrollArea, QFrame

from ....core.project_manager import ProjectManager, PROJECT_STATUSES, P_DONE
from ..comun import primary_btn, clear_layout, label, TEXT_FAINT
from ..comun.nav import NavButton, NavGroup, section_label

ACCENT = "#a78bfa"


class ProyectosLeftPanel(QWidget):
    board_requested = Signal()
    project_requested = Signal(str)
    new_requested = Signal()

    def __init__(self, manager: ProjectManager, parent=None):
        super().__init__(parent)
        self.setObjectName("sidebarPanel")
        self.manager = manager
        self.active = "__board__"
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

    def set_active(self, key):
        self.active = key
        self.nav.set_active(key)

    def refresh(self):
        clear_layout(self._lay)
        new = primary_btn("+  Nuevo proyecto", height=32)
        new.clicked.connect(self.new_requested.emit)
        self._lay.addWidget(new)
        self._lay.addSpacing(10)
        self.nav = NavGroup()
        self._lay.addWidget(section_label("Proyectos"))
        projects = self.manager.projects()
        board = self.nav.add("__board__", NavButton("▦", "Tablero", str(len(projects)) if projects else "", ACCENT))
        board.clicked.connect(lambda: (self.set_active("__board__"), self.board_requested.emit()))
        self._lay.addWidget(board)
        today = date.today()
        for status in PROJECT_STATUSES:
            group = [p for p in projects if p.status == status]
            if not group:
                continue
            self._lay.addSpacing(8)
            self._lay.addWidget(section_label(status))
            for p in group:
                issues = self.manager.issues(p.id)
                done = sum(1 for i in issues if i.is_done)
                overdue = any(i.is_overdue(today) for i in issues)
                b = self.nav.add(p.id, NavButton(p.icon or "●", p.name,
                                                 f"{done}/{len(issues)}" if issues else "",
                                                 ACCENT, "" if p.icon else p.colour))
                b.setToolTip(f"{p.key} · {p.name} — {p.status}" + (" · con vencidas" if overdue else ""))
                b.clicked.connect(lambda _c=False, pid=p.id: (self.set_active(pid), self.project_requested.emit(pid)))
                self._lay.addWidget(b)
        if not projects:
            self._lay.addWidget(label("Sin proyectos todavía", TEXT_FAINT, 11))
        self.nav.set_active(self.active)
        self._lay.addStretch()

    def set_manager(self, manager: ProjectManager):
        self.manager = manager
        self.active = "__board__"
        self.refresh()
