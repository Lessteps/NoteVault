"""Tablero: the project's Kanban with quick filters and optional swimlanes."""

from datetime import date, timedelta

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QCheckBox

from ....core.project_manager import TYPE_ICONS, T_GOAL
from ..comun import (
    TEXT_DIM, TEXT_FAINT, RED, ORANGE, CHECK_SS, PRIORITY_NAMES, PRIORITY_COLOURS, label, combo,
    line_edit, fmt_short,
)
from ..comun.kanban import KanbanBoard

LANES = (("Sin carriles", ""), ("Carriles por submeta", "submeta"), ("Carriles por prioridad", "prioridad"))


class ProyectoTablero(QWidget):
    open_issue = Signal(str)
    create_in = Signal(str)          # column
    changed = Signal()

    def __init__(self, manager, parent=None):
        super().__init__(parent)
        self.manager = manager
        self.project = None
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 8, 0, 0)
        lay.setSpacing(8)
        bar = QHBoxLayout()
        bar.setSpacing(6)
        self.search = line_edit("🔎  Filtrar…", 28)
        self.search.setFixedWidth(170)
        self.search.textChanged.connect(lambda _t: self.refresh())
        bar.addWidget(self.search)
        self.f_priority = combo([("Prioridad: todas", 0)] + [(PRIORITY_NAMES[p], p) for p in (4, 3, 2, 1)], 28)
        self.f_label = combo([("Etiqueta: todas", "")], 28)
        self.f_goal = combo([("Submeta: todas", "")], 28)
        self.lanes = combo(list(LANES), 28)
        for w in (self.f_priority, self.f_label, self.f_goal, self.lanes):
            w.currentIndexChanged.connect(lambda _i: self.refresh())
            bar.addWidget(w)
        self.f_overdue = QCheckBox("Vencidas")
        self.f_week = QCheckBox("Vencen esta semana")
        for cb in (self.f_overdue, self.f_week):
            cb.setStyleSheet(CHECK_SS)
            cb.toggled.connect(lambda _v: self.refresh())
            bar.addWidget(cb)
        bar.addStretch()
        self.count = label("", TEXT_FAINT, 11)
        bar.addWidget(self.count)
        lay.addLayout(bar)
        self.board = KanbanBoard()
        self.board.moved.connect(self._moved)
        self.board.card_clicked.connect(self.open_issue.emit)
        self.board.add_requested.connect(self.create_in.emit)
        lay.addWidget(self.board, 1)

    def load(self, project):
        self.project = project
        self._fill_filters()
        self.refresh()

    def filter_goal(self, goal_id: str):
        self._fill_filters()
        self.f_goal.setCurrentIndex(max(0, self.f_goal.findData(goal_id)))
        self.refresh()

    def _fill_filters(self):
        issues = self.manager.issues(self.project.id)
        for box, items in (
            (self.f_label, [("Etiqueta: todas", "")] + [(l, l) for l in sorted({l for i in issues for l in i.labels})]),
            (self.f_goal, [("Submeta: todas", "")] + [(f"◆ {g.key} {g.title}", g.id)
                                                       for g in issues if g.type == T_GOAL]),
        ):
            current = box.currentData()
            box.blockSignals(True)
            box.clear()
            for text, data in items:
                box.addItem(text, data)
            box.setCurrentIndex(max(0, box.findData(current)))
            box.blockSignals(False)

    def _goal_of(self, issue, by_id):
        cur = by_id.get(issue.parent)
        while cur is not None:
            if cur.type == T_GOAL:
                return cur
            cur = by_id.get(cur.parent)
        return None

    def visible_issues(self):
        issues = self.manager.issues(self.project.id)
        by_id = {i.id: i for i in issues}
        today = date.today()
        week_end = today + timedelta(days=6 - today.weekday())
        q = self.search.text().strip()
        out = []
        for i in issues:
            if i.type == T_GOAL and i.children:
                continue                    # sub-goals are groups, not cards
            if q and not i.matches(q):
                continue
            if self.f_priority.currentData() and i.priority != self.f_priority.currentData():
                continue
            if self.f_label.currentData() and self.f_label.currentData() not in i.labels:
                continue
            goal = self._goal_of(i, by_id)
            if self.f_goal.currentData() and (goal is None or goal.id != self.f_goal.currentData()):
                continue
            if self.f_overdue.isChecked() and not i.is_overdue(today):
                continue
            if self.f_week.isChecked() and not (i.due and today <= i.due <= week_end and not i.is_done):
                continue
            out.append((i, goal))
        return out

    def refresh(self):
        if self.project is None:
            return
        p = self.project
        today = date.today()
        visible = self.visible_issues()
        mode = self.lanes.currentData()

        def card(i, goal):
            due_text, due_colour = "", TEXT_DIM
            if i.due:
                due_text = fmt_short(i.due) + (" ↻" if i.repeat else "")
                if i.is_overdue(today):
                    due_colour = RED
                elif (i.due - today).days <= 2 and not i.is_done:
                    due_colour = ORANGE
            return {"id": i.id, "key": i.key, "title": i.title, "priority": i.priority,
                    "type_icon": TYPE_ICONS.get(i.type, ""), "due_text": due_text,
                    "due_colour": due_colour, "labels": i.labels, "done": i.is_done,
                    "parent_text": goal.title if goal and mode != "submeta" else "",
                    "tooltip": f"{i.key} · {i.type}\n{i.title}"}

        lanes = None
        cards: dict = {}
        if mode == "submeta":
            goals = sorted({g.id: g for _i, g in visible if g}.values(), key=lambda g: g.number)
            lanes = [(g.id, f"◆ {g.key} {g.title}", "#a78bfa") for g in goals] + [("", "Sin submeta", TEXT_DIM)]
        elif mode == "prioridad":
            lanes = [(pr, PRIORITY_NAMES[pr], PRIORITY_COLOURS[pr]) for pr in (4, 3, 2, 1)]
        for i, goal in sorted(visible, key=lambda ig: (ig[0].order, ig[0].number)):
            if mode == "submeta":
                key = (goal.id if goal else "", i.status)
            elif mode == "prioridad":
                key = (i.priority, i.status)
            else:
                key = i.status
            cards.setdefault(key, []).append(card(i, goal))
        if lanes:
            used = {k[0] for k in cards}
            lanes = [l for l in lanes if l[0] in used] or lanes[:1]
        self.board.set_cards(p.columns, cards, lanes, p.done_column)
        total = len(self.manager.issues(p.id))
        self.count.setText(f"{len(visible)} de {total} issues")

    def _moved(self, issue_id, column, lane, index):
        mode = self.lanes.currentData()
        if mode == "prioridad" and lane:
            self.manager.update_issue(self.project.id, issue_id, priority=lane)
        elif mode == "submeta" and lane is not None:
            issue = self.manager.get_issue(self.project.id, issue_id)
            if issue is not None:
                by_id = {i.id: i for i in self.manager.issues(self.project.id)}
                goal = self._goal_of(issue, by_id)
                if (goal.id if goal else "") != lane:
                    self.manager.reparent(self.project.id, issue_id, lane or None)
        self.manager.move(self.project.id, issue_id, column, index)
        self.refresh()
        self.changed.emit()
