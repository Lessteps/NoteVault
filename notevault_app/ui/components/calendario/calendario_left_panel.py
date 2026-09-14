"""
Calendario Left Panel.
View switcher buttons (Día, Semana, Mes, Agenda), mini-month navigation widget,
checkboxes for filtering kinds (rutinas, eventos, hábitos, ejercicio, tareas, proyectos),
and a "Rutinas" button to launch rutina_editor.
"""

from datetime import date, timedelta
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QCheckBox,
    QFrame, QGridLayout
)
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont

from ....config import AppConfig
from ....core import vault_format
from .rutina_editor import RutinaEditorDialog
from . import month_name


def _section_label(text: str) -> QLabel:
    lbl = QLabel(text.upper())
    lbl.setObjectName("sectionLabel")
    f = lbl.font()
    f.setLetterSpacing(QFont.AbsoluteSpacing, 0.9)
    lbl.setFont(f)
    lbl.setStyleSheet("background:transparent; border:none; padding-left:4px; color:#888895; font-size:10px; font-weight:bold;")
    return lbl


class _NavBtn(QPushButton):
    def __init__(self, icon: str, label: str, parent=None):
        super().__init__(parent)
        self.setCheckable(True)
        self.setFixedHeight(34)
        self.setCursor(Qt.PointingHandCursor)

        row = QHBoxLayout(self)
        row.setContentsMargins(10, 0, 10, 0)
        row.setSpacing(8)

        ico = QLabel(icon)
        ico.setStyleSheet("font-size:13px; background:transparent; border:none;")
        ico.setFixedWidth(20)
        ico.setAttribute(Qt.WA_TransparentForMouseEvents)
        row.addWidget(ico)

        self._txt = QLabel(label)
        self._txt.setAttribute(Qt.WA_TransparentForMouseEvents)
        row.addWidget(self._txt, stretch=1)
        self.toggled.connect(self._paint_label)
        self._paint_label(False)

        self.setStyleSheet("""
            QPushButton {
                background: transparent; border: none;
                border-radius: 6px; color: #888895; text-align: left;
            }
            QPushButton:hover { background: #26262e; color: #dcdde0; }
            QPushButton:checked {
                background: #2383e2; color: #ffffff; font-weight: bold;
            }
        """)

    def _paint_label(self, checked: bool):
        colour = "#ffffff; font-weight:bold" if checked else "#dcdde0"
        self._txt.setStyleSheet(
            f"font-size:12px; background:transparent; border:none; color:{colour};")


class MiniMonthWidget(QWidget):
    """Compact mini-month calendar for quick date navigation."""

    date_selected = Signal(date)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_month_date = date.today()
        self.active_date = date.today()

        self._build_ui()
        self.refresh()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(4)

        # Month Nav Header
        hdr = QHBoxLayout()
        hdr.setContentsMargins(0, 0, 0, 0)

        prev_btn = QPushButton("<")
        prev_btn.setFixedSize(22, 22)
        prev_btn.setStyleSheet("background: transparent; border: none; color: #888895; font-weight: bold;")
        prev_btn.setCursor(Qt.PointingHandCursor)
        prev_btn.clicked.connect(self._prev_month)
        hdr.addWidget(prev_btn)

        self.month_lbl = QLabel()
        self.month_lbl.setAlignment(Qt.AlignCenter)
        self.month_lbl.setStyleSheet("font-size: 11px; font-weight: bold; color: #dcdde0;")
        hdr.addWidget(self.month_lbl, stretch=1)

        next_btn = QPushButton(">")
        next_btn.setFixedSize(22, 22)
        next_btn.setStyleSheet("background: transparent; border: none; color: #888895; font-weight: bold;")
        next_btn.setCursor(Qt.PointingHandCursor)
        next_btn.clicked.connect(self._next_month)
        hdr.addWidget(next_btn)

        layout.addLayout(hdr)

        # 7-Column Grid
        self.grid = QGridLayout()
        self.grid.setContentsMargins(0, 0, 0, 0)
        self.grid.setSpacing(2)
        layout.addLayout(self.grid)

    def _prev_month(self):
        first = date(self.current_month_date.year, self.current_month_date.month, 1) - timedelta(days=1)
        self.current_month_date = date(first.year, first.month, 1)
        self.refresh()

    def _next_month(self):
        if self.current_month_date.month == 12:
            self.current_month_date = date(self.current_month_date.year + 1, 1, 1)
        else:
            self.current_month_date = date(self.current_month_date.year, self.current_month_date.month + 1, 1)
        self.refresh()

    def set_active_date(self, d: date):
        self.active_date = d
        self.current_month_date = date(d.year, d.month, 1)
        self.refresh()

    def refresh(self):
        while self.grid.count():
            child = self.grid.takeAt(0)
            if child.widget():
                child.widget().hide()
                child.widget().deleteLater()

        m = self.current_month_date
        self.month_lbl.setText(f"{month_name(m).capitalize()} {m.year}")

        # Weekday headers
        headers = ["L", "M", "X", "J", "V", "S", "D"]
        for idx, h in enumerate(headers):
            lbl = QLabel(h)
            lbl.setAlignment(Qt.AlignCenter)
            lbl.setStyleSheet("color: #666672; font-size: 10px; font-weight: bold;")
            self.grid.addWidget(lbl, 0, idx)

        # Calculate grid
        first_of_month = date(self.current_month_date.year, self.current_month_date.month, 1)
        start_grid = first_of_month - timedelta(days=first_of_month.weekday())

        today = date.today()
        for row in range(1, 7):
            for col in range(7):
                curr_d = start_grid + timedelta(days=(row - 1) * 7 + col)
                btn = QPushButton(str(curr_d.day))
                btn.setFixedSize(24, 22)
                btn.setCursor(Qt.PointingHandCursor)

                is_curr_m = (curr_d.month == self.current_month_date.month)
                is_act = (curr_d == self.active_date)
                is_tod = (curr_d == today)

                base = "padding: 0px; margin: 0px; min-width: 0px; min-height: 0px; border-radius: 11px; font-size: 10px;"
                if is_act:
                    btn.setStyleSheet(f"QPushButton {{ {base} background: #2383e2; color: #ffffff; font-weight: bold; border: none; }}")
                elif is_tod:
                    btn.setStyleSheet(f"QPushButton {{ {base} background: transparent; color: #2383e2; font-weight: bold; border: 1px solid #2383e2; }}")
                elif is_curr_m:
                    btn.setStyleSheet(f"QPushButton {{ {base} background: transparent; color: #dcdde0; border: none; }}"
                                      f"QPushButton:hover {{ background: #26262e; }}")
                else:
                    btn.setStyleSheet(f"QPushButton {{ {base} background: transparent; color: #555560; border: none; }}"
                                      f"QPushButton:hover {{ background: #26262e; }}")

                btn.clicked.connect(lambda _, d=curr_d: self._on_date_click(d))
                self.grid.addWidget(btn, row, col)

    def _on_date_click(self, d: date):
        self.active_date = d
        self.refresh()
        self.date_selected.emit(d)


class CalendarioLeftPanel(QWidget):
    """Calendario left sidebar widget."""

    view_requested = Signal(str)      # "dia" | "semana" | "mes" | "agenda"
    date_selected = Signal(date)
    filters_changed = Signal(dict)

    def __init__(self, schedule_mgr, parent=None):
        super().__init__(parent)
        self.schedule_mgr = schedule_mgr
        self.setObjectName("sidebarPanel")
        self.setFixedWidth(220)

        self._filters = AppConfig.get_calendar_filters()
        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 14, 10, 14)
        layout.setSpacing(14)

        # Header Title
        title_lbl = QLabel("Calendario")
        title_lbl.setStyleSheet("font-size: 15px; font-weight: bold; color: #dcdde0; padding-left: 4px;")
        layout.addWidget(title_lbl)

        # 1. View Switcher
        layout.addWidget(_section_label("Vistas"))
        self.btn_dia = _NavBtn("☀️", "Día")
        self.btn_semana = _NavBtn("📅", "Semana")
        self.btn_mes = _NavBtn("🗓️", "Mes")
        self.btn_agenda = _NavBtn("📋", "Agenda")

        self._nav_btns = {
            "dia": self.btn_dia,
            "semana": self.btn_semana,
            "mes": self.btn_mes,
            "agenda": self.btn_agenda,
        }

        self.btn_semana.setChecked(True)  # Default week view

        for key, btn in self._nav_btns.items():
            btn.clicked.connect(lambda _, k=key: self._select_view(k))
            layout.addWidget(btn)

        layout.addSpacing(6)

        # 2. Mini Month Widget
        layout.addWidget(_section_label("Navegación"))
        self.mini_month = MiniMonthWidget()
        self.mini_month.date_selected.connect(self.date_selected.emit)
        layout.addWidget(self.mini_month)

        layout.addSpacing(6)

        # 3. Filters
        layout.addWidget(_section_label("Filtrar por tipo"))
        self.filter_checkboxes = {}

        filter_defs = [
            ("routine", "Rutinas", "#2dd4bf"),
            ("event", "Eventos", "#ff9632"),
            ("habit", "Hábitos", "#7c5af0"),
            ("exercise", "Ejercicio", "#ff9632"),
            ("task", "Tareas", "#2383e2"),
            ("project", "Proyectos", "#a78bfa"),
        ]

        for kind, label_txt, hex_col in filter_defs:
            cb = QCheckBox(label_txt)
            is_checked = self._filters.get(kind, True)
            cb.setChecked(is_checked)
            cb.setStyleSheet(f"""
                QCheckBox {{ color: #dcdde0; font-size: 12px; spacing: 6px; }}
                QCheckBox::indicator {{ width: 14px; height: 14px; border-radius: 3px; border: 1px solid #33333e; background: #252525; }}
                QCheckBox::indicator:checked {{ background-color: {hex_col}; border-color: {hex_col}; }}
            """)
            cb.toggled.connect(self._on_filter_toggled)
            self.filter_checkboxes[kind] = cb
            layout.addWidget(cb)

        layout.addStretch()

        # 4. Rutinas Template Button
        rutinas_btn = QPushButton("⚙️ Configurar Rutinas")
        rutinas_btn.setCursor(Qt.PointingHandCursor)
        rutinas_btn.setStyleSheet("""
            QPushButton {
                background-color: #25252b; border: 1px solid #33333e;
                border-radius: 6px; color: #dcdde0; padding: 8px; font-size: 12px; font-weight: bold;
            }
            QPushButton:hover { background-color: #2a2a32; border-color: #2383e2; }
        """)
        rutinas_btn.clicked.connect(self._open_rutina_editor)
        layout.addWidget(rutinas_btn)

    def _select_view(self, key: str):
        for k, btn in self._nav_btns.items():
            btn.setChecked(k == key)
        self.view_requested.emit(key)

    def set_active_view(self, key: str):
        if key in self._nav_btns:
            for k, btn in self._nav_btns.items():
                btn.setChecked(k == key)

    def set_active_date(self, d: date):
        self.mini_month.set_active_date(d)

    def _on_filter_toggled(self):
        new_filters = {k: cb.isChecked() for k, cb in self.filter_checkboxes.items()}
        self._filters = new_filters
        AppConfig.set_calendar_filters(new_filters)
        self.filters_changed.emit(new_filters)

    def _open_rutina_editor(self):
        dlg = RutinaEditorDialog(self.schedule_mgr, parent=self)
        dlg.exec()
        self.filters_changed.emit(self._filters)
