"""The canvas scene: an effectively infinite board with a dotted grid."""

from PySide6.QtWidgets import QGraphicsScene
from PySide6.QtCore import QRectF
from PySide6.QtGui import QColor, QPen

BG        = QColor("#1a1a1e")
GRID_DOT  = QColor("#2c2c34")
GRID_STEP = 40


class CanvasScene(QGraphicsScene):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setBackgroundBrush(BG)
        # A big scene rect so scrollbars/panning have room; it grows if needed.
        self.setSceneRect(-10000, -10000, 20000, 20000)

    def drawBackground(self, painter, rect: QRectF):
        super().drawBackground(painter, rect)
        left = int(rect.left()) - (int(rect.left()) % GRID_STEP)
        top = int(rect.top()) - (int(rect.top()) % GRID_STEP)
        pen = QPen(GRID_DOT, 1.0)
        painter.setPen(pen)
        x = left
        while x < rect.right():
            y = top
            while y < rect.bottom():
                painter.drawPoint(x, y)
                y += GRID_STEP
            x += GRID_STEP
