"""Freehand drawing stroke utilities and collision detection for Canvas."""

import math
from PySide6.QtCore import QPointF, QRectF
from PySide6.QtGui import QPainterPath


def stroke_to_path(points: list) -> QPainterPath:
    """Build a QPainterPath from a list of [x, y] coordinates."""
    path = QPainterPath()
    if not points:
        return path
    path.moveTo(float(points[0][0]), float(points[0][1]))
    for pt in points[1:]:
        path.lineTo(float(pt[0]), float(pt[1]))
    return path


def calculate_bounds(strokes: list) -> tuple[float, float, float, float]:
    """Return (min_x, min_y, max_x, max_y) across all points in strokes.

    Returns (0.0, 0.0, 100.0, 100.0) if no points exist.
    """
    if not strokes:
        return (0.0, 0.0, 100.0, 100.0)

    min_x = float("inf")
    min_y = float("inf")
    max_x = float("-inf")
    max_y = float("-inf")
    found = False

    for stroke in strokes:
        w = float(stroke.get("width", 3.0)) / 2.0 + 2.0
        for pt in stroke.get("points", []):
            x, y = float(pt[0]), float(pt[1])
            min_x = min(min_x, x - w)
            min_y = min(min_y, y - w)
            max_x = max(max_x, x + w)
            max_y = max(max_y, y + w)
            found = True

    if not found:
        return (0.0, 0.0, 100.0, 100.0)

    return (min_x, min_y, max_x, max_y)


def _point_to_segment_dist(p: QPointF, a: QPointF, b: QPointF) -> float:
    dx = b.x() - a.x()
    dy = b.y() - a.y()
    length_sq = dx * dx + dy * dy
    if length_sq < 1e-6:
        return math.hypot(p.x() - a.x(), p.y() - a.y())

    t = max(0.0, min(1.0, ((p.x() - a.x()) * dx + (p.y() - a.y()) * dy) / length_sq))
    proj_x = a.x() + t * dx
    proj_y = a.y() + t * dy
    return math.hypot(p.x() - proj_x, p.y() - proj_y)


def hit_test_stroke(stroke: dict, point: QPointF, threshold: float = 8.0) -> bool:
    """Return True if point is within threshold of any segment in the stroke."""
    pts = stroke.get("points", [])
    if not pts:
        return False
    sw = float(stroke.get("width", 3.0))
    limit = threshold + sw / 2.0

    if len(pts) == 1:
        return math.hypot(point.x() - pts[0][0], point.y() - pts[0][1]) <= limit

    for i in range(len(pts) - 1):
        p1 = QPointF(float(pts[i][0]), float(pts[i][1]))
        p2 = QPointF(float(pts[i + 1][0]), float(pts[i + 1][1]))
        if _point_to_segment_dist(point, p1, p2) <= limit:
            return True

    return False
