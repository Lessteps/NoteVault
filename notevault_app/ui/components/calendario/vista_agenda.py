"""
Vista Agenda — Flat chronological list view.
Chronological list of occurrences grouped by date.
"""

from datetime import date, timedelta

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QScrollArea, QFrame, QCheckBox,
)
from PySide6.QtCore import Qt, Signal, QRect, QPoint

from ....core.schedule_manager import Occurrence
from . import month_name, weekday_name


class AgendaItemRow(QFrame):
    """Single item row in the Agenda list."""

    item_clicked = Signal(Occurrence)
    done_toggled = Signal(Occurrence, bool)

    def __init__(self, occ: Occurrence, parent=None):
        super().__init__(parent)
        self.occ = occ
        self.setCursor(Qt.PointingHandCursor)
        self.setFixedHeight(46)
        self.setStyleSheet("""
            AgendaItemRow {
                background-color: #202024; border: 1px solid #33333e;
                border-radius: 6px; margin-bottom: 4px;
            }
            AgendaItemRow:hover {
                background-color: #25252b; border-color: #2383e2;
            }
        """)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(12, 0, 12, 0)
        layout.setSpacing(12)

        # Done Checkbox
        self.cb = QCheckBox()
        self.cb.setChecked(occ.done)
        self.cb.setEnabled(occ.source in ("routine", "event", "task", "metas", "proyectos", "finanzas")
                           or occ.id.startswith("habit:"))
        self.cb.toggled.connect(self._on_toggled)
        layout.addWidget(self.cb)

        # Color bar indicator
        accent_hex = occ.colour if occ.colour.startswith("#") else self._kind_color(occ.colour)
        color_bar = QFrame()
        color_bar.setFixedSize(4, 24)
        color_bar.setStyleSheet(f"background-color: {accent_hex}; border-radius: 2px;")
        layout.addWidget(color_bar)

        # Time label
        if occ.start:
            time_txt = occ.start
            if occ.duration_min:
                try:
                    h, m = map(int, occ.start.split(":"))
                    dur = occ.duration_min
                    end_min = h * 60 + m + dur
                    end_str = f"{end_min // 60:02d}:{end_min % 60:02d}"
                    time_txt = f"{occ.start} - {end_str}"
                except ValueError:
                    pass
        else:
            time_txt = "Todo el día"

        time_lbl = QLabel(time_txt)
        time_lbl.setFixedWidth(110)
        time_lbl.setStyleSheet("color: #888895; font-size: 12px; font-weight: bold;")
        layout.addWidget(time_lbl)

        # Title
        title_lbl = QLabel(occ.title)
        title_lbl.setStyleSheet("color: #dcdde0; font-size: 13px; font-weight: bold;")
        if occ.done:
            title_lbl.setStyleSheet("color: #606068; font-size: 13px; text-decoration: line-through;")
        layout.addWidget(title_lbl, stretch=1)

        # Kind Badge
        kind_lbl = QLabel(self._kind_label(occ.kind))
        kind_lbl.setStyleSheet(f"""
            background-color: #26262e; color: {accent_hex};
            border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: bold;
        """)
        layout.addWidget(kind_lbl)

    def _on_toggled(self, checked: bool):
        self.done_toggled.emit(self.occ, checked)

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.item_clicked.emit(self.occ)

    def _kind_color(self, colour: str) -> str:
        color_map = {
            "blue": "#2383e2", "orange": "#ff9632", "purple": "#7c5af0",
            "teal": "#2dd4bf", "green": "#2dd4bf", "red": "#ef4444", "yellow": "#eab308"
        }
        return color_map.get(colour, "#2383e2")

    def _kind_label(self, kind: str) -> str:
        labels = {
            "routine": "Rutina", "event": "Evento", "task": "Tarea",
            "project": "Proyecto", "exercise": "Ejercicio", "habit": "Hábito",
            "goal_item": "Meta", "issue": "Issue", "saving": "Ahorro",
        }
        return labels.get(kind, kind.capitalize())


class VistaAgenda(QWidget):
    """Full Chronological Agenda View container."""

    date_changed = Signal(date)
    data_changed = Signal()
    occurrence_clicked = Signal(object, QRect)

    def __init__(self, schedule_mgr, parent=None):
        super().__init__(parent)
        self.schedule_mgr = schedule_mgr
        self.current_date = date.today()
        self.filters: dict = {}

        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Header bar
        header = QFrame()
        header.setFixedHeight(44)
        header.setStyleSheet("background-color: #202024; border-bottom: 1px solid #33333e;")
        header_lay = QHBoxLayout(header)
        header_lay.setContentsMargins(16, 0, 16, 0)

        self.title_label = QLabel("Agenda — Próximos 14 días")
        self.title_label.setStyleSheet("font-size: 14px; font-weight: bold; color: #dcdde0;")
        header_lay.addWidget(self.title_label)

        header_lay.addStretch()
        layout.addWidget(header)

        # Scrollable list
        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setStyleSheet("QScrollArea { border: none; background-color: #1a1a1e; }")

        self.list_container = QWidget()
        self.list_container.setStyleSheet("background-color: #1a1a1e;")
        self.list_layout = QVBoxLayout(self.list_container)
        self.list_layout.setContentsMargins(20, 16, 20, 20)
        self.list_layout.setSpacing(12)
        self.list_layout.setAlignment(Qt.AlignTop)

        self.scroll_area.setWidget(self.list_container)
        layout.addWidget(self.scroll_area, stretch=1)

    def set_date(self, d: date):
        self.current_date = d
        self.refresh()
        self.date_changed.emit(d)

    def set_filters(self, filters: dict):
        self.filters = filters
        self.refresh()

    def refresh(self):
        # Clear existing list items
        while self.list_layout.count():
            child = self.list_layout.takeAt(0)
            if child.widget():
                child.widget().hide()
                child.widget().deleteLater()

        start_d = self.current_date
        end_d = start_d + timedelta(days=13)  # 14 days
        self.title_label.setText(f"Agenda — {start_d.strftime('%d/%m')} al {end_d.strftime('%d/%m')}")

        agenda_data = self.schedule_mgr.range(start_d, end_d)
        today = date.today()

        total_items = 0
        curr = start_d
        while curr <= end_d:
            occs = agenda_data.get(curr, [])
            vis_occs = [o for o in occs if self.filters.get(o.kind, True)]

            if vis_occs:
                total_items += len(vis_occs)
                # Date section header
                rel_prefix = ""
                if curr == today:
                    rel_prefix = "Hoy · "
                elif curr == today + timedelta(days=1):
                    rel_prefix = "Mañana · "

                date_header = QLabel(
                    f"{rel_prefix}{weekday_name(curr).capitalize()} {curr.day} de {month_name(curr)}")
                date_header.setStyleSheet("font-size: 13px; font-weight: bold; color: #2383e2; margin-top: 10px; margin-bottom: 2px;")
                self.list_layout.addWidget(date_header)

                for occ in vis_occs:
                    row = AgendaItemRow(occ, parent=self)
                    row.item_clicked.connect(
                        lambda occ, r=row: self.occurrence_clicked.emit(
                            occ, QRect(r.mapToGlobal(QPoint(0, 0)), r.size())))
                    row.done_toggled.connect(self._on_done_toggled)
                    self.list_layout.addWidget(row)

            curr += timedelta(days=1)

        if total_items == 0:
            empty_lbl = QLabel("No hay eventos ni tareas programadas para este período.")
            empty_lbl.setAlignment(Qt.AlignCenter)
            empty_lbl.setStyleSheet("color: #888895; font-size: 13px; margin-top: 40px;")
            self.list_layout.addWidget(empty_lbl)

    def _on_done_toggled(self, occ: Occurrence, done: bool):
        self.schedule_mgr.set_done(occ.date, occ.id, done)
        self.data_changed.emit()
        self.refresh()
