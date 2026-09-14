"""
Vista Mes — 6x7 day cell grid view.
Displays up to 3 items per cell + "+N más". Click on day cell switches to Day view.
"""

from datetime import date, timedelta

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QGridLayout, QFrame,
)
from PySide6.QtCore import Qt, Signal, QRect
from PySide6.QtGui import QPainter, QColor, QPen, QBrush, QFont, QKeySequence, QPainterPath, QShortcut

from ... import theme
from ....core import vault_format
from ....core.schedule_manager import Occurrence


class MonthDayCell(QFrame):
    """Single day cell in the 6x7 month grid."""

    clicked = Signal(date)

    def __init__(self, cell_date: date, current_month: int, occurrences: list[Occurrence],
                 filters: dict = None, parent=None):
        super().__init__(parent)
        self.cell_date = cell_date
        self.is_current_month = (cell_date.month == current_month)
        self.is_today = (cell_date == date.today())
        self.occurrences = occurrences
        self.filters = filters or {}

        self.setCursor(Qt.PointingHandCursor)
        self.setMinimumHeight(80)

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.clicked.emit(self.cell_date)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)

        r = self.rect()
        width = r.width()
        height = r.height()

        # Background
        if self.is_current_month:
            bg_color = QColor(theme.tint("#1a1a1e"))
        else:
            bg_color = QColor(theme.tint("#171717"))

        painter.fillRect(r, bg_color)

        # Border
        if self.is_today:
            painter.setPen(QPen(QColor("#2383e2"), 2))
        else:
            painter.setPen(QPen(QColor(theme.tint("#2d2d38")), 1))
        painter.drawRect(r.adjusted(0, 0, -1, -1))

        # Date number header
        font_num = QFont()
        font_num.setPointSize(10)
        font_num.setBold(self.is_today)
        painter.setFont(font_num)

        if self.is_today:
            painter.setPen(QPen(QColor("#2383e2")))
        elif self.is_current_month:
            painter.setPen(QPen(QColor(theme.tint("#dcdde0"))))
        else:
            painter.setPen(QPen(QColor(theme.tint("#666672"))))

        painter.drawText(r.adjusted(6, 4, -6, -4), Qt.AlignRight | Qt.AlignTop, str(self.cell_date.day))

        # Render up to 3 occurrence items
        vis_occs = [o for o in self.occurrences if self.filters.get(o.kind, True)]
        max_show = 3
        y_offset = 24

        font_item = QFont()
        font_item.setPointSize(8)
        painter.setFont(font_item)

        for idx, occ in enumerate(vis_occs[:max_show]):
            if y_offset + 18 > height - 4:
                break

            accent_hex = occ.colour if occ.colour.startswith("#") else self._kind_color(occ.colour)
            badge_rect = QRect(r.x() + 4, r.y() + y_offset, width - 8, 16)

            # Badge fill
            painter.setPen(Qt.NoPen)
            painter.setBrush(QBrush(QColor(theme.tint("#25252b"))))
            painter.drawRoundedRect(badge_rect, 3, 3)

            # Left 3px accent bar
            painter.setBrush(QBrush(QColor(theme.tint(accent_hex))))
            bar_path = QPainterPath()
            bar_path.addRoundedRect(badge_rect.x(), badge_rect.y(), 3, badge_rect.height(), 1, 1)
            painter.drawPath(bar_path)

            # Text
            painter.setPen(QPen(QColor(theme.tint("#dcdde0"))))
            txt_rect = QRect(badge_rect.x() + 5, badge_rect.y(), badge_rect.width() - 6, 16)
            painter.drawText(txt_rect, Qt.AlignLeft | Qt.AlignVCenter, occ.title)

            y_offset += 18

        # If > 3, display "+N más"
        if len(vis_occs) > max_show:
            rem = len(vis_occs) - max_show
            painter.setPen(QPen(QColor(theme.tint("#888895"))))
            more_rect = QRect(r.x() + 6, r.y() + y_offset, width - 12, 14)
            painter.drawText(more_rect, Qt.AlignLeft | Qt.AlignVCenter, f"+{rem} más")

    def _kind_color(self, colour: str) -> str:
        color_map = {
            "blue": "#2383e2", "orange": "#ff9632", "purple": "#7c5af0",
            "teal": "#2dd4bf", "green": "#2dd4bf", "red": "#ef4444", "yellow": "#eab308"
        }
        return color_map.get(colour, "#2383e2")


class VistaMes(QWidget):
    """Full 6x7 Month View container."""

    day_selected = Signal(date)
    date_changed = Signal(date)
    data_changed = Signal()

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

        # Header with 7 weekday labels
        self.header_bar = QFrame()
        self.header_bar.setFixedHeight(36)
        self.header_bar.setStyleSheet("background-color: #202024; border-bottom: 1px solid #33333e;")
        header_lay = QHBoxLayout(self.header_bar)
        header_lay.setContentsMargins(0, 0, 0, 0)
        header_lay.setSpacing(0)

        for k in vault_format.WEEKDAY_KEYS:
            lbl = QLabel(k.capitalize()[:3])
            lbl.setAlignment(Qt.AlignCenter)
            lbl.setStyleSheet("font-size: 12px; font-weight: bold; color: #888895;")
            header_lay.addWidget(lbl, stretch=1)

        layout.addWidget(self.header_bar)

        # 6x7 Grid container
        self.grid_widget = QWidget()
        self.grid_widget.setStyleSheet("background-color: #1a1a1e;")
        self.grid_layout = QGridLayout(self.grid_widget)
        self.grid_layout.setContentsMargins(0, 0, 0, 0)
        self.grid_layout.setSpacing(0)

        layout.addWidget(self.grid_widget, stretch=1)

    def _setup_shortcuts(self):
        sc_t = QShortcut(QKeySequence("T"), self, context=Qt.WindowShortcut)
        sc_t.activated.connect(lambda: self.set_date(date.today()))

        sc_left = QShortcut(QKeySequence(Qt.Key_Left), self, context=Qt.WindowShortcut)
        sc_left.activated.connect(self._prev_month)

        sc_right = QShortcut(QKeySequence(Qt.Key_Right), self, context=Qt.WindowShortcut)
        sc_right.activated.connect(self._next_month)

    def _prev_month(self):
        first = date(self.current_date.year, self.current_date.month, 1) - timedelta(days=1)
        self.set_date(date(first.year, first.month, 1))

    def _next_month(self):
        if self.current_date.month == 12:
            self.set_date(date(self.current_date.year + 1, 1, 1))
        else:
            self.set_date(date(self.current_date.year, self.current_date.month + 1, 1))

    def set_date(self, d: date):
        self.current_date = d
        self.refresh()
        self.date_changed.emit(d)

    def set_filters(self, filters: dict):
        self.filters = filters
        self.refresh()

    def refresh(self):
        # Clear grid
        while self.grid_layout.count():
            child = self.grid_layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()

        # Calculate 42-day range (6 weeks)
        first_of_month = date(self.current_date.year, self.current_date.month, 1)
        grid_start = first_of_month - timedelta(days=first_of_month.weekday())
        grid_end = grid_start + timedelta(days=41)

        month_data = self.schedule_mgr.range(grid_start, grid_end)

        for row in range(6):
            for col in range(7):
                cell_d = grid_start + timedelta(days=row * 7 + col)
                occs = month_data.get(cell_d, [])
                cell = MonthDayCell(cell_d, self.current_date.month, occs, self.filters, self)
                cell.clicked.connect(self.day_selected.emit)
                self.grid_layout.addWidget(cell, row, col)
