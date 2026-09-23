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


def _waypoints_to_path(waypoints: list, radius: float = 12.0):
    """Converts a sequence of waypoints into a QPainterPath with filleted (rounded) corners."""
    if not waypoints:
        return QPainterPath(), QPointF(), QPointF()
    path = QPainterPath(waypoints[0])
    if len(waypoints) < 3:
        for pt in waypoints[1:]:
            path.lineTo(pt)
        c1 = waypoints[0] + (waypoints[-1] - waypoints[0]) * 0.25
        c2 = waypoints[0] + (waypoints[-1] - waypoints[0]) * 0.75
        return path, c1, c2

    for i in range(1, len(waypoints) - 1):
        prev_pt = waypoints[i - 1]
        curr_pt = waypoints[i]
        next_pt = waypoints[i + 1]
        v1 = prev_pt - curr_pt
        v2 = next_pt - curr_pt
        d1 = math.hypot(v1.x(), v1.y())
        d2 = math.hypot(v2.x(), v2.y())
        if d1 < 1e-4 or d2 < 1e-4:
            path.lineTo(curr_pt)
            continue
        r = min(radius, d1 / 2.0, d2 / 2.0)
        start_arc = curr_pt + (v1 / d1) * r
        end_arc = curr_pt + (v2 / d2) * r
        path.lineTo(start_arc)
        path.quadTo(curr_pt, end_arc)

    path.lineTo(waypoints[-1])
    c1 = waypoints[1] if len(waypoints) > 1 else waypoints[0]
    c2 = waypoints[-2] if len(waypoints) > 1 else waypoints[-1]
    return path, c1, c2


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

    def _route_smart(self, p1: QPointF, n1: QPointF, p2: QPointF, n2: QPointF, from_side: str, to_side: str):
        src_rect = self.src_item.sceneBoundingRect() if self.src_item else QRectF(p1, p1)
        dst_rect = self.dst_item.sceneBoundingRect() if self.dst_item else QRectF(p2, p2)

        # 1. Inter-lane return connection (from right of a lane down to left of a lower lane)
        if p2.y() > p1.y() + 80 and p2.x() < p1.x() - 100:
            channel_y = (src_rect.bottom() + dst_rect.top()) / 2.0
            channel_y = max(src_rect.bottom() + 24.0, min(dst_rect.top() - 24.0, channel_y))
            turn_x = dst_rect.left() - 40.0

            if from_side == "bottom":
                w_start = [p1, QPointF(p1.x(), channel_y)]
            else:
                w_start = [p1, QPointF(src_rect.right() + 24.0, p1.y()), QPointF(src_rect.right() + 24.0, channel_y)]

            if to_side == "left":
                waypoints = w_start + [QPointF(turn_x, channel_y), QPointF(turn_x, p2.y()), p2]
            else:
                waypoints = w_start + [QPointF(p2.x(), channel_y), p2]
            return _waypoints_to_path(waypoints, radius=14.0)

        # 2. Intra-row horizontal connection (left to right)
        if from_side in ("left", "right") and to_side in ("left", "right"):
            mid_x = (p1.x() + p2.x()) / 2.0
            if abs(p1.y() - p2.y()) < 5.0 and p2.x() > p1.x():
                path = QPainterPath(p1)
                path.lineTo(p2)
                return path, p1, p1
            if p2.x() > p1.x():
                waypoints = [p1, QPointF(mid_x, p1.y()), QPointF(mid_x, p2.y()), p2]
            else:
                loop_y = max(src_rect.bottom(), dst_rect.bottom()) + 30.0
                waypoints = [
                    p1,
                    QPointF(src_rect.right() + 24.0, p1.y()),
                    QPointF(src_rect.right() + 24.0, loop_y),
                    QPointF(dst_rect.left() - 24.0, loop_y),
                    QPointF(dst_rect.left() - 24.0, p2.y()),
                    p2
                ]
            return _waypoints_to_path(waypoints, radius=12.0)

        # 3. Vertical connection
        mid_y = (p1.y() + p2.y()) / 2.0
        waypoints = [p1, QPointF(p1.x(), mid_y), QPointF(p2.x(), mid_y), p2]
        return _waypoints_to_path(waypoints, radius=12.0)

    def update_path(self):
        p1 = self.src_item.side_point(self.edge.fromSide)
        to_side = self.edge.toSide or self._best_target_side(p1)
        self.edge.toSide = to_side
        p2 = self.dst_item.side_point(to_side)
        self._p1, self._p2 = p1, p2

        routing = (self.edge.nv or {}).get("routing", "smart")
        n1 = _side_normal(self.edge.fromSide)
        n2 = _side_normal(to_side)

        is_inter_lane = (p2.y() > p1.y() + 100 and p2.x() < p1.x() - 100)

        if routing == "straight":
            path = QPainterPath(p1)
            path.lineTo(p2)
            self._c1 = p1 + (p2 - p1) * 0.25
            self._c2 = p1 + (p2 - p1) * 0.75
        elif routing == "bezier" and not is_inter_lane:
            path = QPainterPath(p1)
            dist = math.hypot(p2.x() - p1.x(), p2.y() - p1.y())
            pull = max(40.0, dist * 0.4)
            c1 = p1 + n1 * pull
            c2 = p2 + n2 * pull
            path.cubicTo(c1, c2, p2)
            self._c1 = c1
            self._c2 = c2
        else:
            # Smart / Orthogonal / Inter-lane obstacle-avoiding routing
            path, c1, c2 = self._route_smart(p1, n1, p2, n2, self.edge.fromSide, to_side)
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
        scale = painter.transform().m11()
        pen = self._pen()
        # The edge keeps the same route and arrows at every zoom level; a
        # straight-line "LOD" made links change shape when zooming out. Only
        # the pen stays at least 1 screen pixel wide so a far-away link does
        # not break up into dashes.
        if pen.widthF() * scale < 1.0:
            pen.setCosmetic(True)
            pen.setWidthF(1.0)
        painter.setRenderHint(painter.RenderHint.Antialiasing)
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
