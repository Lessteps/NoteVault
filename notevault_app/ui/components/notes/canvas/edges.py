"""Edges: curved or angled connectors between nodes, with arrowheads and labels.

An edge is anchored to a side (top/right/bottom/left) of each node and reroutes
itself whenever a node it touches moves. Colour, line style (solid/dashed/
dotted), routing (bezier/straight/orthogonal) and the arrow ends come from the
CanvasEdge model.
"""

import math

from PySide6.QtWidgets import (
    QGraphicsPathItem, QGraphicsItem, QInputDialog
)
from PySide6.QtCore import Qt, QPointF, QRectF
from PySide6.QtGui import QPen, QBrush, QColor, QPainterPath, QFont, QPolygonF

from .items import color_for

ARROW = 10.0


def _side_normal(side: str) -> QPointF:
    return {"top": QPointF(0, -1), "bottom": QPointF(0, 1),
            "left": QPointF(-1, 0), "right": QPointF(1, 0)}.get(side, QPointF(1, 0))


class EdgeItem(QGraphicsPathItem):
    def __init__(self, edge, src_item, dst_item, on_changed=None, parent=None):
        super().__init__(parent)
        self.edge = edge
        self.src_item = src_item
        self.dst_item = dst_item
        self.on_changed = on_changed
        self.setZValue(-1)                       # edges sit behind nodes
        self.setFlag(QGraphicsItem.ItemIsSelectable, True)
        self.setAcceptHoverEvents(True)
        self._p1 = QPointF()
        self._p2 = QPointF()
        self._c1 = QPointF()
        self._c2 = QPointF()
        self.update_path()

    # ── geometry ────────────────────────────────────────────────────────
    def _best_target_side(self, from_point: QPointF) -> str:
        best, bestd = "left", None
        for side in ("top", "right", "bottom", "left"):
            d = (self.dst_item.side_point(side) - from_point)
            dist = d.x() * d.x() + d.y() * d.y()
            if bestd is None or dist < bestd:
                bestd, best = dist, side
        return best

    def update_path(self):
        p1 = self.src_item.side_point(self.edge.fromSide)
        to_side = self.edge.toSide or self._best_target_side(p1)
        self.edge.toSide = to_side
        p2 = self.dst_item.side_point(to_side)
        self._p1, self._p2 = p1, p2

        routing = (self.edge.nv or {}).get("routing", "bezier")
        n1 = _side_normal(self.edge.fromSide)
        n2 = _side_normal(to_side)

        path = QPainterPath(p1)
        if routing == "straight":
            path.lineTo(p2)
            self._c1 = p1 + (p2 - p1) * 0.25
            self._c2 = p1 + (p2 - p1) * 0.75
        elif routing == "orthogonal":
            mid_x = (p1.x() + p2.x()) / 2.0
            mid_y = (p1.y() + p2.y()) / 2.0
            if self.edge.fromSide in ("left", "right"):
                path.lineTo(mid_x, p1.y())
                path.lineTo(mid_x, p2.y())
                path.lineTo(p2)
                self._c1 = QPointF(mid_x, p1.y())
                self._c2 = QPointF(mid_x, p2.y())
            else:
                path.lineTo(p1.x(), mid_y)
                path.lineTo(p2.x(), mid_y)
                path.lineTo(p2)
                self._c1 = QPointF(p1.x(), mid_y)
                self._c2 = QPointF(p2.x(), mid_y)
        else:  # "bezier" default
            dist = math.hypot(p2.x() - p1.x(), p2.y() - p1.y())
            pull = max(40.0, dist * 0.4)
            c1 = p1 + n1 * pull
            c2 = p2 + n2 * pull
            path.cubicTo(c1, c2, p2)
            self._c1 = c1
            self._c2 = c2

        self.prepareGeometryChange()
        self.setPath(path)

    def boundingRect(self) -> QRectF:
        return self.path().boundingRect().adjusted(-30, -30, 30, 30)

    # ── painting ────────────────────────────────────────────────────────
    def _pen(self) -> QPen:
        col = color_for(self.edge.color) if self.edge.color else QColor("#8a8a96")
        if self.isSelected():
            col = QColor("#7c5af0")
        pen = QPen(col, 2.2)
        style = (self.edge.nv or {}).get("style", "solid")
        pen.setStyle({"dashed": Qt.DashLine, "dotted": Qt.DotLine}.get(
            style, Qt.SolidLine))
        pen.setCapStyle(Qt.RoundCap)
        return pen

    def paint(self, painter, option, widget=None):
        painter.setRenderHint(painter.RenderHint.Antialiasing)
        pen = self._pen()
        painter.setPen(pen)
        painter.setBrush(Qt.NoBrush)
        painter.drawPath(self.path())

        col = pen.color()
        if self.edge.toEnd != "none":
            self._draw_arrow(painter, self._p2, self._c2, col)
        if self.edge.fromEnd == "arrow":
            self._draw_arrow(painter, self._p1, self._c1, col)

        if self.edge.label:
            self._draw_label(painter, col)

    def _draw_arrow(self, painter, tip: QPointF, ctrl: QPointF, col: QColor):
        ang = math.atan2(tip.y() - ctrl.y(), tip.x() - ctrl.x())
        a = ang + math.pi
        p_left = tip + QPointF(math.cos(a - 0.4) * ARROW, math.sin(a - 0.4) * ARROW)
        p_right = tip + QPointF(math.cos(a + 0.4) * ARROW, math.sin(a + 0.4) * ARROW)
        painter.setBrush(QBrush(col))
        painter.setPen(QPen(col, 1))
        painter.drawPolygon(QPolygonF([tip, p_left, p_right]))

    def _draw_label(self, painter, col):
        mid = self.path().pointAtPercent(0.5)
        f = QFont("Segoe UI", 9)
        painter.setFont(f)
        metrics = painter.fontMetrics()
        w = metrics.horizontalAdvance(self.edge.label) + 12
        h = metrics.height() + 4
        rect = QRectF(mid.x() - w / 2, mid.y() - h / 2, w, h)
        painter.setBrush(QBrush(QColor("#26262c")))
        painter.setPen(QPen(QColor("#3a3a46")))
        painter.drawRoundedRect(rect, 5, 5)
        painter.setPen(QPen(QColor("#dcdde0")))
        painter.drawText(rect, Qt.AlignCenter, self.edge.label)

    # ── interaction / editing ──────────────────────────────────────────
    def mouseDoubleClickEvent(self, event):
        self.edit_label()
        event.accept()

    def edit_label(self, parent_widget=None):
        text, ok = QInputDialog.getText(
            parent_widget, "Etiqueta de conexión",
            "Texto de la etiqueta:", text=self.edge.label or ""
        )
        if ok:
            self.edge.label = text.strip()
            self.update()
            if callable(self.on_changed):
                self.on_changed()

    def set_color(self, color: str):
        self.edge.color = color
        self.update()
        if callable(self.on_changed):
            self.on_changed()

    def set_style(self, style: str):
        if self.edge.nv is None:
            self.edge.nv = {}
        self.edge.nv["style"] = style
        self.update()
        if callable(self.on_changed):
            self.on_changed()

    def set_routing(self, routing: str):
        if self.edge.nv is None:
            self.edge.nv = {}
        self.edge.nv["routing"] = routing
        self.update_path()
        self.update()
        if callable(self.on_changed):
            self.on_changed()

    def set_arrow_ends(self, from_end: str, to_end: str):
        self.edge.fromEnd = from_end
        self.edge.toEnd = to_end
        self.update()
        if callable(self.on_changed):
            self.on_changed()
