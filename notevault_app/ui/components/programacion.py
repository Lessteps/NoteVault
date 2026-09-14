"""
Scheduling controls shared by Hábitos, Tareas and Calendario: how often
something repeats, between which dates, at what hour, for how long, with
which reminder and colour.
"""

from datetime import date
from typing import Optional

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor, QPainter
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel, QPushButton,
    QSpinBox,
)

from ..components.tareas.tareas_common import (
    BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, combo,
)
from ..components.tareas.date_picker import DateButton
from ...core.recurrence import (
    Recurrence, NONE, DAILY, WEEKLY, EVERY, MONTHLY, WORKDAYS, WEEKEND, ALL_DAYS,
)

DAY_LETTERS = ("L", "M", "X", "J", "V", "S", "D")
DAY_NAMES = ("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo")

GCAL_COLOURS = (
    ("#d50000", "Tomate"), ("#e67c73", "Flamenco"), ("#f4511e", "Mandarina"),
    ("#f6bf26", "Plátano"), ("#33b679", "Salvia"), ("#0b8043", "Albahaca"),
    ("#039be5", "Pavo real"), ("#3f51b5", "Arándano"), ("#7986cb", "Lavanda"),
    ("#8e24aa", "Uva"), ("#616161", "Grafito"),
)

REMINDER_CHOICES = (
    ("Sin aviso", None), ("A la hora exacta", 0), ("5 minutos antes", 5),
    ("10 minutos antes", 10), ("15 minutos antes", 15), ("30 minutos antes", 30),
    ("1 hora antes", 60),
)

DURATION_CHOICES = (15, 30, 45, 60, 90, 120, 180, 240)


def small_label(text: str) -> QLabel:
    lbl = QLabel(text)
    lbl.setStyleSheet(f"color:{TEXT_FAINT};font-size:11px;background:transparent;border:none;")
    return lbl


def _toggle(text: str, size=(30, 30), radius=15, tip="") -> QPushButton:
    b = QPushButton(text)
    b.setCheckable(True)
    b.setFixedSize(*size)
    b.setCursor(Qt.PointingHandCursor)
    b.setToolTip(tip)
    w, h = size
    b.setStyleSheet(
        f"QPushButton{{background:#252525;border:1px solid {BORDER};border-radius:{radius}px;"
        f"color:{TEXT_DIM};font-size:11px;font-weight:600;padding:0px;"
        f"min-width:{w - 2}px;max-width:{w - 2}px;min-height:{h - 2}px;max-height:{h - 2}px;}}"
        f"QPushButton:hover{{border-color:{BLUE};color:{TEXT};}}"
        f"QPushButton:checked{{background:{BLUE};border-color:{BLUE};color:#ffffff;}}"
    )
    return b


def _link(text: str) -> QPushButton:
    b = QPushButton(text)
    b.setCursor(Qt.PointingHandCursor)
    b.setStyleSheet(
        f"QPushButton{{background:transparent;border:none;color:{BLUE};font-size:11px;"
        "padding:2px 4px;min-width:0px;}"
        "QPushButton:hover{text-decoration:underline;}"
    )
    return b


class RecurrencePicker(QWidget):
    """Frequency selector with the detail each frequency needs."""

    changed = Signal()

    def __init__(self, allow_none: bool = False, show_range: bool = True,
                 start_label: str = "Empieza", end_label: str = "Termina", parent=None):
        super().__init__(parent)
        self.setStyleSheet("background:transparent;")
        self._allow_none = allow_none
        self._show_range = show_range

        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(10)

        items = [("No se repite", NONE)] if allow_none else []
        items += [("Todos los días", DAILY), ("Días concretos de la semana", WEEKLY),
                  ("Cada cierto número de días", EVERY), ("Días concretos del mes", MONTHLY)]
        self.freq = combo(items, height=32)
        self.freq.currentIndexChanged.connect(self._freq_changed)
        lay.addWidget(self.freq)

        # Only the page for the chosen frequency is visible; hidden pages take
        # no room, so the picker grows and shrinks with its content.
        self._pages = {
            WEEKLY: self._weekly_page(),
            EVERY: self._every_page(),
            MONTHLY: self._monthly_page(),
        }
        for page in self._pages.values():
            page.setStyleSheet("background:transparent;")
            lay.addWidget(page)

        self.range_box = QWidget()
        rb = QGridLayout(self.range_box)
        rb.setContentsMargins(0, 0, 0, 0)
        rb.setHorizontalSpacing(10)
        rb.setVerticalSpacing(4)
        rb.addWidget(small_label(start_label), 0, 0)
        rb.addWidget(small_label(end_label), 0, 1)
        self.start_btn = DateButton(None, placeholder="Desde hoy", height=30)
        self.end_btn = DateButton(None, placeholder="Sin fecha de fin", height=30)
        self.start_btn.changed.connect(lambda _v: self._emit())
        self.end_btn.changed.connect(lambda _v: self._emit())
        rb.addWidget(self.start_btn, 1, 0)
        rb.addWidget(self.end_btn, 1, 1)
        self.range_box.setVisible(show_range)
        lay.addWidget(self.range_box)

        self.summary = QLabel()
        self.summary.setStyleSheet(f"color:{BLUE};font-size:11px;background:transparent;border:none;")
        lay.addWidget(self.summary)
        self._freq_changed()

    # ── Pages ─────────────────────────────────────────────────────────────

    def _weekly_page(self) -> QWidget:
        page = QWidget()
        v = QVBoxLayout(page)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(6)
        row = QHBoxLayout()
        row.setSpacing(6)
        self.day_btns = []
        for i, letter in enumerate(DAY_LETTERS):
            b = _toggle(letter, tip=DAY_NAMES[i])
            b.toggled.connect(lambda _c: self._emit())
            self.day_btns.append(b)
            row.addWidget(b)
        row.addStretch()
        v.addLayout(row)
        quick = QHBoxLayout()
        quick.setSpacing(2)
        for text, days in (("Laborables", WORKDAYS), ("Fin de semana", WEEKEND), ("Todos", ALL_DAYS)):
            link = _link(text)
            link.clicked.connect(lambda _c=False, d=days: self._set_weekdays(d))
            quick.addWidget(link)
        quick.addStretch()
        v.addLayout(quick)
        return page

    def _every_page(self) -> QWidget:
        page = QWidget()
        row = QHBoxLayout(page)
        row.setContentsMargins(0, 0, 0, 0)
        row.setSpacing(8)
        row.addWidget(small_label("Cada"))
        self.every = QSpinBox()
        self.every.setRange(2, 365)
        self.every.setValue(2)
        self.every.setFixedSize(70, 30)
        self.every.setStyleSheet(
            f"QSpinBox{{background:#252525;border:1px solid {BORDER};border-radius:6px;"
            f"color:{TEXT};font-size:12px;padding:0 6px;}}QSpinBox:focus{{border-color:{BLUE};}}")
        self.every.valueChanged.connect(lambda _v: self._emit())
        row.addWidget(self.every)
        row.addWidget(small_label("días, contando desde la fecha de inicio"))
        row.addStretch()
        return page

    def _monthly_page(self) -> QWidget:
        page = QWidget()
        grid = QGridLayout(page)
        grid.setContentsMargins(0, 0, 0, 0)
        grid.setSpacing(4)
        self.month_btns = []
        for n in range(1, 32):
            b = _toggle(str(n), size=(30, 26), radius=5,
                        tip="En meses más cortos cuenta como el último día" if n > 28 else "")
            b.toggled.connect(lambda _c: self._emit())
            self.month_btns.append(b)
            grid.addWidget(b, (n - 1) // 7, (n - 1) % 7)
        grid.setColumnStretch(7, 1)
        return page

    # ── Value ─────────────────────────────────────────────────────────────

    def _set_weekdays(self, days):
        for i, b in enumerate(self.day_btns):
            b.blockSignals(True)
            b.setChecked(i in days)
            b.blockSignals(False)
        self._emit()

    def set_value(self, rule: Optional[str], start: Optional[date] = None,
                  end: Optional[date] = None):
        r = Recurrence.parse(rule)
        freq = r.freq if r.repeats else (NONE if self._allow_none else DAILY)
        widgets = self.day_btns + self.month_btns + [self.every, self.freq]
        for w in widgets:
            w.blockSignals(True)
        for i, b in enumerate(self.day_btns):
            b.setChecked(i in r.weekdays)
        for n, b in enumerate(self.month_btns, start=1):
            b.setChecked(n in r.month_days)
        self.every.setValue(r.every if r.freq == EVERY else 2)
        index = self.freq.findData(freq)
        self.freq.setCurrentIndex(max(0, index))
        for w in widgets:
            w.blockSignals(False)
        self.start_btn.set_value(start)
        self.end_btn.set_value(end)
        self._freq_changed()

    def recurrence(self) -> Recurrence:
        freq = self.freq.currentData()
        if freq == DAILY:
            return Recurrence(DAILY)
        if freq == WEEKLY:
            return Recurrence.from_weekdays(i for i, b in enumerate(self.day_btns) if b.isChecked())
        if freq == EVERY:
            return Recurrence(EVERY, every=self.every.value())
        if freq == MONTHLY:
            days = [n for n, b in enumerate(self.month_btns, start=1) if b.isChecked()]
            return Recurrence(MONTHLY, month_days=days)
        return Recurrence()

    def rule(self) -> str:
        return self.recurrence().to_string()

    def start(self) -> Optional[date]:
        return self.start_btn.value()

    def end(self) -> Optional[date]:
        return self.end_btn.value()

    def is_valid(self) -> bool:
        freq = self.freq.currentData()
        return freq in (NONE, DAILY) or self.recurrence().repeats

    # ── Internals ─────────────────────────────────────────────────────────

    def _freq_changed(self, *_):
        freq = self.freq.currentData()
        for key, page in self._pages.items():
            page.setVisible(key == freq)
        if freq == WEEKLY and not any(b.isChecked() for b in self.day_btns):
            self._set_weekdays((date.today().weekday(),))
        if freq == MONTHLY and not any(b.isChecked() for b in self.month_btns):
            self.month_btns[date.today().day - 1].setChecked(True)
        self.range_box.setVisible(self._show_range and freq != NONE)
        self._emit()

    def _emit(self):
        freq = self.freq.currentData()
        if freq in (WEEKLY, MONTHLY) and not self.recurrence().repeats:
            self.summary.setText("Elige al menos un día")
        else:
            text = self.recurrence().describe() if freq != NONE else "No se repite"
            if self._show_range and freq != NONE:
                start, end = self.start_btn.value(), self.end_btn.value()
                if start:
                    text += f" · desde el {start.strftime('%d/%m/%Y')}"
                if end:
                    text += f" · hasta el {end.strftime('%d/%m/%Y')}"
            self.summary.setText(text)
        self.changed.emit()


def time_combo(allow_empty: bool = True, empty_label: str = "Sin hora", height: int = 30):
    items = [(empty_label, None)] if allow_empty else []
    items += [(f"{m // 60:02d}:{m % 60:02d}", f"{m // 60:02d}:{m % 60:02d}")
              for m in range(0, 24 * 60, 15)]
    return combo(items, height=height)


def set_time(box, value: Optional[str]):
    if value and box.findData(value) < 0:
        box.addItem(value, value)
    box.setCurrentIndex(max(0, box.findData(value)))


def duration_combo(height: int = 30):
    items = []
    for m in DURATION_CHOICES:
        h, rest = divmod(m, 60)
        label = f"{m} min" if not h else (f"{h} h" if not rest else f"{h} h {rest} min")
        items.append((label, m))
    return combo(items, height=height)


def set_duration(box, minutes: Optional[int]):
    if minutes and box.findData(minutes) < 0:
        box.addItem(f"{minutes} min", minutes)
    index = box.findData(minutes or 30)
    box.setCurrentIndex(max(0, index))


def reminder_combo(height: int = 30):
    return combo(list(REMINDER_CHOICES), height=height)


def set_reminder(box, minutes: Optional[int]):
    index = box.findData(minutes)
    if index < 0 and minutes is not None:
        box.addItem(f"{minutes} minutos antes", minutes)
        index = box.findData(minutes)
    box.setCurrentIndex(max(0, index))


class _Swatch(QPushButton):
    def __init__(self, colour: str, name: str, parent=None):
        super().__init__(parent)
        self.colour = colour
        self.setCheckable(True)
        self.setFixedSize(26, 26)
        self.setToolTip(name)
        self.setCursor(Qt.PointingHandCursor)
        self.setStyleSheet("QPushButton{background:transparent;border:none;min-width:0px;padding:0px;}")

    def paintEvent(self, _event):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        if self.isChecked():
            p.setPen(Qt.NoPen)
            p.setBrush(QColor(self.colour).lighter(150))
            p.drawEllipse(1, 1, 24, 24)
        p.setPen(Qt.NoPen)
        p.setBrush(QColor(self.colour))
        p.drawEllipse(5, 5, 16, 16)


class ColourRow(QWidget):
    changed = Signal(str)

    def __init__(self, value: Optional[str] = None, parent=None):
        super().__init__(parent)
        self.setStyleSheet("background:transparent;")
        row = QHBoxLayout(self)
        row.setContentsMargins(0, 0, 0, 0)
        row.setSpacing(2)
        self._swatches = []
        for hexa, name in GCAL_COLOURS:
            s = _Swatch(hexa, name)
            s.clicked.connect(lambda _c=False, h=hexa: self.set_value(h, emit=True))
            self._swatches.append(s)
            row.addWidget(s)
        row.addStretch()
        self.set_value(value or "#7c5af0")

    def set_value(self, hexa: str, emit: bool = False):
        self._value = hexa
        for s in self._swatches:
            s.setChecked(s.colour.lower() == (hexa or "").lower())
            s.update()
        if emit:
            self.changed.emit(hexa)

    def value(self) -> str:
        return self._value
