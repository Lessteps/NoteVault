"""
"Hoy": every sub-goal due on a day, grouped by area and goal, with a
checkbox and, for measurable ones, a value field. The daily-use screen.
"""

from datetime import date, timedelta

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QScrollArea, QFrame, QLineEdit, QLayout,
)

from ....core import goal_manager as gm
from ....core.store import parse_num, fmt_num
from ..comun import (
    BG_PAGE, BG_CARD, BORDER, TEXT, TEXT_DIM, TEXT_FAINT, BLUE, RED, GREEN, UI_FONT,
    label, chip, clear_layout, flat_btn, PRIORITY_COLOURS, PRIORITY_GLYPHS,
)
from ..comun.widgets import Check
from ..calendario import long_date


class TodayList(QWidget):
    """The rows only; used by the Hoy view, the goal detail tab and Vista General."""

    data_changed = Signal()
    goal_opened = Signal(str)

    def __init__(self, goal_mgr, area_mgr, compact: bool = False, parent=None):
        super().__init__(parent)
        self.goal_mgr, self.area_mgr = goal_mgr, area_mgr
        self.compact = compact
        self.day = date.today()
        self.goal_id = None
        self.limit = None
        self.setStyleSheet("background:transparent;")
        self.lay = QVBoxLayout(self)
        self.lay.setContentsMargins(0, 0, 0, 0)
        self.lay.setSpacing(4 if compact else 8)

    def entries(self):
        goals = self.goal_mgr.goals(gm.FILTER_ACTIVE)
        if self.goal_id:
            goals = [g for g in self.goal_mgr._all_goals() if g.id == self.goal_id]
        elif self.compact:
            goals = [g for g in goals if g.in_overview]
        return self.goal_mgr.items_due_on(self.day, goals)

    def refresh(self):
        clear_layout(self.lay)
        pairs = self.entries()
        if not pairs:
            self.lay.addWidget(label("Nada programado para este día.", TEXT_FAINT, 12))
            return 0
        if self.compact or self.goal_id:
            for goal, item in pairs[: self.limit or len(pairs)]:
                self.lay.addWidget(self._row(goal, item))
            if self.limit and len(pairs) > self.limit:
                self.lay.addWidget(label(f"+{len(pairs) - self.limit} más en Metas", TEXT_FAINT, 11))
            return len(pairs)
        areas = {a["id"]: a for a in self.area_mgr.areas()}
        groups: dict = {}
        for goal, item in pairs:
            groups.setdefault(goal.area if goal.area in areas else "", []).append((goal, item))
        order = [a for a in areas if a in groups] + ([""] if "" in groups else [])
        for key in order:
            area = areas.get(key)
            done = sum(1 for g, i in groups[key] if self.goal_mgr.is_done_on(i, self.day))
            title = f"{area['icon']}  {area['name']}".strip() if area else "Sin área"
            head = QHBoxLayout()
            head.addWidget(label(title, area["colour"] if area else TEXT_DIM, 14, True))
            head.addWidget(label(f"{done}/{len(groups[key])}", TEXT_FAINT, 12))
            head.addStretch()
            self.lay.addLayout(head)
            card = QFrame()
            card.setObjectName("hoyCard")
            card.setAttribute(Qt.WA_StyledBackground, True)
            card.setStyleSheet(f"QFrame#hoyCard{{background:{BG_CARD};border:1px solid {BORDER};"
                               "border-radius:10px;}")
            cl = QVBoxLayout(card)
            cl.setContentsMargins(14, 8, 14, 8)
            cl.setSpacing(2)
            for goal, item in groups[key]:
                cl.addWidget(self._row(goal, item))
            self.lay.addWidget(card)
            self.lay.addSpacing(6)
        return len(pairs)

    def _row(self, goal, item) -> QWidget:
        row = QWidget()
        row.setFixedHeight(28 if self.compact else 34)
        row.setStyleSheet("background:transparent;")
        r = QHBoxLayout(row)
        r.setContentsMargins(0, 0, 0, 0)
        r.setSpacing(8)
        done = self.goal_mgr.is_done_on(item, self.day)
        cb = Check(done, goal.colour or BLUE)
        cb.setToolTip("Marcar como hecha")
        cb.toggled_by_user.connect(lambda v, g=goal, i=item: self._toggle(g, i, v))
        r.addWidget(cb)
        r.addWidget(label(PRIORITY_GLYPHS[item.priority], PRIORITY_COLOURS[item.priority], 11))
        name = label(item.name, TEXT_FAINT if done else TEXT, 12 if self.compact else 13)
        name.setToolTip(f"{goal.name} → {item.name}")
        r.addWidget(name, stretch=1)
        late = not item.repeating and item.due and item.due < self.day
        if late:
            r.addWidget(chip(f"⚠ {item.due.strftime('%d/%m')}", RED))
        if item.due_time:
            r.addWidget(label(item.due_time, TEXT_DIM, 11))
        if item.measurable:
            value = self.goal_mgr.value_on(item, self.day)
            edit = QLineEdit(fmt_num(value) if value is not None else "")
            edit.setPlaceholderText("0")
            edit.setFixedSize(52, 24)
            edit.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
            edit.setStyleSheet(
                f"QLineEdit{{background:#252525;border:1px solid {BORDER};border-radius:5px;"
                f"color:{TEXT};font-size:12px;padding:0 5px;font-family:{UI_FONT};}}"
                f"QLineEdit:focus{{border-color:{BLUE};}}")
            edit.editingFinished.connect(lambda e=edit, g=goal, i=item: self._value(g, i, e.text()))
            r.addWidget(edit)
            r.addWidget(label(f"/ {fmt_num(item.target)} {item.unit}".strip(), TEXT_FAINT, 11))
        if item.repeating and not self.compact:
            streak = self.goal_mgr.streak(item, goal, self.day)
            if streak >= 2:
                r.addWidget(chip(f"🔥 {streak}", "#ff9632"))
        if not self.goal_id:
            g = chip(f"{goal.icon} {goal.name}".strip(), goal.colour)
            g.setCursor(Qt.PointingHandCursor)
            g.mousePressEvent = lambda _e, gid=goal.id: self.goal_opened.emit(gid)
            r.addWidget(g)
        return row

    def _toggle(self, goal, item, value):
        self.goal_mgr.set_done(goal.id, item.id, self.day, value)
        self.refresh()
        self.data_changed.emit()

    def _value(self, goal, item, text):
        number = parse_num(text) if text.strip() else None
        current = self.goal_mgr.value_on(item, self.day)
        if number == current:
            return
        if number is None:
            self.goal_mgr.set_done(goal.id, item.id, self.day, False)
        else:
            self.goal_mgr.set_done(goal.id, item.id, self.day, False, value=number)
        self.refresh()
        self.data_changed.emit()



class MetasHoy(QWidget):
    data_changed = Signal()
    goal_opened = Signal(str)

    def __init__(self, goal_mgr, area_mgr, parent=None):
        super().__init__(parent)
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet(f"QScrollArea{{background:{BG_PAGE};border:none;}}")
        content = QWidget()
        content.setStyleSheet(f"background:{BG_PAGE};")
        page = QVBoxLayout(content)
        page.setContentsMargins(22, 18, 22, 22)
        page.setSpacing(12)
        page.setSizeConstraint(QLayout.SetMinimumSize)
        top = QHBoxLayout()
        top.setSpacing(8)
        top.addWidget(label("☀  Hoy en tus metas", TEXT, 22, True))
        top.addStretch()
        for text, delta in (("‹", -1), ("Hoy", 0), ("›", 1)):
            b = flat_btn(text, height=30)
            b.clicked.connect(lambda _c=False, d=delta: self._move(d))
            top.addWidget(b)
        page.addLayout(top)
        self.subtitle = label("", TEXT_DIM, 13)
        page.addWidget(self.subtitle)
        self.list = TodayList(goal_mgr, area_mgr)
        self.list.data_changed.connect(self._changed)
        self.list.goal_opened.connect(self.goal_opened.emit)
        page.addWidget(self.list)
        page.addStretch()
        scroll.setWidget(content)
        outer.addWidget(scroll)

    def set_managers(self, goal_mgr, area_mgr):
        self.list.goal_mgr, self.list.area_mgr = goal_mgr, area_mgr

    def _move(self, delta):
        self.list.day = date.today() if delta == 0 else self.list.day + timedelta(days=delta)
        self.refresh()

    def _changed(self):
        self.refresh()
        self.data_changed.emit()

    def refresh(self):
        n = self.list.refresh()
        d = self.list.day
        pairs = self.list.entries()
        done = sum(1 for _g, i in pairs if self.list.goal_mgr.is_done_on(i, d))
        prefix = "Hoy, " if d == date.today() else ""
        self.subtitle.setText(f"{prefix}{long_date(d)} · {done} de {n} hechas" if n
                              else f"{prefix}{long_date(d)}")
