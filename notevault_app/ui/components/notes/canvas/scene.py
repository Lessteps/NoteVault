from PySide6.QtWidgets import QGraphicsScene
from PySide6.QtCore import QRectF, Qt
from PySide6.QtGui import QColor, QPen, QBrush, QImage, QPainter

BG        = QColor("#1a1a1e")
GRID_DOT  = QColor("#2c2c34")
GRID_STEP = 40


class CanvasScene(QGraphicsScene):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setBackgroundBrush(BG)
        # Large initial scene rect; will dynamically grow infinitely as needed.
        self.setSceneRect(-30000, -30000, 60000, 60000)
        self._init_grid_brush()

    def _init_grid_brush(self):
        """Create a cached pattern brush for instant, hardware-accelerated grid drawing."""
        img = QImage(GRID_STEP, GRID_STEP, QImage.Format_ARGB32_Premultiplied)
        img.fill(Qt.transparent)
        p = QPainter(img)
        p.setPen(QPen(GRID_DOT, 1.0))
        p.drawPoint(0, 0)
        p.end()
        self._grid_brush = QBrush(img)

    def ensure_bounds(self, target_rect: QRectF, margin: float = 15000.0):
        """Ensure sceneRect encompasses target_rect with a generous margin in all directions."""
        if target_rect.isEmpty():
            return
        needed = target_rect.adjusted(-margin, -margin, margin, margin)
        current = self.sceneRect()
        if not current.contains(needed):
            self.setSceneRect(current.united(needed))

    def drawBackground(self, painter, rect: QRectF):
        super().drawBackground(painter, rect)
        # LOD (Level of Detail) check: skip subpixel dots when zoomed far out
        if painter.transform().m11() < 0.25:
            return
        # Render grid instantaneously via tiled C++ rasterizer without Python loops
        painter.fillRect(rect, self._grid_brush)

