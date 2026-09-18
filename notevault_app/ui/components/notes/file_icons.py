"""
Icons for the notes explorer, painted rather than shipped as image files.

A note is a page with text lines; a source file is a coloured badge with
its language, so a script is never mistaken for a note.
"""

from functools import lru_cache

from PySide6.QtCore import Qt, QRectF, QPointF
from PySide6.QtGui import QIcon, QPixmap, QPainter, QColor, QFont, QPen

from ....core.file_kinds import badge_for, kind_for
from ... import theme

SIZE = 16
SCALE = 3          # painted at 3x so the icon stays sharp on high-DPI screens


def _canvas():
    pm = QPixmap(SIZE * SCALE, SIZE * SCALE)
    pm.fill(Qt.transparent)
    pm.setDevicePixelRatio(SCALE)
    p = QPainter(pm)
    p.setRenderHint(QPainter.Antialiasing)
    return pm, p


@lru_cache(maxsize=None)
def _note_icon(tint_key: str) -> QIcon:
    pm, p = _canvas()
    page = QColor(theme.tint("#888895"))
    p.setPen(QPen(page, 1.1))
    p.setBrush(Qt.NoBrush)
    p.drawRoundedRect(QRectF(3.0, 1.5, 10.0, 13.0), 1.6, 1.6)
    accent = QColor(theme.tint("#7c5af0"))
    p.setPen(QPen(accent, 1.2))
    for y in (5.0, 8.0, 11.0):
        p.drawLine(QPointF(5.5, y), QPointF(10.5, y))
    p.end()
    return QIcon(pm)


@lru_cache(maxsize=None)
def _code_icon(label: str, color: str, tint_key: str) -> QIcon:
    pm, p = _canvas()
    p.setPen(Qt.NoPen)
    p.setBrush(QColor(color))
    p.drawRoundedRect(QRectF(0.5, 2.5, 15.0, 11.0), 2.4, 2.4)
    font = QFont("Segoe UI")
    font.setBold(True)
    font.setPixelSize(7 if len(label) <= 2 else 5)
    p.setFont(font)
    p.setPen(QColor("#ffffff"))
    p.drawText(QRectF(0.5, 2.5, 15.0, 11.0), Qt.AlignCenter, label)
    p.end()
    return QIcon(pm)


@lru_cache(maxsize=None)
def _canvas_icon(tint_key: str) -> QIcon:
    pm, p = _canvas()
    accent = QColor(theme.tint("#7c5af0"))
    node = QColor(theme.tint("#888895"))
    # Two little cards joined by a connector: the sign of a board.
    p.setPen(QPen(node, 1.1))
    p.setBrush(Qt.NoBrush)
    p.drawRoundedRect(QRectF(1.5, 2.5, 5.5, 4.0), 1.0, 1.0)
    p.drawRoundedRect(QRectF(9.0, 9.0, 5.5, 4.0), 1.0, 1.0)
    p.setPen(QPen(accent, 1.2))
    p.drawLine(QPointF(7.0, 4.5), QPointF(9.0, 11.0))
    p.end()
    return QIcon(pm)


def icon_for(path) -> QIcon:
    # The tint key keys the cache by theme, so toggling the theme repaints.
    tint_key = theme.current()
    kind = kind_for(path)
    if kind == "code":
        label, color = badge_for(path)
        return _code_icon(label, color, tint_key)
    if kind == "canvas":
        return _canvas_icon(tint_key)
    return _note_icon(tint_key)
