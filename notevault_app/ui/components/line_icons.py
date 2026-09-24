"""
Thin monochrome line icons, painted on a 20×20 grid.

Shared by the icon rail and the notes sidebar so every navigation icon has
the same stroke and weight (the redesign's look). Colours go through
theme.tint(), so the icons follow the active palette.
"""

import math

from PySide6.QtCore import Qt, QRectF, QPointF
from PySide6.QtGui import QIcon, QPixmap, QPainter, QPen, QColor, QPainterPath

from .. import theme

ICON = 20
SCALE = 3


def _draw(key: str, p: QPainter):
    """One line icon on a 20×20 grid. The pen is already set."""
    if key == "nav":
        p.drawRoundedRect(QRectF(3, 4, 14, 12), 2, 2)
        p.drawLine(QPointF(8, 4), QPointF(8, 16))
    elif key == "home":
        path = QPainterPath()
        path.moveTo(3.5, 9.5)
        path.lineTo(10, 4)
        path.lineTo(16.5, 9.5)
        p.drawPath(path)
        p.drawRoundedRect(QRectF(5.5, 9, 9, 7.5), 1, 1)
    elif key == "calendario":
        p.drawRoundedRect(QRectF(3.5, 5, 13, 11.5), 2, 2)
        p.drawLine(QPointF(3.5, 8.5), QPointF(16.5, 8.5))
        p.drawLine(QPointF(7, 3.5), QPointF(7, 6.5))
        p.drawLine(QPointF(13, 3.5), QPointF(13, 6.5))
    elif key == "habits":
        p.drawEllipse(QRectF(3.5, 3.5, 13, 13))
        path = QPainterPath()
        path.moveTo(7, 10.2)
        path.lineTo(9.2, 12.4)
        path.lineTo(13.2, 8)
        p.drawPath(path)
    elif key == "ejercicio":
        p.drawLine(QPointF(6.5, 10), QPointF(13.5, 10))
        p.drawRoundedRect(QRectF(4, 6.5, 2.5, 7), 0.8, 0.8)
        p.drawRoundedRect(QRectF(13.5, 6.5, 2.5, 7), 0.8, 0.8)
        p.drawLine(QPointF(2.5, 8.5), QPointF(2.5, 11.5))
        p.drawLine(QPointF(17.5, 8.5), QPointF(17.5, 11.5))
    elif key == "proyectos":
        p.drawRoundedRect(QRectF(3.5, 4, 13, 12), 2, 2)
        p.drawLine(QPointF(8, 4), QPointF(8, 16))
        p.drawLine(QPointF(12, 4), QPointF(12, 16))
    elif key == "metas":
        p.drawLine(QPointF(5.5, 3.5), QPointF(5.5, 16.5))
        path = QPainterPath()
        path.moveTo(5.5, 4.5)
        path.lineTo(15, 4.5)
        path.lineTo(12.5, 7.5)
        path.lineTo(15, 10.5)
        path.lineTo(5.5, 10.5)
        p.drawPath(path)
    elif key == "finanzas":
        p.drawRoundedRect(QRectF(3, 5.5, 14, 10.5), 2, 2)
        p.drawRoundedRect(QRectF(11.5, 8.8, 5.5, 4), 1.2, 1.2)
        p.drawLine(QPointF(5, 5.5), QPointF(13, 3.5))
    elif key == "notas":
        path = QPainterPath()
        path.moveTo(5, 16)
        path.lineTo(5.5, 13)
        path.lineTo(13.5, 5)
        path.lineTo(15.5, 7)
        path.lineTo(7.5, 15)
        path.closeSubpath()
        p.drawPath(path)
        p.drawLine(QPointF(9.5, 16), QPointF(15.5, 16))
    elif key == "tareas":
        p.drawRoundedRect(QRectF(3.5, 3.5, 13, 13), 3, 3)
        path = QPainterPath()
        path.moveTo(7, 10.2)
        path.lineTo(9.2, 12.4)
        path.lineTo(13.2, 8)
        p.drawPath(path)
    elif key == "moon":
        path = QPainterPath()
        path.addEllipse(QRectF(4, 4, 12, 12))
        cut = QPainterPath()
        cut.addEllipse(QRectF(7.5, 2, 12, 12))
        p.drawPath(path.subtracted(cut))
    elif key == "sun":
        p.drawEllipse(QRectF(7, 7, 6, 6))
        for k in range(8):
            a = k * math.pi / 4
            p.drawLine(QPointF(10 + 5 * math.cos(a), 10 + 5 * math.sin(a)),
                       QPointF(10 + 7 * math.cos(a), 10 + 7 * math.sin(a)))
    elif key == "folder":
        path = QPainterPath()
        path.moveTo(3, 6)
        path.lineTo(3, 15.5)
        path.lineTo(17, 15.5)
        path.lineTo(17, 7.5)
        path.lineTo(10, 7.5)
        path.lineTo(8.5, 5.5)
        path.lineTo(3.5, 5.5)
        path.closeSubpath()
        p.drawPath(path)
    elif key == "search":
        p.drawEllipse(QRectF(4, 4, 9, 9))
        p.drawLine(QPointF(11.8, 11.8), QPointF(16, 16))
    elif key == "bookmark":
        path = QPainterPath()
        path.moveTo(6, 3.5)
        path.lineTo(14, 3.5)
        path.lineTo(14, 16.5)
        path.lineTo(10, 13.2)
        path.lineTo(6, 16.5)
        path.closeSubpath()
        p.drawPath(path)
    elif key == "graph":
        for cx, cy in ((10, 5), (5, 14), (15, 14)):
            p.drawEllipse(QRectF(cx - 2, cy - 2, 4, 4))
        p.drawLine(QPointF(9, 6.8), QPointF(6, 12.2))
        p.drawLine(QPointF(11, 6.8), QPointF(14, 12.2))
        p.drawLine(QPointF(7, 14), QPointF(13, 14))
    elif key == "tags":
        p.drawLine(QPointF(8, 4), QPointF(6.5, 16))
        p.drawLine(QPointF(13.5, 4), QPointF(12, 16))
        p.drawLine(QPointF(4.5, 8), QPointF(16, 8))
        p.drawLine(QPointF(4, 12.5), QPointF(15.5, 12.5))
    elif key == "new_note":
        path = QPainterPath()
        path.moveTo(5, 3.5)
        path.lineTo(11.5, 3.5)
        path.lineTo(15, 7)
        path.lineTo(15, 16.5)
        path.lineTo(5, 16.5)
        path.closeSubpath()
        p.drawPath(path)
        p.drawLine(QPointF(10, 8.5), QPointF(10, 13.5))
        p.drawLine(QPointF(7.5, 11), QPointF(12.5, 11))
    elif key == "new_folder":
        path = QPainterPath()
        path.moveTo(3, 6)
        path.lineTo(3, 15.5)
        path.lineTo(17, 15.5)
        path.lineTo(17, 7.5)
        path.lineTo(10, 7.5)
        path.lineTo(8.5, 5.5)
        path.lineTo(3.5, 5.5)
        path.closeSubpath()
        p.drawPath(path)
        p.drawLine(QPointF(10, 9.3), QPointF(10, 13.7))
        p.drawLine(QPointF(7.8, 11.5), QPointF(12.2, 11.5))
    elif key == "map":
        p.drawRoundedRect(QRectF(3.5, 3.5, 5, 4), 1, 1)
        p.drawRoundedRect(QRectF(11.5, 8, 5, 4), 1, 1)
        p.drawRoundedRect(QRectF(11.5, 13, 5, 4), 1, 1)
        p.drawLine(QPointF(6, 7.5), QPointF(6, 15))
        p.drawLine(QPointF(6, 10), QPointF(11.5, 10))
        p.drawLine(QPointF(6, 15), QPointF(11.5, 15))
    elif key == "study":
        path = QPainterPath()
        path.moveTo(10, 6)
        path.cubicTo(8, 4.5, 5.5, 4.5, 3, 5)
        path.lineTo(3, 15)
        path.cubicTo(5.5, 14.5, 8, 14.5, 10, 16)
        path.cubicTo(12, 14.5, 14.5, 14.5, 17, 15)
        path.lineTo(17, 5)
        path.cubicTo(14.5, 4.5, 12, 4.5, 10, 6)
        p.drawPath(path)
        p.drawLine(QPointF(10, 6), QPointF(10, 16))
    elif key == "sort":
        p.drawLine(QPointF(6, 4), QPointF(6, 16))
        p.drawLine(QPointF(3.5, 6.5), QPointF(6, 4))
        p.drawLine(QPointF(8.5, 6.5), QPointF(6, 4))
        p.drawLine(QPointF(14, 4), QPointF(14, 16))
        p.drawLine(QPointF(11.5, 13.5), QPointF(14, 16))
        p.drawLine(QPointF(16.5, 13.5), QPointF(14, 16))
    elif key == "reveal":
        p.drawEllipse(QRectF(5, 5, 10, 10))
        p.drawEllipse(QRectF(8.5, 8.5, 3, 3))
        p.drawLine(QPointF(10, 2.5), QPointF(10, 5))
        p.drawLine(QPointF(10, 15), QPointF(10, 17.5))
        p.drawLine(QPointF(2.5, 10), QPointF(5, 10))
        p.drawLine(QPointF(15, 10), QPointF(17.5, 10))
    elif key == "chevron_right":
        p.drawPolyline([QPointF(8, 5.5), QPointF(12.5, 10), QPointF(8, 14.5)])
    elif key == "chevron_down":
        p.drawPolyline([QPointF(5.5, 8), QPointF(10, 12.5), QPointF(14.5, 8)])
    elif key == "link":
        p.drawRoundedRect(QRectF(2.5, 7.5, 8, 5), 2.5, 2.5)
        p.drawRoundedRect(QRectF(9.5, 7.5, 8, 5), 2.5, 2.5)
    elif key == "attach":
        path = QPainterPath()
        path.moveTo(13.5, 7)
        path.lineTo(7.5, 13)
        path.cubicTo(6.3, 14.2, 4.6, 12.5, 5.8, 11.3)
        path.lineTo(12.3, 4.8)
        path.cubicTo(14.3, 2.8, 17.2, 5.7, 15.2, 7.7)
        path.lineTo(8.8, 14.1)
        path.cubicTo(6.3, 16.6, 2.4, 12.7, 4.9, 10.2)
        path.lineTo(10.5, 4.6)
        p.drawPath(path)
    elif key == "sliders":
        for y, x in ((5.5, 12), (10, 7), (14.5, 13.5)):
            p.drawLine(QPointF(3.5, y), QPointF(16.5, y))
            p.drawEllipse(QRectF(x - 1.6, y - 1.6, 3.2, 3.2))
    elif key == "sparkle":
        path = QPainterPath()
        path.moveTo(9, 3)
        path.quadTo(9.6, 8.4, 15, 9)
        path.quadTo(9.6, 9.6, 9, 15)
        path.quadTo(8.4, 9.6, 3, 9)
        path.quadTo(8.4, 8.4, 9, 3)
        p.drawPath(path)
        p.drawLine(QPointF(15, 13), QPointF(15, 17))
        p.drawLine(QPointF(13, 15), QPointF(17, 15))
    elif key == "collapse":
        p.drawPolyline([QPointF(6, 4), QPointF(10, 8), QPointF(14, 4)])
        p.drawPolyline([QPointF(6, 16), QPointF(10, 12), QPointF(14, 16)])


def line_icon(key: str, color: str, size: int = ICON) -> QIcon:
    pm = QPixmap(size * SCALE, size * SCALE)
    pm.fill(Qt.transparent)
    pm.setDevicePixelRatio(SCALE)
    p = QPainter(pm)
    p.setRenderHint(QPainter.Antialiasing)
    p.scale(size / ICON, size / ICON)
    pen = QPen(QColor(theme.tint(color)), 1.5)
    pen.setCapStyle(Qt.RoundCap)
    pen.setJoinStyle(Qt.RoundJoin)
    p.setPen(pen)
    p.setBrush(Qt.NoBrush)
    _draw(key, p)
    p.end()
    return QIcon(pm)


_file_cache: dict = {}


def icon_file(key: str, color: str, size: int = 12) -> str:
    """A line icon saved as a PNG, for stylesheet `image:` rules (tree
    branch chevrons), which only take file paths. Cached per theme colour."""
    import os
    import tempfile
    tinted = theme.tint(color)
    cache_key = (key, tinted, size)
    hit = _file_cache.get(cache_key)
    if hit and os.path.exists(hit):
        return hit
    folder = os.path.join(tempfile.gettempdir(), "notevault_icons")
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f"{key}_{tinted.lstrip('#')}_{size}.png")
    line_icon(key, color, size).pixmap(size, size).save(path, "PNG")
    path = path.replace("\\", "/")
    _file_cache[cache_key] = path
    return path
