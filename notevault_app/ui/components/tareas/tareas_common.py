"""
Shared palette and small widgets for the Tareas module.
Matches the dark Notion-style database look of the reference layout.
"""

from PySide6.QtWidgets import (
    QPushButton, QLineEdit, QComboBox, QLabel, QFrame, QDateEdit,
)
from PySide6.QtCore import Qt, QDate

BG_PAGE   = "#191919"
BG_CARD   = "#1f1f1f"
BG_ROW    = "#1c1c1c"
BG_ROW_ALT = "#202020"
BG_HEAD   = "#161616"
BORDER    = "#2f2f2f"
TEXT      = "#e6e6e6"
TEXT_DIM  = "#9b9b9b"
TEXT_FAINT = "#6f6f6f"
BLUE      = "#2383e2"
GREEN     = "#4ade80"
ORANGE    = "#ff9632"
RED       = "#f2555a"
STAR      = "#e8d44d"

INPUT_SS = (
    f"QLineEdit{{background:#252525;border:1px solid {BORDER};border-radius:6px;"
    f"color:{TEXT};font-size:12px;padding:0 10px;}}"
    f"QLineEdit:focus{{border-color:{BLUE};}}"
)

COMBO_SS = (
    f"QComboBox{{background:#252525;border:1px solid {BORDER};border-radius:6px;"
    f"color:{TEXT_DIM};font-size:12px;padding:2px 10px;}}"
    f"QComboBox:hover{{border-color:{BLUE};color:{TEXT};}}"
    "QComboBox::drop-down{border:none;width:18px;}"
    f"QComboBox QAbstractItemView{{background:#202020;border:1px solid {BORDER};"
    f"color:{TEXT};selection-background-color:{BLUE};outline:none;}}"
)

DATE_SS = (
    f"QDateEdit{{background:#252525;border:1px solid {BORDER};border-radius:6px;"
    f"color:{TEXT};font-size:12px;padding:2px 8px;}}"
    f"QDateEdit:focus{{border-color:{BLUE};}}"
    "QDateEdit::drop-down{border:none;width:16px;}"
    f"QCalendarWidget QWidget{{background:#202020;color:{TEXT};}}"
    f"QCalendarWidget QAbstractItemView{{background:#202020;color:{TEXT};"
    f"selection-background-color:{BLUE};}}"
)


def flat_btn(text: str, color: str = TEXT_DIM, accent: str = BLUE,
             height: int = 28) -> QPushButton:
    b = QPushButton(text)
    b.setCursor(Qt.PointingHandCursor)
    b.setFixedHeight(height)
    b.setStyleSheet(
        f"QPushButton{{background:#252525;border:1px solid {BORDER};"
        f"border-radius:6px;color:{color};font-size:12px;padding:0 12px;}}"
        f"QPushButton:hover{{border-color:{accent};color:{TEXT};}}"
    )
    return b


def primary_btn(text: str, height: int = 28) -> QPushButton:
    b = QPushButton(text)
    b.setCursor(Qt.PointingHandCursor)
    b.setFixedHeight(height)
    b.setStyleSheet(
        f"QPushButton{{background:{BLUE};border:none;border-radius:6px;"
        "color:#ffffff;font-size:12px;font-weight:600;padding:0 14px;}"
        "QPushButton:hover{background:#1a6fc4;}"
    )
    return b


def line_edit(placeholder: str = "", height: int = 28) -> QLineEdit:
    e = QLineEdit()
    e.setPlaceholderText(placeholder)
    e.setFixedHeight(height)
    e.setStyleSheet(INPUT_SS)
    return e


def combo(items: list, height: int = 28) -> QComboBox:
    c = QComboBox()
    c.setFixedHeight(height)
    c.setStyleSheet(COMBO_SS)
    for label, data in items:
        c.addItem(label, data)
    return c


def date_edit(value=None, height: int = 28, allow_empty: bool = True) -> QDateEdit:
    d = QDateEdit()
    d.setCalendarPopup(True)
    d.setDisplayFormat("dd/MM/yyyy")
    d.setFixedHeight(height)
    d.setStyleSheet(DATE_SS)
    d.setSpecialValueText("—")
    d.setMinimumDate(QDate(1900, 1, 1))
    if value:
        d.setDate(QDate(value.year, value.month, value.day))
    elif allow_empty:
        d.setDate(d.minimumDate())
    return d


def qdate_to_date(qd: QDate):
    from datetime import date as _date
    if not qd.isValid() or qd == QDate(1900, 1, 1):
        return None
    return _date(qd.year(), qd.month(), qd.day())


def tag(text: str, color: str, bg: str = "#2c2c2c", size: int = 11) -> QLabel:
    lbl = QLabel(text)
    lbl.setAlignment(Qt.AlignCenter)
    lbl.setStyleSheet(
        f"color:{color};background:{bg};border:none;border-radius:5px;"
        f"font-size:{size}px;padding:3px 9px;"
    )
    return lbl


def hline() -> QFrame:
    f = QFrame()
    f.setFixedHeight(1)
    f.setAttribute(Qt.WA_StyledBackground, True)
    f.setStyleSheet(f"background:{BORDER};border:none;")
    return f


def vline() -> QFrame:
    f = QFrame()
    f.setFixedWidth(1)
    f.setAttribute(Qt.WA_StyledBackground, True)
    f.setStyleSheet(f"background:{BORDER};border:none;")
    return f
