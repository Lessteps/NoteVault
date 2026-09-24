"""Palette and small widgets of the Estudio sub-bar (same look as the practice view)."""

import html
import re

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QFrame, QLabel, QPushButton, QScrollArea, QSizePolicy, QVBoxLayout, QWidget,
)

from ... import theme
from ....core.practice.discipline_catalog import DISCIPLINES, skill_of
from ....core.practice.modes import MODES

BG_PAGE = "#1a1a1e"
BG_CARD = "#202024"
BORDER = "#33333e"
TEXT = "#dcdde0"
TEXT_DIM = "#888895"
TEXT_FAINT = "#666672"
ACCENT = "#7c5af0"
ACCENT_SOFT = "#bca6f7"
GREEN = "#3fb950"
AMBER = "#e0a13a"
RED = "#f2555a"
TEAL = "#2dd4bf"
UI_FONT = "'Segoe UI Variable Text','Segoe UI',sans-serif"

SUBJECT_LABELS = {
    "mathematics": "Matemáticas", "programming": "Programación",
    "english": "Inglés", "general": "General",
}
STATUS_COLOURS = {"not_started": TEXT_FAINT, "practicing": AMBER, "consolidated": GREEN}


def rgba(hexa: str, alpha: float) -> str:
    h = theme.tint(hexa).lstrip("#")
    return f"rgba({int(h[0:2], 16)},{int(h[2:4], 16)},{int(h[4:6], 16)},{alpha})"


def esc(text) -> str:
    return html.escape(str(text or ""))


_CODE_RE = re.compile(r"`([^`]+)`")
_BOLD_RE = re.compile(r"\*\*([^*]+)\*\*")


def inline(text) -> str:
    out = esc(text)
    out = _CODE_RE.sub(
        lambda m: (f"<span style=\"font-family:{theme.CODE_FONT_FAMILY};"
                   f"background:{theme.tint('#2a2a32')};\">&nbsp;{m.group(1)}&nbsp;</span>"), out)
    return _BOLD_RE.sub(r"<b>\1</b>", out).replace("\n", "<br>")


def card(name: str = "estudioCard") -> QFrame:
    f = QFrame()
    f.setObjectName(name)
    f.setAttribute(Qt.WA_StyledBackground, True)
    f.setStyleSheet(
        f"QFrame#{name}{{background:{BG_CARD};border:1px solid {BORDER};border-radius:10px;}}")
    return f


def section(text: str) -> QLabel:
    lbl = QLabel(text.upper())
    lbl.setStyleSheet(
        f"color:{TEXT_DIM};font-size:10px;font-weight:700;letter-spacing:1px;padding-top:6px;"
        f"background:transparent;border:none;font-family:{UI_FONT};")
    return lbl


def label(text: str = "", colour: str = TEXT, size: int = 12, bold: bool = False,
          wrap: bool = False, rich: bool = False) -> QLabel:
    lbl = QLabel(text)
    lbl.setWordWrap(wrap)
    if rich:
        lbl.setTextFormat(Qt.RichText)
    lbl.setStyleSheet(
        f"color:{colour};font-size:{size}px;font-weight:{'700' if bold else '400'};"
        f"background:transparent;border:none;font-family:{UI_FONT};")
    return lbl


def badge(text: str, colour: str) -> QLabel:
    lbl = QLabel(text.upper())
    lbl.setAlignment(Qt.AlignCenter)
    lbl.setSizePolicy(QSizePolicy.Fixed, QSizePolicy.Fixed)
    lbl.setStyleSheet(
        f"color:{colour};background:{rgba(colour, 0.15)};border:none;border-radius:4px;"
        f"font-size:9px;font-weight:700;letter-spacing:0.6px;padding:2px 7px;"
        f"font-family:{UI_FONT};")
    return lbl


def primary(text: str, height: int = 32) -> QPushButton:
    b = QPushButton(text)
    b.setCursor(Qt.PointingHandCursor)
    b.setFixedHeight(height)
    b.setStyleSheet(
        f"QPushButton{{background:{ACCENT};border:none;border-radius:7px;color:#ffffff;"
        f"font-size:12px;font-weight:600;padding:0 14px;min-width:0px;font-family:{UI_FONT};}}"
        "QPushButton:hover{background:#6a48e0;}"
        "QPushButton:disabled{background:#383844;color:#888895;}")
    return b


def ghost(text: str, height: int = 28) -> QPushButton:
    b = QPushButton(text)
    b.setCursor(Qt.PointingHandCursor)
    b.setFixedHeight(height)
    b.setStyleSheet(
        f"QPushButton{{background:transparent;border:1px solid {BORDER};border-radius:7px;"
        f"color:{TEXT};font-size:12px;padding:0 12px;min-width:0px;font-family:{UI_FONT};}}"
        f"QPushButton:hover{{border-color:{ACCENT};color:{ACCENT_SOFT};}}"
        "QPushButton:disabled{color:#55555f;border-color:#2e2e38;}")
    return b


def scroll_column(owner: QWidget, margins=(10, 8, 10, 16), spacing: int = 8) -> QVBoxLayout:
    """Fill owner with a vertical scroll area; return the layout of its content."""
    root = QVBoxLayout(owner)
    root.setContentsMargins(0, 0, 0, 0)
    scroll = QScrollArea()
    scroll.setWidgetResizable(True)
    scroll.setFrameShape(QFrame.NoFrame)
    scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
    scroll.setStyleSheet(
        f"QScrollArea{{background:{BG_PAGE};border:none;}}"
        "QScrollBar:vertical{width:7px;background:transparent;}"
        f"QScrollBar::handle:vertical{{background:{BORDER};border-radius:3px;min-height:30px;}}"
        "QScrollBar::add-line:vertical,QScrollBar::sub-line:vertical{height:0px;}")
    root.addWidget(scroll)
    body = QWidget()
    body.setObjectName("estudioScrollBody")
    body.setStyleSheet(f"QWidget#estudioScrollBody{{background:{BG_PAGE};}}")
    scroll.setWidget(body)
    col = QVBoxLayout(body)
    col.setContentsMargins(*margins)
    col.setSpacing(spacing)
    owner._scroll = scroll
    return col


class ElidedLabel(QLabel):
    """A one-line label that shortens its text with «…» to the width it gets."""

    def __init__(self, text: str = "", colour: str = TEXT, size: int = 12, bold: bool = False):
        super().__init__()
        self._full = text
        self.setToolTip(text)
        self.setMinimumWidth(20)
        self.setSizePolicy(QSizePolicy.Ignored, QSizePolicy.Preferred)
        self.setStyleSheet(
            f"color:{colour};font-size:{size}px;font-weight:{'700' if bold else '400'};"
            f"background:transparent;border:none;font-family:{UI_FONT};")
        super().setText(text)

    def set_full_text(self, text: str):
        self._full = text
        self.setToolTip(text)
        self._elide()

    def _elide(self):
        metrics = self.fontMetrics()
        super().setText(metrics.elidedText(self._full, Qt.ElideRight, max(0, self.width())))

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._elide()


def clear(layout):
    while layout.count():
        item = layout.takeAt(0)
        w = item.widget()
        if w is not None:
            w.hide()
            w.deleteLater()
        elif item.layout() is not None:
            clear(item.layout())


def short_title(title: str) -> str:
    """Skill titles carry their detail in parentheses; lists show the name only."""
    return title.split(" (")[0].strip() or title


def skill_text(discipline: str, code: str, short: bool = True) -> str:
    disc = DISCIPLINES.get(discipline)
    skill = skill_of(disc, code) if disc else None
    if skill:
        return f"{skill.code} {short_title(skill.title) if short else skill.title}"
    return code or "Sin skill"


def exercise_meta(ex) -> str:
    disc = DISCIPLINES.get(ex.discipline)
    mode = MODES.get(ex.mode)
    parts = [disc.title if disc else ex.discipline]
    if ex.skill:
        parts.append(skill_text(ex.discipline, ex.skill))
    parts.append(mode.label if mode else ex.mode)
    parts.append("★" * ex.difficulty + "☆" * (5 - ex.difficulty))
    return " · ".join(parts)
