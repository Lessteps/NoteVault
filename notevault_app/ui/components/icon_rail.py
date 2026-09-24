"""
NoteVault Icon Rail
Navigation buttons + theme toggle.

The icons are painted as thin monochrome line drawings (the redesign's look)
instead of emoji glyphs, which render in full colour and ignore the theme.
Each button keeps three tints — idle, hover and active — and swaps between
them itself, since a QPushButton's icon cannot follow a stylesheet :hover.
"""

from PySide6.QtWidgets import QWidget, QVBoxLayout, QPushButton, QGraphicsOpacityEffect
from PySide6.QtCore import Qt, Signal, QVariantAnimation, QEasingCurve, QSize
from PySide6.QtGui import QIcon

from .line_icons import line_icon, ICON

RAIL_WIDTH = 48

IDLE_COLOR = "#888895"
HOVER_COLOR = "#dcdde0"
ACTIVE_COLOR = "#ffffff"


def rail_icon(key: str, color: str) -> QIcon:
    return line_icon(key, color)


class _RailButton(QPushButton):
    def __init__(self, icon_key: str, tooltip: str, parent=None):
        super().__init__("", parent)
        self.setObjectName("railIconBtn")
        self.setToolTip(tooltip)
        self.setFixedSize(RAIL_WIDTH - 12, RAIL_WIDTH - 12)
        self.setIconSize(QSize(ICON, ICON))
        self.setCursor(Qt.PointingHandCursor)
        self._key = icon_key
        self._active = False
        self._hover = False
        self.repaint_icon()

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

    def set_icon_key(self, key: str):
        self._key = key
        self.repaint_icon()

    def repaint_icon(self):
        color = (ACTIVE_COLOR if self._active
                 else HOVER_COLOR if self._hover else IDLE_COLOR)
        self.setIcon(rail_icon(self._key, color))

    def enterEvent(self, event):
        self._hover = True
        self.repaint_icon()
        super().enterEvent(event)

    def leaveEvent(self, event):
        self._hover = False
        self.repaint_icon()
        super().leaveEvent(event)

    def _flash(self):
        self._flash_anim.stop()
        self._flash_anim.start()

    def set_active(self, active: bool):
        self._active = active
        self.setObjectName("railIconBtnActive" if active else "railIconBtn")
        self.style().unpolish(self)
        self.style().polish(self)
        self.repaint_icon()


class IconRail(QWidget):
    navigator_toggled       = Signal()
    home_requested          = Signal()
    habit_tracker_requested = Signal()
    ejercicio_requested     = Signal()
    proyectos_requested     = Signal()
    notas_requested         = Signal()
    tareas_requested        = Signal()
    calendario_requested    = Signal()
    metas_requested         = Signal()
    finanzas_requested      = Signal()
    theme_toggled           = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("iconRail")
        self.setFixedWidth(RAIL_WIDTH)
        self._buttons: dict = {}
        self._build()

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(6, 10, 6, 12)
        layout.setSpacing(6)
        layout.setAlignment(Qt.AlignHCenter)

        # Top: toggle navigator
        btn = _RailButton("nav", "Mostrar / ocultar panel")
        btn.clicked.connect(self.navigator_toggled.emit)
        layout.addWidget(btn, alignment=Qt.AlignHCenter)
        self._buttons["nav"] = btn
        layout.addSpacing(6)

        # Modules sit at the top of the rail, as in the redesign.
        for key, tip, signal in [
            ("home",       "Vista General",   self.home_requested),
            ("calendario", "Calendario",      self.calendario_requested),
            ("habits",     "Habit Tracker",   self.habit_tracker_requested),
            ("ejercicio",  "Ejercicio",       self.ejercicio_requested),
            ("proyectos",  "Proyectos",       self.proyectos_requested),
            ("metas",      "Metas",           self.metas_requested),
            ("finanzas",   "Finanzas",        self.finanzas_requested),
            ("notas",      "Notas",           self.notas_requested),
            ("tareas",     "Tareas",          self.tareas_requested),
        ]:
            b = _RailButton(key, tip)
            b.clicked.connect(signal.emit)
            layout.addWidget(b, alignment=Qt.AlignHCenter)
            self._buttons[key] = b

        layout.addStretch()

        btn = _RailButton("moon", "Cambiar tema")
        btn.clicked.connect(self.theme_toggled.emit)
        layout.addWidget(btn, alignment=Qt.AlignHCenter)
        self._buttons["theme"] = btn

    def set_theme_glyph(self, is_dark: bool):
        # Re-tint every icon: the palette just changed.
        for b in self._buttons.values():
            b.repaint_icon()
        self._buttons["theme"].set_icon_key("moon" if is_dark else "sun")

    def set_active(self, key: str, active: bool):
        if key in self._buttons:
            self._buttons[key].set_active(active)
