"""
NoteVault Math Graph Widget
Native 2D function plotter rendered with QPainter (no external chart libraries).
"""

import math
from PySide6.QtWidgets import (
    QDialog, QWidget, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QFrame
)
from PySide6.QtCore import Qt, QPointF
from PySide6.QtGui import QPainter, QPen, QColor, QFont

from ..comun import TEXT, BORDER, TEXT_DIM, UI_FONT
from ....core.math_tools import evaluate_function

ACCENT = "#7c5af0"
BG_PLOT = "#18181c"
GRID_COLOR = "#2c2c34"
AXIS_COLOR = "#5a5a6a"
CURVE_COLOR = "#38bdf8"


class MathGraphCanvas(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumSize(450, 320)
        self.expr = "sin(x)"
        self.x_min = -10.0
        self.x_max = 10.0
        self.y_min = -5.0
        self.y_max = 5.0

    def set_function(self, expr: str):
        self.expr = expr
        self.update()

    def set_x_range(self, x_min: float, x_max: float):
        if x_max > x_min:
            self.x_min = x_min
            self.x_max = x_max
            self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)

        w = self.width()
        h = self.height()

        # Background
        painter.fillRect(0, 0, w, h, QColor(BG_PLOT))

        # Coordinate transforms
        def to_screen(x: float, y: float) -> tuple[float, float]:
            sx = (x - self.x_min) / (self.x_max - self.x_min) * w
            sy = h - (y - self.y_min) / (self.y_max - self.y_min) * h
            return sx, sy

        # Draw Grid & Ticks
        grid_pen = QPen(QColor(GRID_COLOR), 1, Qt.DotLine)
        painter.setPen(grid_pen)

        for x_val in range(int(self.x_min), int(self.x_max) + 1):
            sx, _ = to_screen(x_val, 0)
            painter.drawLine(int(sx), 0, int(sx), h)

        for y_val in range(int(self.y_min), int(self.y_max) + 1):
            _, sy = to_screen(0, y_val)
            painter.drawLine(0, int(sy), w, int(sy))

        # Draw Axes
        axis_pen = QPen(QColor(AXIS_COLOR), 2)
        painter.setPen(axis_pen)

        # X-axis (y = 0)
        _, zero_y = to_screen(0, 0)
        if 0 <= zero_y <= h:
            painter.drawLine(0, int(zero_y), w, int(zero_y))

        # Y-axis (x = 0)
        zero_x, _ = to_screen(0, 0)
        if 0 <= zero_x <= w:
            painter.drawLine(int(zero_x), 0, int(zero_x), h)

        # Plot Function Curve
        if not self.expr:
            return

        curve_pen = QPen(QColor(CURVE_COLOR), 2)
        painter.setPen(curve_pen)

        step_pixels = 2
        prev_point = None

        for px in range(0, w + step_pixels, step_pixels):
            math_x = self.x_min + (px / w) * (self.x_max - self.x_min)
            math_y = evaluate_function(self.expr, math_x)

            if math_y is not None and not math.isnan(math_y) and not math.isinf(math_y):
                # Clamp Y to avoid crazy painting jumps
                if self.y_min - 20 <= math_y <= self.y_max + 20:
                    sx, sy = to_screen(math_x, math_y)
                    curr_point = QPointF(sx, sy)
                    if prev_point is not None:
                        painter.drawLine(prev_point, curr_point)
                    prev_point = curr_point
                else:
                    prev_point = None
            else:
                prev_point = None


class MathGraphDialog(QDialog):
    def __init__(self, initial_expr: str = "x**2 - 4", parent=None):
        super().__init__(parent)
        self.setWindowTitle("Graficador de Funciones 2D — NoteVault Math")
        self.setMinimumSize(560, 460)
        self.setStyleSheet(
            f"QDialog {{ background: #1a1a1e; color: {TEXT}; font-family: {UI_FONT}; }}"
            f"QLabel {{ color: {TEXT}; }}"
        )
        self._init_ui(initial_expr)

    def _init_ui(self, initial_expr: str):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(16, 16, 16, 16)
        lay.setSpacing(10)

        # Input row
        in_row = QHBoxLayout()
        lbl = QLabel("f(x) =")
        lbl.setStyleSheet("font-size: 14px; font-weight: bold;")
        in_row.addWidget(lbl)

        self.expr_edit = QLineEdit(initial_expr)
        self.expr_edit.setStyleSheet(
            f"QLineEdit {{ background: #252528; border: 1px solid {BORDER}; "
            f"border-radius: 4px; color: {TEXT}; font-size: 13px; padding: 5px 8px; }}"
        )
        in_row.addWidget(self.expr_edit, stretch=1)

        plot_btn = QPushButton("Graficar")
        plot_btn.setCursor(Qt.PointingHandCursor)
        plot_btn.setStyleSheet(
            f"QPushButton {{ background: {ACCENT}; border: none; border-radius: 4px; "
            f"color: #ffffff; font-weight: bold; padding: 6px 14px; }}"
        )
        plot_btn.clicked.connect(self._plot)
        in_row.addWidget(plot_btn)

        lay.addLayout(in_row)

        # Canvas
        self.canvas = MathGraphCanvas(self)
        self.canvas.set_function(initial_expr)
        lay.addWidget(self.canvas, stretch=1)

        # Controls bar (zoom)
        ctrl_bar = QHBoxLayout()
        z_in = QPushButton("Zoom +")
        z_in.setCursor(Qt.PointingHandCursor)
        z_in.clicked.connect(lambda: self.canvas.set_x_range(self.canvas.x_min * 0.7, self.canvas.x_max * 0.7))
        ctrl_bar.addWidget(z_in)

        z_out = QPushButton("Zoom -")
        z_out.setCursor(Qt.PointingHandCursor)
        z_out.clicked.connect(lambda: self.canvas.set_x_range(self.canvas.x_min * 1.4, self.canvas.x_max * 1.4))
        ctrl_bar.addWidget(z_out)

        reset_btn = QPushButton("Reset Ejes")
        reset_btn.setCursor(Qt.PointingHandCursor)
        reset_btn.clicked.connect(lambda: self.canvas.set_x_range(-10.0, 10.0))
        ctrl_bar.addWidget(reset_btn)

        ctrl_bar.addStretch()

        close_btn = QPushButton("Cerrar")
        close_btn.setCursor(Qt.PointingHandCursor)
        close_btn.clicked.connect(self.accept)
        ctrl_bar.addWidget(close_btn)

        lay.addLayout(ctrl_bar)

    def _plot(self):
        expr = self.expr_edit.text().strip()
        self.canvas.set_function(expr)
