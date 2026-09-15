"""Calendario del proyecto: a month of issues by due date; drag a chip to change its date."""

import calendar
from datetime import date, timedelta

from PySide6.QtCore import Qt, Signal, QMimeData, QTimer
from PySide6.QtGui import QDrag
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QFrame, QLabel, QCheckBox,
)

from ....core.project_manager import TYPE_ICONS
from ..comun import (
    BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, RED, UI_FONT, CHECK_SS,
    PRIORITY_COLOURS, label, flat_btn, clear_layout,
)
from ..calendario import MONTHS_ES

MIME = "application/x-notevault-issue"
DAY_HEAD = ("Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom")


class _Chip(QLabel):
    clicked = Signal(str)

    def __init__(self, issue, colour, parent=None):
        super().__init__(f"{TYPE_ICONS.get(issue.type, '')} {issue.key} {issue.title}", parent)
        self.issue_id = issue.id
        self.setCursor(Qt.OpenHandCursor)
        self.setToolTip(f"{issue.key} · {issue.status}\n{issue.title}\nArrastra a otro día para cambiar la fecha")
        done = issue.is_done
        h = colour.lstrip("#")
        bright = len(h) == 6 and (0.299 * int(h[0:2], 16) + 0.587 * int(h[2:4], 16) + 0.114 * int(h[4:6], 16)) > 150
        ink = "#101010" if bright else "#ffffff"
        self.setStyleSheet(
            f"QLabel{{background:{'#252525' if done else colour};color:{TEXT_FAINT if done else ink};"
            f"border-left:3px solid {PRIORITY_COLOURS.get(issue.priority, TEXT_DIM)};border-radius:4px;"
            f"font-size:11px;padding:1px 5px;font-family:{UI_FONT};"
            f"{'text-decoration:line-through;' if done else ''}}}")
        self.setFixedHeight(20)
        self._press = None

    def mousePressEvent(self, e):
        self._press = e.position().toPoint()

    def mouseMoveEvent(self, e):
        if self._press is None or (e.position().toPoint() - self._press).manhattanLength() < 6:
            return
        drag = QDrag(self)
        mime = QMimeData()
        mime.setData(MIME, self.issue_id.encode())
        drag.setMimeData(mime)
        drag.setPixmap(self.grab())
        self._press = None
        drag.exec(Qt.MoveAction)

    def mouseReleaseEvent(self, e):
        if self._press is not None:
            self.clicked.emit(self.issue_id)
        self._press = None


class _DayCell(QFrame):
    dropped = Signal(str, object)

    def __init__(self, day, in_month, today, parent=None):
        super().__init__(parent)
        self.day = day
        self.setAcceptDrops(True)
        self.setObjectName("pDay")
        self.setAttribute(Qt.WA_StyledBackground, True)
        self._base = (f"QFrame#pDay{{background:{BG_CARD if in_month else '#171717'};"
                      f"border:1px solid {BORDER};border-radius:0px;}}")
        self.setStyleSheet(self._base)
        self.setMinimumHeight(96)
        self.lay = QVBoxLayout(self)
        self.lay.setContentsMargins(4, 3, 4, 3)
        self.lay.setSpacing(2)
        num = label(str(day.day), BLUE if day == today else (TEXT_DIM if in_month else TEXT_FAINT), 11,
                    bold=day == today)
        self.lay.addWidget(num)

    def dragEnterEvent(self, e):
        if e.mimeData().hasFormat(MIME):
            self.setStyleSheet(self._base.replace(f"border:1px solid {BORDER}", f"border:1px solid {BLUE}"))
            e.acceptProposedAction()

    def dragLeaveEvent(self, _e):
        self.setStyleSheet(self._base)

    def dropEvent(self, e):
        self.setStyleSheet(self._base)
        issue_id = bytes(e.mimeData().data(MIME)).decode()
        e.acceptProposedAction()
        QTimer.singleShot(0, lambda: self.dropped.emit(issue_id, self.day))


class ProyectoCalendario(QWidget):
    open_issue = Signal(str)
    changed = Signal()

    def __init__(self, manager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self.project = None
        self.month = date.today().replace(day=1)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 8, 0, 0)
        lay.setSpacing(8)
        bar = QHBoxLayout()
        for text, step in (("‹", -1), ("Hoy", 0), ("›", 1)):
            b = flat_btn(text, height=28)
            b.clicked.connect(lambda _c=False, s=step: self._step(s))
            bar.addWidget(b)
        self.title = label("", TEXT, 16, True)
        bar.addSpacing(8)
        bar.addWidget(self.title)
        bar.addStretch()
        self.general = QCheckBox("Mostrar en el calendario general")
        self.general.setStyleSheet(CHECK_SS)
        self.general.toggled.connect(self._toggle_general)
        bar.addWidget(self.general)
        lay.addLayout(bar)
        self.hint = label("Los issues sin fecha no aparecen aquí. Arrastra un issue a otro día para moverlo.",
                          TEXT_FAINT, 11)
        lay.addWidget(self.hint)
        self.grid = QGridLayout()
        self.grid.setSpacing(0)
        lay.addLayout(self.grid, 1)

    def load(self, project):
        self.project = project
        self.general.blockSignals(True)
        self.general.setChecked(project.in_calendar)
        self.general.blockSignals(False)
        self.refresh()

    def _step(self, s):
        if s == 0:
            self.month = date.today().replace(day=1)
        else:
            m = self.month.month - 1 + s
            self.month = date(self.month.year + m // 12, m % 12 + 1, 1)
        self.refresh()

    def _toggle_general(self, value):
        self.manager.update(self.project.id, in_calendar=value)
        self.project = self.manager.get(self.project.id)
        self.changed.emit()

    def refresh(self):
        if self.project is None:
            return
        clear_layout(self.grid)
        today = date.today()
        self.title.setText(f"{MONTHS_ES[self.month.month - 1].capitalize()} de {self.month.year}")
        for c, name in enumerate(DAY_HEAD):
            h = label(name, TEXT_FAINT, 11, True)
            h.setAlignment(Qt.AlignCenter)
            self.grid.addWidget(h, 0, c)
        first = self.month - timedelta(days=self.month.weekday())
        last_day = calendar.monthrange(self.month.year, self.month.month)[1]
        weeks = (self.month.weekday() + last_day + 6) // 7
        issues = [i for i in self.manager.issues(self.project.id) if i.due or i.repeat]
        for w in range(weeks):
            for c in range(7):
                d = first + timedelta(days=w * 7 + c)
                cell = _DayCell(d, d.month == self.month.month, today)
                cell.dropped.connect(self._dropped)
                todays = sorted([i for i in issues if i.occurs_on(d)], key=lambda i: (-i.priority, i.number))
                for i in todays[:4]:
                    chip = _Chip(i, self.project.colour)
                    chip.clicked.connect(self.open_issue.emit)
                    cell.lay.addWidget(chip)
                if len(todays) > 4:
                    cell.lay.addWidget(label(f"+{len(todays) - 4} más", TEXT_FAINT, 10))
                cell.lay.addStretch()
                self.grid.addWidget(cell, w + 1, c)
        for r in range(1, weeks + 1):
            self.grid.setRowStretch(r, 1)

    def _dropped(self, issue_id, day):
        issue = self.manager.get_issue(self.project.id, issue_id)
        if issue is None or issue.due == day:
            return
        fields = {"due": day}
        if issue.start and issue.due:
            fields["start"] = issue.start + (day - issue.due)
        if issue.reminder and issue.due:
            fields["reminder"] = issue.reminder + (day - issue.due)
        self.manager.update_issue(self.project.id, issue_id, **fields)
        self.refresh()
        self.changed.emit()
