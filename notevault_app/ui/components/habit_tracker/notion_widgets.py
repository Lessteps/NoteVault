"""
Shared Notion-style widgets for the Habit Tracker views.
Palette and primitives replicated from the reference layouts.
"""

from PySide6.QtWidgets import (
    QWidget, QFrame, QLabel, QPushButton, QHBoxLayout, QVBoxLayout, QLineEdit,
)
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont

# ── Palette ───────────────────────────────────────────────────────────────
BG_PAGE     = "#191919"
BG_CARD     = "#202020"
BG_PILL     = "#2c2c2c"
BORDER      = "#2f2f2f"
TEXT        = "#e6e6e6"
TEXT_DIM    = "#9b9b9b"
TEXT_FAINT  = "#6f6f6f"
BLOCK_EMPTY = "#c9c9cf"
BLOCK_FILL  = "#4ade80"
BLUE        = "#2383e2"

# ── Table column widths ───────────────────────────────────────────────────
COL_DATE   = 175
COL_PROG   = 205
COL_HABIT  = 34
COL_MONTH  = 130
COL_NOTES  = 200

BLOCKS = 10
ROW_H  = 38
HEAD_H = 32


class ProgressBlocks(QWidget):
    """Ten square blocks followed by a percentage, as in the reference."""

    def __init__(self, pct: float = 0.0, parent=None):
        super().__init__(parent)
        lay = QHBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(2)

        self._blocks = []
        for _ in range(BLOCKS):
            b = QFrame()
            b.setFixedSize(11, 11)
            self._blocks.append(b)
            lay.addWidget(b)

        lay.addSpacing(7)
        self._pct = QLabel()
        self._pct.setFixedWidth(34)
        self._pct.setStyleSheet(
            f"color:{TEXT_DIM};font-size:11px;background:transparent;border:none;"
        )
        lay.addWidget(self._pct)
        lay.addStretch()

        self.set_pct(pct)

    def set_pct(self, pct: float):
        pct = max(0.0, min(1.0, pct))
        filled = round(pct * BLOCKS)
        for i, b in enumerate(self._blocks):
            color = BLOCK_FILL if i < filled else BLOCK_EMPTY
            b.setStyleSheet(f"background:{color}; border-radius:2px;")
        self._pct.setText(f"{int(round(pct * 100))}%")


class NotionCheck(QPushButton):
    """Square checkbox: empty outline when off, blue tick when on."""

    toggled_habit = Signal(bool)

    def __init__(self, checked: bool = False, parent=None):
        super().__init__(parent)
        self.setCheckable(True)
        self.setChecked(checked)
        self.setFixedSize(16, 16)
        self.setCursor(Qt.PointingHandCursor)
        self._sync()
        self.clicked.connect(self._on_click)

    def _on_click(self):
        self._sync()
        self.toggled_habit.emit(self.isChecked())

    def _sync(self):
        if self.isChecked():
            self.setText("✓")
            self.setStyleSheet(
                f"QPushButton{{background:{BLUE};border:1px solid {BLUE};"
                f"border-radius:3px;color:#ffffff;font-size:10px;font-weight:700;}}"
            )
        else:
            self.setText("")
            self.setStyleSheet(
                "QPushButton{background:transparent;border:1px solid #6a6a72;"
                "border-radius:3px;}"
                f"QPushButton:hover{{border-color:{BLUE};"
                "background:rgba(35,131,226,0.12);}"
            )


class SectionHeader(QWidget):
    """Calendar glyph + large bold title, as at the top of each reference card."""

    def __init__(self, icon: str, title: str, parent=None):
        super().__init__(parent)
        lay = QHBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(9)

        ico = QLabel(icon)
        ico.setStyleSheet(
            f"font-size:15px;color:{TEXT_DIM};background:transparent;border:none;"
        )
        lay.addWidget(ico)

        self._title = QLabel(title)
        self._title.setStyleSheet(
            f"font-size:21px;font-weight:700;color:{TEXT};"
            "background:transparent;border:none;"
        )
        lay.addWidget(self._title)
        lay.addStretch()

        self.row = lay

    def set_title(self, text: str):
        self._title.setText(text)


class ViewPill(QLabel):
    """The small rounded 'Table' / 'Gallery view' tab under the title."""

    def __init__(self, icon: str, text: str, parent=None):
        super().__init__(f"{icon}  {text}", parent)
        self.setFixedHeight(26)
        self.setAlignment(Qt.AlignCenter)
        self.setStyleSheet(
            f"background:{BG_PILL};color:{TEXT};font-size:12px;"
            "border:none;border-radius:6px;padding:0 12px;"
        )


class NavButton(QPushButton):
    def __init__(self, text: str, parent=None):
        super().__init__(text, parent)
        self.setFixedHeight(26)
        self.setCursor(Qt.PointingHandCursor)
        self.setStyleSheet(
            f"QPushButton{{background:transparent;border:1px solid {BORDER};"
            f"border-radius:6px;color:{TEXT_DIM};font-size:11px;padding:0 10px;}}"
            f"QPushButton:hover{{background:{BG_PILL};color:{TEXT};}}"
        )


def card_frame() -> QFrame:
    """The rounded dark container that wraps each view."""
    f = QFrame()
    f.setObjectName("notionCard")
    f.setStyleSheet(
        f"#notionCard{{background:{BG_CARD};border-radius:12px;}}"
    )
    return f


def table_row(separator: bool = True, height: int = ROW_H):
    """Returns (widget, hbox) for one table row with a bottom hairline."""
    w = QFrame()
    w.setAttribute(Qt.WA_StyledBackground, True)
    w.setFixedHeight(height)
    border = f"border-bottom:1px solid {BORDER};" if separator else ""
    w.setStyleSheet(f"QFrame{{background:transparent;{border}}}")
    lay = QHBoxLayout(w)
    lay.setContentsMargins(0, 0, 0, 0)
    lay.setSpacing(0)
    return w, lay


def vsep() -> QFrame:
    """Thin vertical divider between table columns."""
    f = QFrame()
    f.setFixedWidth(1)
    f.setAttribute(Qt.WA_StyledBackground, True)
    f.setStyleSheet(f"background:{BORDER};border:none;")
    return f


def check_container(widget: QWidget) -> QWidget:
    """Centers a checkbox inside a habit column without painting a background."""
    box = QWidget()
    box.setAttribute(Qt.WA_StyledBackground, True)
    box.setFixedWidth(COL_HABIT)
    box.setStyleSheet("background:transparent;")
    lay = QHBoxLayout(box)
    lay.setContentsMargins(0, 0, 0, 0)
    lay.setAlignment(Qt.AlignCenter)
    lay.addWidget(widget)
    return box


def cell(text: str, width: int, align=Qt.AlignLeft, color: str = TEXT,
         size: int = 12, bold: bool = False) -> QLabel:
    lbl = QLabel(text)
    if width > 0:
        lbl.setFixedWidth(width)
    lbl.setAlignment(align | Qt.AlignVCenter)
    lbl.setStyleSheet(
        f"color:{color};font-size:{size}px;"
        f"font-weight:{'600' if bold else '400'};"
        "background:transparent;border:none;"
    )
    return lbl


def notes_edit(text: str) -> QLineEdit:
    e = QLineEdit(text)
    e.setPlaceholderText("")
    e.setMinimumWidth(COL_NOTES)
    e.setStyleSheet(
        f"QLineEdit{{background:transparent;border:none;color:{TEXT_DIM};"
        "font-size:12px;padding:0 4px;}"
        f"QLineEdit:focus{{background:#262626;border-radius:4px;color:{TEXT};}}"
    )
    return e


def letter_spaced(text: str, size: int, spacing: float, color: str) -> QLabel:
    lbl = QLabel(text)
    lbl.setAlignment(Qt.AlignCenter)
    f = lbl.font()
    f.setPointSizeF(size)
    f.setLetterSpacing(QFont.AbsoluteSpacing, spacing)
    lbl.setFont(f)
    lbl.setStyleSheet(f"color:{color};background:transparent;border:none;")
    return lbl
