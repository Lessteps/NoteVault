"""
Quick editor that floats over the calendar, modelled on Google Calendar's:
a large underlined title, Evento / Tarea tabs, a time row that unfolds into
date, start and end pickers, repeat, and "Guardar".
"""

from datetime import date

from PySide6.QtCore import Qt, Signal, QEvent, QPoint, QPointF, QRectF, QDate, QLocale
from PySide6.QtGui import (
    QPainter, QColor, QPen, QPainterPath, QPixmap, QIcon, QKeySequence, QShortcut,
    QTextCharFormat,
)
from PySide6.QtWidgets import (
    QFrame, QWidget, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit, QTextEdit,
    QPushButton, QCheckBox, QListWidget, QListWidgetItem, QCalendarWidget, QMenu,
    QGraphicsDropShadowEffect,
)

from ... import theme
from ....core.recurrence import Recurrence
from ....core.vault_format import WEEKDAY_KEYS
from ..programacion import RecurrencePicker, parse_duration_text, parse_time_text
from . import (
    GCAL_COLOURS, DEFAULT_COLOUR, WEEKDAYS_ES, colour_name, event_colour,
    fmt_duration, fmt_hm, hm, long_date, parse_hm,
)

DAY_MIN = 24 * 60
ICON_COL = 44

REMINDERS = (
    (None, "Sin notificación"),
    (0, "A la hora de inicio"),
    (5, "5 minutos antes"),
    (10, "10 minutos antes"),
    (30, "30 minutos antes"),
    (60, "1 hora antes"),
    (1440, "1 día antes"),
)

POPOVER_QSS = """
#eventPopover QWidget {
    background: transparent;
    font-family: 'Segoe UI Variable Text', 'Segoe UI', sans-serif;
}
#eventPopover { background: #202020; border: 1px solid #2f2f2f; border-radius: 24px; }
#eventPopover QLabel { background: transparent; border: none; }
#eventPopover QCheckBox { background: transparent; color: #e6e6e6; font-size: 14px; spacing: 10px; }
QLineEdit#popTitle {
    background: transparent; border: none; border-bottom: 1px solid #3a3a4a;
    border-radius: 0px; color: #e6e6e6; font-size: 22px; padding: 6px 0px;
}
QLineEdit#popTitle:focus { border-bottom: 2px solid #2383e2; padding-bottom: 5px; }
QPushButton#popTab {
    background: transparent; border: none; border-radius: 6px; color: #dcdde0;
    font-size: 14px; padding: 7px 12px; min-width: 0px;
}
QPushButton#popTab:hover { background: #2a2a2a; }
QPushButton#popTab:checked { background: #1a2232; color: #a0b8ff; font-weight: 600; }
QPushButton#popSummary {
    background: transparent; border: none; border-radius: 6px; text-align: left;
    padding: 0px; min-width: 0px;
}
QPushButton#popSummary:hover { background: #2a2a2a; }
QLabel#popMain { color: #e6e6e6; font-size: 15px; }
QLabel#popSub { color: #9b9b9b; font-size: 12px; }
QLabel#popDash { color: #9b9b9b; font-size: 14px; }
QPushButton#popChip {
    background: #2c2c2c; border: none; border-bottom: 2px solid transparent;
    border-radius: 4px; color: #e6e6e6; font-size: 14px; padding: 8px 12px; min-width: 0px;
}
QPushButton#popChip:hover { background: #303038; }
QPushButton#popChip[open="true"] {
    border-bottom: 2px solid #2383e2; border-bottom-left-radius: 0px; border-bottom-right-radius: 0px;
}
QPushButton#popRowBtn {
    background: transparent; border: none; border-radius: 6px; color: #aaaaae;
    font-size: 14px; padding: 9px 8px; text-align: left; min-width: 0px;
}
QPushButton#popRowBtn:hover { background: #2a2a2a; }
QLineEdit#popField, QTextEdit#popField {
    background: #252525; border: none; border-bottom: 1px solid #3a3a4a;
    border-radius: 4px; color: #e6e6e6; font-size: 14px; padding: 7px 8px;
}
QLineEdit#popField:focus, QTextEdit#popField:focus { border-bottom: 2px solid #2383e2; }
QPushButton#popDay {
    background: #2c2c2c; border: none; border-radius: 15px; color: #dcdde0;
    font-size: 11px; font-weight: 600; padding: 0px; min-width: 0px;
}
QPushButton#popDay:checked { background: #2383e2; color: #ffffff; }
QPushButton#popLink {
    background: transparent; border: none; border-radius: 20px; color: #2383e2;
    font-size: 14px; font-weight: 600; padding: 0px 14px; min-width: 0px;
}
QPushButton#popLink:hover { background: #1a2232; }
QPushButton#popSave {
    background: #2383e2; border: none; border-radius: 20px; color: #ffffff;
    font-size: 14px; font-weight: 600; padding: 0px 26px; min-width: 0px;
}
QPushButton#popSave:hover { background: #1a6fc4; }
"""

MENU_QSS = """
QMenu { background: #202020; border: 1px solid #2f2f2f; padding: 6px 0px; color: #e6e6e6; font-size: 14px; }
QMenu::item { padding: 8px 28px 8px 14px; background: transparent; }
QMenu::item:selected { background: #2a2a2a; }
QMenu::indicator { width: 0px; }
"""

LIST_QSS = """
#popPopup { background: #202020; border: 1px solid #2f2f2f; }
QLineEdit#popTimeEntry {
    background: #252525; border: none; border-bottom: 2px solid #2383e2; border-radius: 0px;
    color: #e6e6e6; font-size: 14px; padding: 8px 12px;
    font-family: 'Segoe UI Variable Text', 'Segoe UI', sans-serif;
}
QListWidget { background: #202020; border: none; outline: 0; color: #e6e6e6; font-size: 14px; }
QListWidget::item { padding: 8px 16px; border: none; }
QListWidget::item:hover { background: #2a2a2a; }
QListWidget::item:selected { background: #2c2c2c; color: #e6e6e6; }
"""

CALENDAR_QSS = """
#popPopup { background: #202020; border: 1px solid #2f2f2f; }
QCalendarWidget QWidget { alternate-background-color: #202020; background: #202020; color: #e6e6e6; }
QCalendarWidget QAbstractItemView {
    background: #202020; color: #e6e6e6; selection-background-color: #2383e2;
    selection-color: #ffffff; outline: 0; font-size: 13px;
}
QCalendarWidget QAbstractItemView:disabled { color: #6f6f6f; }
QCalendarWidget QToolButton {
    background: transparent; border: none; color: #e6e6e6; font-size: 14px;
    font-weight: 600; padding: 4px 8px; min-width: 0px;
}
QCalendarWidget QToolButton:hover { background: #2a2a2a; border-radius: 4px; }
QCalendarWidget QToolButton::menu-indicator { image: none; width: 0px; }
QCalendarWidget QSpinBox { background: #252525; color: #e6e6e6; border: none; }
"""


# ── Icons ──────────────────────────────────────────────────────────────────

def paint_icon(p: QPainter, name: str, r: QRectF, colour: QColor):
    pen = QPen(colour, 1.7)
    pen.setCapStyle(Qt.RoundCap)
    pen.setJoinStyle(Qt.RoundJoin)
    p.setPen(pen)
    p.setBrush(Qt.NoBrush)
    u = min(r.width(), r.height()) / 20.0

    def pt(x, y):
        return QPointF(r.x() + x * u, r.y() + y * u)

    def rect(x0, y0, x1, y1):
        return QRectF(pt(x0, y0), pt(x1, y1))

    if name == "clock":
        p.drawEllipse(pt(10, 10), 7.5 * u, 7.5 * u)
        p.drawLine(pt(10, 10), pt(10, 5.8))
        p.drawLine(pt(10, 10), pt(13, 11.8))
    elif name == "pin":
        path = QPainterPath(pt(10, 18))
        path.cubicTo(pt(5.5, 12.8), pt(4, 10.3), pt(4, 8))
        path.arcTo(rect(4, 2, 16, 14), 180, -180)
        path.cubicTo(pt(16, 10.3), pt(14.5, 12.8), pt(10, 18))
        p.drawPath(path)
        p.drawEllipse(pt(10, 8), 2.2 * u, 2.2 * u)
    elif name == "notes":
        for y, x1 in ((5, 17), (9, 17), (13, 17), (17, 11)):
            p.drawLine(pt(3, y), pt(x1, y))
    elif name == "bell":
        path = QPainterPath(pt(4.5, 14.5))
        path.lineTo(pt(15.5, 14.5))
        path.lineTo(pt(14, 12.5))
        path.lineTo(pt(14, 8.5))
        path.arcTo(rect(6, 4.5, 14, 12.5), 0, 180)
        path.lineTo(pt(6, 12.5))
        path.closeSubpath()
        p.drawPath(path)
        p.drawLine(pt(8.5, 17.2), pt(11.5, 17.2))
        p.drawLine(pt(10, 3), pt(10, 4.5))
    elif name == "calendar":
        p.drawRoundedRect(rect(3, 4.5, 17, 17), 2 * u, 2 * u)
        p.drawLine(pt(3, 8.5), pt(17, 8.5))
        p.drawLine(pt(7, 2.5), pt(7, 5.5))
        p.drawLine(pt(13, 2.5), pt(13, 5.5))
        p.fillRect(rect(6.5, 11, 9.5, 14), colour)
    elif name == "tag":
        p.drawRoundedRect(rect(5, 3, 15, 17), 1.5 * u, 1.5 * u)
        p.drawLine(pt(8, 3), pt(8, 17))
    elif name == "close":
        p.drawLine(pt(5, 5), pt(15, 15))
        p.drawLine(pt(15, 5), pt(5, 15))
    elif name == "trash":
        p.drawLine(pt(4, 6), pt(16, 6))
        path = QPainterPath(pt(8, 6))
        path.lineTo(pt(8, 4))
        path.lineTo(pt(12, 4))
        path.lineTo(pt(12, 6))
        p.drawPath(path)
        body = QPainterPath(pt(5.5, 6))
        body.lineTo(pt(6.5, 17))
        body.lineTo(pt(13.5, 17))
        body.lineTo(pt(14.5, 6))
        p.drawPath(body)
        p.drawLine(pt(8.5, 9), pt(8.5, 14))
        p.drawLine(pt(11.5, 9), pt(11.5, 14))
    elif name == "handle":
        p.drawLine(pt(4, 8), pt(16, 8))
        p.drawLine(pt(4, 12), pt(16, 12))


def dot_icon(colour: str, size: int = 14) -> QIcon:
    pix = QPixmap(size, size)
    pix.fill(Qt.transparent)
    p = QPainter(pix)
    p.setRenderHint(QPainter.Antialiasing)
    p.setPen(Qt.NoPen)
    p.setBrush(QColor(colour))
    p.drawEllipse(1, 1, size - 2, size - 2)
    p.end()
    return QIcon(pix)


class _Icon(QWidget):
    def __init__(self, name: str, parent=None):
        super().__init__(parent)
        self.name = name
        self.setFixedSize(20, 20)
        self.setAttribute(Qt.WA_TransparentForMouseEvents)

    def paintEvent(self, _event):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        paint_icon(p, self.name, QRectF(self.rect()), QColor(theme.tint("#9b9b9b")))


class _IconButton(QPushButton):
    def __init__(self, name: str, tip: str, parent=None):
        super().__init__(parent)
        self.name = name
        self.setToolTip(tip)
        self.setFixedSize(36, 36)
        self.setCursor(Qt.PointingHandCursor)
        self.setFocusPolicy(Qt.NoFocus)
        self.setStyleSheet(
            "QPushButton { background: transparent; border: none; border-radius: 18px;"
            " padding: 0px; min-width: 0px; }"
            "QPushButton:hover { background: #2a2a2a; }")

    def paintEvent(self, event):
        super().paintEvent(event)
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        paint_icon(p, self.name, QRectF(8, 8, 20, 20), QColor(theme.tint("#aaaaae")))


class _Dot(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.colour = DEFAULT_COLOUR
        self.setFixedSize(14, 14)
        self.setAttribute(Qt.WA_TransparentForMouseEvents)

    def paintEvent(self, _event):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        p.setPen(Qt.NoPen)
        p.setBrush(QColor(self.colour))
        p.drawEllipse(1, 1, 12, 12)


class _Row(QWidget):
    """An icon in the left column and free content on the right."""

    def __init__(self, icon: str, parent=None):
        super().__init__(parent)
        outer = QHBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)
        slot = QWidget()
        slot.setFixedWidth(ICON_COL)
        self._slot = QVBoxLayout(slot)
        self._slot.setContentsMargins(4, 10, 0, 0)
        self._slot.addWidget(_Icon(icon), 0, Qt.AlignLeft | Qt.AlignTop)
        self._slot.addStretch()
        outer.addWidget(slot)
        self.body = QVBoxLayout()
        self.body.setContentsMargins(0, 0, 0, 0)
        self.body.setSpacing(8)
        outer.addLayout(self.body, 1)

    def set_icon_top(self, px: int):
        self._slot.setContentsMargins(4, px, 0, 0)


class _Popup(QFrame):
    """Base for the drop-downs under the date and time chips."""

    closed = Signal()

    def __init__(self, parent, css):
        super().__init__(parent, Qt.Popup)
        self.setObjectName("popPopup")
        self.setStyleSheet(css)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(1, 1, 1, 1)
        self.body = lay

    def show_under(self, anchor: QWidget):
        self.adjustSize()
        pos = anchor.mapToGlobal(QPoint(0, anchor.height() + 2))
        area = anchor.screen().availableGeometry()
        if pos.y() + self.height() > area.bottom():
            pos.setY(anchor.mapToGlobal(QPoint(0, 0)).y() - self.height() - 2)
        pos.setX(min(pos.x(), area.right() - self.width()))
        self.move(pos)
        self.show()

    def hideEvent(self, event):
        super().hideEvent(event)
        self.closed.emit()


class _TimeList(_Popup):
    picked = Signal(int)
    typed = Signal(str)

    def __init__(self, parent):
        super().__init__(parent, LIST_QSS)
        self.setFixedSize(260, 300)
        self.entry = QLineEdit()
        self.entry.setObjectName("popTimeEntry")
        self.entry.returnPressed.connect(self._submit)
        self.body.addWidget(self.entry)
        self.list = QListWidget()
        self.list.setVerticalScrollMode(QListWidget.ScrollPerPixel)
        self.list.itemClicked.connect(self._choose)
        self.list.itemActivated.connect(self._choose)
        self.body.addWidget(self.list)

    def _submit(self):
        text = self.entry.text().strip()
        if text:
            self.hide()
            self.typed.emit(text)

    def open(self, values, labels, current, anchor, placeholder=""):
        self.entry.clear()
        self.entry.setPlaceholderText(placeholder)
        self.list.clear()
        chosen = None
        for value, label in zip(values, labels):
            item = QListWidgetItem(label)
            item.setData(Qt.UserRole, value)
            self.list.addItem(item)
            if value == current:
                chosen = item
        self.show_under(anchor)
        if chosen is not None:
            self.list.setCurrentItem(chosen)
            self.list.scrollToItem(chosen, QListWidget.PositionAtCenter)
        self.entry.setFocus()

    def _choose(self, item):
        self.hide()
        self.picked.emit(int(item.data(Qt.UserRole)))


class _DatePopup(_Popup):
    picked = Signal(object)

    def __init__(self, parent):
        super().__init__(parent, CALENDAR_QSS)
        self.cal = QCalendarWidget()
        self.cal.setLocale(QLocale(QLocale.Spanish, QLocale.Spain))
        self.cal.setFirstDayOfWeek(Qt.Monday)
        self.cal.setGridVisible(False)
        self.cal.setVerticalHeaderFormat(QCalendarWidget.NoVerticalHeader)
        self.cal.setHorizontalHeaderFormat(QCalendarWidget.SingleLetterDayNames)
        self.cal.setFixedSize(300, 250)
        self.cal.clicked.connect(self._choose)
        self.cal.activated.connect(self._choose)
        self.body.addWidget(self.cal)

    def open(self, current: date, anchor):
        plain = QTextCharFormat()
        plain.setForeground(QColor(theme.tint("#e6e6e6")))
        for day in (Qt.Saturday, Qt.Sunday):
            self.cal.setWeekdayTextFormat(day, plain)
        self.cal.setSelectedDate(QDate(current.year, current.month, current.day))
        self.show_under(anchor)

    def _choose(self, qd: QDate):
        self.hide()
        self.picked.emit(date(qd.year(), qd.month(), qd.day()))


def _menu(parent) -> QMenu:
    menu = QMenu(parent)
    menu.setStyleSheet(MENU_QSS)
    return menu


# ── Popover ────────────────────────────────────────────────────────────────

class EventPopover(QFrame):
    save_requested = Signal(dict)
    delete_requested = Signal(dict, str)     # original item, "one" | "all"
    closed = Signal()
    draft_changed = Signal()
    refit = Signal()

    WIDTH = 468

    def __init__(self, parent):
        super().__init__(parent)
        self.setObjectName("eventPopover")
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.setFixedWidth(self.WIDTH)
        shadow = QGraphicsDropShadowEffect(self)
        shadow.setBlurRadius(38)
        shadow.setOffset(0, 10)
        shadow.setColor(QColor(0, 0, 0, 95))
        self.setGraphicsEffect(shadow)

        self._drag_from = None
        self._reset_state()
        self._build()

        self.time_popup = _TimeList(self)
        self.time_popup.picked.connect(self._on_time_picked)
        self.time_popup.typed.connect(self._on_time_typed)
        self.time_popup.closed.connect(self._close_chips)
        self.date_popup = _DatePopup(self)
        self.date_popup.picked.connect(self._on_date_picked)
        self.date_popup.closed.connect(self._close_chips)
        self._time_target = None

        esc = QShortcut(QKeySequence(Qt.Key_Escape), self)
        esc.setContext(Qt.WidgetWithChildrenShortcut)
        esc.activated.connect(self.dismiss)
        save = QShortcut(QKeySequence("Ctrl+Return"), self)
        save.setContext(Qt.WidgetWithChildrenShortcut)
        save.activated.connect(self._save)
        self.hide()

    def _reset_state(self):
        self.mode = "create"
        self.kind = "event"
        self.orig: dict = {}
        self.day = date.today()
        self.start = 9 * 60
        self.end = 10 * 60
        self.all_day = False
        self.repeat = "none"         # none | daily | weekly | weekdays | monthly | custom
        self.custom_rule = ""
        self.until = None
        self.colour = DEFAULT_COLOUR
        self.reminder = 30
        self.expanded = False

    # ── Construction ──────────────────────────────────────────────────────

    def _build(self):
        self.setStyleSheet(POPOVER_QSS)
        root = QVBoxLayout(self)
        root.setContentsMargins(14, 10, 14, 18)
        root.setSpacing(6)

        top = QHBoxLayout()
        top.setSpacing(0)
        self.handle = _IconButton("handle", "Mover")
        self.handle.setCursor(Qt.SizeAllCursor)
        self.handle.installEventFilter(self)
        top.addWidget(self.handle)
        top.addStretch()
        self.trash_btn = _IconButton("trash", "Eliminar")
        self.trash_btn.clicked.connect(self._delete)
        top.addWidget(self.trash_btn)
        self.close_btn = _IconButton("close", "Cerrar")
        self.close_btn.clicked.connect(self.dismiss)
        top.addWidget(self.close_btn)
        root.addLayout(top)

        self.title = QLineEdit()
        self.title.setObjectName("popTitle")
        self.title.setPlaceholderText("Añadir título")
        self.title.textChanged.connect(lambda _t: self.draft_changed.emit())
        self.title.returnPressed.connect(self._save)
        root.addLayout(self._indented(self.title))

        self.tabs_box = QWidget()
        tabs = QHBoxLayout(self.tabs_box)
        tabs.setContentsMargins(0, 6, 0, 2)
        tabs.setSpacing(4)
        self.tab_event = self._tab("Evento", "event")
        self.tab_task = self._tab("Tarea", "task")
        tabs.addWidget(self.tab_event)
        tabs.addWidget(self.tab_task)
        tabs.addStretch()
        root.addLayout(self._indented(self.tabs_box))
        root.addSpacing(4)

        # Time: a one-line summary that unfolds into pickers.
        self.time_row = _Row("clock")
        self.summary = QPushButton()
        self.summary.setObjectName("popSummary")
        self.summary.setCursor(Qt.PointingHandCursor)
        self.summary.setMinimumHeight(52)
        sl = QVBoxLayout(self.summary)
        sl.setContentsMargins(8, 7, 8, 7)
        sl.setSpacing(1)
        self.sum_main = QLabel()
        self.sum_main.setObjectName("popMain")
        self.sum_sub = QLabel()
        self.sum_sub.setObjectName("popSub")
        for lbl in (self.sum_main, self.sum_sub):
            lbl.setAttribute(Qt.WA_TransparentForMouseEvents)
            sl.addWidget(lbl)
        self.summary.clicked.connect(self._expand)
        self.time_row.body.addWidget(self.summary)

        self.editor = QWidget()
        el = QVBoxLayout(self.editor)
        el.setContentsMargins(0, 2, 0, 2)
        el.setSpacing(10)
        chips = QHBoxLayout()
        chips.setSpacing(6)
        self.date_chip = self._chip(self._pick_date)
        self.start_chip = self._chip(self._pick_start)
        self.dash = QLabel("–")
        self.dash.setObjectName("popDash")
        self.end_chip = self._chip(self._pick_end)
        chips.addWidget(self.date_chip)
        chips.addWidget(self.start_chip)
        chips.addWidget(self.dash)
        chips.addWidget(self.end_chip)
        chips.addStretch()
        el.addLayout(chips)

        self.allday = QCheckBox("Todo el día")
        self.allday.setCursor(Qt.PointingHandCursor)
        self.allday.toggled.connect(self._set_all_day)
        el.addWidget(self.allday)

        repeat_line = QHBoxLayout()
        self.repeat_chip = self._chip(self._pick_repeat)
        repeat_line.addWidget(self.repeat_chip)
        repeat_line.addStretch()
        el.addLayout(repeat_line)

        self.custom = RecurrencePicker(allow_none=False, show_range=True,
                                       start_label="Desde", end_label="Hasta")
        self.custom.changed.connect(self._custom_changed)
        el.addWidget(self.custom)
        self.time_row.body.addWidget(self.editor)
        root.addWidget(self.time_row)

        self.loc_row, self.loc_btn, self.loc_edit = self._field_row(
            "pin", "Añadir ubicación", QLineEdit())
        self.desc_row, self.desc_btn, self.desc_edit = self._field_row(
            "notes", "Añadir descripción", QTextEdit())
        self.desc_edit.setFixedHeight(84)
        self.desc_edit.setAcceptRichText(False)
        self.subject_row, self.subject_btn, self.subject_edit = self._field_row(
            "tag", "Añadir asignatura", QLineEdit())
        for row in (self.loc_row, self.desc_row, self.subject_row):
            root.addWidget(row)

        self.reminder_row = _Row("bell")
        self.reminder_btn = self._row_button(self._pick_reminder)
        self.reminder_row.body.addWidget(self.reminder_btn)
        root.addWidget(self.reminder_row)

        self.colour_row = _Row("calendar")
        self.colour_btn = self._row_button(self._pick_colour)
        cl = QHBoxLayout(self.colour_btn)
        cl.setContentsMargins(8, 0, 8, 0)
        cl.setSpacing(8)
        self.colour_label = QLabel()
        self.colour_label.setStyleSheet("color: #e6e6e6; font-size: 14px;")
        self.colour_label.setAttribute(Qt.WA_TransparentForMouseEvents)
        self.colour_dot = _Dot()
        cl.addWidget(self.colour_label)
        cl.addWidget(self.colour_dot)
        cl.addStretch()
        self.colour_btn.setMinimumHeight(40)
        self.colour_row.body.addWidget(self.colour_btn)
        root.addWidget(self.colour_row)

        root.addSpacing(10)
        foot = QHBoxLayout()
        foot.addStretch()
        self.more_btn = QPushButton("Más opciones")
        self.more_btn.setObjectName("popLink")
        self.more_btn.setCursor(Qt.PointingHandCursor)
        self.more_btn.clicked.connect(self._more)
        self.save_btn = QPushButton("Guardar")
        self.save_btn.setObjectName("popSave")
        self.save_btn.setCursor(Qt.PointingHandCursor)
        self.save_btn.clicked.connect(self._save)
        for btn in (self.more_btn, self.save_btn):
            btn.setFixedHeight(40)
        foot.addWidget(self.more_btn)
        foot.addSpacing(6)
        foot.addWidget(self.save_btn)
        root.addLayout(foot)

    @staticmethod
    def _indented(widget) -> QHBoxLayout:
        lay = QHBoxLayout()
        lay.setContentsMargins(ICON_COL, 0, 8, 0)
        lay.addWidget(widget)
        return lay

    def _tab(self, text, kind) -> QPushButton:
        b = QPushButton(text)
        b.setObjectName("popTab")
        b.setCheckable(True)
        b.setCursor(Qt.PointingHandCursor)
        b.clicked.connect(lambda _c=False, k=kind: self._set_kind(k))
        return b

    def _chip(self, handler) -> QPushButton:
        b = QPushButton()
        b.setObjectName("popChip")
        b.setCursor(Qt.PointingHandCursor)
        b.clicked.connect(handler)
        return b

    def _row_button(self, handler) -> QPushButton:
        b = QPushButton()
        b.setObjectName("popRowBtn")
        b.setCursor(Qt.PointingHandCursor)
        b.clicked.connect(handler)
        return b

    def _field_row(self, icon, placeholder, editor):
        row = _Row(icon)
        btn = self._row_button(lambda: self._open_field(btn, editor))
        btn.setText(placeholder)
        editor.setObjectName("popField")
        editor.setPlaceholderText(placeholder)
        editor.hide()
        row.body.addWidget(btn)
        row.body.addWidget(editor)
        return row, btn, editor

    def _open_field(self, btn, editor, focus=True):
        btn.hide()
        editor.show()
        if focus:
            editor.setFocus()
        self._refit()

    def _close_field(self, btn, editor):
        editor.hide()
        btn.show()

    # ── Opening ───────────────────────────────────────────────────────────

    def _clear_fields(self):
        self.title.blockSignals(True)
        self.title.clear()
        self.title.blockSignals(False)
        for btn, editor in ((self.loc_btn, self.loc_edit), (self.desc_btn, self.desc_edit),
                            (self.subject_btn, self.subject_edit)):
            editor.clear()
            self._close_field(btn, editor)

    def open_create(self, day: date, start, end, kind: str = "event"):
        self._reset_state()
        self._clear_fields()
        self.kind = kind
        self.day = day
        if start is None:
            self.all_day = True
        else:
            self.start, self.end = start, max(start + 15, end)
        if kind == "task":
            self.reminder = None
        self._sync()

    def open_edit(self, info: dict):
        self._reset_state()
        self._clear_fields()
        self.mode = "edit"
        self.orig = dict(info)
        self.kind = "task" if info["kind"] == "task" else "event"
        self.day = info["date"]
        start = parse_hm(info.get("start"))
        if start is None:
            self.all_day = True
        else:
            self.start = start
            self.end = min(DAY_MIN, start + (info.get("duration") or 60))
        self.title.blockSignals(True)
        self.title.setText(info.get("title", ""))
        self.title.blockSignals(False)
        self.colour = event_colour(info.get("colour"))
        self.reminder = info.get("reminder_min")
        self.until = info.get("until")
        self.repeat, self.custom_rule = self._repeat_for(info.get("repeat") or "")
        if self.repeat == "custom":
            self.custom.blockSignals(True)
            self.custom.set_value(self.custom_rule, None, self.until)
            self.custom.blockSignals(False)
        for btn, editor, value in ((self.loc_btn, self.loc_edit, info.get("location")),
                                   (self.desc_btn, self.desc_edit, info.get("description")),
                                   (self.subject_btn, self.subject_edit, info.get("subject"))):
            if value:
                editor.setPlainText(value) if isinstance(editor, QTextEdit) else editor.setText(value)
                self._open_field(btn, editor, focus=False)
        self._sync()

    def focus_title(self):
        self.title.setFocus()
        self.title.selectAll()

    def dismiss(self):
        if self.isVisible():
            self.hide()
            self.closed.emit()

    # ── State -> widgets ──────────────────────────────────────────────────

    def _preset_rules(self) -> dict:
        return {
            "none": "",
            "daily": "daily",
            "weekly": f"weekly:{self.day.weekday()}",
            "weekdays": "weekly:0,1,2,3,4",
            "monthly": f"monthly:{self.day.day}",
        }

    def _repeat_for(self, rule: str):
        """(menu key, custom rule) for a stored rule string."""
        rule = Recurrence.parse(rule).to_string()
        for key, preset in self._preset_rules().items():
            if rule == preset:
                return key, ""
        return "custom", rule

    def rule(self) -> str:
        if self.repeat == "custom":
            return self.custom.rule()
        return self._preset_rules().get(self.repeat, "")

    def _repeat_label(self, key: str) -> str:
        weekday = WEEKDAYS_ES[self.day.weekday()]
        return {
            "none": "No se repite",
            "daily": "Cada día",
            "weekly": f"Cada semana el {weekday}",
            "weekdays": "Todos los días laborables (de lunes a viernes)",
            "monthly": f"Cada mes el día {self.day.day}",
            "custom": "Personalizado…",
        }[key]

    def _repeat_summary(self) -> str:
        if self.repeat == "custom":
            return Recurrence.parse(self.custom.rule()).describe()
        return self._repeat_label(self.repeat)

    def _reminder_label(self) -> str:
        if self.reminder is None:
            return "Sin notificación"
        if self.reminder == 0:
            return "Notificar a la hora de inicio"
        text = dict(REMINDERS).get(self.reminder, f"{self.reminder} minutos antes")
        return f"Notificar {text}"

    def _sync(self):
        is_task = self.kind == "task"
        self.tabs_box.setVisible(self.mode == "create")
        self.tab_event.setChecked(not is_task)
        self.tab_task.setChecked(is_task)
        self.trash_btn.setVisible(self.mode == "edit")

        main = long_date(self.day)
        if not self.all_day:
            clock = fmt_hm(self.start) if is_task else f"{fmt_hm(self.start)} – {fmt_hm(self.end)}"
            main = f"{main}     {clock}"
        self.sum_main.setText(main)
        sub = ["Todo el día"] if self.all_day else []
        if is_task:
            sub.append("Tarea")
        if not is_task or self.repeat != "none":
            sub.append(self._repeat_summary())
        self.sum_sub.setText(" · ".join(sub))

        self.summary.setVisible(not self.expanded)
        self.editor.setVisible(self.expanded)
        self.time_row.set_icon_top(9 if self.expanded else 16)
        self.date_chip.setText(long_date(self.day))
        self.start_chip.setText(fmt_hm(self.start))
        self.end_chip.setText(fmt_hm(self.end))
        self.start_chip.setVisible(not self.all_day)
        self.dash.setVisible(not self.all_day and not is_task)
        self.end_chip.setVisible(not self.all_day and not is_task)
        self.allday.blockSignals(True)
        self.allday.setChecked(self.all_day)
        self.allday.blockSignals(False)
        self.repeat_chip.setText(f"{self._repeat_label(self.repeat)}   ▾")
        self.custom.setVisible(self.repeat == "custom")

        self.loc_row.setVisible(not is_task)
        self.subject_row.setVisible(is_task)
        self.reminder_row.setVisible(not self.all_day)
        self.reminder_btn.setText(self._reminder_label())
        self.colour_row.setVisible(not is_task)
        self.colour_label.setText(colour_name(self.colour))
        self.colour_dot.colour = self.colour
        self.colour_dot.update()
        self.more_btn.setVisible(not self.expanded)
        self._refit()
        self.draft_changed.emit()

    def _refit(self):
        self.layout().activate()
        self.adjustSize()
        self.refit.emit()

    # ── Handlers ──────────────────────────────────────────────────────────

    def _set_kind(self, kind: str):
        self.kind = kind
        if kind == "task":
            self.reminder = None
        elif self.reminder is None and self.mode == "create":
            self.reminder = 30
        self._sync()

    def _expand(self):
        self.expanded = True
        self._sync()

    def _more(self):
        self.expanded = True
        self._open_field(self.desc_btn, self.desc_edit, focus=False)
        if self.kind == "event":
            self._open_field(self.loc_btn, self.loc_edit, focus=False)
        self._sync()

    def _set_all_day(self, on: bool):
        self.all_day = on
        self._sync()

    def _mark_open(self, chip: QPushButton, on: bool):
        chip.setProperty("open", on)
        chip.style().unpolish(chip)
        chip.style().polish(chip)

    def _close_chips(self):
        for chip in (self.date_chip, self.start_chip, self.end_chip):
            self._mark_open(chip, False)

    def _pick_date(self):
        self._mark_open(self.date_chip, True)
        self.date_popup.open(self.day, self.date_chip)

    def _on_date_picked(self, d: date):
        self.day = d
        self._sync()

    def _pick_start(self):
        values = list(range(0, DAY_MIN, 15))
        if self.start not in values:
            values = sorted(values + [self.start])
        self._time_target = "start"
        self._mark_open(self.start_chip, True)
        self.time_popup.open(values, [fmt_hm(v) for v in values], self.start, self.start_chip,
                             "Escribe una hora: 7:05")

    def _pick_end(self):
        values = list(range(self.start + 15, DAY_MIN + 1, 15))
        if self.end not in values:
            values = sorted(values + [self.end])
        labels = [f"{fmt_hm(v)}   ({fmt_duration(v - self.start)})" for v in values]
        self._time_target = "end"
        self._mark_open(self.end_chip, True)
        self.time_popup.open(values, labels, self.end, self.end_chip,
                             "Hora de fin o duración: 2 h 30 min")

    def _on_time_picked(self, value: int):
        if self._time_target == "start":
            length = self.end - self.start
            self.start = min(DAY_MIN - 5, value)
            self.end = min(DAY_MIN, self.start + max(5, length))
        else:
            self.end = min(DAY_MIN, max(self.start + 5, value))
        self._sync()

    def _on_time_typed(self, text: str):
        """A typed start time, or for the end either a clock time or a length."""
        clock = parse_hm(parse_time_text(text))
        if self._time_target == "start":
            if clock is not None:
                self._on_time_picked(clock)
            return
        has_units = any(ch.isalpha() for ch in text)
        length = parse_duration_text(text)
        if clock is not None and not has_units and clock > self.start:
            self._on_time_picked(clock)
        elif length is not None:
            self._on_time_picked(self.start + length)

    def _pick_repeat(self):
        menu = _menu(self)
        for key in ("none", "daily", "weekly", "weekdays", "monthly", "custom"):
            action = menu.addAction(self._repeat_label(key))
            action.triggered.connect(lambda _c=False, k=key: self._set_repeat(k))
        self._mark_open(self.repeat_chip, True)
        menu.exec(self.repeat_chip.mapToGlobal(QPoint(0, self.repeat_chip.height() + 2)))
        self._mark_open(self.repeat_chip, False)

    def _set_repeat(self, key: str):
        if key == "custom" and self.repeat != "custom":
            seed = self.custom_rule or self.rule() or f"weekly:{self.day.weekday()}"
            self.custom.blockSignals(True)
            self.custom.set_value(seed, None, self.until)
            self.custom.blockSignals(False)
        self.repeat = key
        self._sync()

    def _custom_changed(self):
        self.custom_rule = self.custom.rule()
        self.until = self.custom.end()
        if self.custom.start() and self.custom.start() != self.day:
            self.day = self.custom.start()
        self._sync()

    def _pick_reminder(self):
        menu = _menu(self)
        for minutes, label in REMINDERS:
            action = menu.addAction(label)
            action.triggered.connect(lambda _c=False, m=minutes: self._set_reminder(m))
        menu.exec(self.reminder_btn.mapToGlobal(QPoint(8, self.reminder_btn.height())))

    def _set_reminder(self, minutes):
        self.reminder = minutes
        self._sync()

    def _pick_colour(self):
        menu = _menu(self)
        for hexa, name in GCAL_COLOURS:
            action = menu.addAction(dot_icon(hexa), name)
            action.triggered.connect(lambda _c=False, h=hexa: self._set_colour(h))
        menu.exec(self.colour_btn.mapToGlobal(QPoint(8, self.colour_btn.height())))

    def _set_colour(self, hexa: str):
        self.colour = hexa
        self._sync()

    def _delete(self):
        scope = "all"
        if self.orig.get("kind") == "routine":
            menu = _menu(self)
            one = menu.addAction("Eliminar solo este día")
            every = menu.addAction("Eliminar la rutina en todos los días")
            chosen = menu.exec(self.trash_btn.mapToGlobal(QPoint(0, self.trash_btn.height())))
            if chosen is None:
                return
            scope = "one" if chosen is one else "all"
            if chosen is not one and chosen is not every:
                return
        self.delete_requested.emit(dict(self.orig), scope)

    # ── Output ────────────────────────────────────────────────────────────

    def draft(self):
        start = None if self.all_day else self.start
        end = self.end if self.kind == "event" else min(DAY_MIN, self.start + 30)
        return self.day, start, end, self.title.text().strip(), self.colour

    def payload(self) -> dict:
        is_task = self.kind == "task"
        return dict(
            mode=self.mode,
            kind=self.kind,
            orig=dict(self.orig),
            title=self.title.text().strip() or "(Sin título)",
            date=self.day,
            start=None if self.all_day else hm(self.start),
            duration=None if (self.all_day or is_task) else max(5, self.end - self.start),
            repeat=self.rule(),
            until=self.until if self.repeat == "custom" else None,
            days=[WEEKDAY_KEYS[i] for i in Recurrence.parse(self.rule()).weekdays_mask()],
            location=self.loc_edit.text().strip(),
            description=self.desc_edit.toPlainText().strip(),
            subject=self.subject_edit.text().strip(),
            reminder_min=None if self.all_day else self.reminder,
            colour=self.colour,
        )

    def _save(self):
        if self.isVisible():
            self.save_requested.emit(self.payload())

    # ── Dragging by the handle ────────────────────────────────────────────

    def eventFilter(self, obj, event):
        if obj is self.handle:
            kind = event.type()
            if kind == QEvent.MouseButtonPress and event.button() == Qt.LeftButton:
                self._drag_from = event.globalPosition().toPoint() - self.pos()
                return True
            if kind == QEvent.MouseMove and self._drag_from is not None:
                parent = self.parentWidget()
                target = event.globalPosition().toPoint() - self._drag_from
                target.setX(max(0, min(parent.width() - self.width(), target.x())))
                target.setY(max(0, min(parent.height() - self.height(), target.y())))
                self.move(target)
                return True
            if kind == QEvent.MouseButtonRelease:
                self._drag_from = None
                return True
        return super().eventFilter(obj, event)
