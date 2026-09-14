"""
Calendario Panel.
Centre panel holding a QStackedWidget with Día, Semana, Mes, Agenda views.
Top navigation bar (Prev, Hoy, Next, Date Range, + Nuevo Evento).
"""

from datetime import date, timedelta
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QStackedWidget,
    QFrame, QMessageBox, QDialog
)
from PySide6.QtCore import Qt, Signal

from ....core.schedule_manager import ScheduleManager
from .vista_dia import VistaDia
from .vista_semana import VistaSemana
from .vista_mes import VistaMes
from .vista_agenda import VistaAgenda
from .evento_editor import EventoEditorDialog

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


class CalendarioPanel(QWidget):
    """Main center panel for Calendario module."""

    data_changed = Signal()
    notify_requested = Signal(str, str)
    view_changed = Signal(str)
    date_changed = Signal(date)
    status_message = Signal(str)

    def __init__(self, schedule_mgr: ScheduleManager, parent=None):
        super().__init__(parent)
        self.schedule_mgr = schedule_mgr
        self.setObjectName("centerPanel")

        self.current_date = date.today()
        self.current_view_idx = VIEW_SEMANA
        self.filters: dict = {}

        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # ── Top Bar ──────────────────────────────────────────────────────────
        self.top_bar = QFrame()
        self.top_bar.setFixedHeight(50)
        self.top_bar.setStyleSheet("background-color: #202024; border-bottom: 1px solid #33333e;")
        bar_lay = QHBoxLayout(self.top_bar)
        bar_lay.setContentsMargins(16, 0, 16, 0)
        bar_lay.setSpacing(10)

        # Prev / Hoy / Next Navigation
        self.prev_btn = QPushButton("◄")
        self.prev_btn.setFixedSize(30, 30)
        self.prev_btn.setCursor(Qt.PointingHandCursor)
        self.prev_btn.setStyleSheet("""
            QPushButton { background: #25252b; border: 1px solid #33333e; border-radius: 4px; color: #dcdde0; }
            QPushButton:hover { background: #2a2a32; border-color: #2383e2; }
        """)
        self.prev_btn.clicked.connect(self._nav_prev)
        bar_lay.addWidget(self.prev_btn)

        self.today_btn = QPushButton("Hoy")
        self.today_btn.setFixedSize(50, 30)
        self.today_btn.setCursor(Qt.PointingHandCursor)
        self.today_btn.setStyleSheet("""
            QPushButton { background: #25252b; border: 1px solid #33333e; border-radius: 4px; color: #dcdde0; font-size: 12px; font-weight: bold; }
            QPushButton:hover { background: #2a2a32; border-color: #2383e2; }
        """)
        self.today_btn.clicked.connect(self._nav_today)
        bar_lay.addWidget(self.today_btn)

        self.next_btn = QPushButton("►")
        self.next_btn.setFixedSize(30, 30)
        self.next_btn.setCursor(Qt.PointingHandCursor)
        self.next_btn.setStyleSheet("""
            QPushButton { background: #25252b; border: 1px solid #33333e; border-radius: 4px; color: #dcdde0; }
            QPushButton:hover { background: #2a2a32; border-color: #2383e2; }
        """)
        self.next_btn.clicked.connect(self._nav_next)
        bar_lay.addWidget(self.next_btn)

        # Date Range Title
        self.title_label = QLabel()
        self.title_label.setStyleSheet("font-size: 16px; font-weight: bold; color: #dcdde0; padding-left: 8px;")
        bar_lay.addWidget(self.title_label)

        bar_lay.addStretch()

        # "+ Nuevo Evento" Button
        self.new_event_btn = QPushButton("+ Nuevo evento")
        self.new_event_btn.setCursor(Qt.PointingHandCursor)
        self.new_event_btn.setStyleSheet("""
            QPushButton {
                background-color: #2383e2; color: #ffffff; border: none;
                border-radius: 6px; padding: 6px 14px; font-size: 13px; font-weight: bold;
            }
            QPushButton:hover { background-color: #1a6fc4; }
        """)
        self.new_event_btn.clicked.connect(self._open_new_event_dialog)
        bar_lay.addWidget(self.new_event_btn)

        layout.addWidget(self.top_bar)

        # ── Stacked Views ────────────────────────────────────────────────────
        self.stack = QStackedWidget()

        self.vista_dia = VistaDia(self.schedule_mgr)
        self.vista_semana = VistaSemana(self.schedule_mgr)
        self.vista_mes = VistaMes(self.schedule_mgr)
        self.vista_agenda = VistaAgenda(self.schedule_mgr)

        self.stack.addWidget(self.vista_dia)     # 0
        self.stack.addWidget(self.vista_semana)  # 1
        self.stack.addWidget(self.vista_mes)     # 2
        self.stack.addWidget(self.vista_agenda)  # 3

        # Wiring
        self.vista_dia.data_changed.connect(self.data_changed.emit)
        self.vista_semana.data_changed.connect(self.data_changed.emit)
        self.vista_mes.data_changed.connect(self.data_changed.emit)
        self.vista_mes.day_selected.connect(self._on_month_day_selected)
        self.vista_agenda.data_changed.connect(self.data_changed.emit)

        layout.addWidget(self.stack, stretch=1)
        self.stack.setCurrentIndex(VIEW_SEMANA)
        self._update_header_title()

    # ── Navigation & Views ─────────────────────────────────────────────────

    def show_view(self, key_or_idx):
        if isinstance(key_or_idx, str):
            idx = VIEW_KEYS.get(key_or_idx.lower(), VIEW_SEMANA)
            key_name = key_or_idx.lower()
        else:
            idx = key_or_idx
            key_name = [k for k, v in VIEW_KEYS.items() if v == idx][0]

        self.current_view_idx = idx
        self.stack.setCurrentIndex(idx)

        # Set date & filters on active view
        active_view = self.stack.currentWidget()
        if hasattr(active_view, "set_filters"):
            active_view.set_filters(self.filters)
        if hasattr(active_view, "set_date"):
            active_view.set_date(self.current_date)

        self._update_header_title()
        self.view_changed.emit(key_name)

    def set_date(self, d: date):
        self.current_date = d
        active_view = self.stack.currentWidget()
        if hasattr(active_view, "set_date"):
            active_view.set_date(d)
        self._update_header_title()
        self.date_changed.emit(d)

    def set_filters(self, filters: dict):
        self.filters = filters
        active_view = self.stack.currentWidget()
        if hasattr(active_view, "set_filters"):
            active_view.set_filters(filters)

    def refresh_current(self):
        active_view = self.stack.currentWidget()
        if hasattr(active_view, "refresh"):
            active_view.refresh()
        self._update_header_title()

    def set_manager(self, mgr: ScheduleManager):
        self.schedule_mgr = mgr
        self.vista_dia.schedule_mgr = mgr
        self.vista_semana.schedule_mgr = mgr
        self.vista_mes.schedule_mgr = mgr
        self.vista_agenda.schedule_mgr = mgr
        self.refresh_current()

    def _nav_prev(self):
        if self.current_view_idx == VIEW_DIA:
            self.set_date(self.current_date - timedelta(days=1))
        elif self.current_view_idx == VIEW_SEMANA:
            self.set_date(self.current_date - timedelta(days=7))
        elif self.current_view_idx == VIEW_MES:
            first = date(self.current_date.year, self.current_date.month, 1) - timedelta(days=1)
            self.set_date(date(first.year, first.month, 1))
        elif self.current_view_idx == VIEW_AGENDA:
            self.set_date(self.current_date - timedelta(days=7))

    def _nav_next(self):
        if self.current_view_idx == VIEW_DIA:
            self.set_date(self.current_date + timedelta(days=1))
        elif self.current_view_idx == VIEW_SEMANA:
            self.set_date(self.current_date + timedelta(days=7))
        elif self.current_view_idx == VIEW_MES:
            if self.current_date.month == 12:
                self.set_date(date(self.current_date.year + 1, 1, 1))
            else:
                self.set_date(date(self.current_date.year, self.current_date.month + 1, 1))
        elif self.current_view_idx == VIEW_AGENDA:
            self.set_date(self.current_date + timedelta(days=7))

    def _nav_today(self):
        self.set_date(date.today())

    def _on_month_day_selected(self, d: date):
        self.current_date = d
        self.show_view("dia")

    def _update_header_title(self):
        d = self.current_date
        if self.current_view_idx == VIEW_DIA:
            self.title_label.setText(d.strftime("%d de %B de %Y").capitalize())
        elif self.current_view_idx == VIEW_SEMANA:
            start_w = d - timedelta(days=d.weekday())
            end_w = start_w + timedelta(days=6)
            if start_w.month == end_w.month:
                self.title_label.setText(f"{start_w.day} - {end_w.day} {start_w.strftime('%B %Y')}".capitalize())
            else:
                self.title_label.setText(f"{start_w.strftime('%d %b')} - {end_w.strftime('%d %b %Y')}".capitalize())
        elif self.current_view_idx == VIEW_MES:
            self.title_label.setText(d.strftime("%B de %Y").capitalize())
        elif self.current_view_idx == VIEW_AGENDA:
            self.title_label.setText("Agenda")

    def _open_new_event_dialog(self):
        dlg = EventoEditorDialog(self, date_val=self.current_date)
        if dlg.exec() == QDialog.Accepted:
            if not dlg.is_deleted:
                data = dlg.get_data()
                self.schedule_mgr.add_event(self.current_date, **data)
                self.data_changed.emit()
                self.refresh_current()
