"""Cards, progress blocks, stat tiles and pickers shared by the new modules."""

import re
from typing import Optional

from PySide6.QtCore import Qt, Signal, QRectF, QSize
from PySide6.QtGui import QColor, QPainter
from PySide6.QtWidgets import (
    QFrame, QWidget, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit, QListWidget,
    QListWidgetItem, QComboBox, QDialog, QPushButton, QGridLayout,
)

from ... import theme
from . import (
    BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, GREEN, RED, UI_FONT,
    PRIORITY_NAMES, PRIORITY_COLOURS, PRIORITY_GLYPHS, AREA_COLOURS,
    label, combo, flat_btn, primary_btn, line_edit,
)


class DashboardCard(QFrame):
    """Rounded card with a coloured top border; the whole card is clickable."""

    clicked = Signal()

    def __init__(self, accent: str = BLUE, clickable: bool = True, parent=None):
        super().__init__(parent)
        self.setObjectName("dashCardC")
        self.setAttribute(Qt.WA_StyledBackground, True)
        self._clickable = clickable
        if clickable:
            self.setCursor(Qt.PointingHandCursor)
        self.set_accent(accent)
        self.body = QVBoxLayout(self)
        self.body.setContentsMargins(16, 13, 16, 14)
        self.body.setSpacing(8)

    def set_accent(self, accent: str):
        hover = f"QFrame#dashCardC:hover{{border-color:{accent};}}" if self._clickable else ""
        self.setStyleSheet(
            f"QFrame#dashCardC{{background:{BG_CARD};border:1px solid {BORDER};"
            f"border-top:3px solid {accent};border-radius:10px;}}" + hover)

    def mouseReleaseEvent(self, event):
        if self._clickable and event.button() == Qt.LeftButton \
                and self.rect().contains(event.position().toPoint()):
            self.clicked.emit()
        super().mouseReleaseEvent(event)


class BlockProgress(QWidget):
    """Square blocks, filled up to the fraction, with an optional percentage."""

    def __init__(self, fraction: float = 0.0, colour: str = GREEN, blocks: int = 10,
                 block: int = 11, show_pct: bool = True, parent=None):
        super().__init__(parent)
        self._fraction = 0.0
        self._colour = colour
        self._blocks = blocks
        self._block = block
        self._show_pct = show_pct
        self.setFixedHeight(block + 4)
        self.setMinimumWidth(self._bar_width() + (44 if show_pct else 0))
        self.set_fraction(fraction)

    def _bar_width(self) -> int:
        return self._blocks * (self._block + 2)

    def sizeHint(self):
        return QSize(self._bar_width() + (44 if self._show_pct else 0), self._block + 4)

    def set_fraction(self, fraction: float, colour: Optional[str] = None):
        self._fraction = max(0.0, min(1.0, float(fraction or 0)))
        if colour:
            self._colour = colour
        self.setToolTip(f"{round(self._fraction * 100)} %")
        self.update()

    def paintEvent(self, _event):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        filled = round(self._fraction * self._blocks)
        y = (self.height() - self._block) / 2
        for i in range(self._blocks):
            colour = self._colour if i < filled else "#c9c9cf"
            p.setPen(Qt.NoPen)
            p.setBrush(QColor(theme.tint(colour)))
            if i >= filled:
                p.setOpacity(0.35 if not theme.is_light() else 1.0)
            else:
                p.setOpacity(1.0)
            p.drawRoundedRect(QRectF(i * (self._block + 2), y, self._block, self._block), 2, 2)
        p.setOpacity(1.0)
        if self._show_pct:
            p.setPen(QColor(theme.tint(TEXT_DIM)))
            f = p.font()
            f.setPixelSize(11)
            p.setFont(f)
            p.drawText(QRectF(self._bar_width() + 6, 0, 40, self.height()),
                       Qt.AlignVCenter | Qt.AlignLeft, f"{round(self._fraction * 100)}%")


class StatTile(QFrame):
    """A big number, a caption and an optional small delta line."""

    def __init__(self, value: str = "—", caption: str = "", colour: str = TEXT,
                 delta: str = "", delta_colour: str = TEXT_FAINT, parent=None):
        super().__init__(parent)
        self.setObjectName("statTile")
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.setStyleSheet(
            f"QFrame#statTile{{background:{BG_CARD};border:1px solid {BORDER};border-radius:10px;}}")
        self.setMinimumWidth(120)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(14, 10, 14, 10)
        lay.setSpacing(1)
        self.value = label(value, colour, 22, True)
        self.caption = label(caption.upper(), TEXT_FAINT, 10)
        self.delta = label(delta, delta_colour, 10)
        lay.addWidget(self.value)
        lay.addWidget(self.caption)
        lay.addWidget(self.delta)
        self.delta.setVisible(bool(delta))

    def set(self, value: str, colour: Optional[str] = None, delta: Optional[str] = None,
            delta_colour: str = TEXT_FAINT):
        self.value.setText(value)
        if colour:
            self.value.setStyleSheet(
                f"color:{colour};font-size:22px;font-weight:600;background:transparent;"
                f"border:none;font-family:{UI_FONT};")
        if delta is not None:
            self.delta.setText(delta)
            self.delta.setStyleSheet(
                f"color:{delta_colour};font-size:10px;background:transparent;border:none;"
                f"font-family:{UI_FONT};")
            self.delta.setVisible(bool(delta))


class Check(QPushButton):
    """Empty square checkbox that fills with a tick, like Hábitos."""

    toggled_by_user = Signal(bool)

    def __init__(self, checked: bool = False, colour: str = BLUE, size: int = 16, parent=None):
        super().__init__(parent)
        self._colour = colour
        self.setCheckable(True)
        self.setChecked(checked)
        self.setFixedSize(size, size)
        self.setCursor(Qt.PointingHandCursor)
        self.clicked.connect(self._clicked)
        self._sync()

    def _clicked(self):
        self._sync()
        self.toggled_by_user.emit(self.isChecked())

    def set_checked(self, value: bool):
        self.setChecked(value)
        self._sync()

    def _sync(self):
        c = self._colour
        if self.isChecked():
            self.setText("✓")
            self.setStyleSheet(
                f"QPushButton{{background:{c};border:1px solid {c};border-radius:3px;color:#ffffff;"
                "font-size:10px;font-weight:700;padding:0px;min-width:0px;}")
        else:
            self.setText("")
            self.setStyleSheet(
                "QPushButton{background:transparent;border:1px solid #6a6a72;border-radius:3px;"
                "padding:0px;min-width:0px;}"
                f"QPushButton:hover{{border-color:{c};}}")


# ── Pickers ───────────────────────────────────────────────────────────────

def priority_combo(value: int = 2, height: int = 30) -> QComboBox:
    box = combo([(f"{PRIORITY_GLYPHS[p]}  {PRIORITY_NAMES[p]}", p) for p in (1, 2, 3, 4)],
                height=height)
    box.setCurrentIndex(max(0, box.findData(int(value or 2))))
    return box


def area_combo(area_mgr, value: str = "", height: int = 30, with_all: bool = False) -> QComboBox:
    items = [("Todas las áreas", "*")] if with_all else []
    items.append(("Sin área", ""))
    if area_mgr is not None:
        items += [(f"{a['icon']}  {a['name']}".strip(), a["id"]) for a in area_mgr.areas()]
    box = combo(items, height=height)
    box.setCurrentIndex(max(0, box.findData(value or "")))
    return box


class HabitLinkPicker(QWidget):
    """Checklist of habits; the ones in the given area come first."""

    changed = Signal()

    def __init__(self, habit_mgr, area: str = "", selected=(), parent=None):
        super().__init__(parent)
        self.habit_mgr = habit_mgr
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(4)
        self.hint = label("", TEXT_FAINT, 11, wrap=True)
        lay.addWidget(self.hint)
        self.list = QListWidget()
        self.list.setFixedHeight(150)
        self.list.setStyleSheet(
            f"QListWidget{{background:#1c1c1c;border:1px solid {BORDER};border-radius:6px;"
            f"color:{TEXT};font-size:12px;font-family:{UI_FONT};outline:none;}}"
            "QListWidget::item{padding:3px 4px;}"
            "QListWidget::indicator{width:14px;height:14px;border:1px solid #6a6a72;border-radius:3px;"
            "background:transparent;}"
            f"QListWidget::indicator:checked{{background:{BLUE};border-color:{BLUE};}}"
            "QListWidget::item:selected{background:transparent;color:" + TEXT + ";}")
        self.list.itemChanged.connect(lambda _i: self.changed.emit())
        lay.addWidget(self.list)
        self.set_area(area, selected)

    def set_area(self, area: str, selected=None):
        chosen = set(self.selected() if selected is None else selected)
        self.list.blockSignals(True)
        self.list.clear()
        habits = self.habit_mgr.habits() if self.habit_mgr is not None else []
        same = [h for h in habits if area and h.get("area") == area]
        rest = [h for h in habits if h not in same]
        for group, suffix in ((same, "  · misma área"), (rest, "")):
            for h in group:
                item = QListWidgetItem(f"{h.get('icon', '')}  {h['name']}{suffix}")
                item.setData(Qt.UserRole, h["id"])
                item.setFlags(Qt.ItemIsEnabled | Qt.ItemIsUserCheckable)
                item.setCheckState(Qt.Checked if h["id"] in chosen else Qt.Unchecked)
                self.list.addItem(item)
        self.list.blockSignals(False)
        if not habits:
            self.hint.setText("No hay hábitos todavía.")
        elif area and not same:
            self.hint.setText("Ningún hábito tiene esta área; asígnala en el editor de hábitos "
                              "para verlos primero.")
        else:
            self.hint.setText("Al completar la submeta se marcan estos hábitos ese día.")

    def selected(self) -> list:
        out = []
        for i in range(self.list.count()):
            item = self.list.item(i)
            if item.checkState() == Qt.Checked:
                out.append(item.data(Qt.UserRole))
        return out


# ── Money ─────────────────────────────────────────────────────────────────

def parse_money(text: str) -> Optional[int]:
    """'12.500', '12500', '12,5k', '$ 1.200.000', '3,5M', '12500,50' -> cents."""
    t = (text or "").strip().lower().replace("$", "").replace("cop", "").replace(" ", "")
    if not t:
        return None
    mult = 1
    if t.endswith("k"):
        mult, t = 1_000, t[:-1]
    elif t.endswith("m"):
        mult, t = 1_000_000, t[:-1]
    if not re.fullmatch(r"[\d.,]+", t):
        return None
    if mult > 1:
        value = float(t.replace(",", ".")) if t.count(",") + t.count(".") <= 1 else None
        if value is None:
            return None
        return int(round(value * mult * 100))
    # Thousands use "." in Spanish; a trailing ",dd" is cents.
    m = re.fullmatch(r"([\d.]+)(?:,(\d{1,2}))?", t)
    if m and (m.group(1).count(".") == 0 or re.fullmatch(r"\d{1,3}(\.\d{3})+", m.group(1))):
        whole = int(m.group(1).replace(".", ""))
        cents = int((m.group(2) or "0").ljust(2, "0"))
        return whole * 100 + cents
    m = re.fullmatch(r"(\d+)\.(\d{1,2})", t)          # 12.5 typed English-style
    if m:
        return int(m.group(1)) * 100 + int(m.group(2).ljust(2, "0"))
    m = re.fullmatch(r"\d{1,3}(,\d{3})+", t)            # 12,500
    if m:
        return int(t.replace(",", "")) * 100
    return None


def format_money(cents: int, currency: str = "COP", sign: bool = False) -> str:
    cents = int(cents or 0)
    neg = cents < 0
    cents = abs(cents)
    if currency == "COP":
        whole = round(cents / 100)
        text = f"{whole:,}".replace(",", ".")
    else:
        whole, rest = divmod(cents, 100)
        text = f"{whole:,}".replace(",", ".") + f",{rest:02d}"
    prefix = "-" if neg else ("+" if sign and cents else "")
    return f"{prefix}$ {text}"


class MoneyEdit(QLineEdit):
    """Amount field that accepts 12.500, 12500 or 12,5k and shows $ 12.500."""

    value_changed = Signal(object)    # cents or None

    def __init__(self, cents: Optional[int] = None, currency: str = "COP", height: int = 32,
                 placeholder: str = "$ 0", parent=None):
        super().__init__(parent)
        self.currency = currency
        self._cents = cents
        self.setFixedHeight(height)
        self.setPlaceholderText(placeholder)
        self.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
        self.setStyleSheet(
            f"QLineEdit{{background:#252525;border:1px solid {BORDER};border-radius:6px;"
            f"color:{TEXT};font-size:14px;font-weight:600;padding:0 10px;font-family:{UI_FONT};}}"
            f"QLineEdit:focus{{border-color:{BLUE};}}")
        self.editingFinished.connect(self._commit)
        if cents is not None:
            self.setText(format_money(cents, currency))

    def cents(self) -> Optional[int]:
        self._commit()
        return self._cents

    def set_cents(self, cents: Optional[int]):
        self._cents = cents
        self.setText(format_money(cents, self.currency) if cents is not None else "")

    def _commit(self):
        value = parse_money(self.text())
        if value is None and self.text().strip():
            self.setStyleSheet(self.styleSheet().replace(f"border:1px solid {BORDER}",
                                                         f"border:1px solid {RED}"))
            return
        self.setStyleSheet(self.styleSheet().replace(f"border:1px solid {RED}",
                                                     f"border:1px solid {BORDER}"))
        if value != self._cents:
            self._cents = value
            self.value_changed.emit(value)
        if value is not None:
            self.setText(format_money(value, self.currency))


# ── Small dialogs ─────────────────────────────────────────────────────────

class FormDialog(QDialog):
    """Dark dialog with a title, a grid of labelled fields and Guardar/Cancelar."""

    def __init__(self, title: str, parent=None, width: int = 460):
        super().__init__(parent)
        self.setWindowTitle(title)
        self.setMinimumWidth(width)
        self.setStyleSheet(f"QDialog{{background:{BG_CARD};}}")
        self.outer = QVBoxLayout(self)
        self.outer.setContentsMargins(20, 18, 20, 16)
        self.outer.setSpacing(12)
        self.outer.addWidget(label(title, TEXT, 16, True))
        self.grid = QGridLayout()
        self.grid.setHorizontalSpacing(12)
        self.grid.setVerticalSpacing(8)
        self.grid.setColumnStretch(1, 1)
        self.outer.addLayout(self.grid)
        self._row = 0
        self.buttons = QHBoxLayout()
        self.buttons.setSpacing(8)
        self.buttons.addStretch()
        cancel = flat_btn("Cancelar", height=32)
        cancel.clicked.connect(self.reject)
        self.ok = primary_btn("Guardar", height=32)
        self.ok.clicked.connect(self.accept)
        self.buttons.addWidget(cancel)
        self.buttons.addWidget(self.ok)

    def add_row(self, caption: str, widget: QWidget):
        cap = label(caption, TEXT_DIM, 12)
        cap.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
        self.grid.addWidget(cap, self._row, 0)
        self.grid.addWidget(widget, self._row, 1)
        self._row += 1
        return widget

    def add_wide(self, widget: QWidget):
        self.grid.addWidget(widget, self._row, 0, 1, 2)
        self._row += 1
        return widget

    def finish(self):
        self.outer.addStretch()
        self.outer.addLayout(self.buttons)


class ColourPicker(QWidget):
    changed = Signal(str)

    def __init__(self, value: str = AREA_COLOURS[0], colours=AREA_COLOURS, parent=None):
        super().__init__(parent)
        lay = QHBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(4)
        self._buttons = []
        for c in colours:
            b = QPushButton()
            b.setCheckable(True)
            b.setFixedSize(22, 22)
            b.setCursor(Qt.PointingHandCursor)
            b.setProperty("colour", c)
            b.clicked.connect(lambda _c=False, col=c: self.set_value(col, True))
            self._buttons.append(b)
            lay.addWidget(b)
        lay.addStretch()
        self.set_value(value)

    def set_value(self, colour: str, emit: bool = False):
        self._value = colour
        for b in self._buttons:
            c = b.property("colour")
            on = c.lower() == (colour or "").lower()
            b.setChecked(on)
            b.setStyleSheet(
                f"QPushButton{{background:{c};border:{'2px solid ' + TEXT if on else 'none'};"
                "border-radius:11px;min-width:0px;padding:0px;}")
        if emit:
            self.changed.emit(colour)

    def value(self) -> str:
        return self._value


def icon_edit(value: str = "", placeholder: str = "🎯") -> QLineEdit:
    e = line_edit(placeholder, height=30)
    e.setMaxLength(4)
    e.setFixedWidth(60)
    e.setAlignment(Qt.AlignCenter)
    e.setText(value)
    return e
