"""
Building blocks shared by Metas, Proyectos and Finanzas.

Every component fixes its own size and font in its own stylesheet: the global
QSS sets min-width on buttons and a monospace font on inputs, which would
otherwise leak into them.
"""

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QLabel, QLayout, QWidget

from ..tareas.tareas_common import (   # noqa: F401  (re-exported palette)
    BG_PAGE, BG_CARD, BG_ROW, BG_ROW_ALT, BG_HEAD, BORDER, TEXT, TEXT_DIM,
    TEXT_FAINT, BLUE, GREEN, ORANGE, RED, STAR, INPUT_SS,
    flat_btn, primary_btn, combo, hline, vline,
)
from ..tareas.tareas_common import line_edit as _line_edit

UI_FONT = "'Segoe UI Variable Text','Segoe UI',sans-serif"


CHECK_SS = (
    f"QCheckBox{{color:{TEXT};font-size:12px;spacing:8px;background:transparent;font-family:{UI_FONT};}}"
    "QCheckBox::indicator{width:15px;height:15px;border:1px solid #6a6a72;border-radius:3px;"
    "background:transparent;}"
    f"QCheckBox::indicator:checked{{background:{BLUE};border-color:{BLUE};}}")


def line_edit(placeholder: str = "", height: int = 28):
    """The Tareas input, with the UI font instead of the global monospace one."""
    e = _line_edit(placeholder, height)
    e.setStyleSheet(INPUT_SS.replace("font-size:12px;", f"font-size:12px;font-family:{UI_FONT};"))
    return e
PURPLE = "#a78bfa"
TEAL = "#2dd4bf"
YELLOW = "#eab308"

PRIORITY_NAMES = {1: "Baja", 2: "Media", 3: "Alta", 4: "Urgente"}
PRIORITY_COLOURS = {1: "#8b8b96", 2: "#2383e2", 3: "#ff9632", 4: "#f2555a"}
PRIORITY_GLYPHS = {1: "▽", 2: "=", 3: "△", 4: "⏫"}

AREA_COLOURS = ("#3f51b5", "#8e24aa", "#33b679", "#f6bf26", "#e67c73",
                "#039be5", "#f4511e", "#0b8043", "#7986cb", "#616161")


def label(text: str = "", colour: str = TEXT, size: int = 12, bold: bool = False,
          wrap: bool = False) -> QLabel:
    lbl = QLabel(text)
    lbl.setWordWrap(wrap)
    lbl.setStyleSheet(
        f"color:{colour};font-size:{size}px;font-weight:{'600' if bold else '400'};"
        f"background:transparent;border:none;font-family:{UI_FONT};")
    return lbl


def chip(text: str, colour: str = TEXT_DIM, bg: str = "#252525", size: int = 10) -> QLabel:
    lbl = QLabel(text)
    lbl.setAlignment(Qt.AlignCenter)
    lbl.setStyleSheet(
        f"color:{colour};background:{bg};border:none;border-radius:4px;"
        f"font-size:{size}px;padding:1px 6px;font-family:{UI_FONT};")
    return lbl


def priority_chip(priority: int) -> QLabel:
    p = max(1, min(4, int(priority or 2)))
    return chip(f"{PRIORITY_GLYPHS[p]} {PRIORITY_NAMES[p]}", PRIORITY_COLOURS[p])


def clear_layout(layout: QLayout):
    """Remove and destroy everything in a layout, hiding widgets first so they
    are not painted again before Qt processes the deletion."""
    while layout.count():
        item = layout.takeAt(0)
        w = item.widget()
        if w is not None:
            w.hide()
            w.deleteLater()
        elif item.layout() is not None:
            clear_layout(item.layout())


def transparent(widget: QWidget) -> QWidget:
    widget.setStyleSheet("background:transparent;border:none;")
    return widget


def fmt_day(d) -> str:
    return d.strftime("%d/%m/%Y") if d else "—"


def fmt_short(d) -> str:
    months = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
    return f"{d.day} {months[d.month - 1]}" if d else "—"
