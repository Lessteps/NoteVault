"""
Tareas — Vista Calendario
Month grid showing every task on its due date. Click a day to create a
task for it, click a chip to open the task.
"""

import calendar
from datetime import date
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel, QFrame,
    QPushButton, QScrollArea, QSizePolicy, QLayout,
)
from PySide6.QtCore import Qt, Signal

from ....core.task_manager import (
    TaskManager, Task, STATUS_COLORS, MONTH_NAMES_ES, WEEKDAYS_ES,
)
from .tareas_common import (
    BG_PAGE, BG_CARD, BG_HEAD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT,
    BLUE, RED, GREEN, flat_btn, primary_btn, line_edit,
)
from .task_editor import TaskEditor

CELL_MIN_H = 96


class TareasCalendar(QWidget):
    data_changed = Signal()

    def __init__(self, manager: TaskManager, parent=None):
        super().__init__(parent)
        self.manager = manager
        today = date.today()
        self._year, self._month = today.year, today.month
        self._query = ""
        self._init_ui()

    # ── UI ────────────────────────────────────────────────────────────────

    def _init_ui(self):
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet(f"QScrollArea{{background:{BG_PAGE};border:none;}}")

        content = QWidget()
        content.setStyleSheet(f"background:{BG_PAGE};")
        page = QVBoxLayout(content)
        page.setContentsMargins(18, 16, 18, 18)
        page.setSpacing(10)
        # Keep rows at their natural height; let the area scroll.
        page.setSizeConstraint(QLayout.SetMinimumSize)

        # Header
        top = QHBoxLayout()
        top.setSpacing(8)
        title = QLabel("🗓  Calendario de Tareas")
        title.setStyleSheet(
            f"color:{TEXT};font-size:20px;font-weight:700;"
            "background:transparent;border:none;"
        )
        top.addWidget(title)
        top.addStretch()

        self._search = line_edit("🔎  Buscar...")
        self._search.setFixedWidth(180)
        self._search.textChanged.connect(self._on_search)
        top.addWidget(self._search)

        prev_b = flat_btn("‹")
        prev_b.setFixedWidth(34)
        prev_b.clicked.connect(lambda: self._shift(-1))
        top.addWidget(prev_b)

        today_b = flat_btn("Hoy")
        today_b.clicked.connect(self._go_today)
        top.addWidget(today_b)

        next_b = flat_btn("›")
        next_b.setFixedWidth(34)
        next_b.clicked.connect(lambda: self._shift(1))
        top.addWidget(next_b)

        new_b = primary_btn("+  Nueva tarea")
        new_b.clicked.connect(lambda: self._create_on(date.today()))
        top.addWidget(new_b)
        page.addLayout(top)

        self._month_lbl = QLabel("")
        self._month_lbl.setStyleSheet(
            f"color:{TEXT_DIM};font-size:14px;font-weight:600;"
            "background:transparent;border:none;"
        )
        page.addWidget(self._month_lbl)

        # Grid card
        self._card = QFrame()
        self._card.setAttribute(Qt.WA_StyledBackground, True)
        self._card.setObjectName("calCard")
        self._card.setStyleSheet(
            f"QFrame#calCard{{background:{BG_CARD};border:1px solid {BORDER};"
            "border-radius:10px;}"
        )
        cl = QVBoxLayout(self._card)
        cl.setContentsMargins(1, 1, 1, 1)
        cl.setSpacing(0)

        # Weekday header
        wk = QWidget()
        wk.setFixedHeight(28)
        wk.setStyleSheet(f"background:{BG_HEAD};border:none;")
        wl = QHBoxLayout(wk)
        wl.setContentsMargins(0, 0, 0, 0)
        wl.setSpacing(0)
        for name in WEEKDAYS_ES:
            lbl = QLabel(name)
            lbl.setAlignment(Qt.AlignCenter)
            lbl.setStyleSheet(
                f"color:{TEXT_FAINT};font-size:10px;font-weight:600;"
                "letter-spacing:0.6px;background:transparent;border:none;"
            )
            wl.addWidget(lbl, stretch=1)
        cl.addWidget(wk)

        self._grid = QGridLayout()
        self._grid.setContentsMargins(0, 0, 0, 0)
        self._grid.setSpacing(0)
        cl.addLayout(self._grid)

        page.addWidget(self._card)
        page.addStretch()
        scroll.setWidget(content)
        outer.addWidget(scroll)

    # ── Navigation ────────────────────────────────────────────────────────

    def _shift(self, delta: int):
        m = self._month + delta
        y = self._year
        if m < 1:
            m, y = 12, y - 1
        elif m > 12:
            m, y = 1, y + 1
        self._month, self._year = m, y
        self.refresh()

    def _go_today(self):
        t = date.today()
        self._year, self._month = t.year, t.month
        self.refresh()

    def _on_search(self, text: str):
        self._query = text
        self.refresh()

    # ── Render ────────────────────────────────────────────────────────────

    def refresh(self):
        while self._grid.count():
            item = self._grid.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        self._month_lbl.setText(f"{MONTH_NAMES_ES[self._month]} {self._year}")

        cal = calendar.Calendar(firstweekday=0)   # Monday first
        weeks = cal.monthdatescalendar(self._year, self._month)
        today = date.today()

        by_day: dict = {}
        for t in self.manager.tasks():
            if t.due and (not self._query or t.matches(self._query)):
                by_day.setdefault(t.due, []).append(t)

        for r, week in enumerate(weeks):
            for c, d in enumerate(week):
                self._grid.addWidget(
                    self._day_cell(d, d.month == self._month, d == today,
                                   by_day.get(d, [])),
                    r, c,
                )
            self._grid.setRowStretch(r, 1)
        for c in range(7):
            self._grid.setColumnStretch(c, 1)

    def _day_cell(self, d: date, in_month: bool, is_today: bool,
                  tasks: list) -> QWidget:
        cell = QFrame()
        cell.setAttribute(Qt.WA_StyledBackground, True)
        cell.setMinimumHeight(CELL_MIN_H)
        cell.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        bg = "#1c1c1c" if in_month else "#171717"
        cell.setStyleSheet(
            f"QFrame{{background:{bg};border:none;"
            f"border-right:1px solid {BORDER};border-bottom:1px solid {BORDER};}}"
        )
        lay = QVBoxLayout(cell)
        lay.setContentsMargins(6, 4, 6, 6)
        lay.setSpacing(3)

        # ── Day number row ───────────────────────────────────────────────
        hdr = QHBoxLayout()
        hdr.setContentsMargins(0, 0, 0, 0)
        add = QPushButton("+")
        add.setFixedSize(18, 18)
        add.setCursor(Qt.PointingHandCursor)
        add.setToolTip(f"Nueva tarea para el {d.strftime('%d/%m/%Y')}")
        add.setStyleSheet(
            f"QPushButton{{background:transparent;border:none;color:#3d3d45;"
            "font-size:13px;}"
            f"QPushButton:hover{{color:{BLUE};}}"
        )
        add.clicked.connect(lambda _, _d=d: self._create_on(_d))
        hdr.addWidget(add)
        hdr.addStretch()

        num = QLabel(str(d.day))
        num.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
        if is_today:
            num.setFixedSize(22, 22)
            num.setAlignment(Qt.AlignCenter)
            num.setStyleSheet(
                f"color:#1a1a1a;background:{RED};border:none;border-radius:11px;"
                "font-size:11px;font-weight:700;"
            )
        else:
            num.setStyleSheet(
                f"color:{TEXT_DIM if in_month else '#4a4a52'};font-size:12px;"
                "background:transparent;border:none;"
            )
        hdr.addWidget(num)
        lay.addLayout(hdr)

        # ── Task chips ───────────────────────────────────────────────────
        shown = tasks[:3]
        for t in shown:
            lay.addWidget(self._chip(t))
        if len(tasks) > len(shown):
            more = QLabel(f"+{len(tasks) - len(shown)} más")
            more.setStyleSheet(
                f"color:{TEXT_FAINT};font-size:10px;background:transparent;border:none;"
            )
            lay.addWidget(more)

        lay.addStretch()
        return cell

    def _chip(self, t: Task) -> QPushButton:
        color = STATUS_COLORS.get(t.status, TEXT_DIM)
        if t.is_overdue:
            color = RED
        text = t.name if len(t.name) <= 18 else t.name[:17] + "…"
        b = QPushButton(f"{'★' * max(1, min(3, t.priority))}  {text}")
        b.setCursor(Qt.PointingHandCursor)
        b.setFixedHeight(19)
        b.setToolTip(
            f"{t.name}\n{t.subject or 'Sin asignatura'} · {t.status}"
        )
        b.setStyleSheet(
            f"QPushButton{{background:rgba(255,255,255,0.05);border:none;"
            f"border-left:2px solid {color};border-radius:3px;color:{TEXT};"
            "font-size:10px;text-align:left;padding:0 5px;}"
            "QPushButton:hover{background:rgba(255,255,255,0.12);}"
        )
        b.clicked.connect(lambda _, _t=t: self._open(_t))
        return b

    # ── Actions ───────────────────────────────────────────────────────────

    def _create_on(self, d: date):
        task = self.manager.create("Nueva tarea", due=d, start=date.today())
        self.manager.tasks(force=True)
        self._open(task)

    def _open(self, task: Task):
        dlg = TaskEditor(self.manager, task, self)
        dlg.exec()
        self.manager.tasks(force=True)
        self.data_changed.emit()
        self.refresh()

    def set_manager(self, manager: TaskManager):
        self.manager = manager
        self.refresh()
