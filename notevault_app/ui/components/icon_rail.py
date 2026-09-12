"""
NoteVault Icon Rail
Navigation buttons + theme toggle.
"""

from PySide6.QtWidgets import QWidget, QVBoxLayout, QPushButton, QGraphicsOpacityEffect
from PySide6.QtCore import Qt, Signal, QVariantAnimation, QEasingCurve

RAIL_WIDTH = 44


class _RailButton(QPushButton):
    def __init__(self, glyph: str, tooltip: str, parent=None):
        super().__init__(glyph, parent)
        self.setObjectName("railIconBtn")
        self.setToolTip(tooltip)
        self.setFixedSize(RAIL_WIDTH - 8, RAIL_WIDTH - 8)
        self.setCursor(Qt.PointingHandCursor)

        self._opacity = QGraphicsOpacityEffect(self)
        self._opacity.setOpacity(1.0)
        self.setGraphicsEffect(self._opacity)

        self._flash_anim = QVariantAnimation(self)
        self._flash_anim.setDuration(180)
        self._flash_anim.setStartValue(0.4)
        self._flash_anim.setEndValue(1.0)
        self._flash_anim.setEasingCurve(QEasingCurve.OutCubic)
        self._flash_anim.valueChanged.connect(self._opacity.setOpacity)
        self.clicked.connect(self._flash)

    def _flash(self):
        self._flash_anim.stop()
        self._flash_anim.start()

    def set_active(self, active: bool):
        self.setObjectName("railIconBtnActive" if active else "railIconBtn")
        self.style().unpolish(self)
        self.style().polish(self)


class IconRail(QWidget):
    navigator_toggled       = Signal()
    home_requested          = Signal()
    habit_tracker_requested = Signal()
    ejercicio_requested     = Signal()
    proyectos_requested     = Signal()
    notas_requested         = Signal()
    tareas_requested        = Signal()
    theme_toggled           = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("iconRail")
        self.setFixedWidth(RAIL_WIDTH)
        self._buttons: dict = {}
        self._build()

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 14, 4, 14)
        layout.setSpacing(2)
        layout.setAlignment(Qt.AlignHCenter)

        # Top: toggle navigator
        btn = _RailButton("☰", "Mostrar / ocultar panel")
        btn.clicked.connect(self.navigator_toggled.emit)
        layout.addWidget(btn, alignment=Qt.AlignHCenter)
        self._buttons["nav"] = btn

        layout.addStretch()

        for key, glyph, tip, signal in [
            ("home",      "◎",  "Vista General",   self.home_requested),
            ("habits",    "⊙",  "Habit Tracker",   self.habit_tracker_requested),
            ("ejercicio", "🏋", "Ejercicio",        self.ejercicio_requested),
            ("proyectos", "◫",  "Proyectos",        self.proyectos_requested),
            ("notas",     "✎",  "Notas",            self.notas_requested),
            ("tareas",    "☑",  "Tareas",           self.tareas_requested),
        ]:
            b = _RailButton(glyph, tip)
            b.clicked.connect(signal.emit)
            layout.addWidget(b, alignment=Qt.AlignHCenter)
            self._buttons[key] = b

        layout.addStretch()

        btn = _RailButton("◑", "Cambiar tema")
        btn.clicked.connect(self.theme_toggled.emit)
        layout.addWidget(btn, alignment=Qt.AlignHCenter)
        self._buttons["theme"] = btn

    def set_theme_glyph(self, is_dark: bool):
        self._buttons["theme"].setText("◑" if is_dark else "◐")

    def set_active(self, key: str, active: bool):
        if key in self._buttons:
            self._buttons[key].set_active(active)
