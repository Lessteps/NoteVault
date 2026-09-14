"""
The size picker for a new table.

"Insertar tabla" used to drop a silent 3x3 and leave the user to grow it.
This is the grid every editor shows instead: move over it, the label says
what you are about to get, and a click inserts exactly that.
"""

from PySide6.QtCore import Qt, QRectF, QSize, Signal
from PySide6.QtGui import QPainter, QColor, QPen
from PySide6.QtWidgets import QDialog, QVBoxLayout, QLabel, QFrame, QWidget

BG      = "#202024"
BORDER  = "#33333e"
TEXT    = "#dcdde0"
FAINT   = "#666672"
ACCENT  = "#7c5af0"
EMPTY   = "#2e2e38"

MAX_ROWS = 8
MAX_COLS = 8
CELL = 20
PAD = 3


class _Grid(QWidget):
    picked = Signal(int, int)
    hovered = Signal(int, int)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMouseTracking(True)
        self.rows = 3
        self.cols = 3
        self.setFixedSize(QSize(MAX_COLS * CELL, MAX_ROWS * CELL))

    def _at(self, pos):
        col = max(1, min(MAX_COLS, int(pos.x()) // CELL + 1))
        row = max(1, min(MAX_ROWS, int(pos.y()) // CELL + 1))
        return row, col

    def set_size(self, rows: int, cols: int):
        rows = max(1, min(MAX_ROWS, rows))
        cols = max(1, min(MAX_COLS, cols))
        if (rows, cols) != (self.rows, self.cols):
            self.rows, self.cols = rows, cols
            self.hovered.emit(rows, cols)
            self.update()

    def mouseMoveEvent(self, event):
        self.set_size(*self._at(event.position()))

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.set_size(*self._at(event.position()))
            self.picked.emit(self.rows, self.cols)

    def paintEvent(self, _event):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        for r in range(MAX_ROWS):
            for c in range(MAX_COLS):
                box = QRectF(c * CELL + PAD, r * CELL + PAD,
                             CELL - 2 * PAD, CELL - 2 * PAD)
                inside = r < self.rows and c < self.cols
                p.setPen(QPen(QColor(ACCENT if inside else BORDER), 1))
                p.setBrush(QColor(ACCENT if inside else EMPTY))
                if inside:
                    p.setOpacity(0.85)
                p.drawRoundedRect(box, 2, 2)
                p.setOpacity(1.0)
        p.end()


class TablePicker(QDialog):
    """Returns (rows, cols) including the header row, or None if cancelled."""

    def __init__(self, parent=None):
        super().__init__(parent, Qt.Popup | Qt.FramelessWindowHint)
        self.choice = None

        frame = QFrame(self)
        frame.setObjectName("pickerFrame")
        frame.setStyleSheet(
            f"QFrame#pickerFrame{{background:{BG};border:1px solid {BORDER};"
            "border-radius:10px;}"
        )
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addWidget(frame)

        lay = QVBoxLayout(frame)
        lay.setContentsMargins(12, 10, 12, 10)
        lay.setSpacing(8)

        title = QLabel("Insertar tabla")
        title.setStyleSheet(
            f"color:{TEXT};font-size:13px;font-weight:600;"
            "background:transparent;border:none;"
        )
        lay.addWidget(title)

        self._grid = _Grid()
        self._grid.hovered.connect(self._show_size)
        self._grid.picked.connect(self._choose)
        lay.addWidget(self._grid, alignment=Qt.AlignHCenter)

        self._size = QLabel()
        self._size.setAlignment(Qt.AlignCenter)
        self._size.setStyleSheet(
            f"color:{FAINT};font-size:11px;background:transparent;border:none;")
        lay.addWidget(self._size)
        self._show_size(self._grid.rows, self._grid.cols)

        hint = QLabel("↑↓←→ para ajustar   ·   Enter inserta   ·   Esc cancela")
        hint.setAlignment(Qt.AlignCenter)
        hint.setStyleSheet(
            f"color:{FAINT};font-size:10px;background:transparent;border:none;")
        lay.addWidget(hint)
        self.adjustSize()

    def _show_size(self, rows: int, cols: int):
        body = rows - 1
        tail = "1 fila de datos" if body == 1 else f"{body} filas de datos"
        self._size.setText(f"{rows} × {cols}   ·   cabecera + {tail}"
                           if body else f"{rows} × {cols}   ·   solo cabecera")

    def _choose(self, rows: int, cols: int):
        self.choice = (rows, cols)
        self.accept()

    def keyPressEvent(self, event):
        key = event.key()
        steps = {Qt.Key_Up: (-1, 0), Qt.Key_Down: (1, 0),
                 Qt.Key_Left: (0, -1), Qt.Key_Right: (0, 1)}
        if key in steps:
            dr, dc = steps[key]
            self._grid.set_size(self._grid.rows + dr, self._grid.cols + dc)
            return
        if key in (Qt.Key_Return, Qt.Key_Enter):
            self._choose(self._grid.rows, self._grid.cols)
            return
        super().keyPressEvent(event)

    def pick_over(self, widget):
        """Show centred near the top of widget; returns (rows, cols) or None."""
        top_left = widget.mapToGlobal(widget.rect().topLeft())
        self.move(top_left.x() + max(0, (widget.width() - self.width()) // 2),
                  top_left.y() + 70)
        self.exec()
        return self.choice
