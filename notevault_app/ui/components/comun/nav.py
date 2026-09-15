"""Left-sidebar pieces shared by the module panels."""

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont
from PySide6.QtWidgets import QPushButton, QLabel, QHBoxLayout, QVBoxLayout, QWidget

from . import UI_FONT, BLUE


def section_label(text: str) -> QLabel:
    lbl = QLabel(text.upper())
    lbl.setObjectName("sectionLabel")
    f = lbl.font()
    f.setLetterSpacing(QFont.AbsoluteSpacing, 0.9)
    lbl.setFont(f)
    lbl.setStyleSheet("background:transparent;border:none;padding-left:6px;")
    return lbl


def _rgba(hexa: str, alpha: float) -> str:
    h = hexa.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return f"rgba({r},{g},{b},{alpha})"


class NavButton(QPushButton):
    """Checkable sidebar row: icon, label, optional counter on the right."""

    def __init__(self, icon: str, text: str, count: str = "", accent: str = BLUE,
                 icon_colour: str = "", parent=None):
        super().__init__(parent)
        self.setCheckable(True)
        self.setFixedHeight(32)
        self.setCursor(Qt.PointingHandCursor)
        row = QHBoxLayout(self)
        row.setContentsMargins(10, 0, 10, 0)
        row.setSpacing(8)
        ico = QLabel(icon)
        ico.setFixedWidth(20)
        colour = f"color:{icon_colour};" if icon_colour else ""
        ico.setStyleSheet(f"font-size:13px;background:transparent;border:none;{colour}")
        ico.setAttribute(Qt.WA_TransparentForMouseEvents)
        row.addWidget(ico)
        self.text_label = QLabel(text)
        self.text_label.setStyleSheet(
            f"font-size:12px;background:transparent;border:none;font-family:{UI_FONT};")
        self.text_label.setAttribute(Qt.WA_TransparentForMouseEvents)
        row.addWidget(self.text_label, stretch=1)
        self.count_label = QLabel(count)
        self.count_label.setStyleSheet(
            "font-size:11px;color:#666672;background:transparent;border:none;")
        self.count_label.setAttribute(Qt.WA_TransparentForMouseEvents)
        row.addWidget(self.count_label)
        self.setStyleSheet(
            "QPushButton{background:transparent;border:none;border-radius:6px;color:#888895;"
            "min-width:0px;padding:0px;}"
            "QPushButton:hover{background:#26262e;color:#dcdde0;}"
            f"QPushButton:checked{{background:{_rgba(accent, 0.18)};color:{accent};}}")

    def set_count(self, text: str):
        self.count_label.setText(text)


class NavGroup:
    """Keeps exactly one NavButton checked among a set of keys."""

    def __init__(self):
        self.buttons: dict = {}

    def add(self, key, button: NavButton):
        self.buttons[key] = button
        return button

    def set_active(self, key):
        for k, b in self.buttons.items():
            b.setChecked(k == key)

    def clear(self):
        self.buttons.clear()
