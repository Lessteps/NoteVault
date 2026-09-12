"""
Tareas Left Panel — navigation between Tabla, Calendario and Recordatorios.
"""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QFrame,
)
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont


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
            s.setStyleSheet(
                "font-size:10px;color:#666672;background:transparent;border:none;"
            )
            texts.addWidget(s)
            row.addLayout(texts, stretch=1)
        else:
            txt = QLabel(label)
            txt.setStyleSheet("font-size:13px;background:transparent;border:none;")
            row.addWidget(txt, stretch=1)

        self._badge = QLabel("")
        self._badge.setStyleSheet(
            "font-size:10px;color:#f2555a;background:transparent;border:none;"
        )
        row.addWidget(self._badge)

        self.setStyleSheet("""
            QPushButton {
                background: transparent; border: none;
                border-radius: 6px; color: #888895;
            }
            QPushButton:hover { background: #26262e; color: #dcdde0; }
            QPushButton:checked {
                background: rgba(35,131,226,0.18);
                color: #2383e2;
            }
        """)

    def set_badge(self, text: str):
        self._badge.setText(text)


class TareasLeftPanel(QWidget):
    view_requested = Signal(str)   # 'tabla' | 'calendario' | 'recordatorios'

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("sidebarPanel")
        self._btns: dict = {}
        self._init_ui()

    def _init_ui(self):
        lay = QVBoxLayout(self)
        lay.setContentsMargins(8, 16, 8, 12)
        lay.setSpacing(2)

        lay.addWidget(_section_label("Tareas"))
        lay.addSpacing(6)

        for key, icon, label, sub in [
            ("tabla",        "▦", "Tabla",        "Base de datos"),
            ("calendario",   "🗓", "Calendario",   "Por fecha límite"),
            ("recordatorios", "🔔", "Recordatorios", "Avisos programados"),
        ]:
            b = _NavBtn(icon, label, sub)
            b.clicked.connect(lambda _, k=key: self._switch(k))
            lay.addWidget(b)
            self._btns[key] = b

        lay.addSpacing(6)
        sep = QFrame()
        sep.setFixedHeight(1)
        sep.setObjectName("vaultPopupDivider")
        lay.addWidget(sep)

        lay.addStretch()
        self.set_active("tabla")

    def _switch(self, key: str):
        self.set_active(key)
        self.view_requested.emit(key)

    def set_active(self, key: str):
        for k, b in self._btns.items():
            b.setChecked(k == key)

    def set_reminder_count(self, n: int):
        self._btns["recordatorios"].set_badge(str(n) if n else "")
