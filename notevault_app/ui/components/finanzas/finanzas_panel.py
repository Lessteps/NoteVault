"""Finanzas: left navigation and the centre stack of views."""

from datetime import date

from PySide6.QtCore import Signal
from PySide6.QtWidgets import QWidget, QVBoxLayout, QStackedWidget, QScrollArea, QFrame

from ....core import finance_manager as fin
from ..comun import TEXT_DIM, TEXT_FAINT, GREEN, RED, label, clear_layout
from ..comun.nav import NavButton, NavGroup, section_label
from .finanzas_diario import FinanzasDiario
from .finanzas_tablas import FinanzasSemanal, FinanzasMensual, FinanzasAnual
from .finanzas_metas import FinanzasMetas, FinanzasCategorias

ACCENT = "#eab308"
VIEWS = (("diario", "☀", "Diario"), ("semanal", "📅", "Semanal"), ("mensual", "🗓", "Mensual"),
         ("anual", "📊", "Anual"), ("metas", "🎯", "Metas financieras"), ("categorias", "🏷", "Categorías"))


class FinanzasLeftPanel(QWidget):
    view_requested = Signal(str)

    def __init__(self, fm, parent=None):
        super().__init__(parent)
        self.setObjectName("sidebarPanel")
        self.fm = fm
        self.view = "diario"
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

    def set_manager(self, fm):
        self.fm = fm
        self.refresh()

    def set_view(self, key):
        self.view = key
        self.nav.set_active(key)

    def refresh(self):
        clear_layout(self._lay)
        self._lay.addWidget(section_label("Finanzas"))
        self.nav = NavGroup()
        today = date.today()
        checks = self.fm.due_checks(today)
        pending = sum(1 for _g, c, _i in checks if not c)
        for key, icon, text in VIEWS:
            count = str(pending) if key == "diario" and pending else ""
            b = self.nav.add(key, NavButton(icon, text, count, ACCENT))
            b.clicked.connect(lambda _c=False, k=key: (self.set_view(k), self.view_requested.emit(k)))
            self._lay.addWidget(b)
        self.nav.set_active(self.view)
        self._lay.addSpacing(14)
        this, _prev = self.fm.compare_month(today.year, today.month)
        self._lay.addWidget(section_label("Este mes"))
        for text, value, colour in (("Gastos", this[fin.GASTO], RED), ("Ingresos", this[fin.INGRESO], GREEN),
                                    ("Balance", this["balance"], GREEN if this["balance"] >= 0 else RED)):
            row = label(f"{text}:  {fin.format_money(value)}", colour, 12)
            row.setContentsMargins(10, 2, 0, 2)
            self._lay.addWidget(row)
        self._lay.addSpacing(10)
        self._lay.addWidget(section_label("Ahorro total"))
        total = self.fm.general_savings() + sum(self.fm.saved(g["id"]) for g in self.fm.goals())
        saved = label(fin.format_money(total), ACCENT, 16, True)
        saved.setContentsMargins(10, 2, 0, 2)
        self._lay.addWidget(saved)
        for g in self.fm.goals(include_done=True)[:6]:
            line = label(f"{g['icon']} {g['name']}: {fin.format_money(self.fm.saved(g['id']))}", TEXT_DIM, 11)
            line.setContentsMargins(10, 0, 0, 0)
            self._lay.addWidget(line)
        self._lay.addStretch()


class FinanzasPanel(QWidget):
    data_changed = Signal()
    view_changed = Signal(str)

    def __init__(self, fm, parent=None):
        super().__init__(parent)
        self.setObjectName("centerPanel")
        self.fm = fm
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        self.stack = QStackedWidget()
        self.views = {
            "diario": FinanzasDiario(fm), "semanal": FinanzasSemanal(fm), "mensual": FinanzasMensual(fm),
            "anual": FinanzasAnual(fm), "metas": FinanzasMetas(fm), "categorias": FinanzasCategorias(fm),
        }
        for view in self.views.values():
            self.stack.addWidget(view)
            view.data_changed.connect(self.data_changed.emit)
        lay.addWidget(self.stack)
        self.current = "diario"

    def show_view(self, key: str):
        if key not in self.views:
            key = "diario"
        self.current = key
        self.stack.setCurrentWidget(self.views[key])
        self.views[key].refresh()
        self.view_changed.emit(key)

    def open_goal(self, gid: str):
        self.show_view("metas")
        self.views["metas"].open_goal(gid)

    def refresh(self):
        self.fm.ensure_defaults()
        self.views[self.current].refresh()

    def set_manager(self, fm):
        self.fm = fm
        for view in self.views.values():
            view.fm = fm
        self.views["metas"].current = None
        self.show_view("diario")
