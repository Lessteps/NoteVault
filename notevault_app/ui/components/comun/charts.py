"""
Charts drawn with QPainter, in the theme's colours: no QtCharts, so the .exe
stays small and the light theme needs no special case.
"""

import math
from typing import Optional, Sequence

from PySide6.QtCore import Qt, QRectF, QPointF, QSize
from PySide6.QtGui import QColor, QPainter, QPen, QPainterPath, QFont, QBrush, QLinearGradient
from PySide6.QtWidgets import QWidget

from ... import theme
from . import TEXT, TEXT_DIM, TEXT_FAINT, BORDER, BLUE, GREEN

GRID = "#2f2f2f"


def _c(colour: str, alpha: Optional[int] = None) -> QColor:
    q = QColor(theme.tint(colour))
    if alpha is not None:
        q.setAlpha(alpha)
    return q


def _nice_max(value: float) -> float:
    if value <= 0:
        return 1.0
    exp = 10 ** math.floor(math.log10(value))
    for step in (1, 2, 2.5, 5, 10):
        if value <= step * exp:
            return step * exp
    return 10 * exp


def _font(p: QPainter, size: int, bold: bool = False):
    f = QFont(p.font())
    f.setFamilies(["Segoe UI Variable Text", "Segoe UI"])
    f.setPixelSize(size)
    f.setBold(bold)
    p.setFont(f)


class _Chart(QWidget):
    def __init__(self, title: str = "", height: int = 180, parent=None):
        super().__init__(parent)
        self.title = title
        self.setMinimumHeight(height)
        self.value_format = lambda v: f"{v:g}"
        self.empty_text = "Sin datos todavía"

    def sizeHint(self):
        return QSize(320, self.minimumHeight())

    def _begin(self):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        top = 0
        if self.title:
            _font(p, 12, True)
            p.setPen(_c(TEXT))
            p.drawText(QRectF(0, 0, self.width(), 20), Qt.AlignLeft | Qt.AlignVCenter, self.title)
            top = 26
        return p, top

    def _empty(self, p: QPainter, rect: QRectF):
        _font(p, 11)
        p.setPen(_c(TEXT_FAINT))
        p.drawText(rect, Qt.AlignCenter, self.empty_text)


class BarChart(_Chart):
    """Vertical bars with value labels; `highlight` indexes get the accent."""

    def __init__(self, title: str = "", colour: str = BLUE, height: int = 180, parent=None):
        super().__init__(title, height, parent)
        self.colour = colour
        self.labels: list = []
        self.values: list = []
        self.colours: list = []
        self.highlight: set = set()

    def set_data(self, labels: Sequence[str], values: Sequence[float], colours=None, highlight=()):
        self.labels, self.values = list(labels), [float(v or 0) for v in values]
        self.colours = list(colours or [])
        self.highlight = set(highlight)
        self.update()

    def paintEvent(self, _e):
        p, top = self._begin()
        area = QRectF(34, top + 14, self.width() - 40, self.height() - top - 34)
        if not self.values or max(self.values) <= 0:
            self._empty(p, area)
            return
        vmax = _nice_max(max(self.values))
        if all(float(v).is_integer() for v in self.values):
            vmax = max(4, math.ceil(max(self.values) / 4) * 4)     # whole-number ticks
        _font(p, 9)
        for i in range(5):
            y = area.bottom() - area.height() * i / 4
            p.setPen(QPen(_c(GRID), 1, Qt.DotLine if i else Qt.SolidLine))
            p.drawLine(QPointF(area.left(), y), QPointF(area.right(), y))
            p.setPen(_c(TEXT_FAINT))
            p.drawText(QRectF(0, y - 7, 30, 14), Qt.AlignRight | Qt.AlignVCenter,
                       _short(vmax * i / 4))
        n = len(self.values)
        slot = area.width() / n
        bar_w = max(3.0, min(34.0, slot * 0.62))
        step = max(1, math.ceil(n / max(1, area.width() // 34)))
        for i, v in enumerate(self.values):
            h = area.height() * v / vmax
            x = area.left() + slot * i + (slot - bar_w) / 2
            colour = self.colours[i] if i < len(self.colours) else self.colour
            alpha = 255 if (not self.highlight or i in self.highlight) else 110
            p.setPen(Qt.NoPen)
            p.setBrush(_c(colour, alpha))
            p.drawRoundedRect(QRectF(x, area.bottom() - h, bar_w, h), 2, 2)
            if i % step == 0 and i < len(self.labels):
                p.setPen(_c(TEXT_FAINT))
                p.drawText(QRectF(area.left() + slot * i - 10, area.bottom() + 3, slot + 20, 14),
                           Qt.AlignCenter, str(self.labels[i]))
            if v > 0 and n <= 12:
                p.setPen(_c(TEXT_DIM))
                p.drawText(QRectF(x - 20, area.bottom() - h - 15, bar_w + 40, 13),
                           Qt.AlignCenter, self.value_format(v))


class DonutChart(_Chart):
    """Ring split by value, legend on the right, total in the middle."""

    def __init__(self, title: str = "", height: int = 180, parent=None):
        super().__init__(title, height, parent)
        self.items: list = []       # (label, value, colour)
        self.center_text = ""

    def set_data(self, items, center_text: str = ""):
        self.items = [(str(l), float(v or 0), c) for l, v, c in items if (v or 0) > 0]
        self.center_text = center_text
        self.update()

    def paintEvent(self, _e):
        p, top = self._begin()
        avail = QRectF(0, top, self.width(), self.height() - top)
        total = sum(v for _l, v, _c2 in self.items)
        if total <= 0:
            self._empty(p, avail)
            return
        d = min(avail.height() - 8, avail.width() * 0.45)
        ring = QRectF(8, avail.top() + (avail.height() - d) / 2, d, d)
        width = max(10.0, d * 0.16)
        start = 90 * 16
        pen = QPen()
        pen.setWidthF(width)
        pen.setCapStyle(Qt.FlatCap)
        inner = ring.adjusted(width / 2, width / 2, -width / 2, -width / 2)
        for _l, v, colour in self.items:
            span = -round(360 * 16 * v / total)
            pen.setColor(_c(colour))
            p.setPen(pen)
            p.drawArc(inner, start, span)
            start += span
        _font(p, 12, True)
        p.setPen(_c(TEXT))
        p.drawText(ring, Qt.AlignCenter, self.center_text)
        _font(p, 11)
        x = ring.right() + 18
        y = avail.top() + max(4.0, (avail.height() - 18 * min(len(self.items), 8)) / 2)
        for label, v, colour in self.items[:8]:
            p.setPen(Qt.NoPen)
            p.setBrush(_c(colour))
            p.drawRoundedRect(QRectF(x, y + 4, 10, 10), 2, 2)
            p.setPen(_c(TEXT_DIM))
            text = f"{label}  {self.value_format(v)}  ({round(100 * v / total)}%)"
            p.drawText(QRectF(x + 16, y, self.width() - x - 16, 18),
                       Qt.AlignLeft | Qt.AlignVCenter,
                       p.fontMetrics().elidedText(text, Qt.ElideRight, int(self.width() - x - 16)))
            y += 18


class LineChart(_Chart):
    """One or more series over the same labels; the last point is emphasised."""

    def __init__(self, title: str = "", height: int = 180, parent=None):
        super().__init__(title, height, parent)
        self.labels: list = []
        self.series: list = []      # (name, values, colour, dashed)

    def set_data(self, labels, series):
        self.labels = list(labels)
        self.series = [(n, [None if v is None else float(v) for v in vals], c, bool(dash))
                       for n, vals, c, *rest in series for dash in [rest[0] if rest else False]]
        self.update()

    def paintEvent(self, _e):
        p, top = self._begin()
        area = QRectF(40, top + 10, self.width() - 50, self.height() - top - 42)
        values = [v for _n, vals, _c2, _d in self.series for v in vals if v is not None]
        if not values or len(self.labels) < 2:
            self._empty(p, area)
            return
        vmax = _nice_max(max(values))
        _font(p, 9)
        for i in range(5):
            y = area.bottom() - area.height() * i / 4
            p.setPen(QPen(_c(GRID), 1, Qt.DotLine if i else Qt.SolidLine))
            p.drawLine(QPointF(area.left(), y), QPointF(area.right(), y))
            p.setPen(_c(TEXT_FAINT))
            p.drawText(QRectF(0, y - 7, 36, 14), Qt.AlignRight | Qt.AlignVCenter, _short(vmax * i / 4))
        n = len(self.labels)
        step = max(1, math.ceil(n / max(1, area.width() // 50)))
        for i, lab in enumerate(self.labels):
            if i % step == 0 or i == n - 1:
                x = area.left() + area.width() * i / (n - 1)
                p.setPen(_c(TEXT_FAINT))
                p.drawText(QRectF(x - 30, area.bottom() + 4, 60, 14), Qt.AlignCenter, str(lab))
        for name, vals, colour, dashed in self.series:
            path, last, first = QPainterPath(), None, None
            for i, v in enumerate(vals):
                if v is None:
                    continue
                pt = QPointF(area.left() + area.width() * i / (n - 1),
                             area.bottom() - area.height() * v / vmax)
                if last is None:
                    path.moveTo(pt)
                    first = pt
                else:
                    path.lineTo(pt)
                last = pt
            if last is None:
                continue
            if not dashed and first is not None:
                fill = QPainterPath(path)
                fill.lineTo(last.x(), area.bottom())
                fill.lineTo(first.x(), area.bottom())
                fill.closeSubpath()
                grad = QLinearGradient(0, area.top(), 0, area.bottom())
                grad.setColorAt(0, _c(colour, 70))
                grad.setColorAt(1, _c(colour, 0))
                p.fillPath(fill, QBrush(grad))
            p.setPen(QPen(_c(colour), 2, Qt.DashLine if dashed else Qt.SolidLine))
            p.setBrush(Qt.NoBrush)
            p.drawPath(path)
            if not dashed:
                p.setBrush(_c(colour))
                p.drawEllipse(last, 3.5, 3.5)
        x = area.left()
        _font(p, 10)
        for name, _v, colour, dashed in self.series:
            p.setPen(QPen(_c(colour), 2, Qt.DashLine if dashed else Qt.SolidLine))
            p.drawLine(QPointF(x, self.height() - 7), QPointF(x + 14, self.height() - 7))
            p.setPen(_c(TEXT_DIM))
            w = p.fontMetrics().horizontalAdvance(name) + 8
            p.drawText(QRectF(x + 18, self.height() - 15, w, 16), Qt.AlignLeft | Qt.AlignVCenter, name)
            x += 26 + w


class Sparkline(QWidget):
    def __init__(self, values=(), colour: str = GREEN, width: int = 90, height: int = 24, parent=None):
        super().__init__(parent)
        self.values = list(values)
        self.colour = colour
        self.setFixedSize(width, height)

    def set_values(self, values):
        self.values = list(values)
        self.update()

    def paintEvent(self, _e):
        if len(self.values) < 2:
            return
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        vmax = max(max(self.values), 1e-9)
        w, h = self.width() - 4, self.height() - 4
        path = QPainterPath()
        pts = []
        for i, v in enumerate(self.values):
            pt = QPointF(2 + w * i / (len(self.values) - 1), 2 + h - h * (v / vmax))
            pts.append(pt)
            path.moveTo(pt) if i == 0 else path.lineTo(pt)
        fill = QPainterPath(path)
        fill.lineTo(pts[-1].x(), self.height())
        fill.lineTo(pts[0].x(), self.height())
        fill.closeSubpath()
        p.fillPath(fill, _c(self.colour, 45))
        p.setPen(QPen(_c(self.colour), 1.6))
        p.drawPath(path)
        p.setBrush(_c(self.colour))
        p.setPen(Qt.NoPen)
        p.drawEllipse(pts[-1], 2.5, 2.5)


class HeatStrip(QWidget):
    """One square per day: filled = done, outlined = scheduled, faint = free."""

    def __init__(self, cells=(), colour: str = GREEN, cell: int = 12, parent=None):
        super().__init__(parent)
        self.cells = list(cells)          # (label, state) state: None | 0 | 1
        self.colour = colour
        self.cell = cell
        self.setFixedHeight(cell + 4)

    def set_cells(self, cells):
        self.cells = list(cells)
        self.setMinimumWidth(len(self.cells) * (self.cell + 3))
        tips = [f"{l}: {'hecho' if s == 1 else 'pendiente' if s == 0 else 'no toca'}"
                for l, s in self.cells[-7:]]
        self.setToolTip("\n".join(tips))
        self.update()

    def sizeHint(self):
        return QSize(len(self.cells) * (self.cell + 3), self.cell + 4)

    def paintEvent(self, _e):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        for i, (_label, state) in enumerate(self.cells):
            r = QRectF(i * (self.cell + 3) + 0.5, 2.5, self.cell, self.cell)
            if state == 1:
                p.setPen(Qt.NoPen)
                p.setBrush(_c(self.colour))
            elif state == 0:
                p.setPen(QPen(_c("#6a6a72"), 1))
                p.setBrush(Qt.NoBrush)
            else:
                p.setPen(Qt.NoPen)
                p.setBrush(_c(BORDER))
            p.drawRoundedRect(r, 2, 2)


def _short(v: float) -> str:
    a = abs(v)
    if a >= 1_000_000:
        return f"{v / 1_000_000:.1f}M".replace(".0M", "M")
    if a >= 10_000:
        return f"{v / 1000:.0f}k"
    if a >= 1000:
        return f"{v / 1000:.1f}k".replace(".0k", "k")
    return f"{v:g}" if v == int(v) else f"{v:.1f}"
