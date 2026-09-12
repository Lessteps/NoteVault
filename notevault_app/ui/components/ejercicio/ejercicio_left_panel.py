"""
Ejercicio Left Panel – navigation: overview, days, manage.
"""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QFrame,
)
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont

from .exercise_data import DAYS


def _section_label(text: str) -> QLabel:
    lbl = QLabel(text.upper())
    lbl.setObjectName("sectionLabel")
    f = lbl.font()
    f.setLetterSpacing(QFont.AbsoluteSpacing, 0.9)
    lbl.setFont(f)
    lbl.setStyleSheet("background:transparent;border:none;padding-left:6px;")
    return lbl


class _NavBtn(QPushButton):
    def __init__(self, icon: str, label: str, sub: str = "", parent=None):
        super().__init__(parent)
        self.setCheckable(True)
        self.setFixedHeight(42 if sub else 36)
        self.setCursor(Qt.PointingHandCursor)

        row = QHBoxLayout(self)
        row.setContentsMargins(12, 0, 10, 0)
        row.setSpacing(8)

        ico = QLabel(icon)
        ico.setStyleSheet("font-size:14px;background:transparent;border:none;")
        ico.setFixedWidth(22)
        row.addWidget(ico)

        if sub:
            texts = QVBoxLayout()
            texts.setSpacing(1)
            nm = QLabel(label)
            nm.setStyleSheet("font-size:13px;background:transparent;border:none;")
            texts.addWidget(nm)
            s = QLabel(sub)
            s.setStyleSheet("font-size:10px;color:#666672;background:transparent;border:none;")
            texts.addWidget(s)
            row.addLayout(texts, stretch=1)
        else:
            txt = QLabel(label)
            txt.setStyleSheet("font-size:13px;background:transparent;border:none;")
            row.addWidget(txt, stretch=1)

        self.setStyleSheet("""
            QPushButton {
                background: transparent; border: none;
                border-radius: 6px; color: #888895;
            }
            QPushButton:hover { background: #26262e; color: #dcdde0; }
            QPushButton:checked {
                background: rgba(255,150,50,0.18);
                color: #ff9632;
            }
        """)


GLYPHS   = ["💪", "🦵", "💪", "🦵", "🔥", "🚶", "😴"]
SUBTITLES = [
    "Top A — Fuerza", "Bottom A — Fuerza", "Top B — Hipert.",
    "Bottom B — Hipert.", "Full Body", "Cardio", "Descanso",
]


class EjercicioLeftPanel(QWidget):
    view_requested = Signal(str)   # 'overview' | day_key | 'manage'

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("sidebarPanel")
        self._btns: dict[str, _NavBtn] = {}
        self._init_ui()

    def _init_ui(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(8, 16, 8, 12)
        lay.setSpacing(2)

        lay.addWidget(_section_label("Ejercicio"))
        lay.addSpacing(6)

        # Vista General
        ov_btn = _NavBtn("◈", "Vista General")
        ov_btn.clicked.connect(lambda: self._switch("overview"))
        lay.addWidget(ov_btn)
        self._btns["overview"] = ov_btn

        # Registro
        reg_btn = _NavBtn("🗂", "Registro")
        reg_btn.clicked.connect(lambda: self._switch("registro"))
        lay.addWidget(reg_btn)
        self._btns["registro"] = reg_btn

        # Separator
        sep = QFrame()
        sep.setFixedHeight(1)
        sep.setObjectName("vaultPopupDivider")
        lay.addWidget(sep)
        lay.addSpacing(2)

        # Days
        for i, day in enumerate(DAYS):
            btn = _NavBtn(GLYPHS[i], day["name"], SUBTITLES[i])
            btn.clicked.connect(lambda _, k=day["key"]: self._switch(k))
            lay.addWidget(btn)
            self._btns[day["key"]] = btn

        lay.addSpacing(4)
        sep2 = QFrame()
        sep2.setFixedHeight(1)
        sep2.setObjectName("vaultPopupDivider")
        lay.addWidget(sep2)
        lay.addSpacing(4)

        mg_btn = _NavBtn("⚙", "Gestionar ejercicios")
        mg_btn.clicked.connect(lambda: self._switch("manage"))
        lay.addWidget(mg_btn)
        self._btns["manage"] = mg_btn

        lay.addStretch()
        self.set_active("overview")

    def _switch(self, key: str):
        for k, b in self._btns.items():
            b.setChecked(k == key)
        self.view_requested.emit(key)

    def set_active(self, key: str):
        for k, b in self._btns.items():
            b.setChecked(k == key)
