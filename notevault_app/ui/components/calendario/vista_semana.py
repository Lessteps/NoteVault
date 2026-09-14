"""
Vista Semana — 7-column week view grid.
Interval-packing algorithm for overlapping events, red "now" line, drag to move/resize.
"""

from datetime import date, datetime, timedelta

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QScrollArea, QFrame,
    QMessageBox, QDialog
)
from PySide6.QtCore import Qt, Signal, QRect, QPoint, QTimer
from PySide6.QtGui import (
    QPainter, QColor, QPen, QBrush, QFont, QCursor, QKeySequence, QPainterPath, QShortcut
)

from ... import theme
from ....core import vault_format
from ....core.schedule_manager import Occurrence
from .evento_editor import EventoEditorDialog

HOUR_HEIGHT = 56
LEFT_MARGIN = 55
RESIZE_MARGIN = 8


class WeekCanvas(QWidget):
    """Painted area for the 7-column week grid and events."""

    slot_clicked = Signal(date, str)
    occurrence_moved = Signal(date, Occurrence, str, int)  # (orig_date, occ, new_start, duration)
    status_message = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMouseTracking(True)

        self.start_of_week = date.today()
        self.week_occurrences: dict[date, list[Occurrence]] = {}
        self.day_start_hour = 6
        self.day_end_hour = 23
        self.filters: dict = {}

        # Drag state
        self._dragging_occ: Occurrence | None = None
        self._dragging_orig_date: date | None = None
        self._drag_mode: str | None = None
        self._drag_start_pos: QPoint | None = None
        self._drag_orig_start_min: int = 0
        self._drag_orig_duration: int = 60

        # Timer for now line
        self._timer = QTimer(self)
        self._timer.setInterval(60000)
        self._timer.timeout.connect(self.update)
        self._timer.start()

    def set_data(self, start_of_week: date, week_occurrences: dict[date, list[Occurrence]],
                 start_hour: int = 6, end_hour: int = 23, filters: dict = None):
        self.start_of_week = start_of_week
        self.week_occurrences = week_occurrences
        self.day_start_hour = start_hour
        self.day_end_hour = end_hour
        self.filters = filters or {}
        total_hours = self.day_end_hour - self.day_start_hour + 1
        self.setMinimumHeight(total_hours * HOUR_HEIGHT + 20)
        self.update()

    def _col_x_width(self, col_index: int, total_width: int) -> tuple[int, int]:
        avail_w = max(100, total_width - LEFT_MARGIN - 10)
        col_w = avail_w // 7
        x = LEFT_MARGIN + col_index * col_w
        return (x, col_w)

    def _time_to_y(self, hour: int, minute: int) -> float:
        rel_h = hour - self.day_start_hour + (minute / 60.0)
        return rel_h * HOUR_HEIGHT + 10

    def _pos_to_datetime_slot(self, pos: QPoint, total_width: int) -> tuple[date, int, int]:
        avail_w = max(100, total_width - LEFT_MARGIN - 10)
        col_w = avail_w // 7
        rel_x = max(0, pos.x() - LEFT_MARGIN)
        col_idx = min(6, rel_x // col_w)
        d = self.start_of_week + timedelta(days=col_idx)

        rel_y = max(0, pos.y() - 10)
        total_minutes = int((rel_y / HOUR_HEIGHT) * 60)
        start_min = self.day_start_hour * 60 + total_minutes
        snapped = round(start_min / 15.0) * 15
        snapped = max(self.day_start_hour * 60, min(self.day_end_hour * 60 + 45, snapped))
        return (d, snapped // 60, snapped % 60)

    # ── Interval Packing Algorithm ────────────────────────────────────────

    def _layout_day_occurrences(self, occs: list[Occurrence], col_x: int, col_w: int) -> list[tuple[Occurrence, QRect]]:
        vis = [o for o in occs if o.start is not None and self.filters.get(o.kind, True)]
        if not vis:
            return []

        # Convert to interval items: (occ, y_start, y_end)
        items = []
        for o in vis:
            try:
                h, m = map(int, o.start.split(":"))
                y1 = self._time_to_y(h, m)
                dur = o.duration_min or 60
                y2 = y1 + (dur / 60.0) * HOUR_HEIGHT
                items.append({"occ": o, "y1": y1, "y2": y2, "col": 0, "cols": 1})
            except ValueError:
                pass

        items.sort(key=lambda x: (x["y1"], -(x["y2"] - x["y1"])))

        # Group overlapping intervals
        groups = []
        for item in items:
            placed = False
            for group in groups:
                if any(not (item["y2"] <= g["y1"] or item["y1"] >= g["y2"]) for g in group):
                    group.append(item)
                    placed = True
                    break
            if not placed:
                groups.append([item])

        res = []
        for group in groups:
            # Assign sub-columns
            sub_cols = []
            for item in group:
                placed_sub = False
                for idx, sub in enumerate(sub_cols):
                    if not any(not (item["y2"] <= s["y1"] or item["y1"] >= s["y2"]) for s in sub):
                        sub.append(item)
                        item["col"] = idx
                        placed_sub = True
                        break
                if not placed_sub:
                    item["col"] = len(sub_cols)
                    sub_cols.append([item])

            total_sub = len(sub_cols)
            for item in group:
                w_item = max(18, col_w // total_sub)
                x_item = col_x + item["col"] * w_item
                h_item = max(20, int(item["y2"] - item["y1"]))
                rect = QRect(x_item, int(item["y1"]), w_item - 2, h_item)
                res.append((item["occ"], rect))

        return res

    # ── Painting ──────────────────────────────────────────────────────────

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)

        width = self.width()
        total_hours = self.day_end_hour - self.day_start_hour + 1

        bg_color = QColor(theme.tint("#1a1a1e"))
        painter.fillRect(self.rect(), bg_color)

        pen_hour = QPen(QColor(theme.tint("#33333e")), 1, Qt.SolidLine)
        pen_col = QPen(QColor(theme.tint("#2f2f38")), 1, Qt.SolidLine)
        pen_text = QPen(QColor(theme.tint("#888895")))

        font = QFont()
        font.setPointSize(9)
        painter.setFont(font)

        # Draw Hour grid
        for i in range(total_hours):
            h = self.day_start_hour + i
            y = int(self._time_to_y(h, 0))

            painter.setPen(pen_text)
            painter.drawText(6, y + 4, 42, 16, Qt.AlignRight | Qt.AlignVCenter, f"{h:02d}:00")

            painter.setPen(pen_hour)
            painter.drawLine(LEFT_MARGIN, y, width - 10, y)

        # Draw 7 Column lines
        for col_idx in range(7):
            cx, cw = self._col_x_width(col_idx, width)
            painter.setPen(pen_col)
            painter.drawLine(cx, 0, cx, self.height())

        # Draw Occurrences for each day
        for col_idx in range(7):
            curr_date = self.start_of_week + timedelta(days=col_idx)
            occs = self.week_occurrences.get(curr_date, [])
            cx, cw = self._col_x_width(col_idx, width)
            rects = self._layout_day_occurrences(occs, cx, cw)

            for occ, r in rects:
                accent_hex = occ.colour if occ.colour.startswith("#") else self._kind_color(occ.colour)
                card_bg = QColor(theme.tint("#202024"))

                painter.setPen(QPen(QColor(theme.tint("#33333e")), 1))
                painter.setBrush(QBrush(card_bg))
                painter.drawRoundedRect(r, 4, 4)

                accent_color = QColor(theme.tint(accent_hex))
                painter.setPen(Qt.NoPen)
                painter.setBrush(QBrush(accent_color))
                bar_path = QPainterPath()
                bar_path.addRoundedRect(r.x(), r.y(), 3, r.height(), 1, 1)
                painter.drawPath(bar_path)

                if r.width() >= 30:
                    painter.setPen(QPen(QColor(theme.tint("#dcdde0"))))
                    title_font = QFont()
                    title_font.setPointSize(8)
                    title_font.setBold(True)
                    painter.setFont(title_font)

                    t_text = occ.title
                    if occ.done:
                        t_text = "✓ " + t_text
                    title_rect = QRect(r.x() + 5, r.y() + 2, r.width() - 7, 14)
                    painter.drawText(title_rect, Qt.AlignLeft | Qt.AlignVCenter, t_text)

        # Red "Now" line for today if in view
        today = date.today()
        if self.start_of_week <= today <= self.start_of_week + timedelta(days=6):
            col_idx = (today - self.start_of_week).days
            now = datetime.now()
            if self.day_start_hour <= now.hour <= self.day_end_hour:
                y_now = int(self._time_to_y(now.hour, now.minute))
                cx, cw = self._col_x_width(col_idx, width)

                painter.setPen(QPen(QColor("#ef4444"), 2, Qt.SolidLine))
                painter.drawLine(cx, y_now, cx + cw, y_now)

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

        for col_idx in range(7):
            curr_date = self.start_of_week + timedelta(days=col_idx)
            occs = self.week_occurrences.get(curr_date, [])
            cx, cw = self._col_x_width(col_idx, width)
            rects = self._layout_day_occurrences(occs, cx, cw)

            for occ, r in reversed(rects):
                if r.contains(pos):
                    if not occ.editable:
                        self.status_message.emit("Este elemento se edita en su propio módulo")
                        return

                    if abs(pos.y() - r.bottom()) <= RESIZE_MARGIN:
                        self._dragging_occ = occ
                        self._dragging_orig_date = curr_date
                        self._drag_mode = "resize"
                        self._drag_start_pos = pos
                        self._drag_orig_duration = occ.duration_min or 60
                    else:
                        self._dragging_occ = occ
                        self._dragging_orig_date = curr_date
                        self._drag_mode = "move"
                        self._drag_start_pos = pos
                        try:
                            h, m = map(int, occ.start.split(":"))
                            self._drag_orig_start_min = h * 60 + m
                        except ValueError:
                            self._drag_orig_start_min = 9 * 60
                    return

        # Empty slot clicked
        if pos.x() >= LEFT_MARGIN:
            target_date, h, m = self._pos_to_datetime_slot(pos, width)
            time_str = f"{h:02d}:{m:02d}"
            self.slot_clicked.emit(target_date, time_str)

    def mouseMoveEvent(self, event):
        pos = event.pos()
        width = self.width()

        if self._dragging_occ and self._drag_start_pos:
            delta_y = pos.y() - self._drag_start_pos.y()
            delta_minutes = round((delta_y / HOUR_HEIGHT) * 60 / 15.0) * 15

            if self._drag_mode == "move":
                new_start_min = self._drag_orig_start_min + delta_minutes
                new_start_min = max(self.day_start_hour * 60, min(self.day_end_hour * 60 + 45, new_start_min))
                self._dragging_occ.start = f"{new_start_min // 60:02d}:{new_start_min % 60:02d}"

                # Handle dragging across columns
                target_date, _, _ = self._pos_to_datetime_slot(pos, width)
                self._dragging_occ.date = target_date
                self.update()

            elif self._drag_mode == "resize":
                new_dur = max(15, self._drag_orig_duration + delta_minutes)
                self._dragging_occ.duration_min = new_dur
                self.update()
            return

        # Cursor updates on hover
        for col_idx in range(7):
            curr_date = self.start_of_week + timedelta(days=col_idx)
            occs = self.week_occurrences.get(curr_date, [])
            cx, cw = self._col_x_width(col_idx, width)
            rects = self._layout_day_occurrences(occs, cx, cw)

            for occ, r in rects:
                if r.contains(pos):
                    if occ.editable and abs(pos.y() - r.bottom()) <= RESIZE_MARGIN:
                        self.setCursor(Qt.SizeVerCursor)
                    else:
                        self.setCursor(Qt.PointingHandCursor)
                    return

        self.setCursor(Qt.ArrowCursor)

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.LeftButton and self._dragging_occ:
            occ = self._dragging_occ
            orig_date = self._dragging_orig_date or occ.date
            start_str = occ.start or "09:00"
            dur = occ.duration_min or 60

            self._dragging_occ = None
            self._dragging_orig_date = None
            self._drag_mode = None
            self._drag_start_pos = None

            self.occurrence_moved.emit(orig_date, occ, start_str, dur)
            self.update()


class VistaSemana(QWidget):
    """Full 7-day Week View container with header columns and scrollable canvas."""

    date_changed = Signal(date)
    data_changed = Signal()
    notify_requested = Signal(str, str)

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

        # Header bar with 7 weekday column headers
        self.header_bar = QFrame()
        self.header_bar.setFixedHeight(44)
        self.header_bar.setStyleSheet("background-color: #202024; border-bottom: 1px solid #33333e;")
        self.header_layout = QHBoxLayout(self.header_bar)
        self.header_layout.setContentsMargins(LEFT_MARGIN, 0, 10, 0)
        self.header_layout.setSpacing(0)

        self.col_labels: list[QLabel] = []
        for i in range(7):
            lbl = QLabel()
            lbl.setAlignment(Qt.AlignCenter)
            lbl.setStyleSheet("font-size: 12px; font-weight: bold; color: #dcdde0;")
            self.header_layout.addWidget(lbl, stretch=1)
            self.col_labels.append(lbl)

        layout.addWidget(self.header_bar)

        # Scrollable Canvas
        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setStyleSheet("QScrollArea { border: none; background-color: #1a1a1e; }")

        self.canvas = WeekCanvas()
        self.canvas.slot_clicked.connect(self._on_slot_clicked)
        self.canvas.occurrence_moved.connect(self._on_occ_moved)
        self.scroll_area.setWidget(self.canvas)

        layout.addWidget(self.scroll_area, stretch=1)

    def _setup_shortcuts(self):
        sc_t = QShortcut(QKeySequence("T"), self, context=Qt.WindowShortcut)
        sc_t.activated.connect(lambda: self.set_date(date.today()))

        sc_left = QShortcut(QKeySequence(Qt.Key_Left), self, context=Qt.WindowShortcut)
        sc_left.activated.connect(lambda: self.set_date(self.current_date - timedelta(days=7)))

        sc_right = QShortcut(QKeySequence(Qt.Key_Right), self, context=Qt.WindowShortcut)
        sc_right.activated.connect(lambda: self.set_date(self.current_date + timedelta(days=7)))

    def set_date(self, d: date):
        self.current_date = d
        self.refresh()
        self.date_changed.emit(d)

    def set_filters(self, filters: dict):
        self.filters = filters
        self.refresh()

    def refresh(self):
        # Start of week (Monday)
        start_w = self.current_date - timedelta(days=self.current_date.weekday())
        end_w = start_w + timedelta(days=6)

        # Update header labels
        today = date.today()
        for idx in range(7):
            d = start_w + timedelta(days=idx)
            w_name = vault_format.WEEKDAY_KEYS[idx].capitalize()[:3]
            txt = f"{w_name} {d.day}"
            lbl = self.col_labels[idx]
            lbl.setText(txt)
            if d == today:
                lbl.setStyleSheet("font-size: 12px; font-weight: bold; color: #2383e2; background-color: #26262e; border-radius: 4px;")
            else:
                lbl.setStyleSheet("font-size: 12px; font-weight: bold; color: #dcdde0; background-color: transparent;")

        week_data = self.schedule_mgr.range(start_w, end_w)
        settings = self.schedule_mgr.settings()
        sh = settings.get("day_start_hour", 6)
        eh = settings.get("day_end_hour", 23)
        self.canvas.set_data(start_w, week_data, sh, eh, self.filters)

    def _on_slot_clicked(self, d_val: date, time_str: str):
        event_data = {"date": d_val.isoformat(), "start": time_str, "duration_min": 60}
        dlg = EventoEditorDialog(self, event_data=event_data, date_val=d_val)
        if dlg.exec() == QDialog.Accepted:
            if not dlg.is_deleted:
                data = dlg.get_data()
                self.schedule_mgr.add_event(d_val, **data)
                self.data_changed.emit()
                self.refresh()

    def _on_occ_moved(self, orig_date: date, occ: Occurrence, new_start: str, duration: int):
        target_date = occ.date
        if target_date != orig_date:
            # If moved across days and it's a day event, remove from old date & add to new date
            if occ.id.startswith("ev_"):
                self.schedule_mgr.remove_event(orig_date, occ.id)
                self.schedule_mgr.add_event(target_date, title=occ.title, start=new_start,
                                            duration_min=duration, colour=occ.colour, notes="")
            else:
                self.schedule_mgr.move(target_date, occ.id, new_start, duration)
        else:
            self.schedule_mgr.move(orig_date, occ.id, new_start, duration)

        self.data_changed.emit()
        self.refresh()
