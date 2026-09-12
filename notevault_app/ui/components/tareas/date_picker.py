"""
Pop-up date / date-time pickers used by the Tareas and Proyectos tables.

A plain button shows the current value; clicking it opens a dark-styled
calendar popup (plus an hour/minute row for reminders).
"""

from datetime import date, datetime, time
from PySide6.QtWidgets import (
    QWidget, QPushButton, QVBoxLayout, QHBoxLayout, QFrame, QCalendarWidget,
    QLabel, QSpinBox,
)
from PySide6.QtCore import Qt, Signal, QDate

from .tareas_common import (
    BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, RED, flat_btn, primary_btn,
)

CALENDAR_SS = f"""
QCalendarWidget QWidget {{ alternate-background-color:#1f1f1f; }}
QCalendarWidget QAbstractItemView:enabled {{
    background:#1c1c1c; color:{TEXT};
    selection-background-color:{BLUE}; selection-color:#ffffff;
    outline:none; font-size:12px;
}}
QCalendarWidget QAbstractItemView:disabled {{ color:#4a4a52; }}
QCalendarWidget QWidget#qt_calendar_navigationbar {{
    background:#161616; border-bottom:1px solid {BORDER};
}}
QCalendarWidget QToolButton {{
    background:transparent; border:none; color:{TEXT};
    font-size:12px; padding:4px 10px; border-radius:5px;
}}
QCalendarWidget QToolButton:hover {{ background:#2a2a32; }}
QCalendarWidget QMenu {{ background:#202020; color:{TEXT}; border:1px solid {BORDER}; }}
QCalendarWidget QSpinBox {{
    background:#252525; color:{TEXT}; border:1px solid {BORDER};
}}
"""

SPIN_SS = (
    f"QSpinBox{{background:#252525;border:1px solid {BORDER};border-radius:5px;"
    f"color:{TEXT};font-size:12px;padding:2px 4px;}}"
    f"QSpinBox:focus{{border-color:{BLUE};}}"
)


class _PickerPopup(QFrame):
    """Floating calendar (optionally with a time row)."""

    picked = Signal(object)     # date | datetime | None

    def __init__(self, value=None, with_time: bool = False, parent=None):
        super().__init__(parent, Qt.Popup)
        self.setObjectName("pickerPopup")
        self.setStyleSheet(
            f"QFrame#pickerPopup{{background:#1c1c1c;border:1px solid {BORDER};"
            "border-radius:10px;}"
        )
        self._with_time = with_time

        lay = QVBoxLayout(self)
        lay.setContentsMargins(8, 8, 8, 8)
        lay.setSpacing(8)

        self._cal = QCalendarWidget()
        self._cal.setGridVisible(False)
        self._cal.setVerticalHeaderFormat(QCalendarWidget.NoVerticalHeader)
        self._cal.setFirstDayOfWeek(Qt.Monday)
        self._cal.setStyleSheet(CALENDAR_SS)
        base = value.date() if isinstance(value, datetime) else value
        if base:
            self._cal.setSelectedDate(QDate(base.year, base.month, base.day))
        lay.addWidget(self._cal)

        if with_time:
            trow = QHBoxLayout()
            trow.setSpacing(6)
            lbl = QLabel("Hora")
            lbl.setStyleSheet(
                f"color:{TEXT_FAINT};font-size:11px;background:transparent;border:none;"
            )
            trow.addWidget(lbl)

            self._hh = QSpinBox()
            self._hh.setRange(0, 23)
            self._hh.setStyleSheet(SPIN_SS)
            self._mm = QSpinBox()
            self._mm.setRange(0, 59)
            self._mm.setSingleStep(5)
            self._mm.setStyleSheet(SPIN_SS)
            ref = value if isinstance(value, datetime) else datetime.now()
            self._hh.setValue(ref.hour)
            self._mm.setValue(ref.minute)
            trow.addWidget(self._hh)
            colon = QLabel(":")
            colon.setStyleSheet(
                f"color:{TEXT_DIM};background:transparent;border:none;"
            )
            trow.addWidget(colon)
            trow.addWidget(self._mm)
            trow.addStretch()
            lay.addLayout(trow)

        btns = QHBoxLayout()
        btns.setSpacing(6)
        clear = flat_btn("Quitar", RED, RED, height=26)
        clear.clicked.connect(self._clear)
        btns.addWidget(clear)
        btns.addStretch()
        today_b = flat_btn("Hoy", height=26)
        today_b.clicked.connect(self._today)
        btns.addWidget(today_b)
        ok = primary_btn("Aceptar", height=26)
        ok.clicked.connect(self._accept)
        btns.addWidget(ok)
        lay.addLayout(btns)

        self._cal.activated.connect(lambda _d: self._accept())

    def _today(self):
        t = date.today()
        self._cal.setSelectedDate(QDate(t.year, t.month, t.day))

    def _clear(self):
        self.picked.emit(None)
        self.close()

    def _accept(self):
        qd = self._cal.selectedDate()
        d = date(qd.year(), qd.month(), qd.day())
        if self._with_time:
            self.picked.emit(datetime.combine(
                d, time(self._hh.value(), self._mm.value())
            ))
        else:
            self.picked.emit(d)
        self.close()


class DateButton(QPushButton):
    """Button that shows a date and opens a calendar popup when clicked."""

    changed = Signal(object)    # date | None

    def __init__(self, value=None, with_time: bool = False,
                 placeholder: str = "—", height: int = 26, parent=None):
        super().__init__(parent)
        self._value = value
        self._with_time = with_time
        self._placeholder = placeholder
        self._danger = False
        self.setCursor(Qt.PointingHandCursor)
        self.setFixedHeight(height)
        self.clicked.connect(self._open)
        self._sync()

    # ── Value ─────────────────────────────────────────────────────────────

    def value(self):
        return self._value

    def set_value(self, value, emit: bool = False):
        self._value = value
        self._sync()
        if emit:
            self.changed.emit(value)

    def set_danger(self, danger: bool):
        self._danger = danger
        self._sync()

    def _text(self) -> str:
        if self._value is None:
            return self._placeholder
        if isinstance(self._value, datetime):
            return self._value.strftime("%d/%m/%y  %H:%M")
        return self._value.strftime("%d/%m/%Y")

    def _sync(self):
        empty = self._value is None
        color = RED if self._danger else (TEXT_FAINT if empty else TEXT)
        self.setText(self._text())
        self.setStyleSheet(
            f"QPushButton{{background:#252525;border:1px solid {BORDER};"
            f"border-radius:6px;color:{color};font-size:12px;padding:0 8px;"
            "text-align:center;}"
            f"QPushButton:hover{{border-color:{BLUE};color:{TEXT};}}"
        )

    # ── Popup ─────────────────────────────────────────────────────────────

    def _open(self):
        popup = _PickerPopup(self._value, self._with_time, self)
        popup.picked.connect(self._on_picked)
        popup.adjustSize()
        pos = self.mapToGlobal(self.rect().bottomLeft())
        popup.move(pos.x(), pos.y() + 4)
        popup.show()
        self._popup = popup

    def _on_picked(self, value):
        self._value = value
        self._sync()
        self.changed.emit(value)
