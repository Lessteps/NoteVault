"""
Time grid shared by the day and week views, drawn after Google Calendar:
solid event blocks, a red line at the current time, click or drag on an empty
slot to start a new event, drag a block to move it and drag its bottom edge
to change its length.
"""

from datetime import date, datetime, timedelta

from PySide6.QtCore import Qt, Signal, QRect, QRectF, QPointF, QTimer
from PySide6.QtGui import QPainter, QColor, QPen, QFont, QFontMetrics
from PySide6.QtWidgets import QWidget, QVBoxLayout, QScrollArea, QFrame

from ... import theme
from . import WEEKDAYS_ES, DEFAULT_COLOUR, event_colour, fmt_hm, fmt_range, parse_hm

HOUR_HEIGHT = 48
GUTTER = 64
SNAP = 15
DAY_MIN = 24 * 60
DRAG_SLOP = 4
RESIZE_ZONE = 6
BLOCK_GAP = 10          # free strip on the right of each column, as in Google Calendar
NOW_RED = "#ea4335"
DATE_H = 76
ALLDAY_ROW = 22
ALLDAY_ROWS = 3


def _snap_down(m: int) -> int:
    return (m // SNAP) * SNAP


def _snap_near(m: int) -> int:
    return int(round(m / SNAP)) * SNAP


def _pack(items):
    """Columns for overlapping blocks. items: (key, start, end) -> {key: (col, cols)}."""
    out = {}
    cluster, cluster_end = [], -1

    def flush():
        ends, placed = [], []
        for key, s, e in cluster:
            for i, col_end in enumerate(ends):
                if col_end <= s:
                    ends[i] = e
                    placed.append((key, i))
                    break
            else:
                ends.append(e)
                placed.append((key, len(ends) - 1))
        for key, i in placed:
            out[key] = (i, len(ends))

    for item in sorted(items, key=lambda it: (it[1], it[1] - it[2])):
        if cluster and item[1] >= cluster_end:
            flush()
            cluster, cluster_end = [], -1
        cluster.append(item)
        cluster_end = max(cluster_end, item[2])
    if cluster:
        flush()
    return out


def _global(widget: QWidget, rect: QRectF) -> QRect:
    r = rect.toAlignedRect()
    return QRect(widget.mapToGlobal(r.topLeft()), r.size())


def _small_font(base: QFont, size: float, weight=QFont.Normal) -> QFont:
    f = QFont(base)
    f.setPointSizeF(size)
    f.setWeight(weight)
    return f


def paint_block(p: QPainter, base_font: QFont, rect: QRectF, title: str,
                start: int, end: int, colour: str, done=False, faded=False, lifted=False):
    fill = QColor(colour)
    if faded:
        fill.setAlpha(110)
    elif done:
        fill.setAlpha(150)
    if lifted:
        p.setPen(Qt.NoPen)
        for grow, alpha in ((5, 20), (2, 35)):
            p.setBrush(QColor(0, 0, 0, alpha))
            p.drawRoundedRect(rect.adjusted(-1, 1, 1, grow), 6, 6)
    p.setPen(QPen(QColor(theme.tint("#191919")), 1))
    p.setBrush(fill)
    p.drawRoundedRect(rect, 6, 6)

    inner = rect.adjusted(7, 3, -4, -2)
    title_font = _small_font(base_font, 8.5, QFont.DemiBold)
    title_font.setStrikeOut(done)
    time_font = _small_font(base_font, 8.5)
    fm = QFontMetrics(title_font)
    p.save()
    p.setClipRect(rect.adjusted(1, 1, -1, -1))
    p.setPen(QColor("#ffffff"))
    width = int(max(0, inner.width()))
    line = fm.height()
    if rect.height() >= 2 * line + 6:
        p.setFont(title_font)
        p.drawText(QRectF(inner.x(), inner.y(), inner.width(), line),
                   Qt.AlignLeft | Qt.AlignVCenter, fm.elidedText(title, Qt.ElideRight, width))
        p.setFont(time_font)
        p.drawText(QRectF(inner.x(), inner.y() + line, inner.width(), line),
                   Qt.AlignLeft | Qt.AlignVCenter, fmt_range(start, end))
    else:
        p.setFont(title_font)
        text = fm.elidedText(f"{title}, {fmt_hm(start)}", Qt.ElideRight, width)
        p.drawText(QRectF(inner.x(), inner.y() - 1, inner.width(), line),
                   Qt.AlignLeft | Qt.AlignVCenter, text)
    p.restore()


class GridCanvas(QWidget):
    """The 24-hour grid with one column per day."""

    create_requested = Signal(object, int, int)            # day, start, end
    occurrence_clicked = Signal(object, QRect)              # occurrence, global rect
    occurrence_moved = Signal(object, object, int, int)     # occurrence, day, start, duration
    resized = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMouseTracking(True)
        self.setFocusPolicy(Qt.ClickFocus)
        self.setMinimumHeight(24 * HOUR_HEIGHT + 1)
        self.days: list = []
        self.by_day: dict = {}
        self.filters: dict = {}
        self.draft = None
        self._blocks = []
        self._press = None
        self._cursor = None

        self._clock = QTimer(self)
        self._clock.setInterval(60_000)
        self._clock.timeout.connect(self.update)
        self._clock.start()

    # ── Data ──────────────────────────────────────────────────────────────

    def set_data(self, days, by_day, filters):
        self.days = list(days)
        self.by_day = by_day
        self.filters = filters or {}
        self._press = None
        self._relayout()
        self.update()

    # ── Geometry ──────────────────────────────────────────────────────────

    def col_width(self) -> float:
        return max(1.0, (self.width() - GUTTER) / max(1, len(self.days)))

    def col_x(self, i: int) -> float:
        return GUTTER + i * self.col_width()

    @staticmethod
    def y_of(minutes: int) -> float:
        return minutes * HOUR_HEIGHT / 60.0

    @staticmethod
    def minutes_at(y: float) -> int:
        return max(0, min(DAY_MIN - 1, int(y * 60 / HOUR_HEIGHT)))

    def day_index_at(self, x: float) -> int:
        return max(0, min(len(self.days) - 1, int((x - GUTTER) // self.col_width())))

    def slot_rect(self, i: int, start: int, end: int) -> QRectF:
        top = self.y_of(start) + 1
        return QRectF(self.col_x(i) + 1, top, self.col_width() - BLOCK_GAP - 2,
                      max(18.0, self.y_of(end) - self.y_of(start) - 2))

    def global_slot_rect(self, day, start: int, end: int) -> QRect:
        i = self.days.index(day) if day in self.days else 0
        return _global(self, self.slot_rect(i, start, end))

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._relayout()
        self.resized.emit()

    def _relayout(self):
        self._blocks = []
        cw = self.col_width() - BLOCK_GAP
        for i, day in enumerate(self.days):
            spans = []
            for n, occ in enumerate(self.by_day.get(day, [])):
                if occ.start is None or not self.filters.get(occ.kind, True):
                    continue
                s = parse_hm(occ.start)
                if s is None:
                    continue
                e = max(s + SNAP, min(DAY_MIN, s + (occ.duration_min or 60)))
                spans.append((n, s, e, occ))
            packing = _pack([(n, s, max(e, s + 30)) for n, s, e, _ in spans])
            for n, s, e, occ in spans:
                col, cols = packing[n]
                w = cw / cols
                rect = QRectF(self.col_x(i) + 1 + col * w, self.y_of(s) + 1,
                              max(8.0, w - 2), max(18.0, self.y_of(e) - self.y_of(s) - 2))
                self._blocks.append((occ, i, s, e, rect))

    def _block_at(self, pos):
        point = QPointF(pos)
        for block in reversed(self._blocks):
            if block[4].contains(point):
                return block
        return None

    @staticmethod
    def _resizable(occ) -> bool:
        return occ.editable and occ.kind in ("event", "routine")

    # ── Painting ──────────────────────────────────────────────────────────

    def paintEvent(self, _event):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        p.fillRect(self.rect(), QColor(theme.tint("#191919")))

        line = QColor(theme.tint("#2a2a2a"))
        label = QColor(theme.tint("#9b9b9b"))
        p.setFont(_small_font(self.font(), 8))
        for h in range(24):
            y = round(self.y_of(h * 60)) + 0.5
            if h:
                p.setPen(label)
                p.drawText(QRectF(0, y - 9, GUTTER - 14, 18),
                           Qt.AlignRight | Qt.AlignVCenter, f"{h:02d}:00")
            p.setPen(QPen(line, 1))
            p.drawLine(QPointF(GUTTER - 8, y), QPointF(self.width(), y))
        for i in range(len(self.days) + 1):
            x = round(self.col_x(i)) + 0.5
            p.drawLine(QPointF(x, 0), QPointF(x, self.height()))

        press = self._press
        moving = press["occ"] if press and press.get("moved") and "occ" in press else None
        for occ, i, s, e, rect in self._blocks:
            paint_block(p, self.font(), rect, occ.title, s, e, event_colour(occ.colour),
                        done=occ.done, faded=occ is moving)
        if moving is not None:
            rect = self.slot_rect(press["day"], press["start"], press["end"])
            paint_block(p, self.font(), rect, moving.title, press["start"], press["end"],
                        event_colour(moving.colour), lifted=True)

        draft = self.draft
        if draft and draft["start"] is not None and draft["day"] in self.days:
            rect = self.slot_rect(self.days.index(draft["day"]), draft["start"], draft["end"])
            paint_block(p, self.font(), rect, draft["title"] or "(Sin título)",
                        draft["start"], draft["end"], draft["colour"], lifted=True)

        today = date.today()
        if today in self.days:
            now = datetime.now()
            i = self.days.index(today)
            y = self.y_of(now.hour * 60 + now.minute)
            x0 = self.col_x(i)
            red = QColor(NOW_RED)
            p.setPen(QPen(red, 2))
            p.drawLine(QPointF(x0, y), QPointF(x0 + self.col_width(), y))
            p.setPen(Qt.NoPen)
            p.setBrush(red)
            p.drawEllipse(QPointF(x0, y), 6, 6)

    # ── Mouse ─────────────────────────────────────────────────────────────

    def mousePressEvent(self, event):
        if event.button() != Qt.LeftButton or not self.days:
            return
        pos = event.position().toPoint()
        block = self._block_at(pos)
        if block:
            occ, i, s, e, rect = block
            resize = self._resizable(occ) and rect.bottom() - pos.y() <= RESIZE_ZONE
            self._press = dict(kind="resize" if resize else "move", occ=occ, rect=rect,
                               origin=pos, grab=self.minutes_at(pos.y()) - s,
                               day=i, start=s, end=e, orig=(i, s, e), moved=False)
        elif pos.x() >= GUTTER:
            self._press = dict(kind="create", day=self.day_index_at(pos.x()),
                               anchor=_snap_down(self.minutes_at(pos.y())),
                               origin=pos, moved=False)
        event.accept()

    def mouseMoveEvent(self, event):
        pos = event.position().toPoint()
        press = self._press
        if not press:
            self._hover(pos)
            return
        if not press["moved"] and (pos - press["origin"]).manhattanLength() < DRAG_SLOP:
            return
        if "occ" in press and not press["occ"].editable:
            return
        press["moved"] = True
        m = self.minutes_at(pos.y())

        if press["kind"] == "create":
            a = press["anchor"]
            if m >= a:
                s, e = a, min(DAY_MIN, max(a + SNAP, _snap_down(m) + SNAP))
            else:
                s, e = _snap_down(m), a + SNAP
            self.draft = dict(day=self.days[press["day"]], start=s, end=e,
                              title="", colour=DEFAULT_COLOUR)
        elif press["kind"] == "move":
            i0, s0, e0 = press["orig"]
            length = e0 - s0
            s = max(0, min(DAY_MIN - length, _snap_near(m - press["grab"])))
            i = i0
            if press["occ"].kind in ("event", "task") and len(self.days) > 1:
                i = self.day_index_at(pos.x())
            press.update(day=i, start=s, end=s + length)
        else:
            s0 = press["orig"][1]
            press.update(end=max(s0 + SNAP, min(DAY_MIN, _snap_near(m))))
        self.update()

    def mouseReleaseEvent(self, event):
        if event.button() != Qt.LeftButton or not self._press:
            return
        press, self._press = self._press, None
        if press["kind"] == "create":
            if not press["moved"]:
                s = press["anchor"]
                self.draft = dict(day=self.days[press["day"]], start=s,
                                  end=min(DAY_MIN, s + 60), title="", colour=DEFAULT_COLOUR)
            self.update()
            self.create_requested.emit(self.draft["day"], self.draft["start"], self.draft["end"])
            return

        self.update()
        occ = press["occ"]
        if not press["moved"]:
            self.occurrence_clicked.emit(occ, _global(self, press["rect"]))
        elif (press["day"], press["start"], press["end"]) != press["orig"]:
            self.occurrence_moved.emit(occ, self.days[press["day"]], press["start"],
                                       press["end"] - press["start"])

    def _hover(self, pos):
        block = self._block_at(pos)
        if block and self._resizable(block[0]) and block[4].bottom() - pos.y() <= RESIZE_ZONE:
            shape = Qt.SizeVerCursor
        elif block:
            shape = Qt.PointingHandCursor
        else:
            shape = Qt.ArrowCursor
        if shape != self._cursor:
            self._cursor = shape
            self.setCursor(shape)


class GridHeader(QWidget):
    """Weekday names, day numbers and the all-day strip above the grid."""

    day_clicked = Signal(object)
    create_requested = Signal(object, QRect)
    occurrence_clicked = Signal(object, QRect)

    def __init__(self, canvas: GridCanvas, parent=None):
        super().__init__(parent)
        self.canvas = canvas
        self.setMouseTracking(True)
        self.days: list = []
        self.items: dict = {}
        self.draft = None
        self._chips = []
        self._more = []
        self._cursor = None
        canvas.resized.connect(self.update)
        self.setFixedHeight(DATE_H + ALLDAY_ROW + 6)

    def set_data(self, days, by_day, filters):
        self.days = list(days)
        self.items = {d: [o for o in by_day.get(d, [])
                          if o.start is None and filters.get(o.kind, True)]
                      for d in self.days}
        self._fit()

    def set_draft(self, draft):
        self.draft = draft
        self._fit()

    def _fit(self):
        counts = [len(v) for v in self.items.values()] or [0]
        if self.draft and self.draft["day"] in self.items:
            counts.append(len(self.items[self.draft["day"]]) + 1)
        rows = max(1, min(ALLDAY_ROWS, max(counts)))
        self.setFixedHeight(DATE_H + rows * ALLDAY_ROW + 6)
        self.update()

    def _cols(self):
        n = max(1, len(self.days))
        cw = max(1.0, (self.canvas.width() - GUTTER) / n)
        return cw

    def paintEvent(self, _event):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        p.fillRect(self.rect(), QColor(theme.tint("#191919")))
        if not self.days:
            return
        cw = self._cols()
        today = date.today()
        blue = QColor(theme.tint("#2383e2"))
        dim = QColor(theme.tint("#9b9b9b"))
        text = QColor(theme.tint("#e6e6e6"))
        line = QColor(theme.tint("#2a2a2a"))

        weekday_font = _small_font(self.font(), 8, QFont.DemiBold)
        weekday_font.setLetterSpacing(QFont.AbsoluteSpacing, 0.8)
        number_font = _small_font(self.font(), 18)
        for i, d in enumerate(self.days):
            x = GUTTER + i * cw
            is_today = d == today
            p.setFont(weekday_font)
            p.setPen(blue if is_today else dim)
            p.drawText(QRectF(x, 6, cw, 18), Qt.AlignCenter, WEEKDAYS_ES[d.weekday()][:3].upper())
            circle = QRectF(x + cw / 2 - 21, 25, 42, 42)
            if is_today:
                p.setPen(Qt.NoPen)
                p.setBrush(blue)
                p.drawEllipse(circle)
                p.setPen(QColor("#ffffff"))
            else:
                p.setPen(text)
            p.setFont(number_font)
            p.drawText(circle, Qt.AlignCenter, str(d.day))

        offset = datetime.now().astimezone().utcoffset() or timedelta(0)
        hours = int(offset.total_seconds() // 3600)
        p.setFont(_small_font(self.font(), 7.5))
        p.setPen(dim)
        p.drawText(QRectF(0, DATE_H - 2, GUTTER - 10, ALLDAY_ROW),
                   Qt.AlignRight | Qt.AlignVCenter, f"GMT{hours:+03d}")

        self._chips, self._more = [], []
        chip_font = _small_font(self.font(), 8.5, QFont.DemiBold)
        fm = QFontMetrics(chip_font)
        p.setFont(chip_font)
        for i, d in enumerate(self.days):
            x = GUTTER + i * cw
            items = list(self.items.get(d, []))
            entries = [(occ, occ.title, event_colour(occ.colour), occ.done) for occ in items]
            if self.draft and self.draft["day"] == d:
                entries.append((None, self.draft["title"] or "(Sin título)", self.draft["colour"], False))
            shown = entries if len(entries) <= ALLDAY_ROWS else entries[:ALLDAY_ROWS - 1]
            for row, (occ, title, colour, done) in enumerate(shown):
                rect = QRectF(x + 1, DATE_H + row * ALLDAY_ROW, cw - BLOCK_GAP - 2, ALLDAY_ROW - 3)
                fill = QColor(colour)
                if done:
                    fill.setAlpha(150)
                p.setPen(Qt.NoPen)
                p.setBrush(fill)
                p.drawRoundedRect(rect, 4, 4)
                p.setPen(QColor("#ffffff"))
                p.drawText(rect.adjusted(7, 0, -4, 0), Qt.AlignLeft | Qt.AlignVCenter,
                           fm.elidedText(title, Qt.ElideRight, int(rect.width() - 11)))
                if occ is not None:
                    self._chips.append((occ, rect))
            if len(entries) > ALLDAY_ROWS:
                rect = QRectF(x + 1, DATE_H + (ALLDAY_ROWS - 1) * ALLDAY_ROW, cw - BLOCK_GAP, ALLDAY_ROW - 3)
                p.setPen(dim)
                p.drawText(rect.adjusted(7, 0, 0, 0), Qt.AlignLeft | Qt.AlignVCenter,
                           f"{len(entries) - ALLDAY_ROWS + 1} más")
                self._more.append((d, rect))

        p.setPen(QPen(line, 1))
        for i in range(len(self.days) + 1):
            x = round(GUTTER + i * cw) + 0.5
            p.drawLine(QPointF(x, DATE_H - 4), QPointF(x, self.height()))
        p.drawLine(QPointF(GUTTER - 8, self.height() - 0.5), QPointF(self.width(), self.height() - 0.5))

    def _hit(self, pos):
        point = QPointF(pos)
        for occ, rect in self._chips:
            if rect.contains(point):
                return "chip", occ, rect
        for d, rect in self._more:
            if rect.contains(point):
                return "more", d, rect
        if pos.x() < GUTTER or not self.days:
            return None
        cw = self._cols()
        i = max(0, min(len(self.days) - 1, int((pos.x() - GUTTER) // cw)))
        x = GUTTER + i * cw
        if 25 <= pos.y() <= 67 and abs(pos.x() - (x + cw / 2)) <= 21:
            return "number", self.days[i], None
        if pos.y() >= DATE_H:
            return "empty", self.days[i], QRectF(x + 1, DATE_H, cw - BLOCK_GAP - 2, ALLDAY_ROW - 3)
        return None

    def mousePressEvent(self, event):
        if event.button() != Qt.LeftButton:
            return
        hit = self._hit(event.position().toPoint())
        if not hit:
            return
        what, value, rect = hit
        if what == "chip":
            self.occurrence_clicked.emit(value, _global(self, rect))
        elif what in ("number", "more"):
            self.day_clicked.emit(value)
        else:
            self.create_requested.emit(value, _global(self, rect))

    def mouseMoveEvent(self, event):
        hit = self._hit(event.position().toPoint())
        shape = Qt.PointingHandCursor if hit and hit[0] != "empty" else Qt.ArrowCursor
        if shape != self._cursor:
            self._cursor = shape
            self.setCursor(shape)


class TimeGridView(QWidget):
    """Header plus scrollable grid, for one day or a whole week."""

    create_requested = Signal(object, object, object, QRect)   # day, start|None, end|None, rect
    occurrence_clicked = Signal(object, QRect)
    occurrence_moved = Signal(object, object, int, int)
    day_clicked = Signal(object)
    date_changed = Signal(object)
    data_changed = Signal()

    def __init__(self, schedule_mgr, n_days: int, parent=None):
        super().__init__(parent)
        self.schedule_mgr = schedule_mgr
        self.n_days = n_days
        self.current_date = date.today()
        self.filters: dict = {}
        self._scrolled = False

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self.canvas = GridCanvas()
        self.header = GridHeader(self.canvas)
        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setFrameShape(QFrame.NoFrame)
        self.scroll.setStyleSheet("QScrollArea { border: none; background: #191919; }")
        self.scroll.setWidget(self.canvas)
        layout.addWidget(self.header)
        layout.addWidget(self.scroll, stretch=1)

        self.canvas.create_requested.connect(self._canvas_create)
        self.canvas.occurrence_clicked.connect(self.occurrence_clicked.emit)
        self.canvas.occurrence_moved.connect(self.occurrence_moved.emit)
        self.header.occurrence_clicked.connect(self.occurrence_clicked.emit)
        self.header.day_clicked.connect(self.day_clicked.emit)
        self.header.create_requested.connect(
            lambda day, rect: self.create_requested.emit(day, None, None, rect))

    def days(self) -> list:
        if self.n_days == 1:
            return [self.current_date]
        monday = self.current_date - timedelta(days=self.current_date.weekday())
        return [monday + timedelta(days=i) for i in range(self.n_days)]

    def set_date(self, d: date):
        self.current_date = d
        self.refresh()
        self.date_changed.emit(d)

    def set_filters(self, filters: dict):
        self.filters = filters
        self.refresh()

    def refresh(self):
        days = self.days()
        data = self.schedule_mgr.range(days[0], days[-1])
        self.header.set_data(days, data, self.filters)
        self.canvas.set_data(days, data, self.filters)

    def set_draft(self, day, start, end, title, colour):
        if start is None:
            self.canvas.draft = None
            self.header.set_draft(dict(day=day, title=title, colour=colour))
        else:
            self.header.set_draft(None)
            self.canvas.draft = dict(day=day, start=start, end=end, title=title, colour=colour)
        self.canvas.update()

    def clear_draft(self):
        if self.canvas.draft is not None or self.header.draft is not None:
            self.canvas.draft = None
            self.header.set_draft(None)
            self.canvas.update()

    def draft_rect(self, day, start, end) -> QRect:
        if start is None:
            return QRect(self.header.mapToGlobal(self.header.rect().bottomLeft()), self.header.size())
        self.ensure_visible(start)
        return self.canvas.global_slot_rect(day, start, end)

    def ensure_visible(self, minutes: int):
        bar = self.scroll.verticalScrollBar()
        y = int(GridCanvas.y_of(minutes))
        view = self.scroll.viewport().height()
        if not bar.value() <= y <= bar.value() + view - HOUR_HEIGHT:
            bar.setValue(max(0, y - HOUR_HEIGHT))

    def _canvas_create(self, day, start, end):
        self.create_requested.emit(day, start, end, self.canvas.global_slot_rect(day, start, end))

    def showEvent(self, event):
        super().showEvent(event)
        if not self._scrolled:
            self._scrolled = True
            QTimer.singleShot(0, self._scroll_to_start)

    def _scroll_to_start(self):
        hour = int(self.schedule_mgr.settings().get("day_start_hour", 7))
        if date.today() in self.days():
            hour = max(0, datetime.now().hour - 2)
        self.scroll.verticalScrollBar().setValue(hour * HOUR_HEIGHT)
