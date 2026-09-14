"""
Vista Día — Day grid view.
Custom painted hour grid, red "now" line, event cards with 3px accent bar,
drag to move, drag bottom edge to resize, click empty slot to create event.
"""

import math
from datetime import date, datetime, timedelta

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QScrollArea, QFrame,
    QMenu, QMessageBox, QDialog
)
from PySide6.QtCore import Qt, Signal, QRect, QPoint, QTimer
from PySide6.QtGui import (
    QPainter, QColor, QPen, QBrush, QFont, QCursor, QKeySequence, QPainterPath, QShortcut
)

from ... import theme
from ....core.schedule_manager import Occurrence
from .evento_editor import EventoEditorDialog

HOUR_HEIGHT = 56       # pixels per hour
LEFT_MARGIN = 55       # width of time label column
RESIZE_MARGIN = 8      # drag resize active zone on bottom edge


class DayCanvas(QWidget):
    """Painted area for the day grid and events."""

    event_clicked = Signal(Occurrence)
    slot_clicked = Signal(date, str)  # (date, "HH:MM")
    occurrence_moved = Signal(Occurrence, str, int)  # (occ, new_start, duration)
    status_message = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMouseTracking(True)

        self.current_date = date.today()
        self.occurrences: list[Occurrence] = []
        self.day_start_hour = 6
        self.day_end_hour = 23
        self.filters: dict = {}

        # Drag state
        self._dragging_occ: Occurrence | None = None
        self._drag_mode: str | None = None  # "move" | "resize"
        self._drag_start_pos: QPoint | None = None
        self._drag_orig_start_min: int = 0
        self._drag_orig_duration: int = 60
        self._hover_occ: Occurrence | None = None
        self._hover_resize = False

        # Red line update timer
        self._timer = QTimer(self)
        self._timer.setInterval(60000)  # 60s
        self._timer.timeout.connect(self.update)
        self._timer.start()

    def set_data(self, current_date: date, occurrences: list[Occurrence],
                 start_hour: int = 6, end_hour: int = 23, filters: dict = None):
        self.current_date = current_date
        self.occurrences = occurrences
        self.day_start_hour = start_hour
        self.day_end_hour = end_hour
        self.filters = filters or {}
        total_hours = self.day_end_hour - self.day_start_hour + 1
        self.setMinimumHeight(total_hours * HOUR_HEIGHT + 20)
        self.update()

    def _visible_occurrences(self) -> list[Occurrence]:
        out = []
        for occ in self.occurrences:
            if occ.start is None:
                continue  # All-day handled separately or at top
            kind = occ.kind
            if self.filters and not self.filters.get(kind, True):
                continue
            out.append(occ)
        return out

    def _time_to_y(self, hour: int, minute: int) -> float:
        rel_h = hour - self.day_start_hour + (minute / 60.0)
        return rel_h * HOUR_HEIGHT + 10

    def _y_to_time(self, y: float) -> tuple[int, int]:
        rel_y = max(0, y - 10)
        total_minutes = int((rel_y / HOUR_HEIGHT) * 60)
        start_min = self.day_start_hour * 60 + total_minutes
        # Snap to 15m
        snapped = round(start_min / 15.0) * 15
        snapped = max(self.day_start_hour * 60, min(self.day_end_hour * 60 + 45, snapped))
        return (snapped // 60, snapped % 60)

    def _get_occ_rect(self, occ: Occurrence, canvas_width: int) -> QRect:
        if not occ.start:
            return QRect()
        try:
            h, m = map(int, occ.start.split(":"))
        except ValueError:
            return QRect()

        y1 = self._time_to_y(h, m)
        dur = occ.duration_min or 60
        y2 = y1 + (dur / 60.0) * HOUR_HEIGHT
        x1 = LEFT_MARGIN + 6
        w = max(100, canvas_width - x1 - 16)
        h_rect = max(24, int(y2 - y1))
        return QRect(x1, int(y1), w, h_rect)

    # ── Painting ──────────────────────────────────────────────────────────

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)

        width = self.width()
        total_hours = self.day_end_hour - self.day_start_hour + 1

        # Background
        bg_color = QColor(theme.tint("#1a1a1e"))
        painter.fillRect(self.rect(), bg_color)

        # Hour & Half-hour grid lines
        pen_hour = QPen(QColor(theme.tint("#33333e")), 1, Qt.SolidLine)
        pen_half = QPen(QColor(theme.tint("#25252b")), 1, Qt.DashLine)
        pen_text = QPen(QColor(theme.tint("#888895")))

        font = QFont()
        font.setPointSize(9)
        painter.setFont(font)

        for i in range(total_hours):
            h = self.day_start_hour + i
            y = int(self._time_to_y(h, 0))

            # Hour label
            painter.setPen(pen_text)
            painter.drawText(8, y + 4, 42, 16, Qt.AlignRight | Qt.AlignVCenter, f"{h:02d}:00")

            # Hour line
            painter.setPen(pen_hour)
            painter.drawLine(LEFT_MARGIN, y, width - 10, y)

            # Half-hour line
            y_half = int(self._time_to_y(h, 30))
            painter.setPen(pen_half)
            painter.drawLine(LEFT_MARGIN, y_half, width - 10, y_half)

        # Draw Occurrences
        vis_occs = [o for o in self.occurrences if o.start is not None and self.filters.get(o.kind, True)]
        for occ in vis_occs:
            r = self._get_occ_rect(occ, width)
            if not r.isValid():
                continue

            # Base card color
            accent_hex = occ.colour if occ.colour.startswith("#") else self._kind_color(occ.colour)
            card_bg = QColor(theme.tint("#202024"))

            # Fill card
            painter.setPen(QPen(QColor(theme.tint("#33333e")), 1))
            painter.setBrush(QBrush(card_bg))
            painter.drawRoundedRect(r, 6, 6)

            # 3px accent bar on left edge
            accent_color = QColor(theme.tint(accent_hex))
            painter.setPen(Qt.NoPen)
            painter.setBrush(QBrush(accent_color))
            bar_path = QPainterPath()
            bar_path.addRoundedRect(r.x(), r.y(), 4, r.height(), 2, 2)
            painter.drawPath(bar_path)

            # Text
            painter.setPen(QPen(QColor(theme.tint("#dcdde0"))))
            title_font = QFont()
            title_font.setPointSize(10)
            title_font.setBold(True)
            painter.setFont(title_font)

            title_rect = QRect(r.x() + 10, r.y() + 4, r.width() - 16, 18)
            t_text = occ.title
            if occ.done:
                t_text = "✓ " + t_text
            painter.drawText(title_rect, Qt.AlignLeft | Qt.AlignVCenter, t_text)

            if r.height() >= 36:
                time_font = QFont()
                time_font.setPointSize(8)
                painter.setFont(time_font)
                painter.setPen(QPen(QColor(theme.tint("#888895"))))

                try:
                    h, m = map(int, occ.start.split(":"))
                    dur = occ.duration_min or 60
                    end_min = h * 60 + m + dur
                    end_str = f"{end_min // 60:02d}:{end_min % 60:02d}"
                    time_text = f"{occ.start} - {end_str}"
                except ValueError:
                    time_text = occ.start

                time_rect = QRect(r.x() + 10, r.y() + 22, r.width() - 16, 14)
                painter.drawText(time_rect, Qt.AlignLeft | Qt.AlignVCenter, time_text)

        # Red "Now" line if today
        if self.current_date == date.today():
            now = datetime.now()
            if self.day_start_hour <= now.hour <= self.day_end_hour:
                y_now = int(self._time_to_y(now.hour, now.minute))
                painter.setPen(QPen(QColor("#ef4444"), 2, Qt.SolidLine))
                painter.drawLine(LEFT_MARGIN - 4, y_now, width - 10, y_now)

                # Red dot on left
                painter.setBrush(QBrush(QColor("#ef4444")))
                painter.setPen(Qt.NoPen)
                painter.drawEllipse(QPoint(LEFT_MARGIN - 4, y_now), 4, 4)

    def _kind_color(self, colour: str) -> str:
        color_map = {
            "blue": "#2383e2", "orange": "#ff9632", "purple": "#7c5af0",
            "teal": "#2dd4bf", "green": "#2dd4bf", "red": "#ef4444", "yellow": "#eab308"
        }
        return color_map.get(colour, "#2383e2")

    # ── Mouse Interaction ──────────────────────────────────────────────────

    def mousePressEvent(self, event):
        if event.button() != Qt.LeftButton:
            return

        pos = event.pos()
        width = self.width()

        for occ in reversed([o for o in self.occurrences if o.start is not None and self.filters.get(o.kind, True)]):
            r = self._get_occ_rect(occ, width)
            if r.contains(pos):
                if not occ.editable:
                    self.status_message.emit("Este elemento se edita en su propio módulo")
                    return

                # Check if clicking bottom edge for resize
                if abs(pos.y() - r.bottom()) <= RESIZE_MARGIN:
                    self._dragging_occ = occ
                    self._drag_mode = "resize"
                    self._drag_start_pos = pos
                    self._drag_orig_duration = occ.duration_min or 60
                else:
                    self._dragging_occ = occ
                    self._drag_mode = "move"
                    self._drag_start_pos = pos
                    try:
                        h, m = map(int, occ.start.split(":"))
                        self._drag_orig_start_min = h * 60 + m
                    except ValueError:
                        self._drag_orig_start_min = 9 * 60
                return

        # Clicked empty slot
        if pos.x() >= LEFT_MARGIN:
            h, m = self._y_to_time(pos.y())
            time_str = f"{h:02d}:{m:02d}"
            self.slot_clicked.emit(self.current_date, time_str)

    def mouseMoveEvent(self, event):
        pos = event.pos()
        width = self.width()

        if self._dragging_occ and self._drag_start_pos:
            delta_y = pos.y() - self._drag_start_pos.y()
            delta_minutes = round((delta_y / HOUR_HEIGHT) * 60 / 15.0) * 15

            if self._drag_mode == "move":
                new_start_min = self._drag_orig_start_min + delta_minutes
                new_start_min = max(self.day_start_hour * 60, min(self.day_end_hour * 60 + 45, new_start_min))
                new_start_str = f"{new_start_min // 60:02d}:{new_start_min % 60:02d}"
                self._dragging_occ.start = new_start_str
                self.update()

            elif self._drag_mode == "resize":
                new_dur = max(15, self._drag_orig_duration + delta_minutes)
                self._dragging_occ.duration_min = new_dur
                self.update()
            return

        # Hover cursor change
        cursor_set = False
        for occ in [o for o in self.occurrences if o.start is not None and self.filters.get(o.kind, True)]:
            r = self._get_occ_rect(occ, width)
            if r.contains(pos):
                if occ.editable and abs(pos.y() - r.bottom()) <= RESIZE_MARGIN:
                    self.setCursor(Qt.SizeVerCursor)
                else:
                    self.setCursor(Qt.PointingHandCursor)
                cursor_set = True
                break

        if not cursor_set:
            self.setCursor(Qt.ArrowCursor)

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.LeftButton and self._dragging_occ:
            occ = self._dragging_occ
            start_str = occ.start or "09:00"
            dur = occ.duration_min or 60

            self._dragging_occ = None
            self._drag_mode = None
            self._drag_start_pos = None

            self.occurrence_moved.emit(occ, start_str, dur)
            self.update()


class VistaDia(QWidget):
    """Full Day View container with header, all-day strip, and scrollable grid canvas."""

    date_changed = Signal(date)
    data_changed = Signal()
    notify_requested = Signal(str, str)
    view_change_requested = Signal(str)

    def __init__(self, schedule_mgr, parent=None):
        super().__init__(parent)
        self.schedule_mgr = schedule_mgr
        self.current_date = date.today()
        self.filters: dict = {}

        self._build_ui()
        self._setup_shortcuts()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Header bar
        header = QFrame()
        header.setFixedHeight(44)
        header.setStyleSheet("background-color: #202024; border-bottom: 1px solid #33333e;")
        header_lay = QHBoxLayout(header)
        header_lay.setContentsMargins(12, 0, 12, 0)

        self.date_label = QLabel()
        self.date_label.setStyleSheet("font-size: 14px; font-weight: bold; color: #dcdde0;")
        header_lay.addWidget(self.date_label)

        header_lay.addStretch()
        layout.addWidget(header)

        # Scrollable Canvas
        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setStyleSheet("QScrollArea { border: none; background-color: #1a1a1e; }")

        self.canvas = DayCanvas()
        self.canvas.slot_clicked.connect(self._on_slot_clicked)
        self.canvas.occurrence_moved.connect(self._on_occ_moved)
        self.canvas.status_message.connect(lambda msg: self.parent().status_message.emit(msg) if hasattr(self.parent(), "status_message") else None)
        self.scroll_area.setWidget(self.canvas)

        layout.addWidget(self.scroll_area, stretch=1)

    def _setup_shortcuts(self):
        sc_t = QShortcut(QKeySequence("T"), self, context=Qt.WindowShortcut)
        sc_t.activated.connect(lambda: self.set_date(date.today()))

        sc_left = QShortcut(QKeySequence(Qt.Key_Left), self, context=Qt.WindowShortcut)
        sc_left.activated.connect(lambda: self.set_date(self.current_date - timedelta(days=1)))

        sc_right = QShortcut(QKeySequence(Qt.Key_Right), self, context=Qt.WindowShortcut)
        sc_right.activated.connect(lambda: self.set_date(self.current_date + timedelta(days=1)))

    def set_date(self, d: date):
        self.current_date = d
        self.refresh()
        self.date_changed.emit(d)

    def set_filters(self, filters: dict):
        self.filters = filters
        self.refresh()

    def refresh(self):
        self.date_label.setText(self.current_date.strftime("%A, %d de %B de %Y").capitalize())
        occs = self.schedule_mgr.day(self.current_date)
        settings = self.schedule_mgr.settings()
        sh = settings.get("day_start_hour", 6)
        eh = settings.get("day_end_hour", 23)
        self.canvas.set_data(self.current_date, occs, sh, eh, self.filters)

    def _on_slot_clicked(self, d_val: date, time_str: str):
        event_data = {"date": d_val.isoformat(), "start": time_str, "duration_min": 60}
        dlg = EventoEditorDialog(self, event_data=event_data, date_val=d_val)
        if dlg.exec() == QDialog.Accepted:
            if not dlg.is_deleted:
                data = dlg.get_data()
                self.schedule_mgr.add_event(d_val, **data)
                self.data_changed.emit()
                self.refresh()

    def _on_occ_moved(self, occ: Occurrence, new_start: str, duration: int):
        self.schedule_mgr.move(self.current_date, occ.id, new_start, duration)
        self.data_changed.emit()
        self.refresh()
